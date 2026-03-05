"""
Generate a presigned URL for viewing a resume from S3.
"""
import json
import os
import urllib.parse
import boto3
from botocore.exceptions import ClientError

s3_client = boto3.client("s3")
RESUME_BUCKET = os.environ["RESUME_BUCKET"]
URL_EXPIRATION = 3600  # 1 hour


def handler(event, context):
    try:
        # Get the S3 key from query parameter
        query_params = event.get("queryStringParameters") or {}
        s3_key = query_params.get("key")
        
        if not s3_key:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing key parameter"}),
            }
        
        # URL decode the key
        s3_key = urllib.parse.unquote(s3_key)
        
        # Check if the object exists
        try:
            s3_client.head_object(Bucket=RESUME_BUCKET, Key=s3_key)
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return {
                    "statusCode": 404,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "Resume not found"}),
                }
            raise
        
        # Generate presigned URL for viewing (inline)
        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": RESUME_BUCKET,
                "Key": s3_key,
                "ResponseContentDisposition": "inline",
            },
            ExpiresIn=URL_EXPIRATION,
        )
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "url": presigned_url,
                "expiresIn": URL_EXPIRATION,
            }),
        }
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
