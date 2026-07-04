/**
 * Style constants for the TalentDashboard component.
 */
import type { CandidateStatus } from "@/types/talent";

interface StatusCfg {
  badge: string;
  dot: string;
}

export const statusConfig: Record<CandidateStatus, StatusCfg> = {
  // Hasn't been engaged yet — lightest treatment: outline only, no fill.
  "Potential Candidate": {
    badge: "bg-transparent text-muted-foreground border-border-strong",
    dot: "bg-muted-foreground",
  },
  "Active Candidate": {
    badge: "bg-accent text-accent-foreground border-transparent",
    dot: "bg-primary",
  },
  // Resolved, but not relevant to Aimory's pipeline — heaviest neutral
  // treatment: solid fill, to read as "closed" rather than "not started".
  "Placed at Other Company": {
    badge: "bg-muted-foreground/20 text-foreground/80 border-transparent",
    dot: "bg-muted-foreground",
  },
  "Placed with us": {
    badge: "bg-success/12 text-success border-success/25",
    dot: "bg-success",
  },
  "Stale Candidate": {
    badge: "bg-warning/12 text-warning border-warning/25",
    dot: "bg-warning",
  },
  "Do Not Contact": {
    badge: "bg-destructive/12 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
};

// Clearance badges use a 3-step escalating visual weight (standard → elevated
// → highest) rather than a distinct hue per level — the label text already
// says exactly which clearance it is, so color only needs to flag relative
// sensitivity at a glance.
export const clearanceColors: Record<string, string> = {
  Secret: "bg-secondary text-muted-foreground border-transparent",
  TS: "bg-secondary text-muted-foreground border-transparent",
  "TS/SCI": "bg-accent text-accent-foreground border-transparent",
  "TS/SCI/FSP": "bg-accent text-accent-foreground border-transparent",
  "TS/SCI/CI": "bg-accent text-accent-foreground border-transparent",
  "Yankee White": "bg-primary text-primary-foreground border-transparent",
};
