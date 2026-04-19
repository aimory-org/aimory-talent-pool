/**
 * JobDescriptionsDashboard - Main component for viewing and managing job descriptions.
 */
import { useState, useMemo, useCallback } from "react";
import {
  FileText,
  Filter,
  X,
  RefreshCw,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";
import { useLookups } from "@/hooks/useLookups";
import type { JobDescription } from "@/types/jobDescription";
import type { JdSortField, SortDirection, JdFilters } from "./types";
import { DEFAULT_JD_FILTERS } from "./types";
import { JdTable } from "./components/JdTable";
import { JdDetailPanel } from "./JdDetailPanel";
import { JdUploadDialog } from "./components/JdUploadDialog";
import { CLEARANCE_LEVELS, US_STATES } from "@/types/talent";

export function JobDescriptionsDashboard() {
  const [filters, setFilters] = useState<JdFilters>(DEFAULT_JD_FILTERS);
  const [sortField, setSortField] = useState<JdSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedJd, setSelectedJd] = useState<JobDescription | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const { jobDescriptions, isLoading, error, refresh, removeJobDescription } =
    useJobDescriptions({
      job_title: filters.job_title || undefined,
      industry_category: filters.industry_category || undefined,
      required_clearance: filters.required_clearance || undefined,
      location_state: filters.location_state || undefined,
    });

  const {
    job_titles: lookupJobTitles,
    industry_categories: lookupIndustryCategories,
  } = useLookups();

  // Client-side sorting
  const sortedJds = useMemo(() => {
    const result = [...jobDescriptions];
    result.sort((a, b) => {
      let cmp = 0;
      const av = a[sortField];
      const bv = b[sortField];
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return result;
  }, [jobDescriptions, sortField, sortDirection]);

  const displayedJds = useMemo(() => {
    if (!showDuplicatesOnly) return sortedJds;
    return sortedJds.filter((jd) => jd.possible_duplicate_of);
  }, [sortedJds, showDuplicatesOnly]);

  const duplicateCount = useMemo(
    () => jobDescriptions.filter((jd) => jd.possible_duplicate_of).length,
    [jobDescriptions],
  );

  const handleSort = useCallback(
    (field: JdSortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("desc");
      }
    },
    [sortField],
  );

  const handleFilterChange = useCallback(
    (key: keyof JdFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_JD_FILTERS);
  }, []);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const handleDeleted = useCallback(() => {
    if (selectedJd) {
      removeJobDescription(selectedJd.pk).catch(() => {});
    }
    setSelectedJd(null);
  }, [selectedJd, removeJobDescription]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 blur-md opacity-40" />
            <div className="relative p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg shadow-violet-500/30">
              <FileText className="h-5 w-5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="shimmer-text">Job Descriptions</span>
            </h1>
            <p className="text-xs text-foreground/40 mt-0.5">
              Upload, manage & match candidates across {jobDescriptions.length}{" "}
              job{" "}
              {jobDescriptions.length === 1 ? "description" : "descriptions"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-all"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </button>
          <button
            onClick={refresh}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-foreground/50 hover:text-foreground transition-all"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showFilters || activeFilterCount > 0
                ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300"
                : "border border-black/10 dark:border-white/10 text-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
          <p className="text-sm text-red-600 dark:text-red-300">
            {error.message}
          </p>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-black/[0.07] dark:border-white/[0.07] p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40 mb-1">
                Job Title
              </label>
              <select
                value={filters.job_title}
                onChange={(e) =>
                  handleFilterChange("job_title", e.target.value)
                }
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-foreground"
              >
                <option value="">All</option>
                {lookupJobTitles.map((jt) => (
                  <option key={jt} value={jt}>
                    {jt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40 mb-1">
                Industry
              </label>
              <select
                value={filters.industry_category}
                onChange={(e) =>
                  handleFilterChange("industry_category", e.target.value)
                }
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-foreground"
              >
                <option value="">All</option>
                {lookupIndustryCategories.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40 mb-1">
                Clearance
              </label>
              <select
                value={filters.required_clearance}
                onChange={(e) =>
                  handleFilterChange("required_clearance", e.target.value)
                }
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-foreground"
              >
                <option value="">All</option>
                {CLEARANCE_LEVELS.map((cl) => (
                  <option key={cl.value} value={cl.value}>
                    {cl.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40 mb-1">
                State
              </label>
              <select
                value={filters.location_state}
                onChange={(e) =>
                  handleFilterChange("location_state", e.target.value)
                }
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-foreground"
              >
                <option value="">All</option>
                {US_STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            {duplicateCount > 0 && (
              <button
                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  showDuplicatesOnly
                    ? "bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300"
                    : "border border-black/[0.06] dark:border-white/[0.06] text-foreground/40 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/20"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Warnings
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    showDuplicatesOnly
                      ? "bg-amber-500 text-white"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {duplicateCount}
                </span>
              </button>
            )}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-foreground/40 hover:text-foreground flex items-center gap-1 transition-colors ml-auto"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <JdTable
        jobDescriptions={displayedJds}
        isLoading={isLoading}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onSelectJd={setSelectedJd}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
      />

      {/* Detail panel */}
      {selectedJd && (
        <JdDetailPanel
          jd={selectedJd}
          onClose={() => setSelectedJd(null)}
          onDeleted={handleDeleted}
          onUpdated={(updated) => {
            setSelectedJd(updated);
            refresh();
          }}
        />
      )}

      {/* Upload dialog */}
      <JdUploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={refresh}
      />
    </div>
  );
}
