/**
 * API client for the talent pool backend.
 * Uses Cognito JWT tokens for authentication.
 */
import { fetchAuthSession } from "aws-amplify/auth";
import type { TalentProfile, CandidateStatus } from "@/types/talent";
import type {
  JobDescription,
  MatchCandidatesResponse,
} from "@/types/jobDescription";

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
  industry_categories?: string[];
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
  tags: string[];
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
  const q = new URLSearchParams();
  const { skills, certifications, tags, industry_categories, minYears, maxYears, ...simple } = params;

  for (const [key, val] of Object.entries(simple)) {
    if (val != null && val !== "") q.set(key, String(val));
  }
  if (industry_categories?.length) q.set("industry_category", industry_categories.join(","));
  if (skills?.length) q.set("skills", skills.join(","));
  if (certifications?.length) q.set("certifications", certifications.join(","));
  if (tags?.length) q.set("tags", tags.join(","));
  if (minYears != null) q.set("minYears", String(minYears));
  if (maxYears != null) q.set("maxYears", String(maxYears));

  const qs = q.toString();
  return apiFetch<ListTalentsResponse>(`/talents${qs ? `?${qs}` : ""}`);
}

/**
 * Get a single talent profile by primary key.
 */
export async function getTalent(pk: string): Promise<TalentProfile> {
  return apiFetch<TalentProfile>(`/talent?pk=${encodeURIComponent(pk)}`);
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
  dismiss_duplicate?: boolean;
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

export interface BulkUpdateResult {
  updated_count: number;
  failed_pks: string[];
}

/**
 * Bulk update status for multiple talent profiles in a single API call.
 */
export async function bulkUpdateTalents(
  pks: string[],
  status: CandidateStatus,
): Promise<BulkUpdateResult> {
  return apiFetch<BulkUpdateResult>("/talents/bulk", {
    method: "PATCH",
    body: JSON.stringify({ pks, status }),
  });
}

export interface BulkDeleteResult {
  deleted_count: number;
  failed_pks: string[];
}

/**
 * Bulk delete multiple talent profiles and their S3 resumes.
 */
export async function bulkDeleteTalents(
  pks: string[],
): Promise<BulkDeleteResult> {
  return apiFetch<BulkDeleteResult>("/talents/bulk", {
    method: "DELETE",
    body: JSON.stringify({ pks }),
  });
}

/**
 * Permanently delete a tag from the lookup table and remove it from all profiles.
 */
export async function deleteTag(
  tag: string,
): Promise<{ message: string; profiles_updated: number }> {
  return apiFetch(`/tags?tag=${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
}

// -----------------------------------------------------------------------------
// Audit History
// -----------------------------------------------------------------------------

export interface AuditFieldChange {
  old: unknown;
  new: unknown;
}

export interface AuditEntry {
  pk: string;
  sk: string; // "timestamp#action"
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE";
  timestamp: string;
  user_email: string;
  user_name?: string;
  candidate_name?: string;
  /** Set by the JD pipeline instead of candidate_name */
  title?: string;
  document_type?: string;
  details?: string;
  changes?: Record<string, AuditFieldChange>;
  snapshot?: Record<string, unknown>; // for DELETE
}

export interface AuditHistoryResponse {
  items: AuditEntry[];
}

/**
 * Get audit history for a specific talent profile.
 */
export async function getAuditHistory(
  pk: string,
): Promise<AuditHistoryResponse> {
  return apiFetch<AuditHistoryResponse>(
    `/audit-history?pk=${encodeURIComponent(pk)}`,
  );
}

/**
 * List recent audit entries across all profiles.
 */
export async function listAuditHistory(
  limit = 200,
): Promise<AuditHistoryResponse> {
  return apiFetch<AuditHistoryResponse>(
    `/audit-history?scope=global&limit=${encodeURIComponent(String(limit))}`,
  );
}

// -----------------------------------------------------------------------------
// Deployments
// -----------------------------------------------------------------------------

export interface Deployment {
  id: number;
  status: "completed" | "in_progress" | "queued";
  conclusion: "success" | "failure" | "cancelled" | null;
  branch: string;
  commit_sha: string;
  commit_message: string;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  url: string;
}

export interface DeploymentsResponse {
  deployments: Deployment[];
}

/**
 * Get recent deployment history from GitHub Actions (proxied via Lambda).
 */
export async function getDeployments(): Promise<DeploymentsResponse> {
  return apiFetch<DeploymentsResponse>("/deployments");
}

// -----------------------------------------------------------------------------
// Job Descriptions
// -----------------------------------------------------------------------------

export interface ListJobDescriptionsParams {
  job_title?: string;
  industry_category?: string;
  required_clearance?: string;
  location_state?: string;
  archived?: boolean;
}

/**
 * List job descriptions with optional filters.
 */
export async function listJobDescriptions(
  params: ListJobDescriptionsParams = {},
): Promise<JobDescription[]> {
  const searchParams = new URLSearchParams();
  if (params.job_title) searchParams.set("job_title", params.job_title);
  if (params.industry_category)
    searchParams.set("industry_category", params.industry_category);
  if (params.required_clearance)
    searchParams.set("required_clearance", params.required_clearance);
  if (params.location_state)
    searchParams.set("location_state", params.location_state);
  if (params.archived !== undefined)
    searchParams.set("archived", String(params.archived));

  const query = searchParams.toString();
  return apiFetch<JobDescription[]>(
    `/job-descriptions${query ? `?${query}` : ""}`,
  );
}

/**
 * Get a single job description by primary key.
 */
export async function getJobDescription(pk: string): Promise<JobDescription> {
  return apiFetch<JobDescription>(
    `/job-descriptions/${encodeURIComponent(pk)}`,
  );
}

/**
 * Update a job description's editable fields.
 */
export interface UpdateJobDescriptionParams {
  title?: string;
  required_skills?: string[];
  desired_skills?: string[];
  required_certifications?: string[];
  desired_certifications?: string[];
  required_clearance?: string | null;
  min_experience_years?: number | null;
  location?: {
    city?: string | null;
    state?: string | null;
    remote?: string | null;
  };
  industry_category?: string;
  job_title?: string;
  salary_range?: { min: number | null; max: number | null };
  dismiss_duplicate?: boolean;
  archived?: boolean;
}

export async function updateJobDescription(
  pk: string,
  updates: UpdateJobDescriptionParams,
): Promise<{ status: string; pk: string; updated_at: string }> {
  return apiFetch(`/job-descriptions`, {
    method: "PATCH",
    body: JSON.stringify({ pk, ...updates }),
  });
}

/**
 * Delete a job description.
 */
export async function deleteJobDescription(pk: string): Promise<void> {
  await apiFetch(`/job-descriptions?pk=${encodeURIComponent(pk)}`, {
    method: "DELETE",
  });
}

/**
 * Match candidates against a job description using Bedrock scoring.
 */
export async function matchCandidates(
  pk: string,
  limit?: number,
): Promise<MatchCandidatesResponse> {
  const params = limit ? `?limit=${limit}` : "";
  return apiFetch<MatchCandidatesResponse>(
    `/job-descriptions/${encodeURIComponent(pk)}/match${params}`,
    { method: "POST" },
  );
}

// -----------------------------------------------------------------------------
// JD Upload
// -----------------------------------------------------------------------------

export interface JdUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Get a presigned URL for uploading a job description file.
 */
export async function getJdUploadUrl(
  filename: string,
  contentType: string,
): Promise<JdUploadUrlResponse> {
  return apiFetch<JdUploadUrlResponse>(
    `/jd-upload-url?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`,
  );
}

/**
 * Upload a job description file via presigned URL, then return the S3 key.
 */
export async function uploadJobDescription(file: File): Promise<string> {
  const { uploadUrl, key } = await getJdUploadUrl(file.name, file.type);
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!resp.ok) {
    throw new Error(`Upload failed: ${resp.status} ${resp.statusText}`);
  }
  return key;
}

// -----------------------------------------------------------------------------
// Resume Upload
// -----------------------------------------------------------------------------

export interface ResumeUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Get a presigned URL for uploading a resume file.
 */
export async function getResumeUploadUrl(
  filename: string,
  contentType: string,
): Promise<ResumeUploadUrlResponse> {
  return apiFetch<ResumeUploadUrlResponse>(
    `/resume-upload-url?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`,
  );
}

/**
 * Upload a resume file via presigned URL, then return the S3 key.
 */
export async function uploadResume(file: File): Promise<string> {
  const { uploadUrl, key } = await getResumeUploadUrl(file.name, file.type);
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!resp.ok) {
    throw new Error(`Upload failed: ${resp.status} ${resp.statusText}`);
  }
  return key;
}

