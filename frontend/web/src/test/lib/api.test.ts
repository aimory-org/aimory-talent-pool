/**
 * Tests for the API client (lib/api.ts)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  listTalents,
  getTalent,
  updateTalent,
  deleteTalent,
  getResumeUrl,
  getLookups,
  getAuditHistory,
  listAuditHistory,
  getDeployments,
  listJobDescriptions,
  getJobDescription,
  deleteJobDescription,
  matchCandidates,
} from "@/lib/api";

// Mock the aws-amplify auth module
vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => "mock-jwt-token-12345",
      },
    },
  }),
}));

const API_BASE = "https://api.test.com";

describe("API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTalents", () => {
    it("fetches talents without filters", async () => {
      const result = await listTalents();

      expect(result.items).toHaveLength(3);
      expect(result.count).toBe(3);
    });

    it("fetches talents with status filter", async () => {
      const result = await listTalents({ status: "Active Candidate" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("John Doe");
    });

    it("serializes skills array properly", async () => {
      let capturedUrl = "";
      server.use(
        http.get(`${API_BASE}/talents`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ items: [], count: 0 });
        }),
      );

      await listTalents({ skills: ["TypeScript", "React"] });

      expect(capturedUrl).toContain("skills=TypeScript%2CReact");
    });

    it("handles year range filters", async () => {
      const result = await listTalents({ minYears: 10, maxYears: 15 });

      // Should return John Doe (10 years) and Bob Wilson (15 years)
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty results when no matches", async () => {
      const result = await listTalents({
        status: "NonExistent Status" as never,
      });

      expect(result.items).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe("getTalent", () => {
    it("fetches a single talent by pk", async () => {
      const result = await getTalent("bucket1#resume1.pdf");

      expect(result.name).toBe("John Doe");
      expect(result.pk).toBe("bucket1#resume1.pdf");
    });

    it("handles URL encoding for special characters in pk", async () => {
      let capturedPk = "";
      server.use(
        http.get(`${API_BASE}/talents/:pk`, ({ params }) => {
          capturedPk = params.pk as string;
          return HttpResponse.json({
            pk: "bucket#with spaces/file.pdf",
            name: "Test",
            // Minimal valid response
          });
        }),
      );

      await getTalent("bucket#with spaces/file.pdf");

      // MSW auto-decodes the pk param
      expect(capturedPk).toBe("bucket#with spaces/file.pdf");
    });

    it("throws error for 404 response", async () => {
      await expect(getTalent("nonexistent#key")).rejects.toThrow(
        "Talent not found",
      );
    });
  });

  describe("updateTalent", () => {
    it("sends PATCH request with updates", async () => {
      let capturedBody: unknown;
      server.use(
        http.patch(`${API_BASE}/talents`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ success: true });
        }),
      );

      await updateTalent("bucket1#resume1.pdf", { status: "Placed Candidate" });

      expect(capturedBody).toEqual({ status: "Placed Candidate" });
    });

    it("handles partial update with multiple fields", async () => {
      let capturedBody: unknown;
      server.use(
        http.patch(`${API_BASE}/talents`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ success: true });
        }),
      );

      await updateTalent("bucket1#resume1.pdf", {
        status: "Active Candidate",
        requested_salary: 200000,
        summary: "Updated summary",
      });

      expect(capturedBody).toEqual({
        status: "Active Candidate",
        requested_salary: 200000,
        summary: "Updated summary",
      });
    });

    it("throws error for 404 response", async () => {
      server.use(
        http.patch(`${API_BASE}/talents`, () => {
          return HttpResponse.json(
            { error: "Talent not found" },
            { status: 404 },
          );
        }),
      );

      await expect(
        updateTalent("nonexistent#key", { status: "Active Candidate" }),
      ).rejects.toThrow("Talent not found");
    });
  });

  describe("deleteTalent", () => {
    it("sends DELETE request for talent", async () => {
      let deleteCalled = false;
      server.use(
        http.delete(`${API_BASE}/talents`, () => {
          deleteCalled = true;
          return HttpResponse.json({ success: true });
        }),
      );

      await deleteTalent("bucket1#resume1.pdf");

      expect(deleteCalled).toBe(true);
    });

    it("throws error for 404 response", async () => {
      server.use(
        http.delete(`${API_BASE}/talents`, () => {
          return HttpResponse.json(
            { error: "Talent not found" },
            { status: 404 },
          );
        }),
      );

      await expect(deleteTalent("nonexistent#key")).rejects.toThrow(
        "Talent not found",
      );
    });
  });

  describe("getResumeUrl", () => {
    it("returns presigned URL and expiration", async () => {
      const result = await getResumeUrl("resumes/test-file.pdf");

      expect(result.url).toContain("s3.amazonaws.com");
      expect(result.url).toContain("test-file.pdf");
      expect(result.expiresIn).toBe(3600);
    });

    it("handles missing key parameter", async () => {
      server.use(
        http.get(`${API_BASE}/resume-url`, ({ request }) => {
          const url = new URL(request.url);
          if (!url.searchParams.get("key")) {
            return HttpResponse.json(
              { error: "key required" },
              { status: 400 },
            );
          }
          return HttpResponse.json({ url: "", expiresIn: 0 });
        }),
      );

      // The API function requires a key, so this would be caught at a different level
      // but we can test the error handling
      await expect(getResumeUrl("")).rejects.toThrow();
    });
  });

  describe("getLookups", () => {
    it("fetches all lookups when no include param", async () => {
      const result = await getLookups();

      expect(result.skills).toContain("TypeScript");
      expect(result.certifications).toContain("AWS Solutions Architect");
      expect(result.cities).toContainEqual({ city: "New York", state: "NY" });
    });

    it("fetches only specified fields with include param", async () => {
      const result = await getLookups(["skills"]);

      expect(result.skills).toBeDefined();
      // Other fields may or may not be present depending on handler
    });

    it("returns correct response shape", async () => {
      const result = await getLookups();

      expect(Array.isArray(result.skills)).toBe(true);
      expect(Array.isArray(result.certifications)).toBe(true);
      expect(Array.isArray(result.cities)).toBe(true);
      expect(result.cities[0]).toHaveProperty("city");
      expect(result.cities[0]).toHaveProperty("state");
    });
  });

  describe("Authentication", () => {
    it("includes JWT token in Authorization header", async () => {
      let capturedAuth = "";
      server.use(
        http.get(`${API_BASE}/talents`, ({ request }) => {
          capturedAuth = request.headers.get("Authorization") || "";
          return HttpResponse.json({ items: [], count: 0 });
        }),
      );

      await listTalents();

      expect(capturedAuth).toBe("Bearer mock-jwt-token-12345");
    });

    it("throws error when no token available", async () => {
      const { fetchAuthSession } = await import("aws-amplify/auth");
      vi.mocked(fetchAuthSession).mockResolvedValueOnce({
        tokens: undefined,
      });

      await expect(listTalents()).rejects.toThrow(
        "No authentication token available",
      );
    });
  });

  describe("Error Handling", () => {
    it("parses error message from JSON response", async () => {
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          return HttpResponse.json(
            { error: "Custom error message" },
            { status: 500 },
          );
        }),
      );

      await expect(listTalents()).rejects.toThrow("Custom error message");
    });

    it("falls back to status text on non-JSON error", async () => {
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          return new HttpResponse("Internal Server Error", {
            status: 500,
            statusText: "Internal Server Error",
          });
        }),
      );

      await expect(listTalents()).rejects.toThrow();
    });

    it("handles network errors", async () => {
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          return HttpResponse.error();
        }),
      );

      await expect(listTalents()).rejects.toThrow();
    });
  });

  describe("getAuditHistory", () => {
    it("fetches audit entries for a given pk", async () => {
      const result = await getAuditHistory("bucket1#resume1.pdf");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].action).toBe("STATUS_CHANGE");
      expect(result.items[1].action).toBe("CREATE");
    });

    it("encodes the pk in the query string", async () => {
      let capturedUrl = "";
      server.use(
        http.get(`${API_BASE}/audit-history`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ items: [] });
        }),
      );
      await getAuditHistory("bucket1#resume1.pdf");
      expect(capturedUrl).toContain("pk=bucket1%23resume1.pdf");
    });

    it("throws on non-ok response", async () => {
      server.use(
        http.get(`${API_BASE}/audit-history`, () => {
          return HttpResponse.json({ error: "Not found" }, { status: 404 });
        }),
      );
      await expect(getAuditHistory("missing")).rejects.toThrow("Not found");
    });
  });

  describe("listAuditHistory", () => {
    it("fetches recent audit entries across all profiles", async () => {
      const result = await listAuditHistory();

      expect(result.items).toHaveLength(4);
      expect(result.items[0].action).toBe("STATUS_CHANGE");
      expect(result.items[1].action).toBe("DELETE");
    });

    it("includes global scope and limit in the query string", async () => {
      let capturedUrl = "";

      server.use(
        http.get(`${API_BASE}/audit-history`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ items: [] });
        }),
      );

      await listAuditHistory(50);

      expect(capturedUrl).toContain("scope=global");
      expect(capturedUrl).toContain("limit=50");
    });
  });

  describe("getDeployments", () => {
    it("returns deployments list", async () => {
      const result = await getDeployments();
      expect(result.deployments).toHaveLength(2);
      expect(result.deployments[0].conclusion).toBe("success");
      expect(result.deployments[1].conclusion).toBe("failure");
    });

    it("returns deployment fields correctly shaped", async () => {
      const result = await getDeployments();
      const d = result.deployments[0];
      expect(d).toHaveProperty("id");
      expect(d).toHaveProperty("branch");
      expect(d).toHaveProperty("commit_sha");
      expect(d).toHaveProperty("commit_message");
      expect(d).toHaveProperty("triggered_by");
      expect(d).toHaveProperty("duration_seconds");
      expect(d).toHaveProperty("url");
    });

    it("throws on API error", async () => {
      server.use(
        http.get(`${API_BASE}/deployments`, () => {
          return HttpResponse.json(
            { error: "GitHub API rate limited" },
            { status: 503 },
          );
        }),
      );
      await expect(getDeployments()).rejects.toThrow("GitHub API rate limited");
    });
  });

  describe("listJobDescriptions", () => {
    it("fetches all job descriptions", async () => {
      const result = await listJobDescriptions();
      expect(result).toHaveLength(2);
    });

    it("applies clearance filter", async () => {
      const result = await listJobDescriptions({
        required_clearance: "TS/SCI",
      });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Data Analyst");
    });
  });

  describe("getJobDescription", () => {
    it("fetches a single JD by pk", async () => {
      const result = await getJobDescription("jd-001");
      expect(result.title).toBe("Senior Python Engineer");
    });

    it("throws on not found", async () => {
      await expect(getJobDescription("nonexistent")).rejects.toThrow();
    });
  });

  describe("deleteJobDescription", () => {
    it("deletes a JD", async () => {
      await expect(deleteJobDescription("jd-001")).resolves.toBeUndefined();
    });
  });

  describe("matchCandidates", () => {
    it("returns scored matches", async () => {
      const result = await matchCandidates("jd-001");
      expect(result.matches).toHaveLength(2);
      expect(result.job_description.pk).toBe("jd-001");
      expect(result.matches[0].score).toBe(85);
    });

    it("throws on not found", async () => {
      await expect(matchCandidates("nonexistent")).rejects.toThrow();
    });
  });
});
