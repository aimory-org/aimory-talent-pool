/**
 * Table for displaying job descriptions.
 */
import { FileText, Search, MapPin, Briefcase, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobDescription } from "@/types/jobDescription";
import type { JdSortField, SortDirection } from "../types";
import { SortableHeader } from "@/components/TalentDashboard/components/SortableHeader";
import { ClearanceBadge } from "@/components/TalentDashboard/components/ClearanceBadge";

interface JdTableProps {
  jobDescriptions: JobDescription[];
  isLoading: boolean;
  sortField: JdSortField;
  sortDirection: SortDirection;
  onSort: (field: JdSortField) => void;
  onSelectJd: (jd: JobDescription) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  archived?: boolean;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSalary(
  range: { min: number | null; max: number | null } | null,
) {
  if (!range) return "—";
  const fmt = (n: number | null) =>
    n != null ? `$${(n / 1000).toFixed(0)}k` : null;
  const min = fmt(range.min);
  const max = fmt(range.max);
  if (min && max) return `${min}–${max}`;
  if (min) return `${min}+`;
  if (max) return `up to ${max}`;
  return "—";
}

function SkillsPill({ skills, max = 3 }: { skills: string[]; max?: number }) {
  if (!skills.length) return <span className="text-foreground/30">—</span>;
  const shown = skills.slice(0, max);
  const extra = skills.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span
          key={s}
          className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-foreground"
        >
          {s}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[10px] text-foreground/40 font-medium self-center">
          +{extra}
        </span>
      )}
    </div>
  );
}

export function JdTable({
  jobDescriptions,
  isLoading,
  sortField,
  sortDirection,
  onSort,
  onSelectJd,
  activeFilterCount,
  onClearFilters,
}: JdTableProps) {
  return (
    <div className="relative z-10 bg-card rounded-2xl border border-border overflow-hidden animate-slide-in-up">
      {/*
        Fixed pixel widths (not percentages) so every column keeps enough
        room for its worst-case content, sized to fit within ~1140px without
        needing horizontal scroll at typical laptop widths. The Table
        component provides its own overflow-x-auto wrapper as a fallback.
      */}
      <Table className="table-fixed w-full min-w-[1140px]">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground w-[240px]">
              <SortableHeader
                label="Title"
                field="title"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-muted-foreground w-[160px]">
              <SortableHeader
                label="Job Title"
                field="job_title"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-muted-foreground w-[220px]">
              Required Skills
            </TableHead>
            <TableHead className="text-muted-foreground w-[140px]">
              <SortableHeader
                label="Clearance"
                field="required_clearance"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-muted-foreground w-[110px]">
              <SortableHeader
                label="Location"
                field="location_state"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-muted-foreground w-[110px]">
              Salary
            </TableHead>
            <TableHead className="text-muted-foreground w-[70px]">
              <SortableHeader
                label="Exp."
                field="min_experience_years"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="text-muted-foreground w-[90px]">
              <SortableHeader
                label="Added"
                field="created_at"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={onSort}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobDescriptions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-16">
                <div className="flex flex-col items-center gap-4">
                  {isLoading ? (
                    <>
                      <div className="relative">
                        <div className="h-12 w-12 border-2 border-primary/25 rounded-full" />
                        <div className="absolute inset-0 h-12 w-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                      <div className="text-center">
                        <p className="text-foreground/60 font-medium">
                          Loading job descriptions...
                        </p>
                        <p className="text-foreground/30 text-sm mt-1">
                          This may take a moment
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <div className="p-4 bg-secondary rounded-2xl">
                          <FileText className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                        <div className="absolute -top-1 -right-1 p-1.5 bg-secondary rounded-full border border-border">
                          <Search className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="text-center max-w-sm">
                        <p className="text-foreground/70 font-medium text-lg mb-1">
                          No job descriptions found
                        </p>
                        <p className="text-foreground/40 text-sm">
                          {activeFilterCount > 0
                            ? "Try adjusting your filters to see more results"
                            : "Upload job descriptions to get started"}
                        </p>
                      </div>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={onClearFilters}
                          className="mt-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/70 transition-colors text-sm font-medium flex items-center gap-2"
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
            jobDescriptions.map((jd) => (
              <TableRow
                key={jd.pk}
                className="border-border/60 cursor-pointer hover:bg-secondary transition-colors duration-150 group"
                onClick={() => onSelectJd(jd)}
              >
                <TableCell>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center text-accent-foreground">
                        <FileText className="h-4 w-4" />
                      </div>
                      {jd.possible_duplicate_of && (
                        <span
                          className="absolute -top-1 -right-1 flex items-center justify-center h-4 w-4 rounded-full bg-warning border-2 border-card"
                          title="Possible duplicate"
                        >
                          <span className="text-white text-[9px] font-bold leading-none">
                            !
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {jd.title || "Untitled"}
                      </p>
                      <p className="text-xs text-foreground/40 truncate">
                        {jd.industry_category || "—"}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-foreground/70 text-sm truncate">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-foreground/30 shrink-0" />
                    {jd.job_title || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <SkillsPill skills={jd.required_skills || []} />
                </TableCell>
                <TableCell>
                  <ClearanceBadge level={jd.required_clearance} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-foreground/70 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-foreground/30 shrink-0" />
                    {jd.location_state || "—"}
                  </div>
                </TableCell>
                <TableCell className="text-foreground/70 text-sm font-medium tabular-nums">
                  {formatSalary(jd.salary_range)}
                </TableCell>
                <TableCell className="text-foreground/70 text-sm tabular-nums">
                  {jd.min_experience_years != null
                    ? `${jd.min_experience_years}+ yr`
                    : "—"}
                </TableCell>
                <TableCell className="text-foreground/40 text-xs tabular-nums">
                  {formatDate(jd.created_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
