import { http, HttpResponse } from "msw";
import type { TalentProfile } from "@/types/talent";
import type { AuditEntry, Deployment } from "@/lib/api";

const API_BASE = "https://api.test.com";

// Mock talent data for tests
export const mockTalents: TalentProfile[] = [
  {
    pk: "bucket1#resume1.pdf",
    bucket: "bucket1",
    key: "resume1.pdf",
    name: "John Doe",
    name_lower: "john doe",
    contact: {
      email: "john@example.com",
      phone: "555-1234",
      linkedin: "linkedin.com/in/johndoe",
      github: "github.com/johndoe",
    },
    summary:
      "Experienced software engineer with 10 years in full-stack development",
    service_category: "IT",
    industry_category: "Technology",
    job_title: "Senior Software Engineer",
    skillsets: [
      { name: "TypeScript", evidence: ["5 years experience"] },
      { name: "React", evidence: ["Lead frontend developer"] },
    ],
    skill_names: "TypeScript,React",
    years_of_experience: 10,
    clearance_level: "Secret",
    certifications: ["AWS Solutions Architect", "PMP"],
    cert_names: "AWS Solutions Architect,PMP",
    companies: [
      { name: "Tech Corp", evidence: ["Senior Developer 2020-2023"] },
    ],
    location: { city: "New York", state: "NY" },
    location_state: "NY",
    requested_salary: 150000,
    notes: "",
    tags: ["senior", "full-stack"],
    resume_text: "",
    status: "Active Candidate",
    date_received: "2024-01-15T00:00:00Z",
    updated_at: "2024-06-01T12:00:00Z",
  },
  {
    pk: "bucket2#resume2.pdf",
    bucket: "bucket2",
    key: "resume2.pdf",
    name: "Jane Smith",
    name_lower: "jane smith",
    contact: {
      email: "jane@example.com",
      phone: "555-5678",
      linkedin: null,
      github: null,
    },
    summary: "Project manager with government contracting experience",
    service_category: "FSP Headhunting",
    industry_category: "Government",
    job_title: "Project Manager",
    skillsets: [{ name: "Agile", evidence: ["Scrum Master certified"] }],
    skill_names: "Agile",
    years_of_experience: 8,
    clearance_level: "TS",
    certifications: ["PMP", "CSM"],
    cert_names: "PMP,CSM",
    companies: [{ name: "Gov Solutions", evidence: ["PM 2018-2024"] }],
    location: { city: "Washington", state: "DC" },
    location_state: "DC",
    requested_salary: 175000,
    notes: "",
    tags: [],
    resume_text: "",
    status: "Potential Candidate",
    date_received: "2024-02-20T00:00:00Z",
    updated_at: "2024-05-15T10:30:00Z",
  },
  {
    pk: "bucket3#resume3.pdf",
    bucket: "bucket3",
    key: "resume3.pdf",
    name: "Bob Wilson",
    name_lower: "bob wilson",
    contact: {
      email: "bob@example.com",
      phone: null,
      linkedin: null,
      github: null,
    },
    summary: "Accountant with CPA certification",
    service_category: "Accounting",
    industry_category: "Financial Services",
    job_title: "Senior Accountant",
    skillsets: [{ name: "QuickBooks", evidence: ["10+ years"] }],
    skill_names: "QuickBooks",
    years_of_experience: 15,
    clearance_level: null,
    certifications: ["CPA"],
    cert_names: "CPA",
    companies: [{ name: "Finance Inc", evidence: ["Senior Accountant"] }],
    location: { city: "Chicago", state: "IL" },
    location_state: "IL",
    requested_salary: 100000,
    notes: "",
    tags: [],
    resume_text: "",
    status: "Placed Candidate",
    date_received: "2023-11-01T00:00:00Z",
    updated_at: "2024-03-10T08:00:00Z",
  },
];

