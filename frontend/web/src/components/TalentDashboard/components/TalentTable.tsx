/**
 * Table component for displaying talent profiles.
 */
import { useRef } from "react";
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
import { getProfileWarnings, WARNING_LABELS } from "../warnings";
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
  searchActive?: boolean;
  searchTerm?: string;
  // Selection props (optional — omit to disable checkboxes)
  selectedPks?: Set<string>;
  onToggleSelect?: (pk: string) => void;
  // Receives the PKs of all profiles on the current page plus the desired checked state
  onToggleSelectAll?: (pks: string[], allSelected: boolean) => void;
}

/**
 * Trims an OpenSearch highlight fragment so the <mark> is always visible.
 * Keeps up to `before` plain-text chars before the mark and `after` chars after.
 */
function trimAroundMark(html: string, before = 20, after = 60): string {
  const markStart = html.indexOf("<mark>");
  if (markStart === -1) return html.slice(0, after);

  const markEnd = html.indexOf("</mark>") + "</mark>".length;
  const preMark = html.slice(0, markStart);
  const markContent = html.slice(markStart, markEnd);
  const postMark = html.slice(markEnd);

  // Trim text before mark — keep the tail so the mark follows naturally
  let pre = preMark;
  let preEllipsis = "";
  if (preMark.length > before) {
    const cut = preMark.length - before;
    const space = preMark.indexOf(" ", cut);
    pre = space > 0 ? preMark.slice(space + 1) : preMark.slice(cut);
    preEllipsis = "\u2026";
  }

  // Trim text after mark — keep the head
  let post = postMark;
  let postEllipsis = "";
  if (postMark.length > after) {
    const space = postMark.lastIndexOf(" ", after);
    post = space > 0 ? postMark.slice(0, space) : postMark.slice(0, after);
    postEllipsis = "\u2026";
  }

  return preEllipsis + pre + markContent + post + postEllipsis;
}

const JOB_TITLE_ABBREVIATIONS: [RegExp, string][] = [
  [/\bVice President\b/gi, "VP"],
  [/\bSenior\b/gi, "Sr."],
  [/\bJunior\b/gi, "Jr."],
  [/\bDirector\b/gi, "Dir."],
  [/\bManager\b/gi, "Mgr."],
  [/\bCoordinator\b/gi, "Coord."],
  [/\bAdministrator\b/gi, "Admin."],
  [/\bRepresentative\b/gi, "Rep."],
  [/\bSpecialist\b/gi, "Spec."],
  [/\bSupervisor\b/gi, "Supvr."],
  [/\bExecutive\b/gi, "Exec."],
  [/\bEngineer\b/gi, "Engr."],
  [/\bTechnician\b/gi, "Tech."],
  [/\bOperations\b/gi, "Ops."],
  [/\bManagement\b/gi, "Mgmt."],
  [/\bDevelopment\b/gi, "Dev."],
  [/\bInformation\b/gi, "Info."],
  [/\bCybersecurity\b/gi, "Cyber Sec."],
  [/\bInfrastructure\b/gi, "Infra."],
  [/\bConsultant\b/gi, "Consult."],
];

function abbreviateJobTitle(title: string, maxLen = 24): string {
  if (title.length <= maxLen) return title;
  let result = title;
  for (const [pattern, abbr] of JOB_TITLE_ABBREVIATIONS) {
    result = result.replace(pattern, abbr);
    if (result.length <= maxLen) return result;
  }
  return result;
}

/** Highlights only the prefix-matching portion of a name */
function NamePrefixHighlight({
  name,
  searchTerm,
}: {
  name: string;
  searchTerm: string;
}) {
  const lowerName = name.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase().trim();
  if (!lowerSearch || !lowerName.startsWith(lowerSearch)) {
    // Check if any word in the name starts with the search term
    const words = name.split(/\s+/);
    let offset = 0;
    for (const word of words) {
      if (word.toLowerCase().startsWith(lowerSearch)) {
        const before = name.slice(0, offset);
        const match = name.slice(offset, offset + lowerSearch.length);
        const after = name.slice(offset + lowerSearch.length);
        return (
          <>
            {before}
            <mark className="bg-yellow-200/60 text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-200 rounded px-0.5 not-italic font-medium">
              {match}
            </mark>
            {after}
          </>
        );
      }
      offset += word.length + 1; // +1 for space
    }
    return <>{name}</>;
  }
  const matchLen = lowerSearch.length;
  return (
    <>
      <mark className="bg-yellow-200/60 text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-200 rounded px-0.5 not-italic font-medium">
        {name.slice(0, matchLen)}
      </mark>
      {name.slice(matchLen)}
    </>
  );
}

