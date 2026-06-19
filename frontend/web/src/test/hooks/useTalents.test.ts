/**
 * Tests for useTalents hook
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockTalents } from "../mocks/handlers";
import { useTalents } from "@/hooks/useTalents";

// Mock aws-amplify auth
vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => "mock-jwt-token",
      },
    },
  }),
}));

const API_BASE = "https://api.test.com";

describe("useTalents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial fetch", () => {
    it("fetches talents on mount when enabled (default)", async () => {
      const { result } = renderHook(() => useTalents());

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.talents).toEqual([]);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.talents).toHaveLength(3);
      expect(result.current.error).toBeNull();
    });

    it("skips fetch when enabled is false", async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          fetchCount++;
          return HttpResponse.json({
            items: mockTalents,
            count: mockTalents.length,
          });
        }),
      );

      const { result } = renderHook(() => useTalents({ enabled: false }));

      // Should not be loading since fetch is skipped
      expect(result.current.isLoading).toBe(false);
      expect(result.current.talents).toEqual([]);

      // Wait a bit to ensure no fetch happens
      await new Promise((r) => setTimeout(r, 100));
      expect(fetchCount).toBe(0);
    });

    it("returns empty array when no talents match", async () => {
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          return HttpResponse.json({ items: [], count: 0 });
        }),
      );

      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.talents).toEqual([]);
    });
  });

  describe("Loading and error states", () => {
    it("sets isLoading true while fetching", async () => {
      const { result } = renderHook(() => useTalents());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("sets error on fetch failure", async () => {
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Server error");
      expect(result.current.talents).toEqual([]);
    });

    it("handles network errors", async () => {
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          return HttpResponse.error();
        }),
      );

      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe("Filter handling", () => {
    it("fetches with status filter", async () => {
      const { result } = renderHook(() =>
        useTalents({ status: "Active Candidate" }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.talents).toHaveLength(1);
      expect(result.current.talents[0].name).toBe("John Doe");
    });

    it("refetches when filters change", async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          fetchCount++;
          return HttpResponse.json({
            items: mockTalents,
            count: mockTalents.length,
          });
        }),
      );

      const { result, rerender } = renderHook(
        ({ status }) => useTalents({ status }),
        { initialProps: { status: undefined as string | undefined } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchCount).toBe(1);

      // Change filter
      rerender({ status: "Active Candidate" });

      await waitFor(() => {
        expect(fetchCount).toBe(2);
      });
    });

    it("handles skills array filter", async () => {
      let capturedUrl = "";
      server.use(
        http.get(`${API_BASE}/talents`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ items: [mockTalents[0]], count: 1 });
        }),
      );

      const { result } = renderHook(() =>
        useTalents({ skills: ["TypeScript", "React"] }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(capturedUrl).toContain("skills=TypeScript%2CReact");
    });

    it("handles year range filters", async () => {
      const { result } = renderHook(() =>
        useTalents({ minYears: 10, maxYears: 15 }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should include John (10) and Bob (15)
      expect(result.current.talents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("refresh()", () => {
    it("refetches data when called", async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${API_BASE}/talents`, () => {
          fetchCount++;
          return HttpResponse.json({
            items: mockTalents,
            count: mockTalents.length,
          });
        }),
      );

      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchCount).toBe(1);

      // Call refresh
      await act(async () => {
        await result.current.refresh();
      });

      expect(fetchCount).toBe(2);
    });
  });

  describe("updateStatus()", () => {
    it("optimistically updates talent status", async () => {
      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalStatus = result.current.talents[0].status;

      await act(async () => {
        await result.current.updateStatus(
          result.current.talents[0].pk,
          "Placed at Other Company",
        );
      });

      // Status should be updated optimistically
      expect(result.current.talents[0].status).toBe("Placed at Other Company");
      expect(result.current.talents[0].status).not.toBe(originalStatus);
    });

    it("updates the updated_at timestamp", async () => {
      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalUpdatedAt = result.current.talents[0].updated_at;

      await act(async () => {
        await result.current.updateStatus(
          result.current.talents[0].pk,
          "Placed at Other Company",
        );
      });

      expect(result.current.talents[0].updated_at).not.toBe(originalUpdatedAt);
    });

    it("rolls back on API failure", async () => {
      server.use(
        http.patch(`${API_BASE}/talents`, () => {
          return HttpResponse.json({ error: "Update failed" }, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalStatus = result.current.talents[0].status;

      await act(async () => {
        try {
          await result.current.updateStatus(
            result.current.talents[0].pk,
            "Placed at Other Company",
          );
        } catch {
          // Expected to throw
        }
      });

      // Should rollback to original status
      expect(result.current.talents[0].status).toBe(originalStatus);
    });

    it("only updates the targeted talent", async () => {
      const { result } = renderHook(() => useTalents());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const secondTalentStatus = result.current.talents[1].status;

      await act(async () => {
        await result.current.updateStatus(
          result.current.talents[0].pk,
          "Placed at Other Company",
        );
      });

      // First talent updated
      expect(result.current.talents[0].status).toBe("Placed at Other Company");
      // Second talent unchanged
      expect(result.current.talents[1].status).toBe(secondTalentStatus);
    });
  });
});
