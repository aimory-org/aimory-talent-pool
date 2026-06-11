import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  User,
  UserPlus,
  X,
} from "lucide-react";
import {
  listAuditHistory,
  type AuditEntry,
  type AuditFieldChange,
} from "@/lib/api";
import { Pagination } from "@/components/ui/pagination";
import { isUUID, fallbackCandidateName } from "../utils";

const PAGE_SIZE = 25;

type ActionType =
  | "edit"
  | "status_change"
  | "delete"
  | "tag_add"
  | "tag_remove"
  | "new_candidate"
  | "new_job_description"
  | "archive_jd"
  | "unarchive_jd";

interface RecruiterEvent {
  id: string;
  timestamp: string;
  recruiter_name: string;
  recruiter_email: string;
  action: ActionType;
  candidate_name: string;
  candidate_id: string;
  old_value?: string;
  new_value?: string;
  details: string;
}

const SYSTEM_EMAILS = new Set(["dedup@system"]);

const FIELD_LABELS: Record<string, string> = {
  status: "status",
  tags: "tags",
  requested_salary: "salary",
  clearance_level: "clearance",
  job_title: "job title",
  service_category: "service category",
  industry_category: "industry",
  years_of_experience: "years of experience",
  summary: "summary",
  name: "name",
  title: "title",
  required_skills: "required skills",
  desired_skills: "desired skills",
  required_certifications: "required certifications",
  desired_certifications: "desired certifications",
  required_clearance: "clearance",
  min_experience_years: "min experience",
  location: "location",
  salary_range: "salary range",
  archived: "archived status",
};

const ACTION_CONFIG: Record<
  ActionType,
  { label: string; badge: string; dot: string }
