"""Resume pipeline hooks for llm_extract post-processing."""

import boto3
from botocore.exceptions import ClientError

s3_client = boto3.client("s3")


def post_process(result, event):
    """Handle non-resume documents by deleting them from S3."""
    if not result.get("is_valid", True):
        bucket = event.get("bucket")
        key = event.get("key")
        if bucket and key:
            try:
                s3_client.delete_object(Bucket=bucket, Key=key)
            except ClientError as e:
                raise RuntimeError(f"Failed to delete non-resume file from S3: {e}")

        return {
            "is_valid": False,
            "deleted": True,
            "bucket": bucket,
            "key": key,
            "rejection_reason": result.get("rejection_reason", "Document is not a resume"),
        }

    result["is_valid"] = True
    result.pop("rejection_reason", None)
    return result
