/**
 * Filters panel component for filtering talent pool results.
 */
import { Filter, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  CANDIDATE_STATUSES,
  TALENT_BUCKETS,
  CLEARANCE_LEVELS,
  US_STATES,
  TALENT_CATEGORIES,
} from "@/types/talent";
import type { Filters } from "../types";

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
  activeFilterCount: number;
  lookupSkills: string[];
  lookupCertifications: string[];
  lookupCities: City[];
}

export function FiltersPanel({
  filters,
  onFilterChange,
  onClearFilters,
  onSkillsChange,
  onCertificationsChange,
  activeFilterCount,
  lookupSkills,
  lookupCertifications,
  lookupCities,
}: FiltersPanelProps) {
  return (
    <div className="relative bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/10 p-6 mb-6 animate-in slide-in-from-top-2 duration-300 shadow-xl shadow-black/20">
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
          {activeFilterCount > 0 && (
            <button
              onClick={onClearFilters}
              className="text-sm text-foreground/50 hover:text-foreground transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Row 1: Basic filters */}
        <div className="mb-4">
          <p className="text-xs font-medium text-foreground/30 uppercase tracking-wider mb-3">
            Basic Filters
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground/70">Status</Label>
              <Select
                value={filters.status}
                onChange={(e) => onFilterChange("status", e.target.value)}
                options={CANDIDATE_STATUSES}
                placeholder="All statuses"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Talent Bucket</Label>
              <Select
                value={filters.talent_bucket}
                onChange={(e) =>
                  onFilterChange("talent_bucket", e.target.value)
                }
                options={TALENT_BUCKETS}
                placeholder="All buckets"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Category</Label>
              <Select
                value={filters.talent_category}
                onChange={(e) =>
                  onFilterChange("talent_category", e.target.value)
                }
                options={TALENT_CATEGORIES}
                placeholder="All categories"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Clearance</Label>
              <Select
                value={filters.clearance_level}
                onChange={(e) =>
                  onFilterChange("clearance_level", e.target.value)
                }
                options={CLEARANCE_LEVELS}
                placeholder="Any clearance"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">State</Label>
              <Select
                value={filters.location_state}
                onChange={(e) =>
                  onFilterChange("location_state", e.target.value)
                }
                options={US_STATES}
                placeholder="Any state"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Additional filters */}
        <div>
          <p className="text-xs font-medium text-foreground/30 uppercase tracking-wider mb-3">
            Advanced Filters
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground/70">City</Label>
              <Select
                value={filters.city}
                onChange={(e) => onFilterChange("city", e.target.value)}
                options={(filters.location_state
                  ? lookupCities.filter(
                      (c) => c.state === filters.location_state,
                    )
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
                  <span className="text-indigo-400">
                    ({filters.skills.length})
                  </span>
                )}
              </Label>
              <Select
                value=""
                onChange={(e) => {
                  const skill = e.target.value;
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors"
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
                  <span className="text-amber-400">
                    ({filters.certifications.length})
                  </span>
                )}
              </Label>
              <Select
                value=""
                onChange={(e) => {
                  const cert = e.target.value;
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
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
              <Label className="text-foreground/70">Min Years</Label>
              <input
                type="number"
                min="0"
                value={filters.minYears}
                onChange={(e) => onFilterChange("minYears", e.target.value)}
                placeholder="0"
                className="flex h-9 w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 text-sm text-foreground/90 placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 hover:border-black/20 dark:hover:border-white/20 hover:bg-black/8 dark:hover:bg-white/8 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Max Years</Label>
              <input
                type="number"
                min="0"
                value={filters.maxYears}
                onChange={(e) => onFilterChange("maxYears", e.target.value)}
                placeholder="Any"
                className="flex h-9 w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 text-sm text-foreground/90 placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 hover:border-black/20 dark:hover:border-white/20 hover:bg-black/8 dark:hover:bg-white/8 transition-all"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
