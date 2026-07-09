/**
 * TalentDashboard - Main component for viewing and managing talent profiles.
 *
 * This component provides:
 * - Searchable, filterable list of talent profiles
 * - Statistics overview cards
 * - Sortable table with profile details
 * - Detail panel for viewing/editing individual profiles
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, Filter, X, Loader2 } from "lucide-react";
import { useTalents } from "@/hooks/useTalents";
import { useLookups } from "@/hooks/useLookups";
import { uploadResume, listTalents, bulkDeleteTalents } from "@/lib/api";
import type { TalentProfile, CandidateStatus } from "@/types/talent";
import type { Filters, SortField, SortDirection } from "./types";
import { DEFAULT_FILTERS } from "./types";
import type { WarningType } from "./warnings";
import { getProfileWarnings } from "./warnings";
import { StatsCards } from "./components/StatsCards";
import { ManualUploadButton } from "./components/ManualUploadButton";
import { UploadModal } from "./components/UploadModal";
import { FiltersPanel } from "./components/FiltersPanel";
import { TalentTable } from "./components/TalentTable";
import { BulkActionToolbar } from "./components/BulkActionToolbar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ProfileDetailPanel } from "./ProfileDetailPanel";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 25;

export function TalentDashboard() {
  // Filter state
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Local search input — decoupled from filters.search so the API is only
  // called when the user explicitly submits (Enter or Search button).
  const [searchInput, setSearchInput] = useState("");

  // UI state
  const [sortField, setSortField] = useState<SortField>("date_received");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedProfile, setSelectedProfile] = useState<TalentProfile | null>(
    null,
  );
  const [showFilters, setShowFilters] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [warningsFilterActive, setWarningsFilterActive] = useState(false);
  const [selectedWarningTypes, setSelectedWarningTypes] = useState<WarningType[]>([]);
  const [showProcessingBanner, setShowProcessingBanner] = useState(false);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const [page, setPage] = useState(1);

  // Bulk selection state
  const [selectedPks, setSelectedPks] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Fetch data from API
  const {
    talents,
    isLoading: talentsLoading,
    error: talentsError,
    refresh: refreshTalents,
    mergeTalent,
    bulkUpdateStatus,
    removeTalents,
  } = useTalents({
    status: filters.status || undefined,
    service_category: filters.service_category || undefined,
    industry_categories: filters.industry_categories.length > 0 ? filters.industry_categories : undefined,
    job_title: filters.job_title || undefined,
    clearance_level: filters.clearance_level || undefined,
    location_state: filters.location_state || undefined,
    city: filters.city || undefined,
    search: filters.search || undefined,
    skills: filters.skills.length > 0 ? filters.skills : undefined,
    certifications:
      filters.certifications.length > 0 ? filters.certifications : undefined,
    tags: filters.tags.length > 0 ? filters.tags : undefined,
    minYears: filters.minYears ? parseInt(filters.minYears, 10) : undefined,
    maxYears: filters.maxYears ? parseInt(filters.maxYears, 10) : undefined,
  });

  const {
    skills: lookupSkills,
    certifications: lookupCertifications,
    job_titles: lookupJobTitles,
    industry_categories: lookupIndustryCategories,
    cities: lookupCities,
    tags: lookupTagsFromApi,
  } = useLookups();

  // Local override for lookup tags so deletions are reflected immediately
  const [lookupTagsOverride, setLookupTagsOverride] = useState<string[] | null>(
    null,
  );
  const lookupTags = lookupTagsOverride ?? lookupTagsFromApi;

  // Handle a profile update from the detail panel by immediately merging
  // the DynamoDB response into the local list (avoids OpenSearch replication lag).
  const handleProfileUpdated = useCallback(
    (updated: TalentProfile) => {
      mergeTalent(updated);
      setSelectedProfile(updated);
    },
    [mergeTalent],
  );

  // Selection handlers
  const handleToggleSelect = useCallback((pk: string) => {
    setSelectedPks((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(
    (pks: string[], selectAll: boolean) => {
      if (selectAll) {
        setSelectedPks((prev) => {
          const next = new Set(prev);
          pks.forEach((pk) => next.add(pk));
          return next;
        });
      } else {
        setSelectedPks((prev) => {
          const next = new Set(prev);
          pks.forEach((pk) => next.delete(pk));
          return next;
        });
      }
    },
    [],
  );

  const handleClearSelection = useCallback(() => setSelectedPks(new Set()), []);

  const handleBulkStatus = useCallback(
    async (status: CandidateStatus) => {
      const pks = Array.from(selectedPks);
      if (pks.length === 0) return;
      setIsBulkUpdating(true);
      try {
        const result = await bulkUpdateStatus(pks, status);
        setSelectedPks(new Set());
        const count = result.updated_count;
        showToast(`${count} ${count === 1 ? "candidate" : "candidates"} updated to ${status}`);
      } catch {
        showToast("Failed to update candidates. Please try again.", "error");
      } finally {
        setIsBulkUpdating(false);
      }
    },
    [selectedPks, bulkUpdateStatus, showToast],
  );

  const handleBulkDelete = useCallback(() => {
    if (selectedPks.size === 0) return;
    setShowDeleteConfirm(true);
  }, [selectedPks]);

  const handleConfirmDelete = useCallback(async () => {
    const pks = Array.from(selectedPks);
    setShowDeleteConfirm(false);
    setIsBulkUpdating(true);
    try {
      const result = await bulkDeleteTalents(pks);
      removeTalents(pks);
      setSelectedPks(new Set());
      const count = result.deleted_count;
      showToast(`${count} ${count === 1 ? "candidate" : "candidates"} deleted`);
    } catch {
      showToast("Failed to delete candidates. Please try again.", "error");
    } finally {
      setIsBulkUpdating(false);
    }
  }, [selectedPks, removeTalents, showToast]);

  // Filter change handler with city reset logic
  const handleFilterChange = useCallback(
    (key: keyof Filters, value: string) => {
      if (key === "location_state") {
        // Reset city when state changes, unless the city exists in the new state
        const cityExistsInState = lookupCities.some(
          (c) => c.city === filters.city && c.state === value,
        );
        setFilters((prev) => ({
          ...prev,
          [key]: value,
          city: cityExistsInState ? prev.city : "",
        }));
      } else {
        setFilters((prev) => ({ ...prev, [key]: value }));
      }
    },
    [lookupCities, filters.city],
  );

  const handleIndustryCategoriesChange = useCallback((industry_categories: string[]) => {
    setFilters((prev) => ({ ...prev, industry_categories }));
  }, []);

  const handleSkillsChange = useCallback((skills: string[]) => {
    setFilters((prev) => ({ ...prev, skills }));
  }, []);

  const handleCertificationsChange = useCallback((certifications: string[]) => {
    setFilters((prev) => ({ ...prev, certifications }));
  }, []);

  const handleTagsChange = useCallback((tags: string[]) => {
    setFilters((prev) => ({ ...prev, tags }));
  }, []);

  const handleTagsLookupChange = useCallback((tags: string[]) => {
    setLookupTagsOverride(tags);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
  }, []);

  const handleManualUpload = useCallback(() => {
    setShowUploadModal(true);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    pendingKeyRef.current = null;
  }, []);

  const handleUploadSubmit = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const key = await uploadResume(file);

        stopPolling();
        pendingKeyRef.current = key;
        setShowProcessingBanner(true);

        // Poll every 4 seconds until the new profile appears, or 2 min timeout
        const maxAttempts = 30;
        let attempts = 0;

        pollingIntervalRef.current = setInterval(async () => {
          attempts++;
          try {
            const { items } = await listTalents();
            const found = items.some((t) => t.key === pendingKeyRef.current);
            if (found || attempts >= maxAttempts) {
              stopPolling();
              setShowProcessingBanner(false);
              if (found) refreshTalents();
            }
          } catch {
            // ignore transient poll errors
          }
        }, 4_000);
      } catch (error) {
        console.error("Upload failed:", error);
        throw error;
      }
    },
    [refreshTalents, stopPolling],
  );

  // Clean up timers on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);
  const commitSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, search: searchInput }));
  }, [searchInput]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField],
  );

  // Client-side sorting (all filtering is now server-side)
  const sortedProfiles = useMemo(() => {
    // Apply sorting
    const result = [...talents].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = a.name_lower;
          bVal = b.name_lower;
          break;
        case "job_title":
          aVal = a.job_title || "";
          bVal = b.job_title || "";
          break;
        case "industry_category":
          aVal = a.industry_category || "";
          bVal = b.industry_category || "";
          break;
        case "location_state":
          aVal = a.location_state || "";
          bVal = b.location_state || "";
          break;
        case "clearance_level":
          aVal = a.clearance_level || "";
          bVal = b.clearance_level || "";
          break;
        case "requested_salary":
          aVal = a.requested_salary || 0;
          bVal = b.requested_salary || 0;
          break;
        case "years_of_experience":
          aVal = a.years_of_experience || 0;
          bVal = b.years_of_experience || 0;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "date_received":
          aVal = a.date_received;
          bVal = b.date_received;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [talents, sortField, sortDirection]);

  // PKs that are referenced by other profiles via possible_duplicate_of
  const duplicateTargetPks = useMemo(
    () => new Set(talents.map((t) => t.possible_duplicate_of).filter(Boolean) as string[]),
    [talents],
  );

  // Client-side warnings filter
  const displayedProfiles = useMemo(() => {
    if (!warningsFilterActive) return sortedProfiles;
    if (selectedWarningTypes.length === 0) {
      return sortedProfiles.filter((p) => getProfileWarnings(p, duplicateTargetPks).length > 0);
    }
    return sortedProfiles.filter((p) =>
      getProfileWarnings(p, duplicateTargetPks).some((w) => selectedWarningTypes.includes(w)),
    );
  }, [sortedProfiles, warningsFilterActive, selectedWarningTypes, duplicateTargetPks]);

  const warningCounts = useMemo(() => {
    const counts: Record<WarningType, number> = {
      duplicate: 0,
      incoming_duplicate: 0,
      missing_name: 0,
      missing_job_title: 0,
      no_skills: 0,
      no_location: 0,
    };
    for (const p of talents) {
      for (const w of getProfileWarnings(p, duplicateTargetPks)) counts[w]++;
    }
    return counts;
  }, [talents, duplicateTargetPks]);

  const totalWarningCount = useMemo(
    () => talents.filter((p) => getProfileWarnings(p, duplicateTargetPks).length > 0).length,
    [talents, duplicateTargetPks],
  );

  // Reset to first page when filters / sort change (derived-state avoids effect)
  const resetKey = `${JSON.stringify(filters)}|${sortField}|${sortDirection}|${String(warningsFilterActive)}|${selectedWarningTypes.join(",")}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(displayedProfiles.length / PAGE_SIZE));

  // Clamp page when data changes without filter change (delete / upload / refresh)
  const safePage = Math.min(page, totalPages);
  if (page !== safePage) setPage(safePage);

  // Paginate after sorting + duplicate filter
  const paginatedProfiles = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return displayedProfiles.slice(start, start + PAGE_SIZE);
  }, [displayedProfiles, safePage]);

  const pageStart = displayedProfiles.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, displayedProfiles.length);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([key, v]) =>
      key === "skills" || key === "certifications" || key === "tags" || key === "industry_categories"
        ? (v as string[]).length > 0
        : v !== "",
    ).length;
  }, [filters]);

  // Calculate stats from filtered data
  const stats = useMemo(
    () => ({
      total: displayedProfiles.length,
      potentialCount: displayedProfiles.filter(
        (p) => p.status === "Potential Candidate",
      ).length,
      activeCount: displayedProfiles.filter(
        (p) => p.status === "Active Candidate",
      ).length,
      placedWithUsCount: displayedProfiles.filter(
        (p) => p.status === "Placed with us",
      ).length,
      placedOtherCount: displayedProfiles.filter(
        (p) => p.status === "Placed at Other Company",
      ).length,
    }),
    [displayedProfiles],
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-16 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Title Section */}
            <div className="animate-fade-in">
              <h1 className="font-display text-3xl text-foreground">Talent Pool</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Discover and manage your candidate pipeline
              </p>
            </div>

            {/* Stats Cards */}
            <StatsCards stats={stats} />
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Processing banner */}
        {showProcessingBanner && (
          <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-xl bg-accent border border-border text-accent-foreground">
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <p className="text-sm font-medium">
                Resume uploaded — processing in the background. It will appear in the list once ready.
              </p>
            </div>
            <button
              onClick={() => { stopPolling(); setShowProcessingBanner(false); }}
              className="shrink-0 text-accent-foreground/60 hover:text-accent-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search & Filter Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, tags, and resume content..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitSearch();
                    if (e.key === "Escape") {
                      setSearchInput("");
                      setFilters((prev) => ({ ...prev, search: "" }));
                    }
                  }}
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-secondary border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors duration-150"
                />
              </div>
              {(searchInput || filters.search) && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setFilters((prev) => ({ ...prev, search: "" }));
                  }}
                  className="h-12 px-3 rounded-xl border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={commitSearch}
                className="h-12 px-5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary-hover transition-colors shrink-0"
              >
                Search
              </button>
            </div>
          </div>
          <ManualUploadButton onManualUpload={handleManualUpload} />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border transition-colors duration-150 font-medium ${
              showFilters
                ? "bg-accent border-transparent text-accent-foreground"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <FiltersPanel
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={clearFilters}
            onIndustryCategoriesChange={handleIndustryCategoriesChange}
            onSkillsChange={handleSkillsChange}
            onCertificationsChange={handleCertificationsChange}
            onTagsChange={handleTagsChange}
            onTagsLookupChange={handleTagsLookupChange}
            activeFilterCount={activeFilterCount}
            lookupSkills={lookupSkills}
            lookupCertifications={lookupCertifications}
            lookupJobTitles={lookupJobTitles}
            lookupIndustryCategories={lookupIndustryCategories}
            lookupCities={lookupCities}
            lookupTags={lookupTags}
            warningCounts={warningCounts}
            totalWarningCount={totalWarningCount}
            warningsFilterActive={warningsFilterActive}
            onToggleWarningsFilter={() => {
              setWarningsFilterActive((active) => {
                const next = !active;
                if (!next) setSelectedWarningTypes([]);
                return next;
              });
            }}
            selectedWarningTypes={selectedWarningTypes}
            onWarningTypesChange={setSelectedWarningTypes}
          />
        )}

        {/* Results Count */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {talentsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading candidates...</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="text-foreground font-semibold">
                    {pageStart}–{pageEnd}
                  </span>{" "}
                  of{" "}
                  <span className="text-foreground font-semibold">
                    {displayedProfiles.length}
                  </span>{" "}
                  {displayedProfiles.length === 1 ? "candidate" : "candidates"}
                </p>
                {activeFilterCount > 0 && (
                  <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                    {activeFilterCount}{" "}
                    {activeFilterCount === 1 ? "filter" : "filters"} active
                  </span>
                )}
              </>
            )}
          </div>
          {talentsError && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-destructive" />
              Error: {talentsError.message}
              <button
                onClick={refreshTalents}
                className="underline hover:opacity-80"
              >
                Retry
              </button>
            </p>
          )}
        </div>

        {/* Bulk Action Toolbar */}
        <BulkActionToolbar
          selectedCount={selectedPks.size}
          onClearSelection={handleClearSelection}
          onBulkStatus={handleBulkStatus}
          onBulkDelete={handleBulkDelete}
          isUpdating={isBulkUpdating}
        />

        {/* Results Table */}
        <TalentTable
          profiles={paginatedProfiles}
          isLoading={talentsLoading}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          onSelectProfile={setSelectedProfile}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
          searchActive={!!filters.search}
          searchTerm={filters.search || ""}
          selectedPks={selectedPks}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          duplicateTargetPks={duplicateTargetPks}
        />
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          className="mt-6"
        />
      </div>

      {/* Detail Panel */}
      {selectedProfile && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setSelectedProfile(null)}
          />
          <ProfileDetailPanel
            profile={selectedProfile}
            onClose={() => setSelectedProfile(null)}
            onRefresh={refreshTalents}
            onProfileUpdated={handleProfileUpdated}
            onProfilesDeleted={removeTalents}
            lookupTags={lookupTags}
            allTalents={talents}
          />
        </>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadSubmit}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        count={selectedPks.size}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in border ${
            toast.type === "success"
              ? "bg-card border-success/30 text-success"
              : "bg-card border-destructive/30 text-destructive"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
