"""
Golden-set recall eval for the candidate matcher.

Unlike eval_matching.py (which averages LLM scores — a metric that can't validly compare
configs with different rubrics), this measures RECALL against recruiter-labeled expected
matches: for a set of custom JDs, did the matcher surface the candidates a human considers
genuine top matches, and where did they rank?

It A/Bs retrieval arms (lexical-only vs +vector) so you can SEE which expected candidates the
lexical leg misses that semantic retrieval recovers — the concrete case for vector search.

Flow:
  1. Upsert each golden JD into the dev job-descriptions table (pk = the JD's id).
  2. Invoke the deployed matcher per JD per arm.
  3. Report per-expected rank + recall@k per arm, and highlight semantic recoveries.
  4. (default) delete the temporary JDs.  Use --keep to leave them.

Usage:
  python scripts/eval_golden.py \
      --function aimory-talent-pool-dev-api-match-candidates \
      --jd-table aimory-talent-pool-dev-job-descriptions \
      --golden   scripts/golden_set.json \
      --region   us-east-1 \
      [--k 5,10] [--arms lexical,+vector] [--keep] [--only golden-data-analyst]
"""

import argparse
import json
import time

import boto3

# Retrieval arms. rerank is off (disabled as a default); include it here only if you want to
# A/B it explicitly. Each arm is the set of ?query-string toggles sent to the matcher.
ARMS = {
    "lexical": {"vector": "false", "rerank": "false", "expand": "false"},
    "+vector": {"vector": "true", "rerank": "false", "expand": "false"},
    "+rerank": {"vector": "true", "rerank": "true", "expand": "false"},
}

# JD fields we write to the table (everything the matcher reads). Clearance is intentionally
# left unset so these tests measure skill/semantic matching, not the hard clearance gate.
JD_FIELDS = (
    "title",
    "job_title",
    "seniority",
    "domain",
    "description_summary",
    "required_skills",
    "desired_skills",
    "responsibilities",
    "jd_text",
)


def _upsert_jd(table, jd):
    item = {"pk": jd["id"]}
    for f in JD_FIELDS:
        if jd.get(f) is not None:
            item[f] = jd[f]
    table.put_item(Item=item)


def _invoke(lam, function, jd_pk, qs, limit=50):
    payload = {"pathParameters": {"pk": jd_pk}, "queryStringParameters": {"limit": str(limit), **qs}}
    resp = lam.invoke(FunctionName=function, Payload=json.dumps(payload).encode())
    body = json.loads(resp["Payload"].read())
    if body.get("statusCode") != 200:
        raise RuntimeError(f"matcher returned {body.get('statusCode')}: {body.get('body')}")
    parsed = json.loads(body["body"])
    matches = parsed.get("matches", [])
    # rank (1-based) and score by candidate pk, in returned order (scored first, then unscored)
    rank_by_pk, score_by_pk = {}, {}
    for i, m in enumerate(matches):
        pk = m.get("pk")
        if pk and pk not in rank_by_pk:
            rank_by_pk[pk] = i + 1
            score_by_pk[pk] = m.get("score")
    return rank_by_pk, score_by_pk, parsed.get("telemetry", {})


def _fmt_rank(rank):
    return f"#{rank}" if rank else "MISS"


