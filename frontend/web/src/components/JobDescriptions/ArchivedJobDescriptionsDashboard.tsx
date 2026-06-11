/**
 * ArchivedJobDescriptionsDashboard - View and manage archived job descriptions.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  Filter,
  X,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";
import { useLookups } from "@/hooks/useLookups";
import type { JobDescription } from "@/types/jobDescription";
import type { JdSortField, SortDirection, JdFilters } from "./types";
import { DEFAULT_JD_FILTERS } from "./types";
import { JdTable } from "./components/JdTable";
import { JdDetailPanel } from "./JdDetailPanel";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CLEARANCE_LEVELS, US_STATES } from "@/types/talent";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 25;

export function ArchivedJobDescriptionsDashboard() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<JdFilters>(DEFAULT_JD_FILTERS);
  const [sortField, setSortField] = useState<JdSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedJd, setSelectedJd] = useState<JobDescription | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { jobDescriptions, isLoading, error, refresh } = useJobDescriptions({
    job_title: filters.job_title || undefined,
    industry_category: filters.industry_category || undefined,
    required_clearance: filters.required_clearance || undefined,
    location_state: filters.location_state || undefined,
    archived: true,
  });

  const {
    job_titles: lookupJobTitles,
    industry_categories: lookupIndustryCategories,
  } = useLookups();

  const sortedJds = useMemo(() => {
    const result = jobDescriptions.filter((jd) => jd.archived === true);
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

  // Reset to first page when filters / sort change
  const resetKey = `${JSON.stringify(filters)}|${sortField}|${sortDirection}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sortedJds.length / PAGE_SIZE));

  const safePage = Math.min(page, totalPages);
  if (page !== safePage) setPage(safePage);

  const paginatedJds = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedJds.slice(start, start + PAGE_SIZE);
  }, [sortedJds, safePage]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-linear-to-br from-amber-500 to-orange-600 blur-md opacity-40" />
            <div className="relative p-2.5 bg-linear-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-500/30">
              <Archive className="h-5 w-5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Archived Job Descriptions
            </h1>
            <p className="text-xs text-foreground/40 mt-0.5">
              {jobDescriptions.length} archived job{" "}
              {jobDescriptions.length === 1 ? "description" : "descriptions"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/job-descriptions")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border border-black/10 dark:border-white/10 text-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Active
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
                ? "bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-300"
                : "border border-black/10 dark:border-white/10 text-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
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
        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-black/7 dark:border-white/7 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
                Job Title
              </label>
              <SearchableSelect
                value={filters.job_title}
                onValueChange={(v) => handleFilterChange("job_title", v)}
                options={lookupJobTitles.map((jt) => ({ value: jt, label: jt }))}
                placeholder="All titles"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
                Industry
              </label>
              <SearchableSelect
                value={filters.industry_category}
                onValueChange={(v) => handleFilterChange("industry_category", v)}
                options={lookupIndustryCategories.map((ic) => ({ value: ic, label: ic }))}
                placeholder="All industries"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
                Clearance
              </label>
              <SearchableSelect
                value={filters.required_clearance}
                onValueChange={(v) => handleFilterChange("required_clearance", v)}
                options={CLEARANCE_LEVELS}
                placeholder="Any clearance"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
                State
              </label>
              <SearchableSelect
                value={filters.location_state}
                onValueChange={(v) => handleFilterChange("location_state", v)}
                options={US_STATES}
                placeholder="Any state"
              />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={clearFilters}
                className="text-xs text-foreground/40 hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <JdTable
        jobDescriptions={paginatedJds}
        isLoading={isLoading}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onSelectJd={setSelectedJd}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
      />
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-4"
      />

      {/* Detail panel */}
      {selectedJd && (
        <JdDetailPanel
          key={selectedJd.pk}
          jd={selectedJd}
          onClose={() => setSelectedJd(null)}
          onDeleted={() => {
            setSelectedJd(null);
            void refresh();
          }}
          onUpdated={(updated) => {
            setSelectedJd(updated);
            void refresh();
          }}
          onArchived={() => {
            setSelectedJd(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
