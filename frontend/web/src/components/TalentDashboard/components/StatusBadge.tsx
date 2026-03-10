/**
 * Badge component for displaying candidate status.
 */
import type { CandidateStatus } from "@/types/talent"
import { statusColors } from "../constants"

interface StatusBadgeProps {
  status: CandidateStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
      {status}
    </span>
  )
}
