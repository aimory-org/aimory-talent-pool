#!/usr/bin/env python3
"""
Resume-extraction architecture bake-off.

Answers one question before we commit to a rewrite: for OUR resumes, does a
single Bedrock Converse call with the document attached (Option B) match or beat
the current "extract messy text -> LLM" path (baseline) -- and do we even need
Bedrock Data Automation (Option A) in the middle at all?

It runs each sample resume through up to three methods and prints a side-by-side
summary plus full JSON dumps so you can eyeball the judgment-heavy fields
(service_category, industry_category, job_title, skills) that make our
extraction ours.

    current  Baseline. Replicates the prod pipeline's parse step (docx via
             zip/xml like classify/app.py, pdf via pdfminer) -> feeds that text
             to Claude with our real prompt.txt + schema.json. This is the
             "messy text" path we want to beat.

    converse Option B. Attaches the raw PDF/DOCX to a single Claude Converse
             call (citations enabled on PDFs => visual layout understanding) and
             extracts with the SAME prompt + schema. No parse step, no BDA.

    bda      Option A. Uploads to S3, runs BDA Standard Output ($0.010/page) to
             get clean markdown, then feeds that markdown to Claude. Optional --
             only runs when --methods includes `bda` AND the BDA_* env vars are
             set (needs a BDA project + profile ARN and an S3 bucket).

All three use the identical model + prompt + schema, so the ONLY variable is how
the document text reaches the model. Dynamic lookup-vocab injection is left OUT
on purpose here -- we're isolating parse quality, not vocab consistency.

Usage
-----
    pip install pdfminer.six            # only needed for the `current` PDF path
    export BAKEOFF_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0  # prod model
    python scripts/bda_bakeoff.py --samples ./bakeoff_samples

    # include BDA (Option A):
    export BDA_PROJECT_ARN=arn:aws:bedrock:us-east-1:<acct>:data-automation-project/<id>
    export BDA_PROFILE_ARN=arn:aws:bedrock:us-east-1:<acct>:data-automation-profile/us.data-automation-v1
    export BDA_S3_BUCKET=my-scratch-bucket
    python scripts/bda_bakeoff.py --samples ./bakeoff_samples --methods current,converse,bda

Drop a MIX into --samples: a couple DOCX, a couple born-digital PDFs, and at
least one SCANNED/image PDF -- the scanned one is what separates the options.
"""

import argparse
import io
import json
import os
import re
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

REPO = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO / "infra" / "pipeline_configs" / "resume"

