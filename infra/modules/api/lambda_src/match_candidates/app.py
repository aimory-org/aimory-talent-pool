"""
Match candidates against a job description.

1. Fetch the JD from DynamoDB by pk (path parameter).
2. Pre-filter candidates via OpenSearch (should-based scoring query).
3. Send top candidates to Bedrock Claude for alignment scoring.
4. Return ranked candidates with scores and rationale.
"""

import concurrent.futures
import json
import os
import re
import time
from decimal import Decimal
from difflib import SequenceMatcher

import boto3
from opensearchpy import AWSV4SignerAuth, OpenSearch, RequestsHttpConnection

dynamodb = boto3.resource("dynamodb")
jd_table = dynamodb.Table(os.environ["JOB_DESCRIPTIONS_TABLE"])

OPENSEARCH_ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
INDEX_NAME = "talent-profiles"

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")
bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)

# How many candidates to pull from OpenSearch pre-filter
PRE_FILTER_LIMIT = int(os.environ.get("PRE_FILTER_LIMIT", "50"))
# How many candidates to send to Bedrock for scoring. Scoring is parallelized (see
# _score_candidates), so wall-clock ≈ one batch regardless of this number — we can score
# more candidates without blowing the API Gateway 30s cap.
SCORING_LIMIT = int(os.environ.get("SCORING_LIMIT", "10"))
# Candidates per Bedrock call, and how many calls run concurrently.
SCORING_BATCH = int(os.environ.get("SCORING_BATCH", "2"))
MAX_SCORING_WORKERS = int(os.environ.get("MAX_SCORING_WORKERS", "5"))
# Default number of results to return
DEFAULT_RETURN_LIMIT = 10
# Max characters of résumé text sent to the LLM per candidate (~3k tokens). Kept modest
# to hold total latency under the API Gateway 30s ceiling; enough for scoring judgment.
RESUME_CHARS_CAP = int(os.environ.get("RESUME_CHARS_CAP", "12000"))

# --- Semantic (vector) retrieval — Phase 2a ------------------------------------
CHUNK_INDEX = "talent-chunks"
EMBED_MODEL_ID = os.environ.get("EMBED_MODEL_ID", "amazon.titan-embed-text-v2:0")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "512"))
# How many chunk hits to pull from kNN, and how many candidates the vector leg contributes.
KNN_CHUNK_HITS = int(os.environ.get("KNN_CHUNK_HITS", "100"))
VECTOR_CANDIDATES = int(os.environ.get("VECTOR_CANDIDATES", "50"))
RRF_K = 60  # reciprocal-rank-fusion constant

# --- Reranker (Phase 3): Cohere Rerank picks the BEST candidates to LLM-score --------
bedrock_agent = boto3.client("bedrock-agent-runtime", region_name=AWS_REGION)
RERANK_MODEL_ARN = os.environ.get(
    "RERANK_MODEL_ARN", f"arn:aws:bedrock:{AWS_REGION}::foundation-model/cohere.rerank-v3-5:0"
)
RERANK_INPUT = int(os.environ.get("RERANK_INPUT", "60"))  # max candidates to rerank
RERANK_CHARS_CAP = int(os.environ.get("RERANK_CHARS_CAP", "6000"))  # résumé chars per rerank doc
# Reranker ON by default: with the enriched JD query (responsibilities[] + jd_text), the
# ablation flipped from ~neutral (-0.10, thin 500-char JD) to +2.46 top-5 points — the single
# biggest quality lever. Toggle off per-request with ?rerank=false (used by the ablation eval).
RERANK_DEFAULT = os.environ.get("RERANK_DEFAULT", "true")

