import json
import os
import re

import boto3
from botocore.config import Config

s3 = boto3.client("s3", config=Config(signature_version="s3v4"))

BUCKET = os.environ["RESUME_BUCKET"]
API_KEY = os.environ["PRESIGN_API_KEY"]
PREFIX = os.environ.get("RESUME_PREFIX", "raw/onedrive")


def _sanitize_filename(name: str) -> str:
    name = (name or "resume.pdf").strip()
    name = re.sub(r"[^\w.\- ()]", "_", name)
    name = name.replace("..", ".")
    return name


def _sanitize_meta(v: str, max_len=200) -> str:
    v = (v or "").strip()
    v = re.sub(r"[\r\n\t]", " ", v)
    return v[:max_len]


def handler(event, context):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if headers.get("x-api-key") != API_KEY:
        return {"statusCode": 401, "body": "Unauthorized"}

    data = json.loads(event.get("body") or "{}")

    filename = _sanitize_filename(data.get("filename"))
    content_type = data.get("contentType") or "application/octet-stream"

    # metadata you want to attach
    meta = {
        "source": _sanitize_meta(data.get("source") or "onedrive"),
        "original-filename": _sanitize_meta(filename),
        "flow-run-id": _sanitize_meta(data.get("flowRunId")),
        "onedrive-file-id": _sanitize_meta(data.get("oneDriveFileId")),
    }
    # remove empties
    meta = {k: v for k, v in meta.items() if v}

    key = f"{PREFIX}/{filename}"

    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": content_type,
            "Metadata": meta,
        },
        ExpiresIn=300,
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"url": url, "key": key, "bucket": BUCKET, "metadata": meta}),
    }
