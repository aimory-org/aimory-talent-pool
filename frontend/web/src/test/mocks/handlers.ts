import { http, HttpResponse } from "msw";
import type { TalentProfile } from "@/types/talent";

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
    talent_bucket: "IT Resources",
    talent_category: "Developer",
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
    bill_rate: 150,
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
    talent_bucket: "Business Development/Sales Resources",
    talent_category: "Project Manager",
    skillsets: [{ name: "Agile", evidence: ["Scrum Master certified"] }],
    skill_names: "Agile",
    years_of_experience: 8,
    clearance_level: "TS",
    certifications: ["PMP", "CSM"],
    cert_names: "PMP,CSM",
    companies: [{ name: "Gov Solutions", evidence: ["PM 2018-2024"] }],
    location: { city: "Washington", state: "DC" },
    location_state: "DC",
    bill_rate: 175,
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
    talent_bucket: "Accounting and Finance Resources",
    talent_category: "Accounting",
    skillsets: [{ name: "QuickBooks", evidence: ["10+ years"] }],
    skill_names: "QuickBooks",
    years_of_experience: 15,
    clearance_level: null,
    certifications: ["CPA"],
    cert_names: "CPA",
    companies: [{ name: "Finance Inc", evidence: ["Senior Accountant"] }],
    location: { city: "Chicago", state: "IL" },
    location_state: "IL",
    bill_rate: 100,
    status: "Placed Candidate",
    date_received: "2023-11-01T00:00:00Z",
    updated_at: "2024-03-10T08:00:00Z",
  },
];

export const mockLookups = {
  skills: ["TypeScript", "React", "Python", "Java", "Agile", "QuickBooks"],
  certifications: ["AWS Solutions Architect", "PMP", "CSM", "CPA", "CISSP"],
  cities: [
    { city: "New York", state: "NY" },
    { city: "Washington", state: "DC" },
    { city: "Chicago", state: "IL" },
    { city: "Los Angeles", state: "CA" },
  ],
};

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

    const talentBucket = url.searchParams.get("talent_bucket");
    if (talentBucket) {
      filtered = filtered.filter((t) => t.talent_bucket === talentBucket);
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
];
