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
  talent_bucket: TalentBucket;
  talent_category: TalentCategory;
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
  bill_rate: number | null;
  status: CandidateStatus;
  date_received: string; // ISO date string
  updated_at: string;
  /** Populated by OpenSearch when a search query is active */
  _highlight?: {
    name?: string[];
    summary?: string[];
  };
}

export type CandidateStatus =
  | "Potential Candidate"
  | "Active Candidate"
  | "Placed Candidate"
  | "Stale Candidate"
  | "Do Not Contact";

export type TalentBucket =
  | "IT Resources"
  | "Accounting and Finance Resources"
  | "HR Resources"
  | "Business Development/Sales Resources"
  | "Unclassified";

export type TalentCategory =
  | "Accounting"
  | "Finance"
  | "Data Analysis"
  | "Forensics"
  | "Developer"
  | "Network Engineer"
  | "Database Analyst"
  | "Cloud Expert"
  | "Project Manager"
  | "HR"
  | "Business Development"
  | "Sales"
  | "Unclassified";

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

export const TALENT_BUCKETS: { value: TalentBucket; label: string }[] = [
  { value: "Accounting and Finance Resources", label: "Accounting & Finance" },
  {
    value: "Business Development/Sales Resources",
    label: "Business Dev/Sales",
  },
  { value: "HR Resources", label: "HR Resources" },
  { value: "IT Resources", label: "IT Resources" },
  { value: "Unclassified", label: "Unclassified" },
];

export const TALENT_CATEGORIES: { value: TalentCategory; label: string }[] = [
  { value: "Accounting", label: "Accounting" },
  { value: "Business Development", label: "Business Development" },
  { value: "Cloud Expert", label: "Cloud Expert" },
  { value: "Data Analysis", label: "Data Analysis" },
  { value: "Database Analyst", label: "Database Analyst" },
  { value: "Developer", label: "Developer" },
  { value: "Finance", label: "Finance" },
  { value: "Forensics", label: "Forensics" },
  { value: "HR", label: "HR" },
  { value: "Network Engineer", label: "Network Engineer" },
  { value: "Project Manager", label: "Project Manager" },
  { value: "Sales", label: "Sales" },
  { value: "Unclassified", label: "Unclassified" },
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