export const mockLookups = {
  skills: ["TypeScript", "React", "Python", "Java", "Agile", "QuickBooks"],
  certifications: ["AWS Solutions Architect", "PMP", "CSM", "CPA", "CISSP"],
  job_titles: [
    "Senior Software Engineer",
    "Project Manager",
    "Senior Accountant",
  ],
  cities: [
    { city: "New York", state: "NY" },
    { city: "Washington", state: "DC" },
    { city: "Chicago", state: "IL" },
    { city: "Los Angeles", state: "CA" },
  ],
  industry_categories: [
    "HR",
    "Accounting",
    "Finance",
    "IT Engineering",
    "Manufacturing",
    "Federal Government",
  ],
};

export const mockAuditEntries: AuditEntry[] = [
  {
    pk: "bucket1#resume1.pdf",
    sk: "2026-04-14T12:00:00Z#STATUS_CHANGE",
    action: "STATUS_CHANGE",
    timestamp: "2026-04-14T12:00:00Z",
    user_email: "recruiter@aimory.com",
    user_name: "Sarah Chen",
    candidate_name: "John Doe",
    changes: {
      status: { old: "Potential Candidate", new: "Active Candidate" },
    },
  },
  {
    pk: "bucket2#resume2.pdf",
    sk: "2026-04-14T11:10:00Z#DELETE",
    action: "DELETE",
    timestamp: "2026-04-14T11:10:00Z",
    user_email: "j.okafor@aimory.com",
    user_name: "James Okafor",
    candidate_name: "Jane Smith",
    snapshot: {
      name: "Jane Smith",
    },
  },
  {
    pk: "bucket2#resume2.pdf",
    sk: "2026-04-14T08:45:00Z#UPDATE",
    action: "UPDATE",
    timestamp: "2026-04-14T08:45:00Z",
    user_email: "dedup@system",
    user_name: "Dedup",
    candidate_name: "Jane Smith",
    changes: {
      job_title: { old: "Project Manger", new: "Project Manager" },
    },
  },
  {
    pk: "bucket1#resume1.pdf",
    sk: "2026-04-13T09:00:00Z#CREATE",
    action: "CREATE",
    timestamp: "2026-04-13T09:00:00Z",
    user_email: "pipeline@system",
    user_name: "Pipeline",
    candidate_name: "John Doe",
  },
];

export const mockDeployments: Deployment[] = [
  {
    id: 1001,
    status: "completed",
    conclusion: "success",
    branch: "main",
    commit_sha: "abc1234",
    commit_message: "Add audit log page",
    triggered_by: "bencas21",
    started_at: "2026-04-14T12:00:00Z",
    completed_at: "2026-04-14T12:05:47Z",
    duration_seconds: 347,
    url: "https://github.com/bencas21/aimory-talent-pool/actions/runs/1001",
  },
  {
    id: 1000,
    status: "completed",
    conclusion: "failure",
    branch: "main",
    commit_sha: "def5678",
    commit_message: "Update auth config",
    triggered_by: "bencas21",
    started_at: "2026-04-13T10:00:00Z",
    completed_at: "2026-04-13T10:02:04Z",
    duration_seconds: 124,
    url: "https://github.com/bencas21/aimory-talent-pool/actions/runs/1000",
  },
];

