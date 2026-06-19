/**
 * Filters panel component for filtering talent pool results.
 */
import { useState } from "react";
import { Filter, X, Trash2, Settings, AlertTriangle } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import {
  CANDIDATE_STATUSES,
  SERVICE_CATEGORIES,
  CLEARANCE_LEVELS,
  US_STATES,
} from "@/types/talent";
import { deleteTag } from "@/lib/api";
import type { Filters } from "../types";
import type { WarningType } from "../warnings";
import { WARNING_TYPES } from "../warnings";

interface City {
  city: string;
  state: string;
}

interface FiltersPanelProps {
  filters: Filters;
  onFilterChange: (key: keyof Filters, value: string) => void;
  onClearFilters: () => void;
  onSkillsChange: (skills: string[]) => void;
  onCertificationsChange: (certifications: string[]) => void;
  onTagsChange?: (tags: string[]) => void;
  onTagsLookupChange?: (tags: string[]) => void;
  activeFilterCount: number;
  lookupSkills: string[];
  lookupCertifications: string[];
  lookupJobTitles: string[];
  lookupIndustryCategories: string[];
  lookupCities: City[];
  lookupTags?: string[];
  warningCounts: Record<WarningType, number>;
  totalWarningCount: number;
  warningsFilterActive: boolean;
  onToggleWarningsFilter: () => void;
  selectedWarningTypes: WarningType[];
  onWarningTypesChange: (types: WarningType[]) => void;
}

