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

export type SortField = 
  | "name" 
  | "talent_category" 
  | "location_state" 
  | "clearance_level" 
  | "bill_rate" 
  | "years_of_experience" 
  | "status" 
  | "date_received"
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
