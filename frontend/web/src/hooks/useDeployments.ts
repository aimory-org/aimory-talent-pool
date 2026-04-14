/**
 * Hook for fetching recent deployment history from GitHub Actions (via Lambda proxy).
 */
import { useState, useCallback } from "react";
import { getDeployments, type Deployment } from "@/lib/api";

export interface UseDeploymentsResult {
  deployments: Deployment[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useDeployments(): UseDeploymentsResult {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getDeployments();
      setDeployments(response.deployments);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch deployments"),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deployments, isLoading, error, refresh };
}
