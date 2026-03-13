/**
 * React hooks for fetching and managing talent data.
 */
import { useState, useEffect, useCallback, useRef } from "react";
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

  // Track filter changes
  const filtersRef = useRef(filters);
  const isInitialMount = useRef(true);

  // Serialize filters for comparison
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
  }, [enabled, filtersKey]);

  // Refetch when filters change
  useEffect(() => {
    const filtersChanged = JSON.stringify(filtersRef.current) !== filtersKey;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (enabled) {
        fetchTalents();
      }
    } else if (filtersChanged) {
      filtersRef.current = filters;
      fetchTalents();
    }
  }, [filtersKey, enabled, fetchTalents]);

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

  return {
    talents,
    isLoading,
    error,
    refresh,
    updateStatus,
  };
}
