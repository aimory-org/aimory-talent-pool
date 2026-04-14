import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  GitBranch,
  GitCommit,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { listAuditHistory, type AuditEntry, type Deployment } from "@/lib/api";
import { useDeployments } from "@/hooks/useDeployments";

type SystemEventType = "deploy" | "pipeline" | "dedup" | "reprocess";
type DeployConclusion = "success" | "failure" | "cancelled" | "in_progress";

interface SystemEvent {
  id: string;
  type: SystemEventType;
  timestamp: string;
  conclusion?: DeployConclusion;
  branch?: string;
  commit_sha?: string;
  commit_message?: string;
  triggered_by?: string;
  duration_seconds?: number;
  run_url?: string;
  candidate_name?: string;
  candidate_id?: string;
  dedup_trigger?: "scheduled" | "manual";
  dedup_merged?: number;
  details: string;
}

const SYSTEM_EMAILS = new Set(["pipeline@system", "dedup@system"]);
const DEDUP_RUN_PK = "SYSTEM#LOOKUP_DEDUP_RUN";

const TYPE_CONFIG: Record<
  SystemEventType,
  {
    label: string;
    icon: ReactNode;
    badge: string;
    dot: string;
    bgIcon: string;
  }
> = {
  deploy: {
    label: "Deploy",
    icon: <GitBranch className="w-3.5 h-3.5" />,
    badge:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    dot: "bg-violet-500",
    bgIcon:
      "bg-gradient-to-br from-violet-500/20 to-purple-500/10 text-violet-600 dark:text-violet-400",
  },
  pipeline: {
    label: "Pipeline",
    icon: <Zap className="w-3.5 h-3.5" />,
    badge:
      "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    dot: "bg-indigo-500",
    bgIcon:
      "bg-gradient-to-br from-indigo-500/20 to-blue-500/10 text-indigo-600 dark:text-indigo-400",
  },
  dedup: {
    label: "Dedup",
    icon: <Layers className="w-3.5 h-3.5" />,
    badge:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    dot: "bg-amber-500",
    bgIcon:
      "bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-600 dark:text-amber-400",
  },
  reprocess: {
    label: "Reprocess",
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    badge:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dot: "bg-emerald-500",
    bgIcon:
      "bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

const CONCLUSION_CONFIG: Record<
  DeployConclusion,
  { icon: ReactNode; color: string }
> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-emerald-500",
  },
  failure: {
    icon: <XCircle className="w-4 h-4" />,
    color: "text-red-500",
  },
  cancelled: {
    icon: <Clock className="w-4 h-4" />,
    color: "text-amber-500",
  },
  in_progress: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: "text-indigo-500",
  },
};

