/**
 * React hook for fetching and managing job descriptions.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  listJobDescriptions,
  deleteJobDescription,
  matchCandidates,
  type ListJobDescriptionsParams,
} from "@/lib/api";
import type {
  JobDescription,
  MatchCandidatesResponse,
} from "@/types/jobDescription";

export interface UseJobDescriptionsOptions extends ListJobDescriptionsParams {
  enabled?: boolean;
}

export interface UseJobDescriptionsResult {
  jobDescriptions: JobDescription[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  removeJobDescription: (pk: string) => Promise<void>;
  matchCandidatesForJd: (
    pk: string,
    limit?: number,
  ) => Promise<MatchCandidatesResponse>;
}

export function useJobDescriptions(
  options: UseJobDescriptionsOptions = {},
): UseJobDescriptionsResult {
  const { enabled = true, ...filters } = options;

  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const filtersRef = useRef(filters);
  const isInitialMount = useRef(true);
  const filtersKey = JSON.stringify(filters);

  const fetchJds = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const items = await listJobDescriptions(filters);
      setJobDescriptions(items);
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to fetch job descriptions"),
      );
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filtersKey]);

  useEffect(() => {
    const filtersChanged = JSON.stringify(filtersRef.current) !== filtersKey;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (enabled) fetchJds();
    } else if (filtersChanged) {
      filtersRef.current = filters;
      fetchJds();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, enabled, fetchJds]);

  const refresh = useCallback(async () => {
    await fetchJds();
  }, [fetchJds]);

  const removeJobDescription = useCallback(
    async (pk: string) => {
      const previous = jobDescriptions;
      setJobDescriptions((prev) => prev.filter((jd) => jd.pk !== pk));
      try {
        await deleteJobDescription(pk);
      } catch (err) {
        setJobDescriptions(previous);
        throw err;
      }
    },
    [jobDescriptions],
  );

  const matchCandidatesForJd = useCallback(
    async (pk: string, limit?: number) => {
      return matchCandidates(pk, limit);
    },
    [],
  );

  return {
    jobDescriptions,
    isLoading,
    error,
    refresh,
    removeJobDescription,
    matchCandidatesForJd,
  };
}
