/**
 * Tests for useJobDescriptions hook
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockJobDescriptions } from "../mocks/handlers";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";

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

describe("useJobDescriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial fetch", () => {
    it("fetches job descriptions on mount", async () => {
      const { result } = renderHook(() => useJobDescriptions());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.jobDescriptions).toEqual([]);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.jobDescriptions).toHaveLength(2);
      expect(result.current.error).toBeNull();
    });

    it("skips fetch when enabled is false", async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${API_BASE}/job-descriptions`, () => {
          fetchCount++;
          return HttpResponse.json(mockJobDescriptions);
        }),
      );

      const { result } = renderHook(() =>
        useJobDescriptions({ enabled: false }),
      );

      expect(result.current.isLoading).toBe(false);
      await new Promise((r) => setTimeout(r, 100));
      expect(fetchCount).toBe(0);
    });
  });

  describe("Error handling", () => {
    it("sets error on fetch failure", async () => {
      server.use(
        http.get(`${API_BASE}/job-descriptions`, () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useJobDescriptions());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.jobDescriptions).toEqual([]);
    });
  });

  describe("removeJobDescription", () => {
    it("removes item optimistically and calls API", async () => {
      const { result } = renderHook(() => useJobDescriptions());

      await waitFor(() => {
        expect(result.current.jobDescriptions).toHaveLength(2);
      });

      await act(async () => {
        await result.current.removeJobDescription("jd-001");
      });

      expect(result.current.jobDescriptions).toHaveLength(1);
      expect(result.current.jobDescriptions[0].pk).toBe("jd-002");
    });

    it("rolls back on API failure", async () => {
      server.use(
        http.delete(`${API_BASE}/job-descriptions`, () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useJobDescriptions());

      await waitFor(() => {
        expect(result.current.jobDescriptions).toHaveLength(2);
      });

      await expect(
        act(async () => {
          await result.current.removeJobDescription("jd-001");
        }),
      ).rejects.toThrow();

      expect(result.current.jobDescriptions).toHaveLength(2);
    });
  });

  describe("matchCandidatesForJd", () => {
    it("returns match results from API", async () => {
      const { result } = renderHook(() => useJobDescriptions());

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.isLoading).toBe(false);
      });

      let matchResult;
      await act(async () => {
        matchResult = await result.current.matchCandidatesForJd("jd-001");
      });

      expect(matchResult).toBeDefined();
      expect(matchResult!.matches).toHaveLength(2);
      expect(matchResult!.matches[0].score).toBe(85);
    });
  });
});
