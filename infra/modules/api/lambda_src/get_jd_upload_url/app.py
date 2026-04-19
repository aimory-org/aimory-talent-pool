"""
Generate a presigned URL for uploading a job description to S3.
"""

import json
import os
import re
import uuid
from datetime import datetime, timezone

import boto3

s3_client = boto3.client("s3")
RESUME_BUCKET = os.environ["RESUME_BUCKET"]
JD_RAW_PREFIX = os.environ.get("JD_RAW_PREFIX", "job-descriptions/raw")
URL_EXPIRATION = 900  # 15 minutes


# Allowed content types for JD uploads
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# Max filename length
MAX_FILENAME_LENGTH = 255

# Pattern for safe filenames (alphanumeric, hyphens, underscores, dots, spaces)
SAFE_FILENAME_RE = re.compile(r"^[\w\s\-\.()]+$")


def _sanitize_filename(filename):
    """Sanitize and validate the uploaded filename."""
    if not filename or len(filename) > MAX_FILENAME_LENGTH:
        return None

    # Strip path components (prevent directory traversal)
    filename = filename.replace("\\", "/").split("/")[-1]

    if not filename or not SAFE_FILENAME_RE.match(filename):
        return None

    return filename


def handler(event, context):
    try:
        query_params = event.get("queryStringParameters") or {}
        filename = query_params.get("filename")
        content_type = query_params.get("contentType", "application/pdf")

        if not filename:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing filename parameter"}),
            }

        # Validate content type
        if content_type not in ALLOWED_CONTENT_TYPES:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": f"Unsupported content type: {content_type}. Allowed: PDF, DOC, DOCX"}),
            }

        # Sanitize filename
        safe_filename = _sanitize_filename(filename)
        if not safe_filename:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Invalid filename"}),
            }

        # Build S3 key: job-descriptions/raw/YYYY-MM-DD_<filename>
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        s3_key = f"{JD_RAW_PREFIX}/{today}_{safe_filename}"

        # Check for duplicate key — append short UUID if exists
        try:
            s3_client.head_object(Bucket=RESUME_BUCKET, Key=s3_key)
            # Key already exists, make it unique
            short_id = uuid.uuid4().hex[:8]
            name, ext = os.path.splitext(safe_filename)
            s3_key = f"{JD_RAW_PREFIX}/{today}_{name}_{short_id}{ext}"
        except s3_client.exceptions.ClientError:
            pass  # Key doesn't exist — use original

        # Generate presigned PUT URL
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": RESUME_BUCKET,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=URL_EXPIRATION,
        )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "uploadUrl": presigned_url,
                    "key": s3_key,
                    "expiresIn": URL_EXPIRATION,
                }
            ),
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
