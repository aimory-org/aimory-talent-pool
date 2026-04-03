import json
import os

import boto3

textract = boto3.client("textract")
s3 = boto3.client("s3")

OUT_BUCKET = os.environ["OUT_BUCKET"]
OUT_PREFIX = os.environ.get("OUT_PREFIX", "extracted/")


def handler(event, context):
    bucket = event["bucket"]
    key = event["key"]
    job_id = event["textract"]["job_id"]

    blocks = []
    next_token = None

    while True:
        kwargs = {"JobId": job_id, "MaxResults": 1000}
        if next_token:
            kwargs["NextToken"] = next_token

        resp = textract.get_document_text_detection(**kwargs)
        blocks.extend(resp.get("Blocks", []))
        next_token = resp.get("NextToken")
        if not next_token:
            break

    payload = {"job_id": job_id, "source": {"bucket": bucket, "key": key}, "blocks": blocks}

    out_key = f"{OUT_PREFIX}{key}.textract.json"
    s3.put_object(
        Bucket=OUT_BUCKET,
        Key=out_key,
        Body=json.dumps(payload).encode("utf-8"),
        ContentType="application/json",
    )

    return {"s3_bucket": OUT_BUCKET, "s3_key": out_key, "block_count": len(blocks)}
