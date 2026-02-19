import json
import re
import boto3

s3 = boto3.client("s3")


def _light_normalize(text: str) -> str:
    # Collapse whitespace, then reintroduce simple breaks for readability.
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return text

    # Break after common separators.
    text = re.sub(r"\s*[|•]\s*", "\n", text)

    # Break before common section headers.
    headers = [
        "summary",
        "professional experience",
        "experience",
        "work experience",
        "education",
        "skills",
        "technical skills",
        "certifications",
        "projects",
        "coursework",
        "technologies",
        "languages",
        "tools",
        "frameworks",
        "project approaches",
    ]
    for header in headers:
        pattern = re.compile(rf"\b{re.escape(header)}\b", re.IGNORECASE)
        text = pattern.sub(lambda m: f"\n{m.group(0)}", text)

    # Break before year ranges and month-year patterns.
    text = re.sub(r"(\b(?:19|20)\d{2}\s*[–-]\s*(?:19|20)\d{2}\b)", r"\n\1", text)
    text = re.sub(r"(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}\b)", r"\n\1", text, flags=re.IGNORECASE)

    # Normalize multiple newlines.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def handler(event, context):
    prep = event.get("prep", {})
    if prep.get("skip_textract") and prep.get("direct_text"):
        text = _light_normalize(prep["direct_text"])
        line_count = len([line for line in text.splitlines() if line.strip()])
        return {"text": text, "line_count": line_count}

    ptr = event["textractBlocks"]
    obj = s3.get_object(Bucket=ptr["s3_bucket"], Key=ptr["s3_key"])
    data = json.loads(obj["Body"].read().decode("utf-8"))

    blocks = data.get("blocks", [])
    lines = [b["Text"] for b in blocks if b.get("BlockType") == "LINE" and b.get("Text")]
    text = _light_normalize("\n".join(lines))

    return {"text": text, "line_count": len(lines)}
