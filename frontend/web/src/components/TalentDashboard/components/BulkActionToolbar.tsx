import { useState } from "react";
import { Trash2, CheckSquare, ChevronDown, X } from "lucide-react";
import type { CandidateStatus } from "@/types/talent";

const BULK_STATUSES: { value: CandidateStatus; label: string }[] = [
  { value: "Active Candidate", label: "Active" },
  { value: "Placed with us", label: "Placed (with us)" },
  { value: "Placed at Other Company", label: "Placed (outside)" },
  { value: "Stale Candidate", label: "Stale" },
  { value: "Do Not Contact", label: "Do Not Contact" },
  { value: "Potential Candidate", label: "Potential" },
];

interface BulkActionToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkStatus: (status: CandidateStatus) => void;
  onBulkDelete: () => void;
  isUpdating: boolean;
}

export function BulkActionToolbar({
  selectedCount,
  onClearSelection,
  onBulkStatus,
  onBulkDelete,
  isUpdating,
}: BulkActionToolbarProps) {
  const [selectedStatus, setSelectedStatus] = useState<CandidateStatus | "">("");

  if (selectedCount === 0) return null;

  const handleApplyStatus = () => {
    if (!selectedStatus) return;
    onBulkStatus(selectedStatus as CandidateStatus);
    setSelectedStatus("");
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 animate-fade-in">
      <div className="flex items-center gap-2 shrink-0">
        <CheckSquare className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
          {selectedCount} selected
        </span>
      </div>

      <div className="h-4 w-px bg-indigo-500/30 hidden sm:block" />

      {/* Status change */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as CandidateStatus | "")}
            disabled={isUpdating}
            className="h-8 pl-3 pr-8 rounded-lg border border-indigo-500/30 bg-white dark:bg-slate-800 text-foreground/80 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none cursor-pointer disabled:opacity-50"
          >
            <option value="">Change status to...</option>
            {BULK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/50" />
        </div>
        <button
          onClick={handleApplyStatus}
          disabled={!selectedStatus || isUpdating}
          className="h-8 px-3 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-indigo-500/25"
        >
          {isUpdating ? "Updating…" : "Apply"}
        </button>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Delete */}
        <button
          onClick={onBulkDelete}
          disabled={isUpdating}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-500/30 text-red-500 text-sm font-medium hover:bg-red-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>

        {/* Clear */}
        <button
          onClick={onClearSelection}
          disabled={isUpdating}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-foreground/40 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
