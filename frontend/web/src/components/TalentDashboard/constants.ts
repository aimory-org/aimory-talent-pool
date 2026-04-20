/**
 * Style constants for the TalentDashboard component.
 */
import type { CandidateStatus } from "@/types/talent";

interface StatusCfg {
  badge: string;
  dot: string;
}

export const statusConfig: Record<CandidateStatus, StatusCfg> = {
  "Potential Candidate": {
    badge:
      "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  "Active Candidate": {
    badge:
      "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
    dot: "bg-indigo-500",
  },
  "Placed Candidate": {
    badge:
      "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
    dot: "bg-violet-500",
  },
  "Stale Candidate": {
    badge:
      "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
    dot: "bg-amber-500",
  },
  "Do Not Contact": {
    badge: "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/25",
    dot: "bg-red-500",
  },
};

/** @deprecated use statusConfig */
export const statusColors: Record<CandidateStatus, string> = {
  "Potential Candidate":
    "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "Active Candidate":
    "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  "Placed Candidate":
    "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30",
  "Stale Candidate":
    "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "Do Not Contact":
    "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
};

export const clearanceColors: Record<string, string> = {
  Secret:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  TS: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  "TS/SCI":
    "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "TS/SCI/FSP":
    "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  "TS/SCI/CI":
    "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
  "Yankee White":
    "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
};
