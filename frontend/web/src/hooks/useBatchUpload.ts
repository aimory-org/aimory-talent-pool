/**
 * useBatchUpload - queue-based multi-file upload with guardrails.
 *
 * Uploads files with limited concurrency so a large batch doesn't hammer the
 * API. When the backend reports a rate limit (HTTP 429 / RateLimitError), the
 * queue backs off and retries; if the limit persists, remaining files are
 * marked blocked instead of being fired into a throttled API.
 */
import { useCallback, useRef, useState } from "react";
import { RateLimitError } from "@/lib/api";

export type BatchItemStatus =
  | "queued"
  | "uploading"
  | "success"
  | "error"
  | "blocked";

export interface BatchUploadItem {
  file: File;
  status: BatchItemStatus;
  error?: string;
}

export interface BatchUploadSummary {
  total: number;
  succeeded: number;
  failed: number;
  blocked: number;
  /** True when the batch stopped early because rate limits persisted. */
  rateLimited: boolean;
}

interface UseBatchUploadOptions {
  /** Uploads one file; throw RateLimitError to trigger backoff. */
  uploadFn: (file: File) => Promise<void>;
  /** Parallel uploads. Keep low — each file fans out into LLM work. */
  concurrency?: number;
  /** Backoff retries per file when rate limited. */
  maxRateLimitRetries?: number;
  /** Base backoff delay in ms (doubles per retry). Overridable for tests. */
  baseBackoffMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useBatchUpload({
  uploadFn,
  concurrency = 2,
  maxRateLimitRetries = 3,
  baseBackoffMs = 2000,
}: UseBatchUploadOptions) {
  const [items, setItems] = useState<BatchUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  // Set when retries are exhausted so in-flight workers stop pulling new work.
  const haltedRef = useRef(false);

  const updateItem = useCallback(
    (index: number, patch: Partial<BatchUploadItem>) => {
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    setItems([]);
    setIsUploading(false);
    setRateLimitNotice(null);
    haltedRef.current = false;
  }, []);

  /**
   * Upload one file, backing off and retrying on rate limits.
   * Returns "rate-limited" when retries were exhausted on a 429.
   */
  const uploadWithBackoff = useCallback(
    async (file: File, index: number): Promise<"ok" | "failed" | "rate-limited"> => {
      for (let attempt = 0; ; attempt++) {
        try {
          await uploadFn(file);
          updateItem(index, { status: "success" });
          return "ok";
        } catch (err) {
          if (err instanceof RateLimitError) {
            if (attempt < maxRateLimitRetries) {
              const delay =
                err.retryAfterSeconds != null
                  ? err.retryAfterSeconds * 1000
                  : baseBackoffMs * 2 ** attempt;
              setRateLimitNotice(
                "Request limit reached — retrying automatically…",
              );
              await sleep(delay);
              continue;
            }
            updateItem(index, {
              status: "error",
              error: "Request limit reached. Try again in a few minutes.",
            });
            return "rate-limited";
          }
          updateItem(index, {
            status: "error",
            error:
              err instanceof Error ? err.message : "Upload failed. Please try again.",
          });
          return "failed";
        }
      }
    },
    [uploadFn, updateItem, maxRateLimitRetries, baseBackoffMs],
  );

  /**
   * Upload all files. Resolves with a summary once every file has either
   * finished or been blocked by a persistent rate limit.
   */
  const startUpload = useCallback(
    async (files: File[]): Promise<BatchUploadSummary> => {
      haltedRef.current = false;
      setRateLimitNotice(null);
      setIsUploading(true);
      setItems(files.map((file) => ({ file, status: "queued" as const })));

      const results: ("ok" | "failed" | "rate-limited" | "blocked")[] =
        new Array(files.length);
      let next = 0;

      const worker = async () => {
        while (true) {
          const index = next++;
          if (index >= files.length) return;
          if (haltedRef.current) {
            results[index] = "blocked";
            updateItem(index, {
              status: "blocked",
              error: "Skipped — request limit reached.",
            });
            continue;
          }
          updateItem(index, { status: "uploading" });
          const result = await uploadWithBackoff(files[index], index);
          results[index] = result;
          if (result === "rate-limited") {
            haltedRef.current = true;
            setRateLimitNotice(
              "Request limit reached. Remaining files were skipped — try again in a few minutes.",
            );
          } else if (!haltedRef.current) {
            setRateLimitNotice(null);
          }
        }
      };

      const workerCount = Math.max(1, Math.min(concurrency, files.length));
      await Promise.all(Array.from({ length: workerCount }, worker));

      setIsUploading(false);
      return {
        total: files.length,
        succeeded: results.filter((r) => r === "ok").length,
        failed: results.filter((r) => r === "failed" || r === "rate-limited")
          .length,
        blocked: results.filter((r) => r === "blocked").length,
        rateLimited: results.some(
          (r) => r === "rate-limited" || r === "blocked",
        ),
      };
    },
    [concurrency, updateItem, uploadWithBackoff],
  );

  return { items, isUploading, rateLimitNotice, startUpload, reset };
}
