/**
 * React hook for fetching lookup data (skills, certifications, cities).
 */
import { useState, useEffect, useCallback } from "react";
import { getLookups, type LookupsResponse } from "@/lib/api";

export interface UseLookupsResult {
  skills: string[];
  certifications: string[];
  job_titles: string[];
  industry_categories: string[];
  cities: { city: string; state: string }[];
  tags: string[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching dropdown lookup data.
 * Caches results for the session.
 */
export function useLookups(): UseLookupsResult {
  const [data, setData] = useState<LookupsResponse>({
    skills: [],
    certifications: [],
    job_titles: [],
    industry_categories: [],
    cities: [],
    tags: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLookups = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getLookups();
      // Sort all lookups alphabetically
      setData({
        skills: [...response.skills].sort((a, b) => a.localeCompare(b)),
        certifications: [...response.certifications].sort((a, b) =>
          a.localeCompare(b),
        ),
        job_titles: [...(response.job_titles || [])].sort((a, b) =>
          a.localeCompare(b),
        ),
        industry_categories: [...(response.industry_categories || [])].sort(
          (a, b) => a.localeCompare(b),
        ),
        cities: [...response.cities].sort((a, b) =>
          `${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`),
        ),
        tags: [...(response.tags || [])].sort((a, b) => a.localeCompare(b)),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch lookups"),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  return {
    ...data,
    isLoading,
    error,
    refresh: fetchLookups,
  };
}
