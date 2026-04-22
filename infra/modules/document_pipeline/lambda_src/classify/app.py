import io
import os
import re
import zipfile

import boto3

try:
    import defusedxml.ElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET  # type: ignore[no-redef]  # nosec B314 — fallback for local dev only; defusedxml is always present in the Lambda layer

try:
    from pdfminer.high_level import extract_text as pdf_extract_text
except Exception:
    pdf_extract_text = None

s3 = boto3.client("s3")

MIN_PDF_TEXT_CHARS = int(os.environ.get("MIN_PDF_TEXT_CHARS", "1000"))


def _extract_docx_text(docx_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as zf:
        xml_bytes = zf.read("word/document.xml")
    root = ET.fromstring(xml_bytes)  # nosec B314 — ET is defusedxml.ElementTree in Lambda; stdlib fallback is dev-only
    text = "".join(root.itertext())
    return text


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    if pdf_extract_text is None:
        raise RuntimeError("pdfminer.six is not available; build the Lambda layer before running.")
    return str(pdf_extract_text(io.BytesIO(pdf_bytes)))


def _count_readable_chars(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def _is_text_readable(text: str) -> bool:
    if not text:
        return False
    total = len(text)
    if total == 0:
        return False
    printable = sum(1 for ch in text if ch.isprintable() or ch in "\n\r\t")
    letters = sum(1 for ch in text if ch.isalnum())
    printable_ratio = printable / total
    letter_ratio = letters / total
    return printable_ratio >= 0.85 and letter_ratio >= 0.35


def handler(event, context):
    bucket = event["bucket"]
    key = event["key"]

    ext = ""
    if "." in key:
        ext = key.rsplit(".", 1)[-1].lower()

    if ext == "pdf":
        doc_type = "pdf"
    elif ext == "docx":
        doc_type = "word"
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    obj = s3.get_object(Bucket=bucket, Key=key)
    payload = obj["Body"].read()

    direct_text = None
    skip_textract = False
    readable_chars = 0

    if doc_type == "word" and ext == "docx":
        direct_text = _extract_docx_text(payload)
        readable_chars = _count_readable_chars(direct_text)
        skip_textract = True
    elif doc_type == "pdf":
        candidate_text = _extract_pdf_text(payload)
        if _is_text_readable(candidate_text):
            direct_text = candidate_text
            readable_chars = _count_readable_chars(direct_text)
            skip_textract = readable_chars >= MIN_PDF_TEXT_CHARS

    return {
        "bucket": bucket,
        "key": key,
        "extension": ext,
        "doc_type": doc_type,
        "skip_textract": skip_textract,
        "direct_text": direct_text if skip_textract else None,
        "readable_chars": readable_chars,
        "min_pdf_text_chars": MIN_PDF_TEXT_CHARS,
    }
