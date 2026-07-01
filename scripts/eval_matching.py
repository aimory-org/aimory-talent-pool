"""
Evaluate the candidate matcher: A/B the reranker across all job descriptions.

Invokes the deployed match_candidates lambda twice per JD (rerank on vs off) and compares
the LLM-scored result sets. Since scoring is rubric-based (absolute 0-100), a retrieval
change is "better" when it lands higher-scoring candidates in the scored top-K.

Usage:
    python scripts/eval_matching.py \
        --function aimory-talent-pool-dev-api-match-candidates \
        --jd-table aimory-talent-pool-dev-job-descriptions \
        --region   us-east-1 \
        [--limit-jds N] [--top-k 5]

Metric per JD: mean of the top-K LLM scores, with and without the reranker.
Verdict: on how many JDs the reranker helped / hurt / tied, plus average lift.
"""

import argparse
import json
import time

import boto3


def _invoke(lam, function, jd_pk, qs):
    """Invoke the matcher with query-string overrides. Returns (scores, telemetry)."""
    payload = {"pathParameters": {"pk": jd_pk}, "queryStringParameters": {"limit": "15", **qs}}
    resp = lam.invoke(FunctionName=function, Payload=json.dumps(payload).encode())
    body = json.loads(resp["Payload"].read())
    if body.get("statusCode") != 200:
        return None, {}
    parsed = json.loads(body["body"])
    scores = [m["score"] for m in parsed.get("matches", []) if isinstance(m, dict) and m.get("score") is not None]
    return scores, parsed.get("telemetry", {})


def _topk_mean(scores, k):
    top = sorted(scores, reverse=True)[:k]
    return sum(top) / len(top) if top else 0.0


# Ablation arms — each adds one feature, so arm-to-arm deltas isolate that feature's effect.
ARMS = [
    ("lexical", {"vector": "false", "rerank": "false", "expand": "false"}),
    ("+vector", {"vector": "true", "rerank": "false", "expand": "false"}),
    ("+rerank", {"vector": "true", "rerank": "true", "expand": "false"}),
    ("+expand", {"vector": "true", "rerank": "true", "expand": "true"}),
]


def main():
    p = argparse.ArgumentParser(description="Ablation eval of the matcher: quality + cost per feature")
    p.add_argument("--function", required=True)
    p.add_argument("--jd-table", required=True)
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--limit-jds", type=int, default=None)
    p.add_argument("--top-k", type=int, default=5)
    p.add_argument("--runs", type=int, default=1, help="Runs per config per JD, averaged (de-noises)")
    p.add_argument("--arms", default=None, help="Comma-separated arm names to include (default all)")
    p.add_argument("--sleep", type=float, default=2.0, help="Seconds between invokes (avoid throttle)")
    args = p.parse_args()

    arms = ARMS if not args.arms else [a for a in ARMS if a[0] in args.arms.split(",")]

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    lam = boto3.client("lambda", region_name=args.region)
    jds = dynamodb.Table(args.jd_table).scan().get("Items", [])
    if args.limit_jds:
        jds = jds[: args.limit_jds]

    # Per-arm accumulators: quality (top-k mean) + measured cost (from telemetry).
    agg = {name: {"q": [], "in": [], "out": [], "lat": [], "rerank_docs": [], "embed": []} for name, _ in arms}

    print(f"Ablation across {len(jds)} JDs, {args.runs} run(s)/config averaged (top-{args.top_k} mean)\n")
    header = f"{'JD title':<32}" + "".join(f"{name:>10}" for name, _ in arms)
    print(header)
    print("-" * len(header))
    for jd in jds:
        pk, title = jd["pk"], (jd.get("title") or "?")[:31]
        row = {}
        for name, qs in arms:
            q_runs, tels = [], []
            for _ in range(args.runs):
                scores, tel = _invoke(lam, args.function, pk, qs)
                time.sleep(args.sleep)
                if scores is not None:
                    q_runs.append(_topk_mean(scores, args.top_k))
                    tels.append(tel)
            if not q_runs:
                row[name] = None
                continue
            q = sum(q_runs) / len(q_runs)  # average over runs → de-noised
            row[name] = q
            agg[name]["q"].append(q)
            agg[name]["in"].append(sum(t.get("llm_input_tokens", 0) for t in tels) / len(tels))
            agg[name]["out"].append(sum(t.get("llm_output_tokens", 0) for t in tels) / len(tels))
            agg[name]["lat"].append(sum(t.get("latency_ms", 0) for t in tels) / len(tels))
            agg[name]["rerank_docs"].append(sum(t.get("rerank_docs", 0) for t in tels) / len(tels))
            agg[name]["embed"].append(sum(t.get("embed_calls", 0) for t in tels) / len(tels))
        cells = "".join((f"{row[name]:>10.1f}" if row.get(name) is not None else f"{'ERR':>10}") for name, _ in arms)
        print(f"{title:<32}{cells}")

    def mean(xs):
        return sum(xs) / len(xs) if xs else 0.0

    print("\n=== QUALITY (top-{} mean) & measured COST per arm ===".format(args.top_k))
    print(f"{'arm':<10}{'quality':>9}{'in_tok':>9}{'out_tok':>9}{'embed':>7}{'rrk_docs':>9}{'latency_s':>10}")
    prev_q = None
    for name, _ in ARMS:
        a = agg[name]
        q = mean(a["q"])
        delta = f"  ({q - prev_q:+.2f} vs prev)" if prev_q is not None else ""
        print(
            f"{name:<10}{q:>9.1f}{mean(a['in']):>9.0f}{mean(a['out']):>9.0f}"
            f"{mean(a['embed']):>7.1f}{mean(a['rerank_docs']):>9.0f}{mean(a['lat']) / 1000:>10.1f}{delta}"
        )
        prev_q = q
    print("\nPer-feature quality lift = each arm's quality minus the previous arm's.")
    print("Cost columns are measured resource usage per match (multiply by provider rates for $).")


if __name__ == "__main__":
    main()