DEFAULT_MODEL = os.environ.get("BAKEOFF_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
DEFAULT_REGION = os.environ.get("AWS_REGION", "us-east-1")

# Converse document `format` values we map our extensions onto.
FORMAT_BY_EXT = {".pdf": "pdf", ".docx": "docx", ".doc": "doc", ".txt": "txt", ".md": "md"}


# --------------------------------------------------------------------------- #
# Config loading (reuses the real prod prompt + schema)
# --------------------------------------------------------------------------- #
def load_config():
    schema = json.loads((CONFIG_DIR / "schema.json").read_text())
    prompt = (CONFIG_DIR / "prompt.txt").read_text()
    return schema, prompt


def build_user_text(schema_text: str, doc_text: str | None) -> str:
    """User turn. With an attached document, doc_text is None."""
    if doc_text is None:
        return (
            f"Target JSON schema:\n{schema_text}\n\n"
            "The resume is attached as a document. Extract every field per the schema."
        )
    return f"Target JSON schema:\n{schema_text}\n\nDocument text:\n{doc_text}\n"


# --------------------------------------------------------------------------- #
# Baseline text extraction (mirrors infra classify/app.py)
# --------------------------------------------------------------------------- #
def extract_docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        import xml.etree.ElementTree as ET  # nosec B405 - local dev tool

        root = ET.fromstring(zf.read("word/document.xml"))  # nosec B314
    return "".join(root.itertext())


def extract_pdf_text(data: bytes) -> str:
    try:
        from pdfminer.high_level import extract_text
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(
            "pdfminer.six not installed -- `pip install pdfminer.six` to run the `current` PDF path"
        ) from e
    return str(extract_text(io.BytesIO(data)))


def current_text(path: Path, data: bytes) -> str:
    ext = path.suffix.lower()
    if ext == ".docx":
        return extract_docx_text(data)
    if ext == ".pdf":
        return extract_pdf_text(data)
    raise ValueError(f"baseline path unsupported for {ext}")


# --------------------------------------------------------------------------- #
# Shared Claude call (retry + JSON repair ported from llm_extract/app.py)
# --------------------------------------------------------------------------- #
def parse_model_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").replace("json\n", "", 1).strip()
    for attempt in range(3):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 0:
                raw = re.sub(r",\s*}", "}", raw)
                raw = re.sub(r",\s*]", "]", raw)
            elif attempt == 1:
                last = raw.rfind("}")
                if last > 0:
                    raw = raw[: last + 1]
    raise ValueError("model output was not valid JSON")


def claude_extract(client, model: str, system: str, content: list) -> dict:
    """Run one Converse extraction. Returns parsed json + timing/throttle stats."""
    max_retries, base, cap = 8, 3, 45
    throttles = 0
    t0 = time.time()
    resp = None
    for attempt in range(max_retries):
        try:
            resp = client.converse(
                modelId=model,
                messages=[{"role": "user", "content": content}],
                system=[{"text": system}],
                # Sonnet 4.6+ rejects temperature and top_p together; keep temperature only.
                inferenceConfig={"maxTokens": 4096, "temperature": 0.1},
            )
            break
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "ThrottlingException" and attempt < max_retries - 1:
                throttles += 1
                time.sleep(min(base * (2**attempt), cap))
            else:
                raise
    elapsed = time.time() - t0
    blocks = [c["text"] for c in resp["output"]["message"]["content"] if "text" in c]
    result = parse_model_json("".join(blocks))
    usage = resp.get("usage", {})
    return {
        "result": result,
        "elapsed_s": round(elapsed, 1),
        "throttles": throttles,
        "in_tokens": usage.get("inputTokens"),
        "out_tokens": usage.get("outputTokens"),
    }


def doc_name(path: Path) -> str:
    # Converse document names allow alnum, spaces, hyphens, parens, brackets only.
    name = re.sub(r"[^A-Za-z0-9 ()\[\]-]", " ", path.stem)
    return re.sub(r"\s+", " ", name).strip() or "resume"


# --------------------------------------------------------------------------- #
# Methods
# --------------------------------------------------------------------------- #
def run_current(client, model, system, schema_text, path, data):
    text = current_text(path, data)
    content = [{"text": build_user_text(schema_text, text)}]
    out = claude_extract(client, model, system, content)
    out["chars_fed"] = len(text)
    return out


def run_converse(client, model, system, schema_text, path, data):
    ext = path.suffix.lower()
    fmt = FORMAT_BY_EXT.get(ext)
    if not fmt:
        raise ValueError(f"converse path unsupported for {ext}")
    doc_block = {"format": fmt, "name": doc_name(path), "source": {"bytes": data}}
    if fmt == "pdf":
        doc_block["citations"] = {"enabled": True}  # visual layout understanding
    content = [{"document": doc_block}, {"text": build_user_text(schema_text, None)}]
    return claude_extract(client, model, system, content)


def run_bda(client, model, system, schema_text, path, data, region):
    project = os.environ["BDA_PROJECT_ARN"]
    profile = os.environ["BDA_PROFILE_ARN"]
    bucket = os.environ["BDA_S3_BUCKET"]
    prefix = os.environ.get("BDA_S3_PREFIX", "bakeoff").strip("/")

    s3 = boto3.client("s3", region_name=region)
    bda = boto3.client("bedrock-data-automation-runtime", region_name=region)

    in_key = f"{prefix}/in/{path.name}"
    out_prefix = f"{prefix}/out"
    s3.put_object(Bucket=bucket, Key=in_key, Body=data)

    t0 = time.time()
    inv = bda.invoke_data_automation_async(
        inputConfiguration={"s3Uri": f"s3://{bucket}/{in_key}"},
        outputConfiguration={"s3Uri": f"s3://{bucket}/{out_prefix}"},
        dataAutomationConfiguration={"dataAutomationProjectArn": project},
        dataAutomationProfileArn=profile,
    )
    arn = inv["invocationArn"]
    status = "InProgress"
    while status in ("InProgress", "Created"):
        time.sleep(3)
        st = bda.get_data_automation_status(invocationArn=arn)
        status = st["status"]
    if status != "Success":
        raise RuntimeError(f"BDA job {status}: {st.get('errorMessage')}")
    bda_elapsed = round(time.time() - t0, 1)

    markdown = fetch_bda_markdown(s3, st["outputConfiguration"]["s3Uri"])
    content = [{"text": build_user_text(schema_text, markdown)}]
    out = claude_extract(client, model, system, content)
    out["bda_elapsed_s"] = bda_elapsed
    out["chars_fed"] = len(markdown)
    return out


def fetch_bda_markdown(s3, job_meta_uri: str) -> str:
    """Walk the BDA standard-output job result and pull markdown (fallback: text)."""

    def read_json(uri):
        _, _, rest = uri.partition("s3://")
        bucket, _, key = rest.partition("/")
        return json.loads(s3.get_object(Bucket=bucket, Key=key)["Body"].read())

    meta = read_json(job_meta_uri)
    # job_metadata.json -> output_metadata[].segment_metadata[].standard_output_path
    result_uris = []
    for out in meta.get("output_metadata", []):
        for seg in out.get("segment_metadata", []):
            uri = seg.get("standard_output_path")
            if uri:
                result_uris.append(uri)
    chunks = []

    def collect(node):
        if isinstance(node, dict):
            rep = node.get("representation")
            if isinstance(rep, dict) and (rep.get("markdown") or rep.get("text")):
                chunks.append(rep.get("markdown") or rep.get("text"))
            for v in node.values():
                collect(v)
        elif isinstance(node, list):
            for v in node:
                collect(v)

    for uri in result_uris or [job_meta_uri]:
        collect(read_json(uri))
    return "\n\n".join(c for c in chunks if c).strip()


METHODS = {"current": run_current, "converse": run_converse, "bda": run_bda}


# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #
def summarize(r: dict) -> dict:
    res = r.get("result", {})
    ind = res.get("industry_category")
    return {
        "valid": res.get("is_valid"),
        "job_title": (res.get("job_title") or "")[:22],
        "svc": res.get("service_category"),
        "industry": ",".join(ind) if isinstance(ind, list) else ind,
        "skills": len(res.get("skillsets") or []) if isinstance(res.get("skillsets"), list) else "-",
        "sec": r.get("elapsed_s"),
        "thr": r.get("throttles"),
        "toks": r.get("in_tokens"),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--samples", required=True, type=Path, help="dir of sample resumes (pdf/docx)")
    ap.add_argument("--methods", default="current,converse", help="comma list: current,converse,bda")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--region", default=DEFAULT_REGION)
    ap.add_argument("--out", default=REPO / "bakeoff_out", type=Path, help="where to dump full JSON")
    args = ap.parse_args()

    methods = [m.strip() for m in args.methods.split(",") if m.strip()]
    for m in methods:
        if m not in METHODS:
            ap.error(f"unknown method: {m}")

    schema, prompt = load_config()
    schema_text = json.dumps(schema, indent=2)
    client = boto3.client("bedrock-runtime", region_name=args.region)
    args.out.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in args.samples.iterdir() if p.suffix.lower() in FORMAT_BY_EXT)
    if not files:
        ap.error(f"no pdf/docx files in {args.samples}")

    print(f"model={args.model}  region={args.region}  methods={methods}  files={len(files)}\n")
    rows = []
    for path in files:
        data = path.read_bytes()
        print(f"### {path.name}  ({len(data) // 1024} KB)")
        for m in methods:
            try:
                r = (
                    METHODS[m](client, args.model, prompt, schema_text, path, data, args.region)
                    if m == "bda"
                    else METHODS[m](client, args.model, prompt, schema_text, path, data)
                )
                (args.out / f"{path.stem}.{m}.json").write_text(json.dumps(r.get("result"), indent=2))
                s = summarize(r)
                rows.append((path.name, m, s))
                extra = f" bda={r['bda_elapsed_s']}s" if "bda_elapsed_s" in r else ""
                print(
                    f"  {m:9} valid={s['valid']!s:5} title={s['job_title']!r:24} "
                    f"svc={s['svc']} ind=[{s['industry']}] skills={s['skills']} "
                    f"{s['sec']}s thr={s['thr']} in_tok={s['toks']}{extra}"
                )
            except Exception as e:  # noqa: BLE001
                print(f"  {m:9} ERROR: {type(e).__name__}: {e}")
        print()

    print(f"Full JSON dumps written to {args.out}/ -- diff the judgment fields across methods.")


if __name__ == "__main__":
    main()
