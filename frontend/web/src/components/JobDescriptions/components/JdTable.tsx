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

function SkillsPill({
  skills,
  max = 3,
  archived = false,
}: {
  skills: string[];
  max?: number;
  archived?: boolean;
}) {
  if (!skills.length) return <span className="text-foreground/30">—</span>;
  const shown = skills.slice(0, max);
  const extra = skills.length - max;
  const pill = archived
    ? "bg-violet-600/10 text-violet-700 dark:text-violet-400 border-violet-600/20"
    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20";
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span
          key={s}
          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${pill}`}
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
  archived = false,
}: JdTableProps) {
  const c = archived
    ? {
        accentLine: "via-violet-600/60",
        spinner: "border-violet-600/30",
        spinnerActive: "border-violet-600",
        clearBtn: "bg-violet-600/20 border-violet-600/30 text-violet-700 dark:text-violet-400 hover:bg-violet-600/30",
        rowHover: "hover:bg-violet-600/4 dark:hover:bg-violet-600/4",
        titleHover: "group-hover:text-violet-700 dark:group-hover:text-violet-400",
        iconGradient: "from-violet-500/40 to-purple-600/40",
        iconBorder: "border-violet-500/20 dark:border-violet-500/20",
        iconText: "text-violet-700 dark:text-violet-400",
      }
    : {
        accentLine: "via-indigo-500/60",
        spinner: "border-indigo-500/30",
        spinnerActive: "border-indigo-500",
        clearBtn: "bg-indigo-500/20 border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/30",
        rowHover: "hover:bg-indigo-500/4 dark:hover:bg-violet-400/4",
        titleHover: "group-hover:text-indigo-600 dark:group-hover:text-indigo-300",
        iconGradient: "from-indigo-400/40 to-violet-500/40",
        iconBorder: "border-indigo-400/20 dark:border-indigo-400/20",
        iconText: "text-indigo-500 dark:text-indigo-300",
      };

  return (
    <div className="relative z-10 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-black/7 dark:border-white/7 overflow-hidden shadow-xl shadow-black/5 animate-slide-in-up">
      <div className={`absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent ${c.accentLine} to-transparent`} />
      <div className="overflow-x-auto">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="border-black/10 dark:border-white/10 hover:bg-transparent">
              <TableHead className="text-foreground/60 w-[25%]">
                <SortableHeader
                  label="Title"
                  field="title"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-foreground/60 w-[14%]">
                <SortableHeader
                  label="Job Title"
                  field="job_title"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-foreground/60 w-[18%]">
                Required Skills
              </TableHead>
              <TableHead className="text-foreground/60 w-[10%]">
                <SortableHeader
                  label="Clearance"
                  field="required_clearance"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-foreground/60 w-[10%]">
                <SortableHeader
                  label="Location"
                  field="location_state"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-foreground/60 w-[10%]">
                Salary
              </TableHead>
              <TableHead className="text-foreground/60 w-[6%]">
                <SortableHeader
                  label="Exp."
                  field="min_experience_years"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-foreground/60 w-[7%]">
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
                          <div className={`h-12 w-12 border-2 ${c.spinner} rounded-full`} />
                          <div className={`absolute inset-0 h-12 w-12 border-2 ${c.spinnerActive} border-t-transparent rounded-full animate-spin`} />
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
                          <div className="p-4 bg-gray-200/50 dark:bg-slate-800/50 rounded-2xl">
                            <FileText className="h-10 w-10 text-foreground/20" />
                          </div>
                          <div className="absolute -top-1 -right-1 p-1.5 bg-gray-200 dark:bg-slate-800 rounded-full border border-black/10 dark:border-white/10">
                            <Search className="h-4 w-4 text-foreground/30" />
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
                            className={`mt-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium flex items-center gap-2 ${c.clearBtn}`}
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
                  className={`border-black/4 dark:border-white/4 cursor-pointer ${c.rowHover} transition-all duration-150 group`}
                  onClick={() => onSelectJd(jd)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className={`h-9 w-9 rounded-full bg-linear-to-br ${c.iconGradient} flex items-center justify-center border ${c.iconBorder} ${c.iconText} shadow-sm`}>
                          <FileText className="h-4 w-4" />
                        </div>
                        {jd.possible_duplicate_of && (
                          <span
                            className="absolute -top-1 -right-1 flex items-center justify-center h-4 w-4 rounded-full bg-amber-500 border-2 border-white dark:border-slate-800"
                            title="Possible duplicate"
                          >
                            <span className="text-white text-[9px] font-bold leading-none">
                              !
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium text-foreground ${c.titleHover} transition-colors truncate`}>
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
                    <SkillsPill skills={jd.required_skills || []} archived={archived} />
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
    </div>
  );
}
