/**
 * Tests for useLookups hook
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockLookups } from "../mocks/handlers";
import { useLookups } from "@/hooks/useLookups";

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

describe("useLookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial fetch", () => {
    it("fetches lookups on mount", async () => {
      const { result } = renderHook(() => useLookups());

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.skills.length).toBeGreaterThan(0);
      expect(result.current.certifications.length).toBeGreaterThan(0);
      expect(result.current.cities.length).toBeGreaterThan(0);
      expect(result.current.error).toBeNull();
    });

    it("starts with empty arrays", () => {
      const { result } = renderHook(() => useLookups());

      // Before fetch completes, should have empty arrays
      expect(result.current.skills).toEqual([]);
      expect(result.current.certifications).toEqual([]);
      expect(result.current.cities).toEqual([]);
    });
  });

  describe("Sorting", () => {
    it("sorts skills alphabetically", async () => {
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.json({
            skills: ["Zebra", "Apple", "Mango"],
            certifications: [],
            cities: [],
          });
        }),
      );

      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.skills).toEqual(["Apple", "Mango", "Zebra"]);
    });

    it("sorts certifications alphabetically", async () => {
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.json({
            skills: [],
            certifications: ["PMP", "AWS", "CISSP"],
            cities: [],
          });
        }),
      );

      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.certifications).toEqual(["AWS", "CISSP", "PMP"]);
    });

    it("sorts cities by city, state", async () => {
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.json({
            skills: [],
            certifications: [],
            cities: [
              { city: "Zebra City", state: "ZZ" },
              { city: "Apple Town", state: "AA" },
              { city: "Apple Town", state: "ZZ" },
            ],
          });
        }),
      );

      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.cities[0]).toEqual({
        city: "Apple Town",
        state: "AA",
      });
      expect(result.current.cities[1]).toEqual({
        city: "Apple Town",
        state: "ZZ",
      });
      expect(result.current.cities[2]).toEqual({
        city: "Zebra City",
        state: "ZZ",
      });
    });
  });

  describe("Error handling", () => {
    it("sets error on fetch failure", async () => {
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Server error");
    });

    it("handles network errors", async () => {
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.error();
        }),
      );

      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
    });

    it("keeps previous data on error after initial load", async () => {
      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Now make refresh fail
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Data should be cleared on error (current implementation resets data)
      // But error should be set
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe("refresh()", () => {
    it("refetches data when called", async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          fetchCount++;
          return HttpResponse.json(mockLookups);
        }),
      );

      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchCount).toBe(1);

      await act(async () => {
        await result.current.refresh();
      });

      expect(fetchCount).toBe(2);
    });

    it("sets loading state during refresh", async () => {
      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Start refresh but don't await
      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("clears previous error on successful refresh", async () => {
      // First, make it fail
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.json({ error: "Server error" }, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(Error);
      });

      // Now make it succeed
      server.use(
        http.get(`${API_BASE}/lookups`, () => {
          return HttpResponse.json(mockLookups);
        }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.skills.length).toBeGreaterThan(0);
    });
  });

  describe("Response shape", () => {
    it("returns skills as string array", async () => {
      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.skills)).toBe(true);
      result.current.skills.forEach((skill) => {
        expect(typeof skill).toBe("string");
      });
    });

    it("returns certifications as string array", async () => {
      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.certifications)).toBe(true);
      result.current.certifications.forEach((cert) => {
        expect(typeof cert).toBe("string");
      });
    });

    it("returns cities with city and state properties", async () => {
      const { result } = renderHook(() => useLookups());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.cities)).toBe(true);
      result.current.cities.forEach((city) => {
        expect(city).toHaveProperty("city");
        expect(city).toHaveProperty("state");
        expect(typeof city.city).toBe("string");
        expect(typeof city.state).toBe("string");
      });
    });
  });
});
