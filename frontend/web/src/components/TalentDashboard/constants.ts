/**
 * Style constants for the TalentDashboard component.
 */
import type { CandidateStatus } from "@/types/talent"

export const statusColors: Record<CandidateStatus, string> = {
  "Potential Candidate": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Active Candidate": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Placed Candidate": "bg-green-500/20 text-green-300 border-green-500/30",
  "Stale Candidate": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Do Not Contact": "bg-red-500/20 text-red-300 border-red-500/30",
}

export const clearanceColors: Record<string, string> = {
  Secret: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  TS: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "TS/SCI": "bg-red-500/20 text-red-300 border-red-500/30",
  "TS/SCI/FSP": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "TS/SCI/CI": "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "Yankee White": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
}
