/**
 * Data-quality warning detection shared by the warnings filter and the
 * per-row table badge.
 */
import type { TalentProfile } from "@/types/talent";

export type WarningType =
  | "duplicate"
  | "missing_name"
  | "missing_job_title"
  | "no_skills"
  | "no_location";

export const WARNING_TYPES: { value: WarningType; label: string }[] = [
  { value: "duplicate", label: "Possible Duplicate" },
  { value: "missing_name", label: "Missing Name" },
  { value: "missing_job_title", label: "Missing Job Title" },
  { value: "no_skills", label: "No Skills" },
  { value: "no_location", label: "No Location" },
];

export const WARNING_LABELS: Record<WarningType, string> = WARNING_TYPES.reduce(
  (acc, w) => ({ ...acc, [w.value]: w.label }),
  {} as Record<WarningType, string>,
);

export function getProfileWarnings(profile: TalentProfile): WarningType[] {
  const warnings: WarningType[] = [];
  if (profile.possible_duplicate_of) warnings.push("duplicate");
  if (!profile.name?.trim()) warnings.push("missing_name");
  if (!profile.job_title?.trim()) warnings.push("missing_job_title");
  if (!profile.skillsets || profile.skillsets.length === 0) warnings.push("no_skills");
  if (!profile.location?.city && !profile.location?.state) warnings.push("no_location");
  return warnings;
}
