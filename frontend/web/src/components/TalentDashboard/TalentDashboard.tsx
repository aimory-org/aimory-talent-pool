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
import { Users, Search, Filter, X, Loader2 } from "lucide-react";
import { useTalents } from "@/hooks/useTalents";
import { useLookups } from "@/hooks/useLookups";
import { uploadResume, listTalents } from "@/lib/api";
import type { TalentProfile } from "@/types/talent";
import type { Filters, SortField, SortDirection } from "./types";
import { DEFAULT_FILTERS } from "./types";
import type { WarningType } from "./warnings";
import { getProfileWarnings } from "./warnings";
import { StatsCards } from "./components/StatsCards";
import { ManualUploadButton } from "./components/ManualUploadButton";
import { UploadModal } from "./components/UploadModal";
import { FiltersPanel } from "./components/FiltersPanel";
import { TalentTable } from "./components/TalentTable";
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

  // Fetch data from API
  const {
    talents,
    isLoading: talentsLoading,
    error: talentsError,
    refresh: refreshTalents,
    mergeTalent,
  } = useTalents({
    status: filters.status || undefined,
    service_category: filters.service_category || undefined,
    industry_category: filters.industry_category || undefined,
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

  // Client-side warnings filter
  const displayedProfiles = useMemo(() => {
    if (!warningsFilterActive) return sortedProfiles;
    if (selectedWarningTypes.length === 0) {
      return sortedProfiles.filter((p) => getProfileWarnings(p).length > 0);
    }
    return sortedProfiles.filter((p) =>
      getProfileWarnings(p).some((w) => selectedWarningTypes.includes(w)),
    );
  }, [sortedProfiles, warningsFilterActive, selectedWarningTypes]);

  const warningCounts = useMemo(() => {
    const counts: Record<WarningType, number> = {
      duplicate: 0,
      missing_name: 0,
      missing_job_title: 0,
      no_skills: 0,
      no_location: 0,
    };
    for (const p of talents) {
      for (const w of getProfileWarnings(p)) counts[w]++;
    }
    return counts;
  }, [talents]);

  const totalWarningCount = useMemo(
    () => talents.filter((p) => getProfileWarnings(p).length > 0).length,
    [talents],
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
      key === "skills" || key === "certifications" || key === "tags"
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
      <div className="border-b border-black/6 dark:border-white/6 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Title Section */}
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 blur-md opacity-40" />
                <div className="relative p-2.5 bg-linear-to-br from-indigo-500 to-violet-600 rounded-xl shadow-lg shadow-indigo-500/30">
                  <Users className="h-5 w-5 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  <span className="shimmer-text">Talent Pool</span>
                </h1>
                <p className="text-xs text-foreground/40 mt-0.5">
                  Discover and manage your candidate pipeline
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <StatsCards stats={stats} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Processing banner */}
        {showProcessingBanner && (
          <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <p className="text-sm font-medium">
                Resume uploaded — processing in the background. It will appear in the list once ready.
              </p>
            </div>
            <button
              onClick={() => { stopPolling(); setShowProcessingBanner(false); }}
              className="shrink-0 text-indigo-500/60 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search & Filter Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 group">
            <div className="absolute inset-0 bg-linear-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/40 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
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
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-black/10 dark:focus:bg-white/10 transition-all duration-300"
                />
              </div>
              {(searchInput || filters.search) && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setFilters((prev) => ({ ...prev, search: "" }));
                  }}
                  className="h-12 px-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-foreground/50 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={commitSearch}
                className="h-12 px-5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-medium text-sm hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25 shrink-0"
              >
                Search
              </button>
            </div>
          </div>
          <ManualUploadButton onManualUpload={handleManualUpload} />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border transition-all duration-300 font-medium ${
              showFilters
                ? "bg-linear-to-r from-indigo-500/20 to-purple-500/20 border-indigo-500/40 text-indigo-600 dark:text-indigo-300 shadow-lg shadow-indigo-500/10"
                : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground/60 hover:text-foreground hover:border-black/20 dark:hover:border-white/20 hover:bg-black/10 dark:hover:bg-white/10"
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-linear-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25">
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
              <div className="flex items-center gap-2 text-foreground/40">
                <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading candidates...</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-foreground/60">
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
                  <span className="text-xs bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                    {activeFilterCount}{" "}
                    {activeFilterCount === 1 ? "filter" : "filters"} active
                  </span>
                )}
              </>
            )}
          </div>
          {talentsError && (
            <p className="text-sm text-red-400 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-red-500" />
              Error: {talentsError.message}
              <button
                onClick={refreshTalents}
                className="underline hover:text-red-300"
              >
                Retry
              </button>
            </p>
          )}
        </div>

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
            lookupTags={lookupTags}
          />
        </>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadSubmit}
      />
    </div>
  );
}
