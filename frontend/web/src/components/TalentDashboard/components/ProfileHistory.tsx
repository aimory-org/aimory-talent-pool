/**
 * History tab for ProfileDetailPanel.
 * Vertical timeline of audit events for a single candidate —
 * edits, status changes, pipeline ingestions, dedup-driven lookup updates, and deletes.
 */
import { useState, useEffect } from "react";
import {
  Clock,
  Edit3,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Database,
} from "lucide-react";
import {
  getAuditHistory,
  type AuditEntry,
  type AuditFieldChange,
} from "@/lib/api";
import { CLEARANCE_LEVELS } from "@/types/talent";

// ---------------------------------------------------------------------------
// Action config
// ---------------------------------------------------------------------------

type ActionCfg = {
  label: string;
  icon: React.ReactNode;
  pillCls: string;
  dotCls: string;
};

const ACTION_CFG: Record<AuditEntry["action"], ActionCfg> = {
  CREATE: {
    label: "Ingested",
    icon: <Plus className="w-3.5 h-3.5" />,
    pillCls: "bg-success/10 text-success border-success/20",
    dotCls: "bg-success",
  },
  UPDATE: {
    label: "Updated",
    icon: <Edit3 className="w-3.5 h-3.5" />,
    pillCls: "bg-secondary text-muted-foreground border-transparent",
    dotCls: "bg-muted-foreground",
  },
  STATUS_CHANGE: {
    label: "Status changed",
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    pillCls: "bg-accent text-accent-foreground border-transparent",
    dotCls: "bg-primary",
  },
  DELETE: {
    label: "Deleted",
    icon: <Trash2 className="w-3.5 h-3.5" />,
    pillCls: "bg-destructive/10 text-destructive border-destructive/20",
    dotCls: "bg-destructive",
  },
};

// ---------------------------------------------------------------------------
// Field display labels
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  name: "Name",
  notes: "Notes",
  tags: "Tags",
  requested_salary: "Salary",
  clearance_level: "Clearance",
  job_title: "Job Title",
  service_category: "Service",
  industry_category: "Industry",
  years_of_experience: "Experience",
  summary: "Summary",
  "contact.email": "Email",
  "contact.phone": "Phone",
  "contact.linkedin": "LinkedIn",
  "contact.github": "GitHub",
  "location.city": "City",
  "location.state": "State",
  skillsets: "Skills",
  certifications: "Certifications",
  companies: "Work History",
};

const CLEARANCE_LABELS: Record<string, string> = Object.fromEntries(
  CLEARANCE_LEVELS.map((c) => [c.value, c.label]),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatAbsolute(ts: string): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (field === "requested_salary" || v >= 10_000)
      return `$${v.toLocaleString()}/yr`;
    if (field === "years_of_experience")
      return `${v} ${v === 1 ? "year" : "years"}`;
    return String(v);
  }
  if (field === "clearance_level" && typeof v === "string") {
    return CLEARANCE_LABELS[v] ?? v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "none";
    if (typeof v[0] === "object" && v[0] !== null && "name" in v[0])
      return (v as { name: string }[]).map((x) => x.name).join(", ");
    return (v as string[]).join(", ");
  }
  return String(v);
}

/** Extract a display label from a list item, whether it's a plain string or an object with `name`. */
function itemLabel(item: unknown): string {
  if (item && typeof item === "object" && "name" in item) {
    return String((item as { name: string }).name);
  }
  return String(item);
}

/**
 * Diff two list-valued snapshots by item identity (case-insensitive name match)
 * so an append shows up as an addition instead of a full-list replacement.
 */
function diffListField(
  oldVal: unknown[],
  newVal: unknown[],
): { added: string[]; removed: string[] } {
  const oldItems = oldVal.map(itemLabel).filter(Boolean);
  const newItems = newVal.map(itemLabel).filter(Boolean);
  const oldKeys = new Set(oldItems.map((s) => s.toLowerCase().trim()));
  const newKeys = new Set(newItems.map((s) => s.toLowerCase().trim()));
  const added = newItems.filter((s) => !oldKeys.has(s.toLowerCase().trim()));
  const removed = oldItems.filter((s) => !newKeys.has(s.toLowerCase().trim()));
  return { added, removed };
}

function sourceLabel(entry: AuditEntry): string | null {
  if (entry.user_email === "pipeline@system") return "Pipeline";
  if (entry.user_email === "dedup@system") return "Dedup";
  return null;
}

// ---------------------------------------------------------------------------
// FieldDiff row
// ---------------------------------------------------------------------------