// Default handlers
export const handlers = [
  // List talents
  http.get(`${API_BASE}/talents`, ({ request }) => {
    const url = new URL(request.url);
    let filtered = [...mockTalents];

    // Apply filters
    const status = url.searchParams.get("status");
    if (status) {
      filtered = filtered.filter((t) => t.status === status);
    }

    const serviceCategory = url.searchParams.get("service_category");
    if (serviceCategory) {
      filtered = filtered.filter((t) => t.service_category === serviceCategory);
    }

    const locationState = url.searchParams.get("location_state");
    if (locationState) {
      filtered = filtered.filter((t) => t.location_state === locationState);
    }

    const skills = url.searchParams.get("skills");
    if (skills) {
      const skillList = skills.split(",");
      filtered = filtered.filter((t) =>
        skillList.some((skill) => t.skill_names.includes(skill)),
      );
    }

    const minYears = url.searchParams.get("minYears");
    const maxYears = url.searchParams.get("maxYears");
    if (minYears) {
      filtered = filtered.filter(
        (t) => (t.years_of_experience ?? 0) >= parseInt(minYears),
      );
    }
    if (maxYears) {
      filtered = filtered.filter(
        (t) => (t.years_of_experience ?? 0) <= parseInt(maxYears),
      );
    }

    return HttpResponse.json({
      items: filtered,
      count: filtered.length,
    });
  }),

  // Get single talent
  http.get(`${API_BASE}/talents/:pk`, ({ params }) => {
    const pk = decodeURIComponent(params.pk as string);
    const talent = mockTalents.find((t) => t.pk === pk);

    if (!talent) {
      return HttpResponse.json({ error: "Talent not found" }, { status: 404 });
    }

    return HttpResponse.json(talent);
  }),

  // Update talent
  http.patch(`${API_BASE}/talents`, async ({ request }) => {
    const url = new URL(request.url);
    const pk = url.searchParams.get("pk");

    if (!pk) {
      return HttpResponse.json({ error: "pk required" }, { status: 400 });
    }

    const talent = mockTalents.find((t) => t.pk === decodeURIComponent(pk));
    if (!talent) {
      return HttpResponse.json({ error: "Talent not found" }, { status: 404 });
    }

    return HttpResponse.json({ success: true });
  }),

  // Delete talent
  http.delete(`${API_BASE}/talents`, ({ request }) => {
    const url = new URL(request.url);
    const pk = url.searchParams.get("pk");

    if (!pk) {
      return HttpResponse.json({ error: "pk required" }, { status: 400 });
    }

    const talent = mockTalents.find((t) => t.pk === decodeURIComponent(pk));
    if (!talent) {
      return HttpResponse.json({ error: "Talent not found" }, { status: 404 });
    }

    return HttpResponse.json({ success: true });
  }),

  // Get lookups
  http.get(`${API_BASE}/lookups`, ({ request }) => {
    const url = new URL(request.url);
    const include = url.searchParams.get("include");

    if (include) {
      const fields = include.split(",");
      const response: Record<string, unknown> = {};
      if (fields.includes("skills")) response.skills = mockLookups.skills;
      if (fields.includes("certifications"))
        response.certifications = mockLookups.certifications;
      if (fields.includes("job_titles"))
        response.job_titles = mockLookups.job_titles;
      if (fields.includes("industry_categories"))
        response.industry_categories = mockLookups.industry_categories;
      if (fields.includes("cities")) response.cities = mockLookups.cities;
      return HttpResponse.json(response);
    }

    return HttpResponse.json(mockLookups);
  }),

  // Get resume URL
  http.get(`${API_BASE}/resume-url`, ({ request }) => {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return HttpResponse.json({ error: "key required" }, { status: 400 });
    }

    return HttpResponse.json({
      url: `https://s3.amazonaws.com/test-bucket/${key}?signature=abc123`,
      expiresIn: 3600,
    });
  }),

  // Audit history
  http.get(`${API_BASE}/audit-history`, ({ request }) => {
    const url = new URL(request.url);
    const pk = url.searchParams.get("pk");
    const scope = url.searchParams.get("scope");
    const limit = Number(
      url.searchParams.get("limit") ?? mockAuditEntries.length,
    );

    const sorted = [...mockAuditEntries].sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    );

    if (scope === "global") {
      return HttpResponse.json({ items: sorted.slice(0, limit) });
    }

    if (!pk) {
      return HttpResponse.json({ error: "pk required" }, { status: 400 });
    }

    return HttpResponse.json({
      items: sorted.filter((item) => item.pk === pk),
    });
  }),

  // Deployments
  http.get(`${API_BASE}/deployments`, () => {
    return HttpResponse.json({ deployments: mockDeployments });
  }),
];
