import json
import os
import time
import re
import boto3

s3 = boto3.client("s3")

BUCKET = os.environ["RESUME_BUCKET"]
API_KEY = os.environ["PRESIGN_API_KEY"]
PREFIX = os.environ.get("RESUME_PREFIX", "raw/onedrive")

def _sanitize_filename(name: str) -> str:
    name = (name or "resume.pdf").strip()
    name = re.sub(r"[^\w.\- ()]", "_", name)
    name = name.replace("..", ".")
    return name

def handler(event, context):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if headers.get("x-api-key") != API_KEY:
        return {"statusCode": 401, "body": "Unauthorized"}

    data = json.loads(event.get("body") or "{}")
    filename = _sanitize_filename(data.get("filename"))
    content_type = data.get("contentType") or "application/octet-stream"

    key = f"{PREFIX}/{int(time.time())}_{filename}"

    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=900,
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"url": url, "key": key, "bucket": BUCKET}),
    }
