import json
import boto3

s3 = boto3.client("s3")

def handler(event, context):
    ptr = event["textractBlocks"]
    obj = s3.get_object(Bucket=ptr["s3_bucket"], Key=ptr["s3_key"])
    data = json.loads(obj["Body"].read().decode("utf-8"))

    blocks = data.get("blocks", [])
    lines = [b["Text"] for b in blocks if b.get("BlockType") == "LINE" and b.get("Text")]
    text = "\n".join(lines)

    return {"text": text, "line_count": len(lines)}
