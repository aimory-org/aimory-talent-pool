/**
 * JobDescriptionsDashboard - Main component for viewing and managing job descriptions.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Filter,
  X,
  RefreshCw,
  AlertTriangle,
  Archive,
} from "lucide-react";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";
import { useLookups } from "@/hooks/useLookups";
import type { JobDescription } from "@/types/jobDescription";
import type { JdSortField, SortDirection, JdFilters } from "./types";
import { DEFAULT_JD_FILTERS } from "./types";
import { JdTable } from "./components/JdTable";
import { JdDetailPanel } from "./JdDetailPanel";
import { JdUploadDialog } from "./components/JdUploadDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CLEARANCE_LEVELS, US_STATES } from "@/types/talent";
import { UploadActionButton } from "@/components/ui/upload-action-button";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 25;

export function JobDescriptionsDashboard() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<JdFilters>(DEFAULT_JD_FILTERS);
  const [sortField, setSortField] = useState<JdSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedJd, setSelectedJd] = useState<JobDescription | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [page, setPage] = useState(1);

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

  // Client-side sorting — exclude archived items (belt-and-suspenders over the API filter)
  const sortedJds = useMemo(() => {
    const result = jobDescriptions.filter((jd) => !jd.archived);
    result.sort((a, b) => {
      let cmp: number;
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
    () => sortedJds.filter((jd) => jd.possible_duplicate_of).length,
    [sortedJds],
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

  // Reset to first page when filters / sort / duplicate toggle change (derived-state avoids effect)
  const resetKey = `${JSON.stringify(filters)}|${sortField}|${sortDirection}|${String(showDuplicatesOnly)}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(displayedJds.length / PAGE_SIZE));

  // Clamp page when data changes without filter change (delete / refresh)
  const safePage = Math.min(page, totalPages);
  if (page !== safePage) setPage(safePage);

  const paginatedJds = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return displayedJds.slice(start, start + PAGE_SIZE);
  }, [displayedJds, safePage]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const handleDeleted = useCallback(() => {
    if (selectedJd) {
      removeJobDescription(selectedJd.pk).catch(() => {});
    }
    setSelectedJd(null);
  }, [selectedJd, removeJobDescription]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Job Descriptions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload, manage & match candidates across {sortedJds.length}{" "}
            job{" "}
            {sortedJds.length === 1 ? "description" : "descriptions"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate("/job-descriptions/archived")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <Archive className="h-3.5 w-3.5" />
            Archive Pool
          </button>
          <UploadActionButton
            label="Upload"
            onClick={() => setShowUpload(true)}
          />
          <button
            onClick={refresh}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4">
          <p className="text-sm text-destructive">
            {error.message}
          </p>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
          <div className="mt-3 flex items-center justify-between">
            {duplicateCount > 0 && (
              <button
                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showDuplicatesOnly
                    ? "bg-warning/15 border border-warning/30 text-warning"
                    : "border border-border text-muted-foreground hover:text-warning hover:border-warning/30"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Warnings
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    showDuplicatesOnly
                      ? "bg-warning text-white"
                      : "bg-warning/15 text-warning"
                  }`}
                >
                  {duplicateCount}
                </span>
              </button>
            )}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors ml-auto"
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
          onDeleted={handleDeleted}
          onUpdated={(updated) => {
            setSelectedJd(updated);
            refresh();
          }}
          onArchived={() => {
            setSelectedJd(null);
            void refresh();
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
