/**
 * Badge component for displaying candidate status.
 */
import type { CandidateStatus } from "@/types/talent";
import { statusConfig } from "../constants";

interface StatusBadgeProps {
  status: CandidateStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap animate-badge-pop ${cfg.badge}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} animate-pulse`}
      />
      {status}
    </span>
  );
}
