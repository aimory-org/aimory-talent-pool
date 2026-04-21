import type { AuditEntry } from "@/lib/api";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string) {
  return UUID_RE.test(value);
}

export function fallbackCandidateName(entry: AuditEntry): string {
  // candidate_name is sometimes set to the raw pk (a UUID) by the Lambda —
  // in that case it's not useful, so skip it.
  const candidateName =
    entry.candidate_name && !isUUID(entry.candidate_name)
      ? entry.candidate_name
      : null;

  // JD pipeline stores the job title as top-level `title` (not candidate_name)
  const topLevelTitle =
    entry.title && !isUUID(entry.title) ? entry.title : null;

  const snapshotName = (() => {
    if (!entry.snapshot || typeof entry.snapshot !== "object") return null;
    const s = entry.snapshot as Record<string, unknown>;
    if (typeof s.name === "string" && s.name) return s.name;
    if (typeof s.job_title === "string" && s.job_title) return s.job_title;
    if (typeof s.title === "string" && s.title) return s.title;
    return null;
  })();

  const pkFallback = entry.pk.split("#").at(-1)?.replace(".pdf", "") ?? null;
  const pkClean = pkFallback && !isUUID(pkFallback) ? pkFallback : null;

  return candidateName ?? topLevelTitle ?? snapshotName ?? pkClean ?? "Unknown";
}