export function FiltersPanel({
  filters,
  onFilterChange,
  onClearFilters,
  onSkillsChange,
  onCertificationsChange,
  onTagsChange,
  onTagsLookupChange,
  activeFilterCount,
  lookupSkills,
  lookupCertifications,
  lookupJobTitles,
  lookupIndustryCategories,
  lookupCities,
  lookupTags = [],
  warningCounts,
  totalWarningCount,
  warningsFilterActive,
  onToggleWarningsFilter,
  selectedWarningTypes,
  onWarningTypesChange,
}: FiltersPanelProps) {
  const [managingTags, setManagingTags] = useState(false);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  const handleDeleteTag = async (tag: string) => {
    if (confirmDeleteTag !== tag) {
      setConfirmDeleteTag(tag);
      return;
    }
    setDeletingTag(tag);
    setConfirmDeleteTag(null);
    try {
      await deleteTag(tag);
      // Remove from active filters if selected
      onTagsChange?.(filters.tags.filter((t) => t !== tag));
      // Remove from lookup list
      onTagsLookupChange?.(lookupTags.filter((t) => t !== tag));
    } catch (err) {
      console.error("Failed to delete tag:", err);
    } finally {
      setDeletingTag(null);
    }
  };

  return (
    <div className="relative z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/15 p-6 mb-6 shadow-xl shadow-black/5">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 via-transparent to-purple-500/5 rounded-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Filter className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Filter Candidates
              </h3>
              <p className="text-xs text-foreground/40">
                Narrow down your search with specific criteria
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeFilterCount > 0 && (
              <button
                onClick={onClearFilters}
                className="text-sm text-foreground/50 hover:text-foreground transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-accent"
              >
                <X className="h-4 w-4" />
                Clear all ({activeFilterCount})
              </button>
            )}
            {warningsFilterActive && (
              <div className="w-56">
                <SearchableSelect
                  value=""
                  onValueChange={(v) => {
                    const type = v as WarningType;
                    if (type && !selectedWarningTypes.includes(type)) {
                      onWarningTypesChange([...selectedWarningTypes, type]);
                    }
                  }}
                  options={WARNING_TYPES.filter(
                    (w) => !selectedWarningTypes.includes(w.value),
                  ).map((w) => ({
                    value: w.value,
                    label: `${w.label} (${warningCounts[w.value]})`,
                  }))}
                  placeholder="Filter by warning type..."
                />
              </div>
            )}
            {totalWarningCount > 0 && (
              <button
                onClick={onToggleWarningsFilter}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  warningsFilterActive
                    ? "bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300"
                    : "border border-black/6 dark:border-white/6 text-foreground/40 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/20"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Warnings
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    warningsFilterActive
                      ? "bg-amber-500 text-white"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {totalWarningCount}
                </span>
              </button>
            )}
          </div>
        </div>

        {warningsFilterActive && selectedWarningTypes.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5 mb-5">
            {selectedWarningTypes.map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
              >
                {WARNING_TYPES.find((w) => w.value === type)?.label}
                <button
                  onClick={() =>
                    onWarningTypesChange(
                      selectedWarningTypes.filter((t) => t !== type),
                    )
                  }
                  className="hover:text-foreground ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* All filters in a single grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label className="text-foreground/70">Status</Label>
            <SearchableSelect
              value={filters.status}
              onValueChange={(v) => onFilterChange("status", v)}
              options={CANDIDATE_STATUSES}
              placeholder="All statuses"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">Service Category</Label>
            <SearchableSelect
              value={filters.service_category}
              onValueChange={(v) => onFilterChange("service_category", v)}
              options={SERVICE_CATEGORIES}
              placeholder="All categories"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">Industry</Label>
            <SearchableSelect
              value={filters.industry_category}
              onValueChange={(v) => onFilterChange("industry_category", v)}
              options={lookupIndustryCategories.map((ic) => ({
                value: ic,
                label: ic,
              }))}
              placeholder="All industries"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">Job Title</Label>
            <SearchableSelect
              value={filters.job_title}
              onValueChange={(v) => onFilterChange("job_title", v)}
              options={lookupJobTitles.map((t) => ({ value: t, label: t }))}
              placeholder="All titles"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">Clearance</Label>
            <SearchableSelect
              value={filters.clearance_level}
              onValueChange={(v) => onFilterChange("clearance_level", v)}
              options={CLEARANCE_LEVELS}
              placeholder="Any clearance"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">State</Label>
            <SearchableSelect
              value={filters.location_state}
              onValueChange={(v) => onFilterChange("location_state", v)}
              options={US_STATES}
              placeholder="Any state"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">City</Label>
            <SearchableSelect
              value={filters.city}
              onValueChange={(v) => onFilterChange("city", v)}
              options={(filters.location_state
                ? lookupCities.filter((c) => c.state === filters.location_state)
                : lookupCities
              ).map((c) => ({
                value: c.city,
                label: filters.location_state
                  ? c.city
                  : `${c.city}, ${c.state}`,
              }))}
              placeholder="Any city"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">
              Skills{" "}
              {filters.skills.length > 0 && (
                <span className="text-indigo-600 dark:text-indigo-400">
                  ({filters.skills.length})
                </span>
              )}
            </Label>
            <SearchableSelect
              value=""
              onValueChange={(skill) => {
                if (skill && !filters.skills.includes(skill)) {
                  onSkillsChange([...filters.skills, skill]);
                }
              }}
              options={lookupSkills
                .filter((s) => !filters.skills.includes(s))
                .map((s) => ({ value: s, label: s }))}
              placeholder="Add skill..."
            />
            {filters.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {filters.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors"
                  >
                    {skill}
                    <button
                      onClick={() =>
                        onSkillsChange(
                          filters.skills.filter((s) => s !== skill),
                        )
                      }
                      className="hover:text-foreground ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">
              Certifications{" "}
              {filters.certifications.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  ({filters.certifications.length})
                </span>
              )}
            </Label>
            <SearchableSelect
              value=""
              onValueChange={(cert) => {
                if (cert && !filters.certifications.includes(cert)) {
                  onCertificationsChange([...filters.certifications, cert]);
                }
              }}
              options={lookupCertifications
                .filter((c) => !filters.certifications.includes(c))
                .map((c) => ({ value: c, label: c }))}
              placeholder="Add certification..."
            />
            {filters.certifications.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {filters.certifications.map((cert) => (
                  <span
                    key={cert}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                  >
                    {cert}
                    <button
                      onClick={() =>
                        onCertificationsChange(
                          filters.certifications.filter((c) => c !== cert),
                        )
                      }
                      className="hover:text-foreground ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground/70">
                Tags{" "}
                {filters.tags.length > 0 && (
                  <span className="text-purple-600 dark:text-purple-400">
                    ({filters.tags.length})
                  </span>
                )}
              </Label>
              {lookupTags.length > 0 && (
                <button
                  onClick={() => {
                    setManagingTags((v) => !v);
                    setConfirmDeleteTag(null);
                  }}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    managingTags
                      ? "bg-red-500/10 text-red-500 border border-red-500/20"
                      : "text-foreground/40 hover:text-foreground/70"
                  }`}
                  title="Manage tags"
                >
                  <Settings className="h-3 w-3" />
                  Manage
                </button>
              )}
            </div>

            {managingTags ? (
              <div className="space-y-1.5">
                <p className="text-[10px] text-foreground/40">
                  Click trash to delete permanently from all candidates.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {lookupTags.map((tag) => {
                    const isConfirming = confirmDeleteTag === tag;
                    const isDeleting = deletingTag === tag;
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          isConfirming
                            ? "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40"
                            : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                        }`}
                      >
                        {tag}
                        <button
                          onClick={() => handleDeleteTag(tag)}
                          disabled={isDeleting}
                          title={
                            isConfirming
                              ? "Click again to confirm"
                              : "Delete tag permanently"
                          }
                          className={`ml-0.5 transition-colors ${
                            isConfirming
                              ? "text-red-500 hover:text-red-700"
                              : "text-foreground/40 hover:text-red-500"
                          }`}
                        >
                          {isDeleting ? (
                            <span className="inline-block h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <SearchableSelect
                  value=""
                  onValueChange={(tag) => {
                    if (tag && !filters.tags.includes(tag)) {
                      onTagsChange?.([...filters.tags, tag]);
                    }
                  }}
                  options={lookupTags
                    .filter((t) => !filters.tags.includes(t))
                    .map((t) => ({ value: t, label: t }))}
                  placeholder={
                    lookupTags.length === 0 ? "No tags yet" : "Add tag..."
                  }
                  disabled={lookupTags.length === 0}
                />
                {filters.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filters.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                      >
                        {tag}
                        <button
                          onClick={() =>
                            onTagsChange?.(
                              filters.tags.filter((t) => t !== tag),
                            )
                          }
                          className="hover:text-foreground ml-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/70">Years of Exp.</Label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={filters.minYears}
                onChange={(e) => onFilterChange("minYears", e.target.value)}
                placeholder="Min"
                className="flex h-9 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground/90 placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 hover:border-border hover:bg-secondary transition-all"
              />
              <input
                type="number"
                min="0"
                value={filters.maxYears}
                onChange={(e) => onFilterChange("maxYears", e.target.value)}
                placeholder="Max"
                className="flex h-9 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground/90 placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 hover:border-border hover:bg-secondary transition-all"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
