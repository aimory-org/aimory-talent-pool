/**
 * React hooks for fetching and managing talent data.
 */
import { useState, useEffect, useCallback } from "react";
import { listTalents, updateTalent, type ListTalentsParams } from "@/lib/api";
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
  /** Replace a single talent in the local list (e.g. after an edit) */
  mergeTalent: (updated: TalentProfile) => void;
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

  const fetchTalents = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await listTalents(filters);
      setTalents(response.items);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch talents"),
      );
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filtersKey]);

  useEffect(() => {
    // Avoid direct setState in effect body
    const doFetch = async () => {
      await fetchTalents();
    };
    void doFetch();
  }, [fetchTalents]);

  const refresh = useCallback(async () => {
    await fetchTalents();
  }, [fetchTalents]);

  const updateStatus = useCallback(
    async (pk: string, status: CandidateStatus) => {
      // Optimistic update
      let previousTalents: TalentProfile[] = [];
      setTalents((prev) => {
        previousTalents = prev;
        return prev.map((t) =>
          t.pk === pk
            ? { ...t, status, updated_at: new Date().toISOString() }
            : t,
        );
      });

      try {
        await updateTalent(pk, { status });
      } catch (err) {
        // Rollback on error
        setTalents(() => previousTalents);
        throw err;
      }
    },
    [],
  );

  const mergeTalent = useCallback((updated: TalentProfile) => {
    setTalents((prev) => prev.map((t) => (t.pk === updated.pk ? updated : t)));
  }, []);

  return {
    talents,
    isLoading,
    error,
    refresh,
    updateStatus,
    mergeTalent,
  };
}