const TYPE_FILTERS: { value: SystemEventType | "all"; label: string }[] = [
  { value: "all", label: "All Events" },
  { value: "deploy", label: "Deploys" },
  { value: "pipeline", label: "Pipeline" },
  { value: "dedup", label: "Dedup Runs" },
  { value: "reprocess", label: "Reprocesses" },
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

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function fallbackCandidateName(entry: AuditEntry): string {
  const snapshotName =
    entry.snapshot &&
    typeof entry.snapshot === "object" &&
    "name" in entry.snapshot &&
    typeof (entry.snapshot as { name?: unknown }).name === "string"
      ? (entry.snapshot as { name: string }).name
      : null;

  return (
    entry.candidate_name ||
    snapshotName ||
    entry.pk.split("#").at(-1)?.replace(".pdf", "") ||
    "Candidate"
  );
}

function getSnapshotValue(entry: AuditEntry, key: string): unknown {
  if (!entry.snapshot || typeof entry.snapshot !== "object") {
    return undefined;
  }

  return (entry.snapshot as Record<string, unknown>)[key];
}

function inferDedupTrigger(entry: AuditEntry): "scheduled" | "manual" {
  const snapshotTrigger = getSnapshotValue(entry, "trigger");
  if (snapshotTrigger === "scheduled" || snapshotTrigger === "manual") {
    return snapshotTrigger;
  }

  if (entry.details) {
    const details = entry.details.toLowerCase();
    if (details.startsWith("scheduled lookup dedup run")) {
      return "scheduled";
    }
    if (details.startsWith("manual lookup dedup run")) {
      return "manual";
    }
  }

  // Old entries before trigger metadata was added default to manual to avoid
  // showing an incorrect "Scheduled" tag for script-triggered runs.
  return "manual";
}

function deploymentToEvent(deployment: Deployment): SystemEvent {
  const details =
    deployment.conclusion === "success"
      ? "Deployment completed successfully."
      : deployment.conclusion === "failure"
        ? "Deployment failed during GitHub Actions execution."
        : deployment.conclusion === "cancelled"
          ? "Deployment was cancelled before completion."
          : "Deployment is currently in progress.";

  return {
    id: `deploy-${deployment.id}`,
    type: "deploy",
    timestamp: deployment.completed_at ?? deployment.started_at,
    conclusion:
      deployment.status === "in_progress"
        ? "in_progress"
        : (deployment.conclusion ?? undefined),
    branch: deployment.branch,
    commit_sha: deployment.commit_sha,
    commit_message: deployment.commit_message,
    triggered_by: deployment.triggered_by,
    duration_seconds: deployment.duration_seconds ?? undefined,
    run_url: deployment.url,
    details,
  };
}

function auditToSystemEvent(entry: AuditEntry): SystemEvent | null {
  if (!SYSTEM_EMAILS.has(entry.user_email)) return null;

  if (entry.user_email === "dedup@system") {
    const isRunSummary =
      entry.pk === DEDUP_RUN_PK ||
      entry.pk === "LOOKUP_DEDUP_RUN" ||
      entry.pk.endsWith("#LOOKUP_DEDUP_RUN");
    const candidateName = isRunSummary
      ? undefined
      : fallbackCandidateName(entry);
    const safeCandidateName =
      candidateName && candidateName.toUpperCase() !== "LOOKUP_DEDUP_RUN"
        ? candidateName
        : undefined;
    const changeCount = Object.keys(entry.changes || {}).length;

    return {
      id: entry.sk,
      type: "dedup",
      timestamp: entry.timestamp,
      candidate_name: safeCandidateName,
      candidate_id: entry.pk,
      dedup_trigger: inferDedupTrigger(entry),
      dedup_merged: isRunSummary ? undefined : changeCount || undefined,
      details:
        entry.details ||
        (isRunSummary
          ? "Lookup dedup run completed."
          : safeCandidateName && changeCount > 0
            ? `Lookup dedup updated ${changeCount} fields for ${safeCandidateName}.`
            : safeCandidateName
              ? `Lookup dedup updated ${safeCandidateName}.`
              : "Lookup dedup updated profile fields."),
    };
  }

  const candidateName = fallbackCandidateName(entry);

  if (entry.action === "UPDATE") {
    return {
      id: entry.sk,
      type: "reprocess",
      timestamp: entry.timestamp,
      candidate_name: candidateName,
      candidate_id: entry.pk,
      details: `Pipeline reprocessed ${candidateName}.`,
    };
  }

  return {
    id: entry.sk,
    type: "pipeline",
    timestamp: entry.timestamp,
    conclusion: "success",
    candidate_name: candidateName,
    candidate_id: entry.pk,
    details: `Pipeline ingested ${candidateName}.`,
  };
}

function getLatestDeploy(events: SystemEvent[]) {
  return events.find((event) => event.type === "deploy");
}

function DeployMeta({ event }: { event: SystemEvent }) {
  const conclusion = event.conclusion
    ? CONCLUSION_CONFIG[event.conclusion]
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3 mt-1.5">
      {conclusion && (
        <span
          className={`flex items-center gap-1 text-xs font-medium ${conclusion.color}`}
        >
          {conclusion.icon}
          <span className="capitalize">{event.conclusion}</span>
        </span>
      )}
      {event.branch && (
        <span className="flex items-center gap-1 text-xs text-foreground/50">
          <GitBranch className="w-3 h-3" />
          {event.branch}
        </span>
      )}
      {event.commit_sha && (
        <span className="flex items-center gap-1 text-xs font-mono text-foreground/40 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
          <GitCommit className="w-3 h-3" />
          {event.commit_sha}
        </span>
      )}
      {event.duration_seconds != null && (
        <span className="flex items-center gap-1 text-xs text-foreground/40">
          <Clock className="w-3 h-3" />
          {formatDuration(event.duration_seconds)}
        </span>
      )}
      {event.triggered_by && (
        <span className="text-xs text-foreground/40">
          by{" "}
          <span className="font-medium text-foreground/60">
            {event.triggered_by}
          </span>
        </span>
      )}
      {event.run_url && (
        <a
          href={event.run_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-600 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          View run
        </a>
      )}
    </div>
  );
}

function PipelineMeta({ event }: { event: SystemEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-1.5">
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Processed
      </span>
      {event.candidate_name && (
        <span className="text-xs text-foreground/50">
          <span className="font-medium text-foreground/70">
            {event.candidate_name}
          </span>
        </span>
      )}
    </div>
  );
}

function DedupMeta({ event }: { event: SystemEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-1.5">
      <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20">
        {event.dedup_trigger === "manual" ? "Manual" : "Scheduled"}
      </span>
      {event.dedup_merged != null && (
        <span
          className={`flex items-center gap-1 text-xs font-medium ${
            event.dedup_merged > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-foreground/40"
          }`}
        >
          <Layers className="w-3 h-3" />
          {event.dedup_merged} changed
        </span>
      )}
    </div>
  );
}

function LatestDeployBanner({ deploy }: { deploy: SystemEvent }) {
  const conclusion = deploy.conclusion
    ? CONCLUSION_CONFIG[deploy.conclusion]
    : null;
  const isSuccess = deploy.conclusion === "success";

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-2xl border mb-6 ${
        isSuccess
          ? "bg-emerald-500/8 border-emerald-500/20"
          : "bg-red-500/8 border-red-500/20"
      }`}
    >
      <div
        className={`p-2 rounded-xl ${
          isSuccess
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-red-500/15 text-red-500"
        }`}
      >
        {conclusion?.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Latest deploy:{" "}
          <span
            className={
              isSuccess
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {isSuccess ? "Successful" : "Failed"}
          </span>
        </p>
        <p className="text-xs text-foreground/50 truncate mt-0.5">
          {deploy.commit_message || "Deployment"}
          {deploy.triggered_by ? ` - ${deploy.triggered_by}` : ""} -{" "}
          {formatDate(deploy.timestamp)}, {formatTime(deploy.timestamp)}
          {deploy.duration_seconds != null
            ? ` - ${formatDuration(deploy.duration_seconds)}`
            : ""}
        </p>
      </div>
      {deploy.run_url && (
        <a
          href={deploy.run_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors px-3 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/8 hover:bg-indigo-500/15"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View
        </a>
      )}
    </div>
  );
}

export function SystemActivity() {
  const [typeFilter, setTypeFilter] = useState<SystemEventType | "all">("all");
  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [auditEvents, setAuditEvents] = useState<SystemEvent[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState<Error | null>(null);

  const {
    deployments,
    isLoading: isLoadingDeployments,
    error: deploymentsError,
    refresh: refreshDeployments,
  } = useDeployments();

  const loadAuditEvents = useCallback(async () => {
    setIsLoadingAudit(true);
    setAuditError(null);
    try {
      const response = await listAuditHistory(300);
      setAuditEvents(
        response.items
          .map(auditToSystemEvent)
          .filter((event): event is SystemEvent => Boolean(event)),
      );
    } catch (err) {
      setAuditError(
        err instanceof Error
          ? err
          : new Error("Failed to load system activity"),
      );
    } finally {
      setIsLoadingAudit(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshDeployments(), loadAuditEvents()]);
  }, [refreshDeployments, loadAuditEvents]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const allEvents = useMemo(() => {
    const deploymentEvents = deployments.map(deploymentToEvent);
    return [...deploymentEvents, ...auditEvents].sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    );
  }, [deployments, auditEvents]);

  const filtered = useMemo(() => {
    return allEvents.filter((event) => {
      if (typeFilter !== "all" && event.type !== typeFilter) return false;
      if (!search) return true;

      const q = search.toLowerCase();
      return (
        event.details.toLowerCase().includes(q) ||
        (event.commit_message?.toLowerCase().includes(q) ?? false) ||
        (event.candidate_name?.toLowerCase().includes(q) ?? false) ||
        (event.triggered_by?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allEvents, typeFilter, search]);

  const latestDeploy = getLatestDeploy(allEvents);
  const currentFilter = TYPE_FILTERS.find(
    (filterOption) => filterOption.value === typeFilter,
  );
  const isLoading = isLoadingDeployments || isLoadingAudit;

  return (
    <div className="animate-fade-in">
      {latestDeploy && <LatestDeployBanner deploy={latestDeploy} />}

      {(deploymentsError || auditError) && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-2xl border border-red-500/20 bg-red-500/8 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          System activity could not be fully loaded.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commits, candidates, or event details..."
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/[0.07] dark:border-white/[0.07] text-sm text-foreground placeholder-foreground/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/30 transition-all"
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
            className="flex items-center gap-2 h-10 px-4 rounded-xl border border-black/[0.07] dark:border-white/[0.07] bg-black/5 dark:bg-white/5 text-sm font-medium text-foreground/60 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <span>{currentFilter?.label}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {showFilter && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-slate-800 shadow-xl shadow-black/10 z-20 py-1 animate-slide-in-up">
              {TYPE_FILTERS.map((filterOption) => (
                <button
                  key={filterOption.value}
                  onClick={() => {
                    setTypeFilter(filterOption.value);
                    setShowFilter(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    typeFilter === filterOption.value
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
          onClick={() => void refreshAll()}
          title="Refresh activity"
          className="h-10 w-10 shrink-0 rounded-xl border border-black/[0.07] dark:border-white/[0.07] bg-black/5 dark:bg-white/5 text-foreground/60 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all flex items-center justify-center"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="text-xs text-foreground/40 mb-4">
        Showing{" "}
        <span className="font-semibold text-foreground/60">
          {filtered.length}
        </span>{" "}
        {filtered.length === 1 ? "event" : "events"}
      </p>

      <div className="space-y-2">
        {isLoading && filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-foreground/30">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">Loading system events</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-foreground/30">
            <Activity className="h-10 w-10" />
            <p className="text-sm">No system events found</p>
          </div>
        ) : (
          filtered.map((event, index) => {
            const config = TYPE_CONFIG[event.type];
            return (
              <div
                key={event.id}
                className="animate-fade-in flex gap-4 p-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:border-indigo-500/20 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all duration-200"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div
                  className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${config.bgIcon}`}
                >
                  {config.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.badge}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${config.dot}`}
                      />
                      {config.label}
                    </span>
                    {event.commit_message && (
                      <span className="text-sm font-medium text-foreground truncate max-w-[400px]">
                        {event.commit_message}
                      </span>
                    )}
                  </div>

                  {event.type === "deploy" && <DeployMeta event={event} />}
                  {event.type === "pipeline" && <PipelineMeta event={event} />}
                  {event.type === "dedup" && <DedupMeta event={event} />}
                  {event.type === "reprocess" && (
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20">
                        System
                      </span>
                      {event.candidate_name && (
                        <span className="text-xs font-medium text-foreground/70">
                          {event.candidate_name}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-foreground/50 mt-1.5">
                    {event.details}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-foreground/60">
                    {formatTime(event.timestamp)}
                  </p>
                  <p className="text-[11px] text-foreground/30 mt-0.5">
                    {formatDate(event.timestamp)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
