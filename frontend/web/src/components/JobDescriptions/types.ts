export type JdSortField =
  | "title"
  | "job_title"
  | "industry_category"
  | "required_clearance"
  | "location_state"
  | "min_experience_years"
  | "created_at";

export type SortDirection = "asc" | "desc";

export interface JdFilters {
  job_title: string;
  industry_category: string;
  required_clearance: string;
  location_state: string;
}

export const DEFAULT_JD_FILTERS: JdFilters = {
  job_title: "",
  industry_category: "",
  required_clearance: "",
  location_state: "",
};
