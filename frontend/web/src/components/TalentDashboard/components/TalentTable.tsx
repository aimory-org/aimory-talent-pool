/**
 * Table component for displaying talent profiles.
 */
import { Users, Search, MapPin, ChevronRight, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TalentProfile } from "@/types/talent";
import type { SortField, SortDirection } from "../types";
import { StatusBadge } from "./StatusBadge";
import { ClearanceBadge } from "./ClearanceBadge";
import { SortableHeader } from "./SortableHeader";

interface TalentTableProps {
  profiles: TalentProfile[];
  isLoading: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onSelectProfile: (profile: TalentProfile) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export function TalentTable({
  profiles,
  isLoading,
  sortField,
  sortDirection,
  onSort,
  onSelectProfile,
  activeFilterCount,
  onClearFilters,
}: TalentTableProps) {
  return (
    <div className="relative bg-white/50 dark:bg-slate-700/50 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden shadow-xl shadow-black/20">
      {/* Table gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-indigo-500/50 to-transparent" />
      <Table>
        <TableHeader>
          <TableRow className="border-black/10 dark:border-white/10 hover:bg-transparent">
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Candidate"
                field="name"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Category"
                field="talent_category"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Location"
                field="location_state"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Clearance"
                field="clearance_level"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Rate"
                field="bill_rate"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Experience"
                field="years_of_experience"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Status"
                field="status"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-foreground/60">
              <SortableHeader
                label="Received"
                field="date_received"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-16">
                <div className="flex flex-col items-center gap-4">
                  {isLoading ? (
                    <>
                      <div className="relative">
                        <div className="h-12 w-12 border-2 border-indigo-500/30 rounded-full" />
                        <div className="absolute inset-0 h-12 w-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                      <div className="text-center">
                        <p className="text-foreground/60 font-medium">
                          Loading candidates...
                        </p>
                        <p className="text-foreground/30 text-sm mt-1">
                          This may take a moment
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <div className="p-4 bg-gray-200/50 dark:bg-slate-800/50 rounded-2xl">
                          <Users className="h-10 w-10 text-foreground/20" />
                        </div>
                        <div className="absolute -top-1 -right-1 p-1.5 bg-gray-200 dark:bg-slate-800 rounded-full border border-black/10 dark:border-white/10">
                          <Search className="h-4 w-4 text-foreground/30" />
                        </div>
                      </div>
                      <div className="text-center max-w-sm">
                        <p className="text-foreground/70 font-medium text-lg mb-1">
                          No candidates found
                        </p>
                        <p className="text-foreground/40 text-sm">
                          {activeFilterCount > 0
                            ? "Try adjusting your filters to see more results"
                            : "Add candidates to get started"}
                        </p>
                      </div>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={onClearFilters}
                          className="mt-2 px-4 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/30 transition-all text-sm font-medium flex items-center gap-2"
                        >
                          <X className="h-4 w-4" />
                          Clear all filters
                        </button>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            profiles.map((profile) => (
              <TableRow
                key={profile.pk}
                className="border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 hover:shadow-lg transition-all duration-200 group"
                onClick={() => onSelectProfile(profile)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 h-10 w-10 rounded-full bg-linear-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-black/10 dark:border-white/10 text-foreground font-medium text-sm">
                      {(profile.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                        {profile.name || "Unknown"}
                      </p>
                      <p className="text-xs text-foreground/40">
                        {profile.contact?.email || "—"}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-foreground/80">
                      {profile.talent_category}
                    </p>
                    <p className="text-xs text-foreground/40">
                      {profile.talent_bucket}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-foreground/70">
                    <MapPin className="h-3.5 w-3.5 text-foreground/40" />
                    <span>
                      {profile.location?.city
                        ? `${profile.location.city}, `
                        : ""}
                      {profile.location_state}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <ClearanceBadge level={profile.clearance_level} />
                </TableCell>
                <TableCell className="text-foreground/70 font-medium">
                  {profile.bill_rate ? (
                    <span className="text-emerald-400">
                      ${profile.bill_rate}
                      <span className="text-foreground/40 text-xs">/hr</span>
                    </span>
                  ) : (
                    <span className="text-foreground/30">—</span>
                  )}
                </TableCell>
                <TableCell className="text-foreground/70">
                  {profile.years_of_experience ? (
                    <span>
                      {profile.years_of_experience}{" "}
                      <span className="text-foreground/40">yrs</span>
                    </span>
                  ) : (
                    <span className="text-foreground/30">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={profile.status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground/50 text-sm">
                      {new Date(profile.date_received).toLocaleDateString()}
                    </span>
                    <ChevronRight className="h-4 w-4 text-foreground/20 group-hover:text-foreground/50 group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
