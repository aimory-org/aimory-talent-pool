/**
 * API client for the talent pool backend.
 * Uses Cognito JWT tokens for authentication.
 */
import { fetchAuthSession } from "aws-amplify/auth";
import type { TalentProfile, CandidateStatus } from "@/types/talent";

const API_BASE_URL = import.meta.env.VITE_API_ENDPOINT;

if (!API_BASE_URL) {
  console.warn("VITE_API_ENDPOINT not set - API calls will fail");
}

/**
 * Get the current user's JWT token for API calls.
 */
async function getAuthToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new Error("No authentication token available");
  }
  return token;
}

/**
 * Make an authenticated API request.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// -----------------------------------------------------------------------------
// API Types
// -----------------------------------------------------------------------------

export interface ListTalentsParams {
  status?: string;
  service_category?: string;
  industry_category?: string;
  job_title?: string;
  clearance_level?: string;
  location_state?: string;
  city?: string;
  skills?: string[];
  certifications?: string[];
  tags?: string[];
  search?: string;
  minYears?: number;
  maxYears?: number;
}

export interface ListTalentsResponse {
  items: TalentProfile[];
  count: number;
}

export interface LookupsResponse {
  skills: string[];
  certifications: string[];
  job_titles: string[];
  industry_categories: string[];
  cities: { city: string; state: string }[];
}

// -----------------------------------------------------------------------------
// API Functions
// -----------------------------------------------------------------------------

/**
 * List talent profiles with optional filters.
 */
export async function listTalents(
  params: ListTalentsParams = {},
): Promise<ListTalentsResponse> {
  const searchParams = new URLSearchParams();

  if (params.status) searchParams.set("status", params.status);
  if (params.service_category)
    searchParams.set("service_category", params.service_category);
  if (params.industry_category)
    searchParams.set("industry_category", params.industry_category);
  if (params.job_title) searchParams.set("job_title", params.job_title);
  if (params.clearance_level)
    searchParams.set("clearance_level", params.clearance_level);
  if (params.location_state)
    searchParams.set("location_state", params.location_state);
  if (params.city) searchParams.set("city", params.city);
  if (params.skills?.length)
    searchParams.set("skills", params.skills.join(","));
  if (params.certifications?.length)
    searchParams.set("certifications", params.certifications.join(","));
  if (params.tags?.length) searchParams.set("tags", params.tags.join(","));
  if (params.search) searchParams.set("search", params.search);
  if (params.minYears !== undefined)
    searchParams.set("minYears", params.minYears.toString());
  if (params.maxYears !== undefined)
    searchParams.set("maxYears", params.maxYears.toString());

  const query = searchParams.toString();
  return apiFetch<ListTalentsResponse>(`/talents${query ? `?${query}` : ""}`);
}

/**
 * Get a single talent profile by primary key.
 */
export async function getTalent(pk: string): Promise<TalentProfile> {
  return apiFetch<TalentProfile>(`/talents/${encodeURIComponent(pk)}`);
}

/**
 * Get lookup data for dropdowns (skills, certifications, cities).
 */
export async function getLookups(
  include?: ("skills" | "certifications" | "job_titles" | "cities")[],
): Promise<LookupsResponse> {
  const query = include?.length ? `?include=${include.join(",")}` : "";
  return apiFetch<LookupsResponse>(`/lookups${query}`);
}

/**
 * Get a presigned URL for viewing a resume.
 */
export async function getResumeUrl(
  s3Key: string,
): Promise<{ url: string; expiresIn: number }> {
  return apiFetch<{ url: string; expiresIn: number }>(
    `/resume-url?key=${encodeURIComponent(s3Key)}`,
  );
}

/**
 * Update talent profile fields.
 */
export interface UpdateTalentParams {
  status?: CandidateStatus;
  requested_salary?: number | null;
  name?: string;
  contact?: {
    email?: string | null;
    phone?: string | null;
    linkedin?: string | null;
    github?: string | null;
  };
  summary?: string | null;
  service_category?: string;
  industry_category?: string;
  job_title?: string;
  clearance_level?: string | null;
  skillsets?: { name: string; evidence?: string[] }[];
  certifications?: string[];
  companies?: { name: string; evidence?: string[] }[];
  location?: {
    city?: string | null;
    state?: string | null;
  };
  years_of_experience?: number | null;
  notes?: string;
  tags?: string[];
}

export async function updateTalent(
  pk: string,
  updates: UpdateTalentParams,
): Promise<TalentProfile> {
  const result = await apiFetch<{ profile: TalentProfile }>(
    `/talents?pk=${encodeURIComponent(pk)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );
  return result.profile;
}

/**
 * Delete a talent profile.
 */
export async function deleteTalent(pk: string): Promise<void> {
  await apiFetch(`/talents?pk=${encodeURIComponent(pk)}`, {
    method: "DELETE",
  });
}