# --- Lookup-grounded query expansion (Phase 2b) --------------------------------
# Ask the LLM which CANONICAL lookup skills/titles are equivalent to the JD's, then match
# those against the structured skill_names/job_title fields — precise (no résumé-body noise).
SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
JOB_TITLES_LOOKUP_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "")
EXPAND_DEFAULT = os.environ.get("EXPAND_DEFAULT", "false")
_lookup_cache = {}


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def _get_os_client():
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, AWS_REGION, "es")
    return OpenSearch(
        hosts=[{"host": OPENSEARCH_ENDPOINT, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30,
    )


# Clearance hierarchy: higher index = higher clearance
_CLEARANCE_HIERARCHY = [
    "Secret",
    "TS",
    "TS/SCI",
    "TS/SCI/CI",
    "TS/SCI/FSP",
    "Yankee White",
]


def _clearance_rank(clearance):
    """Return numeric rank for a clearance level, or -1 if not found."""
    try:
        return _CLEARANCE_HIERARCHY.index(clearance)
    except (ValueError, TypeError):
        return -1


def _meets_hard_requirements(jd, candidate):
    """Mirrors the lexical prefilter's clearance gate. The vector leg's kNN query
    (_vector_candidate_pks) has no filter clause, so RRF fusion can reintroduce a candidate
    the lexical leg would have excluded on clearance — apply the same gate here to the
    merged set regardless of which leg surfaced the candidate. (Low experience is
    intentionally NOT hard-excluded here — that's a soft signal handled by
    _apply_score_guardrails' score cap, not an exclusion.)"""
    required_clearance = jd.get("required_clearance")
    if required_clearance:
        req_rank = _clearance_rank(required_clearance)
        if req_rank >= 0 and _clearance_rank(candidate.get("clearance_level")) < req_rank:
            return False
    return True


_SKILL_NOISE_TOKENS = {
    "skill",
    "skills",
    "framework",
    "frameworks",
    "methodology",
    "methodologies",
    "development",
    "delivery",
    "experience",
    "knowledge",
    "proficiency",
    "tools",
    "tool",
    "platform",
    "platforms",
    "technologies",
    "technology",
    "hands",
    "on",
    "and",
}


def _to_list(value):
    """Normalize comma-delimited or list fields into a clean string list."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return [str(value).strip()] if str(value).strip() else []


def _to_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _skill_tokens(skill):
    """Return normalized tokens for fuzzy skill matching."""
    if not skill:
        return set()

    clean = str(skill).lower().replace("&", " and ")
    clean = re.sub(r"[^a-z0-9\s]", " ", clean)
    tokens = []
    for raw in clean.split():
        tok = raw.strip()
        if not tok or tok in _SKILL_NOISE_TOKENS:
            continue
        if len(tok) > 4 and tok.endswith("ies"):
            tok = tok[:-3] + "y"
        elif len(tok) > 4 and tok.endswith("s"):
            tok = tok[:-1]
        tokens.append(tok)
    return set(tokens)


def _skills_semantically_match(required_skill, candidate_skill):
    """Return True when two skill phrases appear semantically equivalent for matching."""
    req_raw = str(required_skill or "").strip().lower()
    cand_raw = str(candidate_skill or "").strip().lower()
    if not req_raw or not cand_raw:
        return False
    if req_raw == cand_raw:
        return True

    req_tokens = _skill_tokens(required_skill)
    cand_tokens = _skill_tokens(candidate_skill)
    if not req_tokens or not cand_tokens:
        return False

    # Require meaningful tokens — very short token sets match too broadly
    if len(req_tokens) == 1 and len(cand_tokens) == 1:
        # Single-token skills must match exactly (e.g. "AI" != "BI")
        return req_tokens == cand_tokens

    overlap = len(req_tokens & cand_tokens)
    overlap_req = overlap / max(1, len(req_tokens))
    if overlap_req >= 0.80:
        return True

    req_phrase = " ".join(sorted(req_tokens))
    cand_phrase = " ".join(sorted(cand_tokens))
    phrase_similarity = SequenceMatcher(None, req_phrase, cand_phrase).ratio()
    return overlap_req >= 0.6 and phrase_similarity >= 0.85


def _count_missing_required_skills(required_skills, candidate_skills):
    """Count required skills that have no semantic match in candidate skills."""
    missing = 0
    for req_skill in required_skills:
        if not any(_skills_semantically_match(req_skill, cand_skill) for cand_skill in candidate_skills):
            missing += 1
    return missing


def _apply_score_guardrails(jd, candidate, score, rationale):
    """Apply deterministic caps so skills-only matches do not over-score misaligned candidates."""
    capped_score = max(0, min(100, int(score)))
    cap = 100
    reasons = []

    # Penalize missing required skills even when overall skill overlap is high.
    required_skills = _to_list(jd.get("required_skills"))
    candidate_skills = _to_list(candidate.get("skill_names"))
    missing_required = _count_missing_required_skills(required_skills, candidate_skills)
    if missing_required >= 2:
        cap = min(cap, 65)
        reasons.append("missing multiple required skills")
    elif missing_required == 1:
        cap = min(cap, 78)
        reasons.append("missing one required skill")

    # Penalize years-of-experience gaps.
    min_exp = _to_float(jd.get("min_experience_years"))
    cand_exp = _to_float(candidate.get("years_of_experience"))
    if min_exp is not None and cand_exp is not None and cand_exp < min_exp:
        shortfall = min_exp - cand_exp
        if shortfall >= 3:
            cap = min(cap, 60)
            reasons.append("experience shortfall (3+ years)")
        elif shortfall >= 1:
            cap = min(cap, 75)
            reasons.append("experience shortfall")

    # NOTE: the old lexical job-title guardrail was removed — it capped strong
    # candidates for wording differences ("Cybersecurity Analyst" vs "Information
    # Security Specialist"). job_title is still a prefilter boost and is given to the
    # LLM, which weighs role fit semantically against the full résumé instead.

    adjusted = min(capped_score, cap)
    if adjusted < capped_score and rationale:
        rationale = f"{rationale} Guardrail adjustment: {', '.join(reasons)}."

    return adjusted, rationale


def _scan_lookup(table_name, key):
    """Scan a lookup table's values (cached per warm container)."""
    if not table_name:
        return []
    if table_name in _lookup_cache:
        return _lookup_cache[table_name]
    values = []
    try:
        table = dynamodb.Table(table_name)
        resp = table.scan(ProjectionExpression="#k", ExpressionAttributeNames={"#k": key})
        values = [i[key] for i in resp.get("Items", []) if i.get(key)]
        while "LastEvaluatedKey" in resp:
            resp = table.scan(
                ProjectionExpression="#k",
                ExpressionAttributeNames={"#k": key},
                ExclusiveStartKey=resp["LastEvaluatedKey"],
            )
            values += [i[key] for i in resp.get("Items", []) if i.get(key)]
    except Exception as e:
        print(f"Lookup scan failed for {table_name}: {e}")
    _lookup_cache[table_name] = values
    return values


def _expand_query_terms(jd):
    """LLM-grounded expansion: which CANONICAL lookup skills/titles are equivalent to the JD's?

    Matching the expanded canonical terms against structured skill_names/job_title finds
    candidates who describe the same skill with different words — without the noise of matching
    raw terms against résumé body text. Returns (extra_skills, extra_titles); empty on failure.
    """
    jd_skills = _to_list(jd.get("required_skills")) + _to_list(jd.get("desired_skills"))
    skills_vocab = _scan_lookup(SKILLS_LOOKUP_TABLE, "skill")
    if not jd_skills or not skills_vocab:
        return [], []
    titles_vocab = _scan_lookup(JOB_TITLES_LOOKUP_TABLE, "job_title")
    prompt = (
        f"A job needs these skills: {json.dumps(jd_skills)}\n"
        f"Job title: {jd.get('job_title')}\n\n"
        f"Candidate database skill vocabulary:\n{json.dumps(skills_vocab)}\n\n"
        f"Job-title vocabulary:\n{json.dumps(titles_vocab)}\n\n"
        'Return ONLY a JSON object {"skills": [...], "titles": [...]} of vocabulary entries that '
        "are TIGHT EQUIVALENTS of the job's needs — the SAME skill/role described with different "
        "words. This feeds mechanical keyword retrieval, so precision matters more than recall.\n"
        'INCLUDE only near-synonyms, e.g. "Software Engineer" ⇄ "Software Developer", '
        '"Amazon Web Services" ⇄ "AWS", "K8s" ⇄ "Kubernetes".\n'
        'EXCLUDE merely-related or broader/narrower entries, e.g. do NOT map "Software Engineer" '
        'to "Computer Scientist" or "Data Scientist" — those are judged separately by semantic '
        "search and the scoring model. Use ONLY exact strings from the vocabularies above; return "
        "empty arrays if nothing is a tight equivalent."
    )
    try:
        resp = bedrock.converse(
            modelId=MODEL_ID,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 1024, "temperature": 0},
        )
        text = resp["output"]["message"]["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0].strip()
        data = json.loads(text)
        vocab_s, vocab_t, jd_set = set(skills_vocab), set(titles_vocab), set(jd_skills)
        extra_skills = [s for s in data.get("skills", []) if s in vocab_s and s not in jd_set]
        extra_titles = [t for t in data.get("titles", []) if t in vocab_t]
        return extra_skills, extra_titles
    except Exception as e:
        print(f"Query expansion failed: {e}")
        return [], []


def _build_prefilter_query(jd, extra_skills=None, extra_titles=None):
    """Build an OpenSearch bool query to pre-filter and score candidates."""
    should = []
    filters = []

    # Lookup-expanded canonical skills/titles (Phase 2b) — lower boost than the JD's own terms.
    for skill in extra_skills or []:
        should.append({"term": {"skill_names": {"value": skill, "boost": 2}}})
    for title in extra_titles or []:
        should.append({"match": {"job_title": {"query": title, "boost": 1}}})

    # Exact keyword boosts on the canonical skill/cert lists (precise matches).
    for skill in jd.get("required_skills") or []:
        should.append({"term": {"skill_names": {"value": skill, "boost": 3}}})
    for skill in jd.get("desired_skills") or []:
        should.append({"term": {"skill_names": {"value": skill, "boost": 1}}})

    for cert in jd.get("required_certifications") or []:
        should.append({"term": {"cert_names": {"value": cert, "boost": 3}}})
    for cert in jd.get("desired_certifications") or []:
        should.append({"term": {"cert_names": {"value": cert, "boost": 1}}})

    # NOTE: recall for differently-worded skills is handled in Phase 2 via (a) lookup-table
    # query expansion against these structured skill_names/job_title fields and (b) semantic
    # kNN over résumé chunks — NOT by matching raw terms against the résumé body, which
    # boosts incidental keyword mentions ("we used Python, but I did Java") and is noisy.

    # Boost matching industry / job title (job_title is a positive signal, never a gate)
    if jd.get("industry_category"):
        # Match against the split list field so multi-industry candidates still get boosted.
        should.append({"term": {"industry_category_list": {"value": jd["industry_category"], "boost": 2}}})
    if jd.get("job_title"):
        should.append({"match": {"job_title": {"query": jd["job_title"], "boost": 2}}})

    # Clearance: filter to candidates who meet or exceed the requirement
    required_clearance = jd.get("required_clearance")
    if required_clearance:
        req_rank = _clearance_rank(required_clearance)
        if req_rank >= 0:
            qualifying = _CLEARANCE_HIERARCHY[req_rank:]
            filters.append({"terms": {"clearance_level": qualifying}})

    # Experience: filter to candidates meeting minimum
    min_exp = jd.get("min_experience_years")
    if min_exp is not None:
        filters.append({"range": {"years_of_experience": {"gte": float(min_exp)}}})

    query = {
        "bool": {
            "should": should,
            "minimum_should_match": 1 if should else 0,
        }
    }
    if filters:
        query["bool"]["filter"] = filters

    return query


def _jd_query_text(jd):
    """The JD's FOCUSED role signal (not the raw JD — that dilutes the match).

    Uses the distilled responsibilities[] + summary + seniority/domain + skills. Shared by the
    embedding (kNN query) and the reranker query.
    """
    parts = []
    if jd.get("job_title"):
        parts.append(str(jd["job_title"]))
    if jd.get("seniority"):
        parts.append(f"Seniority: {jd['seniority']}")
    if jd.get("domain"):
        parts.append(f"Domain: {jd['domain']}")
    if jd.get("description_summary"):
        parts.append(str(jd["description_summary"]))
    responsibilities = _to_list(jd.get("responsibilities"))
    if responsibilities:
        parts.append("Responsibilities: " + "; ".join(responsibilities))
    skills = _to_list(jd.get("required_skills")) + _to_list(jd.get("desired_skills"))
    if skills:
        parts.append("Skills: " + ", ".join(skills))
    return "\n".join(parts).strip()


def _embed_jd_query(jd):
    """Embed the JD's focused role signal. Returns None on failure (→ lexical fallback)."""
    text = _jd_query_text(jd)
    if not text:
        return None
    try:
        resp = bedrock.invoke_model(
            modelId=EMBED_MODEL_ID,
            body=json.dumps({"inputText": text[:8000], "dimensions": EMBED_DIM, "normalize": True}),
        )
        return json.loads(resp["body"].read())["embedding"]
    except Exception as e:
        print(f"JD embedding failed (falling back to lexical): {e}")
        return None


def _vector_candidate_pks(os_client, query_vector):
    """kNN the résumé-chunk index, aggregate chunk hits to candidates (best chunk wins).

    Returns candidate pks ordered best-first. Empty on failure or when no vectors exist yet
    (keeps the matcher working before/during the embedding rollout).
    """
    if not query_vector:
        return []
    body = {
        "size": KNN_CHUNK_HITS,
        "query": {"knn": {"vector": {"vector": query_vector, "k": KNN_CHUNK_HITS}}},
        "_source": ["parent_pk"],
    }
    try:
        resp = os_client.search(index=CHUNK_INDEX, body=body)
    except Exception as e:
        print(f"kNN search skipped/failed (falling back to lexical): {e}")
        return []
    best = {}
    for hit in resp.get("hits", {}).get("hits", []):
        pk = (hit.get("_source") or {}).get("parent_pk")
        if not pk:
            continue
        score = hit.get("_score", 0)
        if pk not in best or score > best[pk]:
            best[pk] = score
    return sorted(best, key=best.get, reverse=True)[:VECTOR_CANDIDATES]


def _rrf_order(lexical_pks, vector_pks, k=RRF_K):
    """Reciprocal-rank fusion of the lexical and vector candidate lists (best first)."""
    scores = {}
    for rank, pk in enumerate(lexical_pks):
        scores[pk] = scores.get(pk, 0) + 1.0 / (k + rank + 1)
    for rank, pk in enumerate(vector_pks):
        scores[pk] = scores.get(pk, 0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=scores.get, reverse=True)


def _fetch_candidates_by_pk(os_client, pks):
    """mget candidate profile docs by pk; returns {pk: _source}."""
    if not pks:
        return {}
    try:
        resp = os_client.mget(index=INDEX_NAME, body={"ids": pks})
    except Exception as e:
        print(f"mget candidates failed: {e}")
        return {}
    return {d["_id"]: d["_source"] for d in resp.get("docs", []) if d.get("found")}


def _candidate_rerank_text(c):
    """Candidate text for the reranker. Uses the FULL résumé (capped) — reranking on the
    thin summary made the reranker's picks diverge from the LLM's (which reads the résumé);
    Bedrock Rerank auto-chunks long docs and returns one score per candidate."""
    title = c.get("job_title") or ""
    resume = c.get("resume_text") or c.get("summary") or ""
    return (f"{title}\n{resume}" if title else resume)[:RERANK_CHARS_CAP] or " "


def _rerank_candidates(jd, candidates):
    """Reorder the fused candidate set by Cohere Rerank relevance to the JD, so the LLM
    scores the genuinely-best few. Falls back to the input order on any failure."""
    if len(candidates) <= 1:
        return candidates
    query = _jd_query_text(jd)
    if not query:
        return candidates
    docs = candidates[:RERANK_INPUT]
    sources = [
        {
            "type": "INLINE",
            "inlineDocumentSource": {"type": "TEXT", "textDocument": {"text": _candidate_rerank_text(c)}},
        }
        for c in docs
    ]
    try:
        resp = bedrock_agent.rerank(
            queries=[{"type": "TEXT", "textQuery": {"text": query[:2000]}}],
            sources=sources,
            rerankingConfiguration={
                "type": "BEDROCK_RERANKING_MODEL",
                "bedrockRerankingConfiguration": {
                    "numberOfResults": len(docs),
                    "modelConfiguration": {"modelArn": RERANK_MODEL_ARN},
                },
            },
        )
        order = [r["index"] for r in resp.get("results", []) if isinstance(r.get("index"), int)]
        if not order:
            return candidates  # malformed/empty response → keep fused order, drop nothing
        seen = set()
        reranked = []
        for i in order:
            if 0 <= i < len(docs) and i not in seen:
                seen.add(i)
                reranked.append(docs[i])
        # never drop a candidate: append any docs the reranker omitted, in original order
        reranked += [docs[i] for i in range(len(docs)) if i not in seen]
        # keep any candidates beyond the rerank window in their fused order
        return reranked + candidates[RERANK_INPUT:]
    except Exception as e:
        print(f"Rerank failed (keeping fused order): {e}")
        return candidates


def _build_scoring_prompt(jd, candidates):
    """Build the Bedrock prompt for alignment scoring."""
    jd_summary = {
        "title": jd.get("title"),
        "description_summary": jd.get("description_summary"),
        "responsibilities": jd.get("responsibilities", []),
        "seniority": jd.get("seniority"),
        "domain": jd.get("domain"),
        "required_skills": jd.get("required_skills", []),
        "desired_skills": jd.get("desired_skills", []),
        "required_certifications": jd.get("required_certifications", []),
        "desired_certifications": jd.get("desired_certifications", []),
        "required_clearance": jd.get("required_clearance"),
        "min_experience_years": jd.get("min_experience_years"),
        "industry_category": jd.get("industry_category"),
        "job_title": jd.get("job_title"),
        "location": jd.get("location"),
    }

    candidate_summaries = []
    for c in candidates:
        company_names = []
        for company in c.get("companies") or []:
            if isinstance(company, dict):
                company_name = company.get("name")
                if company_name:
                    company_names.append(str(company_name))

        candidate_summaries.append(
            {
                "pk": c.get("pk"),
                "name": c.get("name"),
                "skills": _to_list(c.get("skill_names")),
                "certifications": _to_list(c.get("cert_names")),
                "clearance_level": c.get("clearance_level"),
                "years_of_experience": c.get("years_of_experience"),
                "industry_category": c.get("industry_category"),
                "job_title": c.get("job_title"),
                "location_state": c.get("location_state"),
                "companies": company_names[:8],
                # Full résumé (capped) — the primary evidence. Falls back to the
                # summary only when resume_text is unavailable.
                "resume": (c.get("resume_text") or c.get("summary") or "")[:RESUME_CHARS_CAP],
            }
        )

    return f"""You are an expert technical recruiter scoring how well each candidate fits a \
specific job description. Judge on EVIDENCE in the candidate's résumé — what they have \
actually done — not on surface keyword overlap.

JOB DESCRIPTION:
{json.dumps(jd_summary, cls=DecimalEncoder, indent=2)}

CANDIDATES (each includes their full résumé text plus extracted fields):
{json.dumps(candidate_summaries, cls=DecimalEncoder, indent=2)}

Score each candidate 0-100 using this rubric (100 points total):

1. Role & experience alignment — 40 pts (MOST IMPORTANT)
   Compare the résumé against the JD's responsibilities, seniority, and domain. Does the
   candidate's actual work history show they have DONE the duties the JD lists? Reward
   hands-on evidence of the same kind of work at the right level. Matching keywords behind
   a fundamentally different real role (e.g. a project manager for a hands-on engineering
   JD) scores LOW here.

2. Skills & certifications — 30 pts
   Required skills/certs weigh far more than desired. Credit a skill when the résumé
   demonstrates it even if worded differently from the JD ("AWS" ≈ "Amazon Web Services",
   "ran the SOC" ≈ "Security Operations"). Do NOT require exact wording. Note genuinely
   missing required skills.


3. Years of experience — 15 pts
   Compare relevant experience to the JD minimum.

4. Clearance, location & industry — 15 pts
   Clearance meeting or exceeding the requirement, location/remote compatibility, and
   industry/sector overlap.

Guidance:
- Base the score on what the résumé shows; the rationale must cite specific evidence.
- A clearly-aligned, well-qualified match approaches 90-100; keyword-only overlap behind a
  fundamentally different real role stays below ~70.
- Be decisive and consistent — identical evidence must yield identical scores.

For each candidate, produce a JSON object:
- "pk": the candidate's pk, EXACTLY as given (string)
- "score": integer 0-100
- "rationale": 1-2 sentences citing the specific résumé evidence behind the score,
  including how their experience level compares to the JD requirement.

Scoring bands: 90-100 excellent / low-risk · 70-89 good with minor gaps ·
50-69 partial with notable gaps · 30-49 weak · 0-29 poor.

Return ONLY a JSON array of these objects, sorted by score descending. No markdown, no prose \
outside the JSON."""


def _converse_with_retry(prompt, attempts=3):
    """Bedrock converse with backoff on throttling (concurrent scoring raises throttle odds)."""
    for i in range(attempts):
        try:
            return bedrock.converse(
                modelId=MODEL_ID,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"maxTokens": 4096, "temperature": 0},
            )
        except Exception as e:
            throttled = "Throttl" in type(e).__name__ or "TooManyRequests" in type(e).__name__
            if throttled and i < attempts - 1:
                time.sleep(1.5 * (2**i))
                continue
            raise


def _score_candidates(jd, candidates):
    """Score candidates concurrently.

    Each small batch is a separate Bedrock call fanned out on a thread pool, so wall-clock
    ≈ the slowest single batch instead of the sum of all of them. Scoring is rubric-based
    (absolute 0-100 vs the JD), so independent batches don't lose cross-candidate calibration
    — and it removes position bias. Keeps the whole request under the 30s API Gateway cap.
    """
    if not candidates:
        return {}, {"in": 0, "out": 0, "calls": 0}

    batches = [candidates[i : i + SCORING_BATCH] for i in range(0, len(candidates), SCORING_BATCH)]
    score_map = {}
    usage = {"in": 0, "out": 0, "calls": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_SCORING_WORKERS) as pool:
        for sm, u in pool.map(lambda b: _score_batch(jd, b), batches):
            score_map.update(sm)
            for k in usage:
                usage[k] += u[k]
    return score_map, usage


def _score_batch(jd, candidates):
    """Score one small batch. Returns ({pk: {score, rationale}}, token-usage dict)."""
    if not candidates:
        return {}, {"in": 0, "out": 0, "calls": 0}

    prompt = _build_scoring_prompt(jd, candidates)

    try:
        response = _converse_with_retry(prompt)
        _u = response.get("usage") or {}
        usage = {"in": _u.get("inputTokens", 0), "out": _u.get("outputTokens", 0), "calls": 1}

        text = response["output"]["message"]["content"][0]["text"]

        # Parse the JSON response — handle markdown code blocks
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        scores = json.loads(text)

        # Build lookup of scores by pk
        candidate_by_pk = {c.get("pk"): c for c in candidates if c.get("pk")}
        score_map = {}
        for entry in scores:
            pk = entry.get("pk")
            if pk:
                raw_score = max(0, min(100, int(entry.get("score", 0))))
                raw_rationale = str(entry.get("rationale", ""))
                adjusted_score, adjusted_rationale = _apply_score_guardrails(
                    jd,
                    candidate_by_pk.get(pk, {}),
                    raw_score,
                    raw_rationale,
                )
                score_map[pk] = {
                    "score": adjusted_score,
                    "rationale": adjusted_rationale,
                }

        return score_map, usage

    except Exception as e:
        print(f"Bedrock scoring error: {e}")
        return {}, {"in": 0, "out": 0, "calls": 0}


def handler(event, context):
    try:
        t_start = time.time()
        pk = (event.get("pathParameters") or {}).get("pk")

        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk path parameter"}),
            }

        # Parse optional limit + feature toggles (toggles enable per-feature ablation eval).
        params = event.get("queryStringParameters") or {}
        use_vector = str(params.get("vector", "true")).lower() not in ("false", "0", "no")
        use_rerank = str(params.get("rerank", RERANK_DEFAULT)).lower() not in ("false", "0", "no")
        use_expand = str(params.get("expand", EXPAND_DEFAULT)).lower() not in ("false", "0", "no")
        try:
            limit = min(int(params.get("limit", DEFAULT_RETURN_LIMIT)), PRE_FILTER_LIMIT)
        except (ValueError, TypeError):
            limit = DEFAULT_RETURN_LIMIT

        # 1. Fetch job description
        jd_response = jd_table.get_item(Key={"pk": pk})
        jd = jd_response.get("Item")
        if not jd:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Job description not found"}),
            }

        # 2. Pre-filter candidates from OpenSearch (optionally with lookup-grounded expansion)
        os_client = _get_os_client()
        extra_skills, extra_titles = _expand_query_terms(jd) if use_expand else ([], [])
        query = _build_prefilter_query(jd, extra_skills, extra_titles)

        search_body = {
            "query": query,
            "size": PRE_FILTER_LIMIT,
            "sort": [{"_score": {"order": "desc"}}],
        }

        try:
            os_response = os_client.search(index=INDEX_NAME, body=search_body)
            hits = os_response.get("hits", {}).get("hits", [])
        except Exception as e:
            print(f"OpenSearch query error: {e}")
            hits = []

        lexical_sources = {
            h["_source"]["pk"]: h["_source"] for h in hits if (h.get("_source") or {}).get("pk")
        }
        lexical_pks = list(lexical_sources.keys())  # already ordered by lexical _score

        # 2b. Semantic (vector) retrieval — surfaces candidates the lexical leg missed.
        # Backward-compatible: if embeddings/kNN are unavailable this is empty and we fall
        # back to pure lexical order. ?vector=false disables it (ablation eval).
        vector_pks = _vector_candidate_pks(os_client, _embed_jd_query(jd)) if use_vector else []

        if vector_pks:
            fused_pks = _rrf_order(lexical_pks, vector_pks)
            missing = [pk for pk in fused_pks if pk not in lexical_sources][:VECTOR_CANDIDATES]
            sources = {**lexical_sources, **_fetch_candidates_by_pk(os_client, missing)}
            candidates = [sources[pk] for pk in fused_pks if pk in sources]
        else:
            candidates = [lexical_sources[pk] for pk in lexical_pks]

        # The vector leg has no hard-filter clause, so re-apply the JD's hard requirements
        # (clearance, min experience) to the merged set — otherwise RRF fusion can put a
        # disqualified candidate (e.g. missing clearance) in the scored top-K.
        candidates = [c for c in candidates if _meets_hard_requirements(jd, c)]

        # 2c. Rerank the fused set, then BLEND the reranker's order with the fusion order
        # via RRF — the reranker is a voter, not a dictator, so one bad rerank call can't
        # drop a well-fused candidate out of the scored top-K. ?rerank=false disables it.
        rerank_docs = 0
        if use_rerank:
            rerank_docs = min(len(candidates), RERANK_INPUT)
            reranked = _rerank_candidates(jd, candidates)
            by_pk = {c["pk"]: c for c in candidates if c.get("pk")}
            blended = _rrf_order(
                [c["pk"] for c in candidates if c.get("pk")],
                [c["pk"] for c in reranked if c.get("pk")],
            )
            candidates = [by_pk[pk] for pk in blended if pk in by_pk]

        # 3. Score top candidates with Bedrock (parallel)
        to_score = candidates[:SCORING_LIMIT]
        score_map, llm_usage = _score_candidates(jd, to_score)

        # 4. Build results — merge scores with candidate data
        results = []
        for candidate in candidates:
            cpk = candidate.get("pk", "")
            scoring = score_map.get(cpk)
            if scoring:
                results.append(
                    {
                        "pk": cpk,
                        "name": candidate.get("name"),
                        "job_title": candidate.get("job_title"),
                        "clearance_level": candidate.get("clearance_level"),
                        "years_of_experience": candidate.get("years_of_experience"),
                        "location_state": candidate.get("location_state"),
                        "skills": _to_list(candidate.get("skill_names")),
                        "certifications": _to_list(candidate.get("cert_names")),
                        "industry_category": candidate.get("industry_category"),
                        "score": scoring["score"],
                        "rationale": scoring["rationale"],
                    }
                )
            else:
                # Candidates beyond SCORING_LIMIT or scoring failed
                results.append(
                    {
                        "pk": cpk,
                        "name": candidate.get("name"),
                        "job_title": candidate.get("job_title"),
                        "clearance_level": candidate.get("clearance_level"),
                        "years_of_experience": candidate.get("years_of_experience"),
                        "location_state": candidate.get("location_state"),
                        "skills": _to_list(candidate.get("skill_names")),
                        "certifications": _to_list(candidate.get("cert_names")),
                        "industry_category": candidate.get("industry_category"),
                        "score": None,
                        "rationale": None,
                    }
                )

        # Sort scored candidates first (by score desc), then unscored
        results.sort(key=lambda x: (x["score"] is not None, x["score"] or 0), reverse=True)

        # Telemetry: which stages ran + real cost/latency, for the ablation + cost eval.
        telemetry = {
            "lexical_candidates": len(lexical_pks),
            "vector_candidates": len(vector_pks),
            "vector_used": use_vector,
            "rerank_used": use_rerank,
            "rerank_docs": rerank_docs,
            "expand_used": use_expand,
            "expanded_skills": len(extra_skills),
            "expanded_titles": len(extra_titles),
            "candidates_scored": sum(1 for r in results if r["score"] is not None),
            "llm_calls": llm_usage["calls"],
            "llm_input_tokens": llm_usage["in"],
            "llm_output_tokens": llm_usage["out"],
            "embed_calls": 1 if use_vector else 0,
            "latency_ms": int((time.time() - t_start) * 1000),
        }

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "job_description": {
                        "pk": jd.get("pk"),
                        "title": jd.get("title"),
                    },
                    "total_candidates": len(results),
                    "matches": results[:limit],
                    "telemetry": telemetry,
                },
                cls=DecimalEncoder,
            ),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
