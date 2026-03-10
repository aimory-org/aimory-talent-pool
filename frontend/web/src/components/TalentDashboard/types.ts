/**
 * Types for the TalentDashboard component and its subcomponents.
 */

export interface Filters {
  search: string
  status: string
  talent_bucket: string
  talent_category: string
  clearance_level: string
  location_state: string
  city: string
  skills: string[]
  certifications: string[]
  minYears: string
  maxYears: string
}

export type SortField = "name" | "date_received" | "years_of_experience" | "status"
export type SortDirection = "asc" | "desc"

export const DEFAULT_FILTERS: Filters = {
  search: "",
  status: "",
  talent_bucket: "",
  talent_category: "",
  clearance_level: "",
  location_state: "",
  city: "",
  skills: [],
  certifications: [],
  minYears: "",
  maxYears: "",
}
