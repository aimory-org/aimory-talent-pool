/**
 * Tests for useDeployments hook
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockDeployments } from "../mocks/handlers";
import { useDeployments } from "@/hooks/useDeployments";

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: { idToken: { toString: () => "mock-jwt-token" } },
  }),
}));

const API_BASE = "https://api.test.com";

describe("useDeployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with empty state and no loading", () => {
    const { result } = renderHook(() => useDeployments());

    expect(result.current.deployments).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches deployments on refresh call", async () => {
    const { result } = renderHook(() => useDeployments());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.deployments).toHaveLength(2);
    expect(result.current.deployments[0].id).toBe(1001);
    expect(result.current.deployments[0].conclusion).toBe("success");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("sets isLoading true while fetching", async () => {
    let resolveRequest: (() => void) | undefined;
    server.use(
      http.get(`${API_BASE}/deployments`, async () => {
        await new Promise<void>((res) => {
          resolveRequest = res;
        });
        return HttpResponse.json({ deployments: mockDeployments });
      }),
    );

    const { result } = renderHook(() => useDeployments());

    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(resolveRequest).toBeDefined());

    await act(async () => {
      resolveRequest?.();
      await refreshPromise!;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("stores error on API failure", async () => {
    server.use(
      http.get(`${API_BASE}/deployments`, () => {
        return HttpResponse.json(
          { error: "GitHub API unavailable" },
          { status: 503 },
        );
      }),
    );

    const { result } = renderHook(() => useDeployments());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.deployments).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("clears error on successful retry", async () => {
    // First call fails
    server.use(
      http.get(`${API_BASE}/deployments`, () => {
        return HttpResponse.json({ error: "fail" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useDeployments());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).not.toBeNull();

    // Restore the successful handler
    server.use(
      http.get(`${API_BASE}/deployments`, () => {
        return HttpResponse.json({ deployments: mockDeployments });
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.deployments).toHaveLength(2);
  });

  it("exposes both success and failure deployments", async () => {
    const { result } = renderHook(() => useDeployments());

    await act(async () => {
      await result.current.refresh();
    });

    const conclusions = result.current.deployments.map((d) => d.conclusion);
    expect(conclusions).toContain("success");
    expect(conclusions).toContain("failure");
  });

  it("refresh is stable across renders", async () => {
    const { result, rerender } = renderHook(() => useDeployments());
    const firstRefresh = result.current.refresh;

    rerender();

    expect(result.current.refresh).toBe(firstRefresh);
  });
});
