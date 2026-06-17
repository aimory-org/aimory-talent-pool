/**
 * Job Description type definitions.
 */

export interface JobDescription {
  pk: string;
  title: string | null;
  required_skills: string[];
  desired_skills: string[];
  required_certifications: string[];
  desired_certifications: string[];
  required_clearance: ClearanceLevel;
  min_experience_years: number | null;
  location: {
    city: string | null;
    state: string | null;
    remote: string | null;
  };
  location_state: string;
  industry_category: string | null;
  job_title: string | null;
  salary_range: { min: number | null; max: number | null } | null;
  skill_names: string;
  cert_names: string;
  bucket: string;
  key: string;
  possible_duplicate_of?: string;
  archived?: boolean;
  created_at: string;
  updated_at: string;
}

export type ClearanceLevel =
  | "Secret"
  | "TS"
  | "TS/SCI"
  | "TS/SCI/FSP"
  | "TS/SCI/CI"
  | "Yankee White"
  | null;

export interface CandidateMatch {
  pk: string;
  name: string;
  job_title: string | null;
  clearance_level: string | null;
  years_of_experience: number | null;
  location_state: string | null;
  skills: string[];
  certifications: string[];
  industry_category: string | null;
  score: number | null;
  rationale: string | null;
}

export interface MatchCandidatesResponse {
  job_description: { pk: string; title: string | null };
  total_candidates: number;
  matches: CandidateMatch[];
}
