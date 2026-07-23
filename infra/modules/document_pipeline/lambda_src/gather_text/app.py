import json

import boto3

s3 = boto3.client("s3")


def handler(event, context):
    """Assemble the plain document text used for storage, full-text search and
    content-hash dedup.

    This text is NOT sent to the LLM — extraction reads the raw document in a
    parallel branch — so there is no reformatting to do here, only faithful
    assembly:
      - born-digital docs: the direct text extracted by the classify step
      - scanned docs: the Textract LINE blocks joined in reading order

    Kept deliberately deterministic so identical bytes always produce identical
    text (content-hash dedup depends on it).
    """
    prep = event.get("prep", {})
    if prep.get("skip_textract") and prep.get("direct_text"):
        text = prep["direct_text"]
        line_count = len([line for line in text.splitlines() if line.strip()])
        return {"text": text, "line_count": line_count}

    ptr = event.get("textractBlocks")
    if not ptr:
        # No direct text and no Textract output — nothing to assemble.
        return {"text": "", "line_count": 0}

    obj = s3.get_object(Bucket=ptr["s3_bucket"], Key=ptr["s3_key"])
    data = json.loads(obj["Body"].read().decode("utf-8"))

    blocks = data.get("blocks", [])
    lines = [b["Text"] for b in blocks if b.get("BlockType") == "LINE" and b.get("Text")]
    return {"text": "\n".join(lines), "line_count": len(lines)}
