/**
 * Badge component for displaying candidate status.
 */
import type { CandidateStatus } from "@/types/talent";
import { statusConfig } from "../constants";

interface StatusBadgeProps {
  status: CandidateStatus;
}

const FALLBACK_CFG = {
  badge: "bg-gray-500/12 text-gray-700 dark:text-gray-300 border-gray-500/25",
  dot: "bg-gray-500",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  // status is a stored DB value and may briefly hold a retired status
  // (e.g. "Placed Candidate") between a status rename and its data migration.
  const cfg = statusConfig[status] ?? FALLBACK_CFG;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cfg.badge}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} animate-pulse`}
      />
      {status}
    </span>
  );
}
