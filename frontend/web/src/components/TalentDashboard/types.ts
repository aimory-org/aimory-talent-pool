/**
 * Types for the TalentDashboard component and its subcomponents.
 */

export interface Filters {
  search: string;
  status: string;
  service_category: string;
  industry_category: string;
  job_title: string;
  clearance_level: string;
  location_state: string;
  city: string;
  skills: string[];
  certifications: string[];
  tags: string[];
  minYears: string;
  maxYears: string;
}

export type SortField =
  | "name"
  | "job_title"
  | "industry_category"
  | "location_state"
  | "clearance_level"
  | "requested_salary"
  | "years_of_experience"
  | "status"
  | "date_received";
export type SortDirection = "asc" | "desc";

export const DEFAULT_FILTERS: Filters = {
  search: "",
  status: "",
  service_category: "",
  industry_category: "",
  job_title: "",
  clearance_level: "",
  location_state: "",
  city: "",
  skills: [],
  certifications: [],
  tags: [],
  minYears: "",
  maxYears: "",
};
