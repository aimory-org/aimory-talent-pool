import { describe, it, expect } from "vitest";
import { isUUID, fallbackCandidateName } from "@/components/AuditLog/utils";
import type { AuditEntry } from "@/lib/api";

const BASE_ENTRY: AuditEntry = {
  pk: "PROFILE#resume.pdf",
  sk: "2024-01-01T00:00:00Z#CREATE",
  action: "CREATE",
  timestamp: "2024-01-01T00:00:00Z",
  user_email: "user@example.com",
};

const UUID = "550e8400-e29b-41d4-a716-446655440000";

// --- isUUID ---

describe("isUUID", () => {
  it("returns true for a valid lowercase UUID", () => {
    expect(isUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("returns true for a valid uppercase UUID", () => {
    expect(isUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("returns true for a mixed-case UUID", () => {
    expect(isUUID("550e8400-E29B-41d4-A716-446655440000")).toBe(true);
  });

  it("returns false for a plain name", () => {
    expect(isUUID("John Doe")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isUUID("")).toBe(false);
  });

  it("returns false for a UUID missing a segment", () => {
    expect(isUUID("550e8400-e29b-41d4-a716")).toBe(false);
  });

  it("returns false for a filename", () => {
    expect(isUUID("resume.pdf")).toBe(false);
  });
});

// --- fallbackCandidateName ---

describe("fallbackCandidateName", () => {
  describe("candidate_name priority", () => {
    it("returns candidate_name when present and not a UUID", () => {
      const entry = { ...BASE_ENTRY, candidate_name: "Alice Johnson" };
      expect(fallbackCandidateName(entry)).toBe("Alice Johnson");
    });

    it("skips candidate_name when it is a UUID", () => {
      const entry = {
        ...BASE_ENTRY,
        candidate_name: UUID,
        title: "Senior Engineer",
      };
      expect(fallbackCandidateName(entry)).toBe("Senior Engineer");
    });
  });

  describe("title fallback (JD pipeline)", () => {
    it("returns title when candidate_name is absent", () => {
      const entry = { ...BASE_ENTRY, title: "Frontend Developer" };
      expect(fallbackCandidateName(entry)).toBe("Frontend Developer");
    });

    it("skips title when it is a UUID", () => {
      const entry = {
        ...BASE_ENTRY,
        title: UUID,
        snapshot: { name: "Bob Smith" },
      };
      expect(fallbackCandidateName(entry)).toBe("Bob Smith");
    });
  });

  describe("snapshot fallback", () => {
    it("returns snapshot.name", () => {
      const entry = { ...BASE_ENTRY, snapshot: { name: "Carol White" } };
      expect(fallbackCandidateName(entry)).toBe("Carol White");
    });

    it("returns snapshot.job_title when name is absent", () => {
      const entry = {
        ...BASE_ENTRY,
        snapshot: { job_title: "Software Architect" },
      };
      expect(fallbackCandidateName(entry)).toBe("Software Architect");
    });

    it("returns snapshot.title when name and job_title are absent", () => {
      const entry = {
        ...BASE_ENTRY,
        snapshot: { title: "Staff Engineer" },
      };
      expect(fallbackCandidateName(entry)).toBe("Staff Engineer");
    });

    it("snapshot.name takes precedence over snapshot.job_title", () => {
      const entry = {
        ...BASE_ENTRY,
        snapshot: { name: "Primary Name", job_title: "Secondary" },
      };
      expect(fallbackCandidateName(entry)).toBe("Primary Name");
    });

    it("returns null when snapshot is not an object", () => {
      const entry = {
        ...BASE_ENTRY,
        snapshot: undefined,
        pk: "PROFILE#dave.pdf",
      };
      expect(fallbackCandidateName(entry)).toBe("dave");
    });
  });

  describe("pk tail fallback", () => {
    it("strips the PROFILE# prefix and .pdf extension", () => {
      const entry = { ...BASE_ENTRY, pk: "PROFILE#charlie-resume.pdf" };
      expect(fallbackCandidateName(entry)).toBe("charlie-resume");
    });

    it("skips pk tail when it is a UUID", () => {
      const entry = { ...BASE_ENTRY, pk: UUID };
      expect(fallbackCandidateName(entry)).toBe("Unknown");
    });

    it("uses the last segment after # when there are multiple separators", () => {
      const entry = { ...BASE_ENTRY, pk: "PROFILE#2024#resume.pdf" };
      expect(fallbackCandidateName(entry)).toBe("resume");
    });
  });

  describe("Unknown fallback", () => {
    it("returns 'Unknown' when all sources are absent or UUID-shaped", () => {
      const entry = { ...BASE_ENTRY, pk: UUID };
      expect(fallbackCandidateName(entry)).toBe("Unknown");
    });
  });

  describe("priority order", () => {
    it("candidate_name > title > snapshot > pk", () => {
      const entry = {
        ...BASE_ENTRY,
        candidate_name: "Wins",
        title: "Loses to candidate_name",
        snapshot: { name: "Also loses" },
        pk: "PROFILE#also-loses.pdf",
      };
      expect(fallbackCandidateName(entry)).toBe("Wins");
    });

    it("title > snapshot when candidate_name is a UUID", () => {
      const entry = {
        ...BASE_ENTRY,
        candidate_name: UUID,
        title: "Title Wins",
        snapshot: { name: "Snapshot loses" },
        pk: "PROFILE#pk-loses.pdf",
      };
      expect(fallbackCandidateName(entry)).toBe("Title Wins");
    });
  });
});