function StyledCheckbox({
  checked,
  indeterminate,
  onChange,
  stopClick,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  stopClick?: boolean;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className="relative inline-flex items-center justify-center cursor-pointer h-5 w-5"
      onClick={stopClick ? (e) => e.stopPropagation() : undefined}
    >
      <input
        ref={(el) => {
          (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          if (el) el.indeterminate = !!indeterminate;
        }}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
        aria-label={ariaLabel}
      />
      <div
        className={`h-4 w-4 rounded border-2 transition-colors duration-150 flex items-center justify-center ${
          checked || indeterminate
            ? "bg-primary border-primary"
            : "border-border-strong bg-transparent hover:border-primary/60"
        }`}
      >
        {indeterminate && !checked ? (
          <div className="h-0.5 w-2 bg-white rounded-full" />
        ) : checked ? (
          <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
    </label>
  );
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
  searchActive = false,
  searchTerm = "",
  selectedPks,
  onToggleSelect,
  onToggleSelectAll,
}: TalentTableProps) {
  const selectionEnabled = !!selectedPks && !!onToggleSelect;
  const allOnPageSelected =
    selectionEnabled && profiles.length > 0 && profiles.every((p) => selectedPks!.has(p.pk));
  const someOnPageSelected =
    selectionEnabled && profiles.some((p) => selectedPks!.has(p.pk)) && !allOnPageSelected;

  return (
    <div className="relative z-10 bg-card rounded-2xl border border-border overflow-hidden animate-slide-in-up">
      {/*
        Fixed pixel widths (not percentages) so every column keeps enough
        room for its worst-case content — e.g. "Placed at Other Company" or
        "Yankee White" — sized to fit within ~1200px (a 1280px laptop screen)
        without needing horizontal scroll. The Table component already
        provides its own overflow-x-auto wrapper as a fallback for narrower
        viewports.
      */}
      <Table className="table-fixed w-full min-w-[1210px]">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {selectionEnabled && (
                <TableHead className="w-[44px] pl-4">
                  <StyledCheckbox
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onChange={() =>
                      onToggleSelectAll?.(profiles.map((p) => p.pk), !allOnPageSelected)
                    }
                    ariaLabel="Select all on page"
                  />
                </TableHead>
              )}
              <TableHead className="text-muted-foreground w-[220px]">
                <SortableHeader
                  label="Candidate"
                  field="name"
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
              <TableHead className="text-muted-foreground w-[130px]">
                <SortableHeader
                  label="Location"
                  field="location_state"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-muted-foreground w-[140px]">
                <SortableHeader
                  label="Clearance"
                  field="clearance_level"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-muted-foreground w-[110px]">
                <SortableHeader
                  label="Req. Salary"
                  field="requested_salary"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-muted-foreground w-[70px]">
                <SortableHeader
                  label="Exp."
                  field="years_of_experience"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-muted-foreground w-[230px]">
                <SortableHeader
                  label="Status"
                  field="status"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-muted-foreground w-[100px]">
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
                <TableCell colSpan={selectionEnabled ? 9 : 8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-4">
                    {isLoading ? (
                      <>
                        <div className="relative">
                          <div className="h-12 w-12 border-2 border-primary/25 rounded-full" />
                          <div className="absolute inset-0 h-12 w-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                          <div className="p-4 bg-secondary rounded-2xl">
                            <Users className="h-10 w-10 text-muted-foreground/50" />
                          </div>
                          <div className="absolute -top-1 -right-1 p-1.5 bg-secondary rounded-full border border-border">
                            <Search className="h-4 w-4 text-muted-foreground" />
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
              profiles.map((profile) => (
                <TableRow
                  key={profile.pk}
                  className={`border-border/60 cursor-pointer hover:bg-secondary transition-colors duration-150 group ${selectionEnabled && selectedPks!.has(profile.pk) ? "bg-accent" : ""}`}
                  onClick={() => onSelectProfile(profile)}
                >
                  {selectionEnabled && (
                    <TableCell
                      className="pl-4"
                      onClick={(e) => { e.stopPropagation(); onToggleSelect!(profile.pk); }}
                    >
                      <StyledCheckbox
                        checked={selectedPks!.has(profile.pk)}
                        onChange={() => onToggleSelect!(profile.pk)}
                        stopClick
                        ariaLabel={`Select ${profile.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-semibold text-sm">
                          {(profile.name || "?").charAt(0).toUpperCase()}
                        </div>
                        {(() => {
                          const warnings = getProfileWarnings(profile);
                          if (warnings.length === 0) return null;
                          return (
                            <span
                              className="absolute -top-1 -right-1 flex items-center justify-center h-4 w-4 rounded-full bg-warning border-2 border-card"
                              title={warnings
                                .map((w) => WARNING_LABELS[w])
                                .join(", ")}
                            >
                              <span className="text-white text-[9px] font-bold leading-none">
                                !
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {searchActive && searchTerm && profile.name ? (
                            <NamePrefixHighlight
                              name={profile.name}
                              searchTerm={searchTerm}
                            />
                          ) : (
                            profile.name || "Unknown"
                          )}
                        </p>
                        {searchActive &&
                        searchTerm &&
                        profile._highlight?.resume_text?.[0] ? (
                          <span
                            className="text-xs text-foreground/50 leading-tight mt-0.5 block truncate [&>mark]:bg-yellow-200/60 [&>mark]:text-yellow-900 dark:[&>mark]:bg-yellow-500/25 dark:[&>mark]:text-yellow-200 [&>mark]:rounded [&>mark]:px-0.5 [&>mark]:font-medium"
                            dangerouslySetInnerHTML={{
                              __html: trimAroundMark(
                                profile._highlight.resume_text[0],
                              ),
                            }}
                          />
                        ) : (
                          <p className="text-xs text-foreground/40 truncate">
                            {profile.contact?.email || "—"}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="text-foreground/80 truncate" title={profile.job_title || undefined}>
                        {profile.job_title ? abbreviateJobTitle(profile.job_title) : "—"}
                      </p>
                      <p className="text-xs text-foreground/40 truncate">
                        {profile.industry_category || profile.service_category}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 min-w-0 text-foreground/70">
                      <MapPin className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
                      <span
                        className="truncate"
                        title={
                          profile.location?.city
                            ? `${profile.location.city}, ${profile.location_state || ""}`
                            : profile.location_state || undefined
                        }
                      >
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
                    {profile.requested_salary ? (
                      <span className="text-foreground">
                        ${profile.requested_salary.toLocaleString()}
                        <span className="text-foreground/40 text-xs">/yr</span>
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
                  <TableCell className="overflow-hidden">
                    <div className="max-w-full overflow-hidden">
                      <StatusBadge status={profile.status} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-between gap-1">
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