> = {
  edit: {
    label: "Edit",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    dot: "bg-blue-500",
  },
  status_change: {
    label: "Status Change",
    badge:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    dot: "bg-violet-500",
  },
  delete: {
    label: "Delete",
    badge: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    dot: "bg-red-500",
  },
  tag_add: {
    label: "Tag Added",
    badge:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  tag_remove: {
    label: "Tag Removed",
    badge:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    dot: "bg-amber-500",
  },
  new_candidate: {
    label: "New Candidate",
    badge:
      "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
    dot: "bg-teal-500",
  },
  new_job_description: {
    label: "New Job Description",
    badge:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    dot: "bg-violet-500",
  },
  archive_jd: {
    label: "Archived",
    badge:
      "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
    dot: "bg-orange-500",
  },
  unarchive_jd: {
    label: "Unarchived",
    badge:
      "bg-orange-300/10 text-orange-500 dark:text-orange-200 border-orange-400/20",
    dot: "bg-orange-400",
  },
};

const ACTION_FILTERS: { value: ActionType | "all"; label: string }[] = [
  { value: "all", label: "All Actions" },
  { value: "new_candidate", label: "New Candidates" },
  { value: "new_job_description", label: "New Job Descriptions" },
  { value: "edit", label: "Edits" },
  { value: "status_change", label: "Status Changes" },
  { value: "delete", label: "Deletes" },
  { value: "tag_add", label: "Tags Added" },
  { value: "tag_remove", label: "Tags Removed" },
  { value: "archive_jd", label: "JD Archived" },
  { value: "unarchive_jd", label: "JD Unarchived" },
];

const AVATAR_COLORS = [
  "from-indigo-500 to-violet-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function avatarColor(name: string) {
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function toNamedList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        const name = (item as { name?: unknown }).name;
        return typeof name === "string" ? name : null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function deriveTagAction(
  change: AuditFieldChange,
): { action: "tag_add" | "tag_remove"; value: string } | null {
  const oldTags = toNamedList(change.old);
  const newTags = toNamedList(change.new);

  const added = newTags.find((tag) => !oldTags.includes(tag));
  if (added) return { action: "tag_add", value: added };

  const removed = oldTags.find((tag) => !newTags.includes(tag));
  if (removed) return { action: "tag_remove", value: removed };

  return null;
}

function mapRecruiterEvent(entry: AuditEntry): RecruiterEvent | null {
  // Pipeline ingestion → show as "New Candidate" (resume) or "New Job Description" (JD)
  if (entry.user_email === "pipeline@system" && entry.action !== "UPDATE") {
    const displayName = fallbackCandidateName(entry);
    const isJd = isUUID(entry.pk);
    return {
      id: entry.sk,
      timestamp: entry.timestamp,
      recruiter_name: "Pipeline",
      recruiter_email: entry.user_email,
      action: isJd ? "new_job_description" : "new_candidate",
      candidate_name: displayName,
      candidate_id: entry.pk,
      details: isJd
        ? `${displayName} was added as a new job description.`
        : `${displayName} was added via the upload pipeline.`,
    };
  }

  // pipeline@system UPDATE entries are reprocesses — they belong in SystemActivity
  if (entry.user_email === "pipeline@system") return null;

  if (SYSTEM_EMAILS.has(entry.user_email)) return null;

  const candidateName = fallbackCandidateName(entry);
  const recruiterName = entry.user_name || entry.user_email.split("@")[0];

  if (entry.action === "DELETE") {
    return {
      id: entry.sk,
      timestamp: entry.timestamp,
      recruiter_name: recruiterName,
      recruiter_email: entry.user_email,
      action: "delete",
      candidate_name: candidateName,
      candidate_id: entry.pk,
      details: isUUID(entry.pk)
        ? `Deleted job description: ${candidateName}.`
        : `Deleted profile for ${candidateName}.`,
    };
  }

  if (entry.action === "STATUS_CHANGE") {
    const statusChange = entry.changes?.status;
    return {
      id: entry.sk,
      timestamp: entry.timestamp,
      recruiter_name: recruiterName,
      recruiter_email: entry.user_email,
      action: "status_change",
      candidate_name: candidateName,
      candidate_id: entry.pk,
      old_value: statusChange ? String(statusChange.old ?? "") : undefined,
      new_value: statusChange ? String(statusChange.new ?? "") : undefined,
      details: isUUID(entry.pk)
        ? "Updated job description status."
        : "Updated candidate status.",
    };
  }

  if (entry.action === "UPDATE") {
    // JD Lambda (old format) stores changes as a string array; talent Lambda stores {field: {old, new}}.
    // Normalise to the dict format so the rest of the logic is uniform.
    const rawChanges = entry.changes;
    const changes: Record<string, AuditFieldChange> = Array.isArray(rawChanges)
      ? Object.fromEntries(
          (rawChanges as string[]).map((f) => [f, { old: null, new: null }]),
        )
      : (rawChanges ?? {});

    if (changes.tags) {
      const tagAction = deriveTagAction(changes.tags);
      if (tagAction) {
        return {
          id: entry.sk,
          timestamp: entry.timestamp,
          recruiter_name: recruiterName,
          recruiter_email: entry.user_email,
          action: tagAction.action,
          candidate_name: candidateName,
          candidate_id: entry.pk,
          new_value:
            tagAction.action === "tag_add" ? tagAction.value : undefined,
          old_value:
            tagAction.action === "tag_remove" ? tagAction.value : undefined,
          details:
            tagAction.action === "tag_add"
              ? `Added tag ${tagAction.value}.`
              : `Removed tag ${tagAction.value}.`,
        };
      }
    }

    // Archived field change — use a dedicated action type and description.
    if ("archived" in changes) {
      const newVal = changes.archived.new;
      const isArchiving = newVal === true;
      return {
        id: entry.sk,
        timestamp: entry.timestamp,
        recruiter_name: recruiterName,
        recruiter_email: entry.user_email,
        action: isArchiving ? "archive_jd" : "unarchive_jd",
        candidate_name: candidateName,
        candidate_id: entry.pk,
        details: isArchiving
          ? `Archived job description: ${candidateName}.`
          : `Restored job description from archive: ${candidateName}.`,
      };
    }

    const firstField = Object.keys(changes)[0];
    const firstChange = firstField ? changes[firstField] : null;
    const entityFallback = isUUID(entry.pk) ? "job description" : "profile";
    const label = FIELD_LABELS[firstField || ""] || firstField || entityFallback;

    return {
      id: entry.sk,
      timestamp: entry.timestamp,
      recruiter_name: recruiterName,
      recruiter_email: entry.user_email,
      action: "edit",
      candidate_name: candidateName,
      candidate_id: entry.pk,
      old_value: firstChange?.old != null ? String(firstChange.old) : undefined,
      new_value: firstChange?.new != null ? String(firstChange.new) : undefined,
      details: `Updated ${label}.`,
    };
  }

  return {
    id: entry.sk,
    timestamp: entry.timestamp,
    recruiter_name: recruiterName,
    recruiter_email: entry.user_email,
    action: "edit",
    candidate_name: candidateName,
    candidate_id: entry.pk,
    details: isUUID(entry.pk)
      ? `Added job description: ${candidateName}.`
      : `Created profile for ${candidateName}.`,
  };
}

export function RecruiterActivity() {
  const [actionFilter, setActionFilter] = useState<ActionType | "all">("all");
  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [events, setEvents] = useState<RecruiterEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);

  const loadEvents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listAuditHistory(300);
      setEvents(
        response.items
          .map(mapRecruiterEvent)
          .filter((event): event is RecruiterEvent => Boolean(event)),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to load recruiter activity"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (actionFilter !== "all" && event.action !== actionFilter) return false;
      if (!search) return true;

      const q = search.toLowerCase();
      return (
        event.recruiter_name.toLowerCase().includes(q) ||
        event.candidate_name.toLowerCase().includes(q) ||
        event.details.toLowerCase().includes(q)
      );
    });
  }, [events, actionFilter, search]);

  const currentAction = ACTION_FILTERS.find((f) => f.value === actionFilter);

  // Reset to first page when action filter or search changes
  useEffect(() => {
    setPage(1);
  }, [actionFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Clamp page when data changes without filter change (refresh)
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const safePage = Math.min(page, totalPages);

  const paginatedEvents = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const pageStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, filtered.length);

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by recruiter, candidate, or notes..."
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/7 dark:border-white/7 text-sm text-foreground placeholder-foreground/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/30 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowFilter((v) => !v)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl border border-black/7 dark:border-white/7 bg-black/5 dark:bg-white/5 text-sm font-medium text-foreground/60 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <span>{currentAction?.label}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {showFilter && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-black/7 dark:border-white/7 bg-white dark:bg-slate-800 shadow-xl shadow-black/10 z-20 py-1 animate-slide-in-up">
              {ACTION_FILTERS.map((filterOption) => (
                <button
                  key={filterOption.value}
                  onClick={() => {
                    setActionFilter(filterOption.value);
                    setShowFilter(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    actionFilter === filterOption.value
                      ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
                      : "text-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {filterOption.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => void loadEvents()}
          title="Refresh recruiter activity"
          className="h-10 w-10 shrink-0 rounded-xl border border-black/7 dark:border-white/7 bg-black/5 dark:bg-white/5 text-foreground/60 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all flex items-center justify-center"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-2xl border border-red-500/20 bg-red-500/8 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load recruiter activity.
        </div>
      )}

      <p className="text-xs text-foreground/40 mb-4">
        Showing{" "}
        <span className="font-semibold text-foreground/60">
          {pageStart}–{pageEnd}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-foreground/60">
          {filtered.length}
        </span>{" "}
        {filtered.length === 1 ? "event" : "events"}
      </p>

      <div className="space-y-2">
        {isLoading && filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-foreground/30">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">Loading recruiter activity</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-foreground/30">
            <User className="h-10 w-10" />
            <p className="text-sm">No activity found</p>
          </div>
        ) : (
          paginatedEvents.map((event, index) => {
            const config = ACTION_CONFIG[event.action];
            const gradient = avatarColor(event.recruiter_name);
            const isPipeline =
              event.action === "new_candidate" ||
              event.action === "new_job_description";
            const avatarBg = isPipeline
              ? event.action === "new_job_description"
                ? "from-violet-500 to-purple-600"
                : "from-teal-500 to-emerald-600"
              : gradient;

            return (
              <div
                key={event.id}
                className="animate-fade-in flex gap-3 p-4 rounded-2xl border border-black/6 dark:border-white/6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:border-indigo-500/20 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all duration-200"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* Avatar */}
                <div
                  className={`shrink-0 h-9 w-9 rounded-xl bg-linear-to-br ${avatarBg} flex items-center justify-center text-white shadow-sm`}
                >
                  {event.action === "new_candidate" ? (
                    <UserPlus className="w-4 h-4" />
                  ) : event.action === "new_job_description" ? (
                    <FileText className="w-4 h-4" />
                  ) : (
                    <span className="text-[11px] font-bold">
                      {getInitials(event.recruiter_name)}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Row 1: subject + timestamp */}
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="text-sm font-semibold text-foreground leading-snug truncate">
                      {event.candidate_name}
                    </p>
                    <div className="shrink-0 text-right leading-none">
                      <p className="text-xs font-medium text-foreground/50">
                        {formatTime(event.timestamp)}
                      </p>
                      <p className="text-[11px] text-foreground/30 mt-0.5">
                        {formatDate(event.timestamp)}
                      </p>
                    </div>
                  </div>

                  {/* Row 2: badge + actor */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.badge}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                      {config.label}
                    </span>
                    {!isPipeline && (
                      <span className="text-xs text-foreground/40">
                        by{" "}
                        <span className="font-medium text-foreground/60">
                          {event.recruiter_name}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Row 3: diff chips or description */}
                  {event.old_value && event.new_value ? (
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-red-500/8 text-red-600 dark:text-red-400 line-through font-mono max-w-[180px] truncate">
                        {event.old_value}
                      </span>
                      <span className="text-foreground/30">&rarr;</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/8 text-emerald-700 dark:text-emerald-400 font-mono max-w-[180px] truncate">
                        {event.new_value}
                      </span>
                    </div>
                  ) : event.new_value ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/8 text-emerald-700 dark:text-emerald-400 font-mono max-w-[220px] truncate">
                        {event.new_value}
                      </span>
                    </div>
                  ) : event.old_value ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-red-500/8 text-red-600 dark:text-red-400 line-through font-mono max-w-[220px] truncate">
                        {event.old_value}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-foreground/45 leading-relaxed">
                      {event.details}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-6"
      />
    </div>
  );
}
