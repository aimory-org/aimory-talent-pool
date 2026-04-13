/**
 * Badge component for displaying clearance level.
 */
import { ShieldCheck } from "lucide-react";
import type { ClearanceLevel } from "@/types/talent";
import { clearanceColors } from "../constants";

interface ClearanceBadgeProps {
  level: ClearanceLevel;
}

export function ClearanceBadge({ level }: ClearanceBadgeProps) {
  if (!level) return null;
  const cls =
    clearanceColors[level] ||
    "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border tracking-wide ${cls}`}
    >
      <ShieldCheck className="h-3 w-3 shrink-0" />
      {level}
    </span>
  );
}
