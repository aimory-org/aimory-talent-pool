/**
 * Data-quality warning detection shared by the warnings filter and the
 * per-row table badge.
 */
import type { TalentProfile } from "@/types/talent";

export type WarningType =
  | "duplicate"
  | "incoming_duplicate"
  | "missing_name"
  | "missing_job_title"
  | "no_skills"
  | "no_location";

export const WARNING_TYPES: { value: WarningType; label: string }[] = [
  { value: "duplicate", label: "Possible Duplicate" },
  { value: "incoming_duplicate", label: "Incoming Duplicate" },
  { value: "missing_name", label: "Missing Name" },
  { value: "missing_job_title", label: "Missing Job Title" },
  { value: "no_skills", label: "No Skills" },
  { value: "no_location", label: "No Location" },
];

export const WARNING_LABELS: Record<WarningType, string> = WARNING_TYPES.reduce(
  (acc, w) => ({ ...acc, [w.value]: w.label }),
  {} as Record<WarningType, string>,
);

/**
 * Returns all profiles in the same duplicate cluster as `originalPk`, excluding
 * the original itself. Uses name-matching so dismissed peers (whose
 * `possible_duplicate_of` was cleared) are still included.
 */
export function findDuplicatePeers(
  originalPk: string,
  allTalents: TalentProfile[],
): TalentProfile[] {
  const original = allTalents.find((t) => t.pk === originalPk);
  if (!original) return [];
  const nameLower = original.name?.trim().toLowerCase();
  if (!nameLower || nameLower === "unknown") {
    // Can't cluster by name — fall back to explicit pointer only
    return allTalents.filter((t) => t.possible_duplicate_of === originalPk);
  }
  return allTalents.filter(
    (t) => t.pk !== originalPk && t.name?.trim().toLowerCase() === nameLower,
  );
}

/**
 * Returns all warnings for a profile.
 * Pass `duplicateTargetPks` (set of PKs that other profiles point to via
 * `possible_duplicate_of`) to detect incoming-duplicate warnings.
 */
export function getProfileWarnings(
  profile: TalentProfile,
  duplicateTargetPks?: Set<string>,
): WarningType[] {
  const warnings: WarningType[] = [];
  if (profile.possible_duplicate_of) warnings.push("duplicate");
  if (duplicateTargetPks?.has(profile.pk)) warnings.push("incoming_duplicate");
  if (!profile.name?.trim()) warnings.push("missing_name");
  if (!profile.job_title?.trim()) warnings.push("missing_job_title");
  if (!profile.skillsets || profile.skillsets.length === 0) warnings.push("no_skills");
  if (!profile.location?.city && !profile.location?.state) warnings.push("no_location");
  return warnings;
}
