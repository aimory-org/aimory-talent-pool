/**
 * Tests for useBatchUpload hook (batch upload queue with rate-limit guardrails)
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchUpload } from "@/hooks/useBatchUpload";
import { RateLimitError } from "@/lib/api";

const makeFile = (name: string) =>
  new File(["content"], name, { type: "application/pdf" });

describe("useBatchUpload", () => {
  it("uploads every file and reports success", async () => {
    const uploadFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBatchUpload({ uploadFn, baseBackoffMs: 1 }),
    );

    const files = [makeFile("a.pdf"), makeFile("b.pdf"), makeFile("c.pdf")];
    let summary;
    await act(async () => {
      summary = await result.current.startUpload(files);
    });

    expect(uploadFn).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({
      total: 3,
      succeeded: 3,
      failed: 0,
      blocked: 0,
      rateLimited: false,
    });
    expect(result.current.items.every((i) => i.status === "success")).toBe(
      true,
    );
    expect(result.current.isUploading).toBe(false);
  });

  it("limits concurrent uploads", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const uploadFn = vi.fn().mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    const { result } = renderHook(() =>
      useBatchUpload({ uploadFn, concurrency: 2, baseBackoffMs: 1 }),
    );

    const files = Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.pdf`));
    await act(async () => {
      await result.current.startUpload(files);
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(uploadFn).toHaveBeenCalledTimes(6);
  });

  it("retries after a rate limit and succeeds", async () => {
    const uploadFn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError("throttled", 0))
      .mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useBatchUpload({ uploadFn, baseBackoffMs: 1 }),
    );

    let summary;
    await act(async () => {
      summary = await result.current.startUpload([makeFile("a.pdf")]);
    });

    expect(uploadFn).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ succeeded: 1, rateLimited: false });
  });

  it("halts the queue when rate limiting persists", async () => {
    const uploadFn = vi
      .fn()
      .mockRejectedValue(new RateLimitError("throttled", 0));

    const { result } = renderHook(() =>
      useBatchUpload({
        uploadFn,
        concurrency: 1,
        maxRateLimitRetries: 2,
        baseBackoffMs: 1,
      }),
    );

    const files = [makeFile("a.pdf"), makeFile("b.pdf"), makeFile("c.pdf")];
    let summary;
    await act(async () => {
      summary = await result.current.startUpload(files);
    });

    // First file: 1 attempt + 2 retries. Remaining files never hit the API.
    expect(uploadFn).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      succeeded: 0,
      failed: 1,
      blocked: 2,
      rateLimited: true,
    });
    expect(result.current.items[0].status).toBe("error");
    expect(result.current.items[1].status).toBe("blocked");
    expect(result.current.items[2].status).toBe("blocked");
    expect(result.current.rateLimitNotice).toMatch(/request limit/i);
  });

  it("marks ordinary failures without stopping the batch", async () => {
    const uploadFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useBatchUpload({ uploadFn, concurrency: 1, baseBackoffMs: 1 }),
    );

    const files = [makeFile("a.pdf"), makeFile("b.pdf")];
    let summary;
    await act(async () => {
      summary = await result.current.startUpload(files);
    });

    expect(summary).toMatchObject({
      succeeded: 1,
      failed: 1,
      blocked: 0,
      rateLimited: false,
    });
    expect(result.current.items[0].status).toBe("error");
    expect(result.current.items[0].error).toBe("boom");
    expect(result.current.items[1].status).toBe("success");
  });

  it("reset clears items and notices", async () => {
    const uploadFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBatchUpload({ uploadFn, baseBackoffMs: 1 }),
    );

    await act(async () => {
      await result.current.startUpload([makeFile("a.pdf")]);
    });
    expect(result.current.items).toHaveLength(1);

    act(() => result.current.reset());
    expect(result.current.items).toHaveLength(0);
    expect(result.current.rateLimitNotice).toBeNull();
  });
});
