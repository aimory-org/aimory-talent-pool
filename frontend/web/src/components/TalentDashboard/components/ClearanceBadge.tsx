/**
 * Badge component for displaying clearance level.
 */
import { Shield } from "lucide-react";
import type { ClearanceLevel } from "@/types/talent";
import { clearanceColors } from "../constants";

interface ClearanceBadgeProps {
  level: ClearanceLevel;
}

export function ClearanceBadge({ level }: ClearanceBadgeProps) {
  if (!level) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${clearanceColors[level] || "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30"}`}
    >
      <Shield className="h-3 w-3 mr-1" />
      {level}
    </span>
  );
}
