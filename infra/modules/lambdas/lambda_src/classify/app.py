def handler(event, context):
    bucket = event["bucket"]
    key = event["key"]

    ext = ""
    if "." in key:
        ext = key.rsplit(".", 1)[-1].lower()

    if ext == "pdf":
        doc_type = "pdf"
    elif ext in ("doc", "docx"):
        doc_type = "word"
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    return {
        "bucket": bucket,
        "key": key,
        "extension": ext,
        "doc_type": doc_type
    }
