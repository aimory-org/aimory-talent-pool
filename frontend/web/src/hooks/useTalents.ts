/**
 * React hooks for fetching and managing talent data.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { listTalents, updateTalent, bulkUpdateTalents, type ListTalentsParams } from "@/lib/api";
import type { TalentProfile, CandidateStatus } from "@/types/talent";

export interface UseTalentsOptions extends ListTalentsParams {
  /** Whether to fetch data automatically on mount/filter change */
  enabled?: boolean;
}

export interface UseTalentsResult {
  talents: TalentProfile[];
  isLoading: boolean;
  error: Error | null;
  /** Refresh the data */
  refresh: () => Promise<void>;
  /** Update a talent's status optimistically */
  updateStatus: (pk: string, status: CandidateStatus) => Promise<void>;
  /** Bulk update status for multiple talents optimistically */
  bulkUpdateStatus: (pks: string[], status: CandidateStatus) => Promise<{ updated_count: number; failed_pks: string[] }>;
  /** Replace a single talent in the local list (e.g. after an edit) */
  mergeTalent: (updated: TalentProfile) => void;
  /** Remove multiple talents from local state (after bulk delete) */
  removeTalents: (pks: string[]) => void;
}

/**
 * Hook for fetching and managing talent profiles.
 * Loads all matching records at once.
 */
export function useTalents(options: UseTalentsOptions = {}): UseTalentsResult {
  const { enabled = true, ...filters } = options;

  const [talents, setTalents] = useState<TalentProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const filtersKey = JSON.stringify(filters);

  // Monotonic id per fetch so a slow response can't clobber a newer one
  // (e.g. a slow OpenSearch query landing after the user already cleared
  // the search and the unfiltered list came back).
  const fetchSeqRef = useRef(0);

  const fetchTalents = useCallback(async () => {
    if (!enabled) return;

    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await listTalents(filters);
      if (seq !== fetchSeqRef.current) return; // stale response - discard
      setTalents(response.items);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(
        err instanceof Error ? err : new Error("Failed to fetch talents"),
      );
    } finally {
      if (seq === fetchSeqRef.current) {
        setIsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filtersKey]);

  useEffect(() => {
    void fetchTalents();
  }, [fetchTalents]);

  const refresh = useCallback(async () => {
    await fetchTalents();
  }, [fetchTalents]);

  const updateStatus = useCallback(
    async (pk: string, status: CandidateStatus) => {
      // Optimistic update
      const previousTalents = talents;
      setTalents((prev) =>
        prev.map((t) =>
          t.pk === pk
            ? { ...t, status, updated_at: new Date().toISOString() }
            : t,
        ),
      );

      try {
        await updateTalent(pk, { status });
      } catch (err) {
        // Rollback on error
        setTalents(previousTalents);
        throw err;
      }
    },
    [talents],
  );

  const bulkUpdateStatus = useCallback(
    async (pks: string[], status: CandidateStatus) => {
      const previousTalents = talents;
      const pkSet = new Set(pks);
      setTalents((prev) =>
        prev.map((t) =>
          pkSet.has(t.pk)
            ? { ...t, status, updated_at: new Date().toISOString() }
            : t,
        ),
      );
      try {
        return await bulkUpdateTalents(pks, status);
      } catch (err) {
        setTalents(previousTalents);
        throw err;
      }
    },
    [talents],
  );

  const mergeTalent = useCallback((updated: TalentProfile) => {
    setTalents((prev) => prev.map((t) => (t.pk === updated.pk ? updated : t)));
  }, []);

  const removeTalents = useCallback((pks: string[]) => {
    const pkSet = new Set(pks);
    setTalents((prev) => prev.filter((t) => !pkSet.has(t.pk)));
  }, []);

  return {
    talents,
    isLoading,
    error,
    refresh,
    updateStatus,
    bulkUpdateStatus,
    mergeTalent,
    removeTalents,
  };
}