function FieldDiff({
  field,
  change,
}: {
  field: string;
  change: AuditFieldChange;
}) {
  const label = FIELD_LABELS[field] ?? field.replace(/_/g, " ");

  // List-valued fields (skills, certifications, work history, tags): diff by
  // item identity so an append/removal reads as "+X" / "-Y" rather than a
  // wholesale before/after replacement of the entire list.
  if (Array.isArray(change.old) && Array.isArray(change.new)) {
    const { added, removed } = diffListField(change.old, change.new);
    if (added.length === 0 && removed.length === 0) {
      return null; // e.g. reordered only — nothing meaningful to surface
    }

    return (
      <div className="flex items-start gap-3 text-xs">
        <span className="w-24 shrink-0 text-foreground/40 font-medium pt-0.5 truncate">
          {label}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          {added.length > 0 && (
            <div className="flex items-start gap-1.5 flex-wrap">
              <span className="text-success font-medium shrink-0 pt-0.5">
                + Added
              </span>
              {added.map((item, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md bg-success/8 text-success border border-success/15 max-w-40 truncate"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {removed.length > 0 && (
            <div className="flex items-start gap-1.5 flex-wrap">
              <span className="text-destructive font-medium shrink-0 pt-0.5">
                − Removed
              </span>
              {removed.map((item, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md bg-destructive/8 text-destructive border border-destructive/15 line-through decoration-destructive/50 max-w-40 truncate"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const oldVal = formatValue(field, change.old);
  const newVal = formatValue(field, change.new);

  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="w-24 shrink-0 text-foreground/40 font-medium pt-0.5 truncate">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        {oldVal !== "—" && (
          <span className="px-2 py-0.5 rounded-md bg-destructive/8 text-destructive border border-destructive/15 line-through decoration-destructive/50 max-w-40 truncate">
            {oldVal}
          </span>
        )}
        {oldVal !== "—" && newVal !== "—" && (
          <ArrowRight className="w-3 h-3 text-foreground/25 shrink-0" />
        )}
        {newVal !== "—" && (
          <span className="px-2 py-0.5 rounded-md bg-success/8 text-success border border-success/15 max-w-40 truncate">
            {newVal}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single timeline entry
// ---------------------------------------------------------------------------

function AuditCard({ entry, isLast }: { entry: AuditEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = ACTION_CFG[entry.action];
  // Summary text is long-form and noisy in a diff view — omit it from the log entirely.
  const changes = entry.changes
    ? Object.fromEntries(
        Object.entries(entry.changes).filter(([field]) => field !== "summary"),
      )
    : undefined;
  const changeKeys = changes ? Object.keys(changes) : [];
  const hasChanges = changeKeys.length > 0;
  const system = sourceLabel(entry);
  const displayName = entry.user_name ?? entry.user_email.split("@")[0];

  return (
    <div className="relative flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center pt-1">
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ring-4 ring-background ring-offset-0 ${cfg.dotCls}`}
        />
        {!isLast && (
          <div className="w-px flex-1 mt-1.5 border-l border-dashed border-foreground/10" />
        )}
      </div>

      {/* Card body */}
      <div className="flex-1 pb-5 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Avatar */}
            <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center shrink-0">
              {system ? (
                <Database className="w-3 h-3 text-accent-foreground" />
              ) : (
                <span className="text-accent-foreground text-[9px] font-bold">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            {/* Name */}
            <span className="text-sm font-semibold text-foreground">
              {system ?? displayName}
            </span>

            {/* Action pill */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.pillCls}`}
            >
              {cfg.icon}
              {cfg.label}
            </span>

            {/* Email (for non-system) */}
            {!system && (
              <span className="text-[11px] text-foreground/35 truncate max-w-[130px]">
                {entry.user_email}
              </span>
            )}

            {/* What changed, at a glance */}
            {changeKeys.length > 1 && (
              <span className="text-[11px] text-foreground/35 truncate max-w-[220px]">
                {changeKeys.length <= 3
                  ? changeKeys
                      .map((k) => FIELD_LABELS[k] ?? k.replace(/_/g, " "))
                      .join(", ")
                  : `${changeKeys.length} fields`}
              </span>
            )}
          </div>

          {/* Right: timestamp + expand */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-[11px] text-foreground/40 cursor-default"
              title={formatAbsolute(entry.timestamp)}
            >
              {formatRelative(entry.timestamp)}
            </span>
            {hasChanges && (
              <button
                onClick={() => setExpanded((p) => !p)}
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-foreground/30 hover:text-foreground/70"
              >
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Expanded diff */}
        {expanded && hasChanges && (
          <div className="mt-2 p-3 rounded-lg bg-black/3 dark:bg-white/3 border border-black/6 dark:border-white/6 space-y-1.5">
            {Object.entries(changes!).map(([field, change]) => (
              <FieldDiff key={field} field={field} change={change} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProfileHistoryProps {
  pk: string;
}

export function ProfileHistory({ pk }: ProfileHistoryProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<AuditEntry["action"] | "ALL">("ALL");

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAuditHistory(pk);
      setEntries(res.items);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to load history"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pk]);

  const filtered =
    filter === "ALL" ? entries : entries.filter((e) => e.action === filter);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as AuditEntry["action"] | "ALL")
          }
          className="flex-1 h-9 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors [&>option]:bg-popover [&>option]:text-foreground"
        >
          <option value="ALL">All events</option>
          <option value="CREATE">Ingested</option>
          <option value="UPDATE">Updated</option>
          <option value="STATUS_CHANGE">Status changes</option>
          <option value="DELETE">Deleted</option>
        </select>
        <button
          onClick={load}
          disabled={isLoading}
          title="Refresh"
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-secondary hover:bg-accent transition-colors text-muted-foreground hover:text-accent-foreground disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-10">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error.message}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12">
          <Clock className="w-8 h-8 text-foreground/15" />
          <p className="text-sm text-foreground/40 font-medium">
            No history yet
          </p>
          <p className="text-xs text-foreground/25 text-center max-w-[200px]">
            Changes will appear here once the audit log is connected.
          </p>
        </div>
      )}

      {/* Timeline */}
      {!isLoading && !error && filtered.length > 0 && (
        <div>
          {filtered.map((entry, i) => (
            <AuditCard
              key={entry.sk}
              entry={entry}
              isLast={i === filtered.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
