// Types matching the DynamoDB talent_profiles table schema
export interface TalentProfile {
  pk: string; // Primary key (e.g., "bucket#key")
  bucket: string;
  key: string;
  name: string;
  name_lower: string;
  contact: {
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    github: string | null;
  };
  summary: string | null;
  service_category: string;
  industry_category: string;
  job_title: string;
  skillsets: { name: string; evidence: string[] }[];
  skill_names: string; // comma-separated for search
  years_of_experience: number | null;
  clearance_level: ClearanceLevel;
  certifications: string[];
  cert_names: string; // comma-separated for search
  companies: { name: string; evidence: string[] }[];
  location: {
    city: string | null;
    state: string | null;
  };
  location_state: string;
  requested_salary: number | null;
  notes: string;
  tags: string[];
  resume_text: string;
  possible_duplicate_of?: string;
  status: CandidateStatus;
  date_received: string; // ISO date string
  updated_at: string;
  /** Populated by OpenSearch when a search query is active */
  _highlight?: {
    name?: string[];
    summary?: string[];
    resume_text?: string[];
  };
}

export type CandidateStatus =
  | "Potential Candidate"
  | "Active Candidate"
  | "Placed Candidate"
  | "Stale Candidate"
  | "Do Not Contact";

export type ServiceCategory =
  | "IT"
  | "Accounting"
  | "FSP Headhunting"
  | "Cybersecurity"
  | "Unknown";

export type ClearanceLevel =
  | "Secret"
  | "TS"
  | "TS/SCI"
  | "TS/SCI/FSP"
  | "TS/SCI/CI"
  | "Yankee White"
  | null;

export const CANDIDATE_STATUSES: { value: CandidateStatus; label: string }[] = [
  { value: "Active Candidate", label: "Active Candidate" },
  { value: "Do Not Contact", label: "Do Not Contact" },
  { value: "Placed Candidate", label: "Placed Candidate" },
  { value: "Potential Candidate", label: "Potential Candidate" },
  { value: "Stale Candidate", label: "Stale Candidate" },
];

export const SERVICE_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "IT", label: "IT" },
  { value: "Accounting", label: "Accounting" },
  { value: "FSP Headhunting", label: "FSP Headhunting" },
  { value: "Cybersecurity", label: "Cybersecurity" },
  { value: "Unknown", label: "Unknown" },
];

export const CLEARANCE_LEVELS: { value: string; label: string }[] = [
  { value: "Secret", label: "Secret" },
  { value: "TS", label: "Top Secret" },
  { value: "TS/SCI", label: "TS/SCI" },
  { value: "TS/SCI/CI", label: "TS/SCI + CI Poly" },
  { value: "TS/SCI/FSP", label: "TS/SCI + Full Scope Poly" },
  { value: "Yankee White", label: "Yankee White" },
];

export const US_STATES: { value: string; label: string }[] = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "DC", label: "Washington DC" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];
