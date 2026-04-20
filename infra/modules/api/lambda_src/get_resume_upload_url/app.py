"""
Generate a presigned URL for uploading a resume to S3.
"""

import json
import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone

import boto3

s3_client = boto3.client("s3")
RESUME_BUCKET = os.environ["RESUME_BUCKET"]
RESUME_RAW_PREFIX = os.environ.get("RESUME_RAW_PREFIX", "resumes/raw")
URL_EXPIRATION = 900  # 15 minutes


# Allowed content types for resume uploads
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

CONTENT_TYPE_EXTENSIONS = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

# Max filename length
MAX_FILENAME_LENGTH = 255

# Pattern for allowed characters in final S3 filename
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9\s\-_.()]+")


def _sanitize_filename(filename):
    """Sanitize and validate the uploaded filename."""
    if not filename:
        return None

    # Strip path components (prevent directory traversal)
    filename = filename.replace("\\", "/").split("/")[-1].strip()
    if not filename:
        return None

    # Reject obvious HTML/script-like payloads
    if "<" in filename or ">" in filename:
        return None

    # Normalize unicode to ASCII-friendly text so uploads with smart punctuation/accents still work
    filename = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode("ascii")
    if not filename:
        return None

    # Replace unsupported characters with '-' instead of hard-failing the upload
    filename = SAFE_FILENAME_RE.sub("-", filename)
    filename = re.sub(r"\s+", " ", filename).strip()

    # Keep extension and trim basename safely
    name, ext = os.path.splitext(filename)
    name = name.strip(" .-_")
    ext = ext.lower().strip()

    if not name:
        return None

    sanitized = f"{name}{ext}"
    if len(sanitized) > MAX_FILENAME_LENGTH:
        allowed_name_len = MAX_FILENAME_LENGTH - len(ext)
        name = name[:allowed_name_len].rstrip(" .-_")
        if not name:
            return None
        sanitized = f"{name}{ext}"

    return sanitized


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

        # Ensure the key uses an extension that matches the declared content type
        name, ext = os.path.splitext(safe_filename)
        expected_ext = CONTENT_TYPE_EXTENSIONS[content_type]
        if not ext:
            safe_filename = f"{name}{expected_ext}"
        elif ext.lower() != expected_ext:
            safe_filename = f"{name}{expected_ext}"

        # Build S3 key: resumes/raw/YYYY-MM-DD_<filename>
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        s3_key = f"{RESUME_RAW_PREFIX}/{today}_{safe_filename}"

        # Check for duplicate key — append short UUID if exists
        try:
            s3_client.head_object(Bucket=RESUME_BUCKET, Key=s3_key)
            # Key already exists, make it unique
            short_id = uuid.uuid4().hex[:8]
            name, ext = os.path.splitext(safe_filename)
            s3_key = f"{RESUME_RAW_PREFIX}/{today}_{name}_{short_id}{ext}"
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
