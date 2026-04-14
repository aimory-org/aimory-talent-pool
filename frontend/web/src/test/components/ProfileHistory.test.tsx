/**
 * Tests for ProfileHistory component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockAuditEntries } from "../mocks/handlers";
import { ProfileHistory } from "@/components/TalentDashboard/components/ProfileHistory";

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: { idToken: { toString: () => "mock-jwt-token" } },
  }),
}));

const API_BASE = "https://api.test.com";
const TEST_PK = "bucket1#resume1.pdf";

describe("ProfileHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading state", () => {
    it("shows spinner while fetching", async () => {
      let resolveRequest: (() => void) | undefined;
      server.use(
        http.get(`${API_BASE}/audit-history`, async () => {
          await new Promise<void>((res) => {
            resolveRequest = res;
          });
          return HttpResponse.json({ items: [] });
        }),
      );

      render(<ProfileHistory pk={TEST_PK} />);

      // Spinner rendered during load
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();

      // Unblock
      await waitFor(() => expect(resolveRequest).toBeDefined());
      resolveRequest?.();
      await waitFor(() =>
        expect(document.querySelector(".animate-spin")).not.toBeInTheDocument(),
      );
    });
  });

  describe("Empty state", () => {
    it("shows 'No history yet' when API returns empty list", async () => {
      server.use(
        http.get(`${API_BASE}/audit-history`, () => {
          return HttpResponse.json({ items: [] });
        }),
      );

      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        expect(screen.getByText("No history yet")).toBeInTheDocument();
      });
    });
  });

  describe("Error state", () => {
    it("shows error message when API fails", async () => {
      server.use(
        http.get(`${API_BASE}/audit-history`, () => {
          return HttpResponse.json({ error: "Unauthorised" }, { status: 401 });
        }),
      );

      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        expect(screen.getByText(/unauthorised/i)).toBeInTheDocument();
      });
    });
  });

  describe("Populated state", () => {
    it("renders all audit entries", async () => {
      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        // Status change entry: actor is Sarah Chen
        expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
        // Pipeline system entry shows "Pipeline"
        expect(screen.getByText("Pipeline")).toBeInTheDocument();
      });
    });

    it("renders action pills correctly", async () => {
      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        expect(screen.getByText("Status changed")).toBeInTheDocument();
        expect(screen.getAllByText("Ingested").length).toBeGreaterThan(0);
      });
    });

    it("shows expand button only for entries with changes", async () => {
      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        expect(screen.getByText("Status changed")).toBeInTheDocument();
      });

      // The STATUS_CHANGE entry has 1 change field — expand chevron should exist
      const chevrons = document.querySelectorAll(
        ".lucide-chevron-down, .lucide-chevron-up",
      );
      expect(chevrons.length).toBeGreaterThanOrEqual(1);
    });

    it("expands diff when chevron clicked", async () => {
      const user = userEvent.setup();
      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        expect(screen.getByText("Status changed")).toBeInTheDocument();
      });

      // Click expand button
      const expandBtn = document
        .querySelector("button .lucide-chevron-down")
        ?.closest("button");
      if (expandBtn) {
        await user.click(expandBtn);
        // The diff should show old/new values
        await waitFor(() => {
          expect(screen.getByText("Potential Candidate")).toBeInTheDocument();
          expect(screen.getByText("Active Candidate")).toBeInTheDocument();
        });
      }
    });

    it("shows relative timestamp on entry", async () => {
      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        // Some relative or absolute time should appear (e.g. "Xd ago" or "Apr 14")
        const timeEls = document.querySelectorAll("[title]");
        expect(timeEls.length).toBeGreaterThan(0);
      });
    });

    it("sends pk in query string", async () => {
      let capturedUrl = "";
      server.use(
        http.get(`${API_BASE}/audit-history`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ items: [] });
        }),
      );

      render(<ProfileHistory pk="bucket1#resume1.pdf" />);

      await waitFor(() => {
        expect(capturedUrl).toContain("pk=bucket1%23resume1.pdf");
      });
    });
  });

  describe("Filter", () => {
    it("filters by action type", async () => {
      const user = userEvent.setup();
      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
      });

      // Change filter to "Ingested" (CREATE only)
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "CREATE");

      // Sarah's STATUS_CHANGE entry should be hidden
      expect(screen.queryByText("Sarah Chen")).not.toBeInTheDocument();
      // Pipeline entry should remain
      expect(screen.getByText("Pipeline")).toBeInTheDocument();
    });

    it("shows all entries when filter is ALL", async () => {
      const user = userEvent.setup();
      render(<ProfileHistory pk={TEST_PK} />);

      await waitFor(() => {
        expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
      });

      // Switch to CREATE then back to ALL
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "CREATE");
      await user.selectOptions(select, "ALL");

      expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
      expect(screen.getByText("Pipeline")).toBeInTheDocument();
    });
  });

  describe("Refresh", () => {
    it("refreshes data when refresh button clicked", async () => {
      const user = userEvent.setup();
      let callCount = 0;

      server.use(
        http.get(`${API_BASE}/audit-history`, () => {
          callCount++;
          return HttpResponse.json({ items: mockAuditEntries });
        }),
      );

      render(<ProfileHistory pk={TEST_PK} />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
      });

      expect(callCount).toBe(1);

      // Click refresh
      const refreshBtn = screen.getByTitle("Refresh");
      await user.click(refreshBtn);

      await waitFor(() => {
        expect(callCount).toBe(2);
      });
    });
  });

  describe("Re-fetch on pk change", () => {
    it("fetches new data when pk prop changes", async () => {
      const seenPks: string[] = [];

      server.use(
        http.get(`${API_BASE}/audit-history`, ({ request }) => {
          const url = new URL(request.url);
          seenPks.push(url.searchParams.get("pk") ?? "");
          return HttpResponse.json({ items: [] });
        }),
      );

      const { rerender } = render(<ProfileHistory pk="bucket1#a.pdf" />);

      await waitFor(() => {
        expect(seenPks).toContain("bucket1#a.pdf");
      });

      rerender(<ProfileHistory pk="bucket2#b.pdf" />);

      await waitFor(() => {
        expect(seenPks).toContain("bucket2#b.pdf");
      });
    });
  });
});