def main():
    p = argparse.ArgumentParser(description="Golden-set recall eval for the matcher")
    p.add_argument("--function", required=True)
    p.add_argument("--jd-table", required=True)
    p.add_argument("--golden", default="scripts/golden_set.json")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--k", default="5,10", help="comma-separated recall@k cutoffs")
    p.add_argument("--arms", default="lexical,+vector", help="comma-separated arm names")
    p.add_argument("--only", default=None, help="run a single JD id")
    p.add_argument("--keep", action="store_true", help="don't delete the temp JDs afterward")
    p.add_argument("--sleep", type=float, default=4.0,
                   help="seconds to pause between matcher invocations (avoids Bedrock "
                        "throttling that shows up as spurious unscored 'misses')")
    args = p.parse_args()

    ks = [int(x) for x in args.k.split(",")]
    arms = [a.strip() for a in args.arms.split(",")]
    for a in arms:
        if a not in ARMS:
            raise SystemExit(f"unknown arm '{a}'. choices: {list(ARMS)}")

    with open(args.golden) as fh:
        golden = json.load(fh)
    jds = golden["jds"]
    if args.only:
        jds = [j for j in jds if j["id"] == args.only]
        if not jds:
            raise SystemExit(f"no JD with id '{args.only}'")

    lam = boto3.client("lambda", region_name=args.region)
    table = boto3.resource("dynamodb", region_name=args.region).Table(args.jd_table)

    # aggregate recall counters: arm -> tier -> k -> (hits, total)
    agg = {a: {"must": {k: [0, 0] for k in ks}, "should": {k: [0, 0] for k in ks}} for a in arms}
    recoveries = []  # (jd_id, name, lexical_rank, vector_rank)

    created = []
    try:
        for jd in jds:
            _upsert_jd(table, jd)
            created.append(jd["id"])
            print("\n" + "=" * 78)
            print(f"JD: {jd['id']}  —  {jd.get('title', jd.get('job_title'))}")
            print("=" * 78)

            arm_results = {}
            for a in arms:
                rank_by_pk, score_by_pk, tel = _invoke(lam, args.function, jd["id"], ARMS[a])
                arm_results[a] = (rank_by_pk, score_by_pk)
                print(
                    f"  [{a:8}] scored={tel.get('candidates_scored')} "
                    f"lexN={tel.get('lexical_candidates')} vecN={tel.get('vector_candidates')} "
                    f"latency={tel.get('latency_ms')}ms"
                )
                time.sleep(args.sleep)

            # per-expected candidate table
            header = f"  {'expected candidate':44} {'tier':5} " + " ".join(f"{a:>9}" for a in arms)
            print(header)
            print("  " + "-" * (len(header) - 2))
            for exp in jd["expected"]:
                pk, tier = exp["pk"], exp["tier"]
                cells = []
                ranks = {}
                for a in arms:
                    rank = arm_results[a][0].get(pk)
                    score = arm_results[a][1].get(pk)
                    ranks[a] = rank
                    tag = _fmt_rank(rank)
                    if rank and score is not None:
                        tag += f"({int(score)})"
                    cells.append(f"{tag:>9}")
                    for k in ks:
                        if rank and rank <= k:
                            agg[a][tier][k][0] += 1
                        agg[a][tier][k][1] += 1
                print(f"  {exp['name'][:44]:44} {tier:5} " + " ".join(cells))

                # semantic recovery: lexical misses top-10 but +vector lands it there
                if "lexical" in arms and "+vector" in arms:
                    lr, vr = ranks.get("lexical"), ranks.get("+vector")
                    lex_bad = (lr is None) or (lr > 10)
                    vec_good = (vr is not None) and (vr <= 10)
                    if lex_bad and vec_good:
                        recoveries.append((jd["id"], exp["name"], lr, vr))
    finally:
        if not args.keep:
            for jid in created:
                table.delete_item(Key={"pk": jid})
            print(f"\n(cleaned up {len(created)} temp JD(s); use --keep to retain them)")
        else:
            print(f"\n(kept {len(created)} temp JD(s) in {args.jd_table})")

    # summary
    print("\n" + "#" * 78)
    print("SUMMARY — recall@k (share of expected candidates surfaced in top-k)")
    print("#" * 78)
    for tier in ("must", "should"):
        print(f"\n  tier = {tier}")
        for a in arms:
            parts = []
            for k in ks:
                hits, total = agg[a][tier][k]
                pct = (100 * hits / total) if total else 0
                parts.append(f"recall@{k} {hits}/{total} ({pct:.0f}%)")
            print(f"    {a:8} " + "   ".join(parts))

    if "lexical" in arms and "+vector" in arms:
        print("\n  SEMANTIC RECOVERIES (lexical missed top-10, +vector recovered):")
        if recoveries:
            for jid, name, lr, vr in recoveries:
                print(f"    - {name}  [{jid}]  lexical {_fmt_rank(lr)} -> +vector #{vr}")
        else:
            print("    (none this run)")


if __name__ == "__main__":
    main()
