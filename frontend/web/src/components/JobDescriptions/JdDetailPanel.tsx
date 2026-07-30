/**
 * Detail panel for viewing a job description and matching candidates.
 */
import { useState, useCallback } from "react";
import {
  X,
  FileText,
  Briefcase,
  MapPin,
  ShieldCheck,
  Clock,
  DollarSign,
  Users,
  Sparkles,
  Trash2,
  Loader2,
  Eye,
  ChevronRight,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import {
  matchCandidates,
  deleteJobDescription,
  getResumeUrl,
  updateJobDescription,
  getTalent,
} from "@/lib/api";
import type { JobDescription, CandidateMatch } from "@/types/jobDescription";
import type { TalentProfile } from "@/types/talent";
import { ClearanceBadge } from "@/components/TalentDashboard/components/ClearanceBadge";
import { DocumentViewer } from "@/components/TalentDashboard/components/DocumentViewer";
import { ProfileDetailPanel } from "@/components/TalentDashboard/ProfileDetailPanel";

interface JdDetailPanelProps {
  jd: JobDescription;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated?: (jd: JobDescription) => void;
  onArchived?: () => void;
}

// Match-quality scale collapsed to the app's restrained semantic set: success
// (excellent) / primary (good) / warning (partial or weak) / destructive
// (poor) — the label text carries the finer distinction, not a unique hue.
function ScoreBadge({ score }: { score: number | null }) {
  if (score == null)
    return (
      <span className="text-xs text-foreground/30 italic">not scored</span>
    );
  let color = "bg-destructive/15 text-destructive border-destructive/25";
  let labelColor = "text-destructive/70";
  let label = "Poor";
  if (score >= 90) {
    color = "bg-success/15 text-success border-success/25";
    labelColor = "text-success/80";
    label = "Excellent";
  } else if (score >= 70) {
    color = "bg-accent text-accent-foreground border-transparent";
    labelColor = "text-accent-foreground/80";
    label = "Good";
  } else if (score >= 50) {
    color = "bg-warning/15 text-warning border-warning/25";
    labelColor = "text-warning/80";
    label = "Partial";
  } else if (score >= 30) {
    color = "bg-warning/10 text-warning border-warning/20";
    labelColor = "text-warning/70";
    label = "Weak";
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[10px] font-medium ${labelColor}`}>{label}</span>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border tabular-nums ${color}`}
      >
        {score}
      </span>
    </div>
  );
}

function SkillTags({
  skills,
  label,
  variant = "required",
}: {
  skills: string[];
  label: string;
  variant?: "required" | "desired";
}) {
  if (!skills.length) return null;
  const colors =
    variant === "required"
      ? "bg-accent text-accent-foreground"
      : "bg-secondary text-muted-foreground";
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/40 mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {skills.map((s) => (
          <span
            key={s}
            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${colors}`}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export function JdDetailPanel({
  jd,
  onClose,
  onDeleted,
  onUpdated,
  onArchived,
}: JdDetailPanelProps) {
  const [matches, setMatches] = useState<CandidateMatch[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [hasMatched, setHasMatched] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [showDocument, setShowDocument] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<TalentProfile | null>(
    null,
  );
  const [selectedMatch, setSelectedMatch] = useState<CandidateMatch | null>(
    null,
  );
  const [profileLoading, setProfileLoading] = useState<string | null>(null);

  const handleMatch = useCallback(async () => {
    setIsMatching(true);
    setMatchError(null);
    try {
      const result = await matchCandidates(jd.pk);
      setMatches(result.matches);
      setHasMatched(true);
    } catch (err) {
      setMatchError(
        err instanceof Error ? err.message : "Failed to match candidates",
      );
    } finally {
      setIsMatching(false);
    }
  }, [jd.pk]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteJobDescription(jd.pk);
      onDeleted();
    } catch {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [jd.pk, onDeleted]);

  const handleArchiveToggle = useCallback(async () => {
    setIsArchiving(true);
    setArchiveError(null);
    try {
      await updateJobDescription(jd.pk, { archived: !jd.archived });
      onArchived?.();
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Failed to update archive status",
      );
      setIsArchiving(false);
    }
  }, [jd.pk, jd.archived, onArchived]);

  const handleViewDocument = useCallback(async () => {
    if (!jd.key) return;
    setDocumentLoading(true);
    try {
      const { url } = await getResumeUrl(jd.key);
      setDocumentUrl(url);
      setShowDocument(true);
    } catch (error) {
      console.error("Failed to get document URL:", error);
      alert("Failed to load document. Please try again.");
    } finally {
      setDocumentLoading(false);
    }
  }, [jd.key]);

  const handleProfileClick = useCallback(async (match: CandidateMatch) => {
    setProfileLoading(match.pk);
    setSelectedMatch(match);
    try {
      const profile = await getTalent(match.pk);
      setSelectedProfile(profile);
    } catch (error) {
      console.error("Failed to load profile:", error);
      setSelectedMatch(null);
    } finally {
      setProfileLoading(null);
    }
  }, []);

  const salary = jd.salary_range;
  const fmtSalary = (n: number | null) =>
    n != null ? `$${n.toLocaleString()}` : null;

  // Profile detail view — shows the candidate profile panel
  if (selectedProfile) {
    return (
      <>
        <ProfileDetailPanel
          profile={selectedProfile}
          onClose={() => {
            setSelectedProfile(null);
            setSelectedMatch(null);
          }}
          onRefresh={async () => {}}
          matchContext={{ jd, match: selectedMatch }}
        />
      </>
    );
  }

  // Document viewer — full-screen file viewer with JD summary sidebar
  if (showDocument && documentUrl) {
    return (
      <div className="fixed inset-y-0 right-0 w-full bg-card backdrop-blur-sm border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Top bar */}
        <div className="flex-none bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {jd.title || "Untitled"}
              </h2>
              <p className="text-xs text-foreground/40">
                Job Description &middot; {jd.job_title || "Document"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDocument(false)}
              className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/70 transition-colors text-sm font-medium flex items-center gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Back to Details
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Split content: document (left) + summary sidebar (right) */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 bg-background border-r border-border">
            <DocumentViewer
              url={documentUrl}
              fileKey={jd.key || ""}
              title={`Job Description - ${jd.title || "Document"}`}
            />
          </div>
          {/* Summary sidebar */}
          <div className="w-96 shrink-0 overflow-y-auto bg-secondary/40">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 gap-2">
                {jd.job_title && (
                  <div className="flex items-center gap-2 text-sm text-foreground/70">
                    <Briefcase className="h-4 w-4 text-foreground/30 shrink-0" />
                    {jd.job_title}
                  </div>
                )}
                {(jd.location?.city || jd.location_state) && (
                  <div className="flex items-center gap-2 text-sm text-foreground/70">
                    <MapPin className="h-4 w-4 text-foreground/30 shrink-0" />
                    {jd.location?.city && jd.location?.state
                      ? `${jd.location.city}, ${jd.location.state}`
                      : jd.location_state || "—"}
                  </div>
                )}
                {jd.required_clearance && (
                  <div className="flex items-center gap-2 text-sm text-foreground/70">
                    <ShieldCheck className="h-4 w-4 text-foreground/30 shrink-0" />
                    <ClearanceBadge level={jd.required_clearance} />
                  </div>
                )}
                {jd.min_experience_years != null && (
                  <div className="flex items-center gap-2 text-sm text-foreground/70">
                    <Clock className="h-4 w-4 text-foreground/30 shrink-0" />
                    {jd.min_experience_years}+ years
                  </div>
                )}
                {salary && (
                  <div className="flex items-center gap-2 text-sm text-foreground/70">
                    <DollarSign className="h-4 w-4 text-foreground/30 shrink-0" />
                    {fmtSalary(salary.min)} – {fmtSalary(salary.max)}
                  </div>
                )}
              </div>
              <SkillTags
                skills={jd.required_skills || []}
                label="Required Skills"
                variant="required"
              />
              <SkillTags
                skills={jd.desired_skills || []}
                label="Desired Skills"
                variant="desired"
              />
              <SkillTags
                skills={jd.required_certifications || []}
                label="Required Certifications"
                variant="required"
              />
              <SkillTags
                skills={jd.desired_certifications || []}
                label="Desired Certifications"
                variant="desired"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg z-50 flex flex-col bg-card border-l border-border shadow-xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 h-10 w-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground truncate">
              {jd.title || "Untitled"}
            </h2>
            <p className="text-xs text-foreground/40">
              Added{" "}
              {jd.created_at
                ? new Date(jd.created_at).toLocaleDateString()
                : "—"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* View Document button */}
        {jd.key && (
          <button
            onClick={handleViewDocument}
            disabled={documentLoading}
            className="w-full px-4 py-3 rounded-xl bg-accent text-accent-foreground hover:bg-accent/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            {documentLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Document...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                View Document
              </>
            )}
          </button>
        )}

        {/* Key details grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <Briefcase className="h-4 w-4 text-foreground/30 shrink-0" />
            {jd.job_title || "—"}
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <MapPin className="h-4 w-4 text-foreground/30 shrink-0" />
            {jd.location?.city && jd.location?.state
              ? `${jd.location.city}, ${jd.location.state}`
              : jd.location_state || "—"}
            {jd.location?.remote && (
              <span className="text-xs text-foreground/40">
                ({jd.location.remote})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <ShieldCheck className="h-4 w-4 text-foreground/30 shrink-0" />
            {jd.required_clearance ? (
              <ClearanceBadge level={jd.required_clearance} />
            ) : (
              "None"
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            <Clock className="h-4 w-4 text-foreground/30 shrink-0" />
            {jd.min_experience_years != null
              ? `${jd.min_experience_years}+ years`
              : "—"}
          </div>
          {salary && (
            <div className="flex items-center gap-2 text-sm text-foreground/70 col-span-2">
              <DollarSign className="h-4 w-4 text-foreground/30 shrink-0" />
              {fmtSalary(salary.min)} – {fmtSalary(salary.max)}
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="space-y-3">
          <SkillTags
            skills={jd.required_skills || []}
            label="Required Skills"
            variant="required"
          />
          <SkillTags
            skills={jd.desired_skills || []}
            label="Desired Skills"
            variant="desired"
          />
        </div>

        {/* Certifications */}
        <div className="space-y-3">
          <SkillTags
            skills={jd.required_certifications || []}
            label="Required Certifications"
            variant="required"
          />
          <SkillTags
            skills={jd.desired_certifications || []}
            label="Desired Certifications"
            variant="desired"
          />
        </div>

        {/* Possible Duplicate Warning */}
        {jd.possible_duplicate_of && (
          <div className="bg-warning/10 rounded-xl p-4 border border-warning/30">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-warning text-sm font-medium">
                  ⚠ Possible duplicate of another job description
                </p>
                <p className="text-warning/70 text-xs mt-1 break-all">
                  {jd.possible_duplicate_of}
                </p>
              </div>
              <button
                onClick={async () => {
                  try {
                    await updateJobDescription(jd.pk, {
                      dismiss_duplicate: true,
                    });
                    onUpdated?.({ ...jd, possible_duplicate_of: undefined });
                  } catch {
                    alert("Failed to dismiss duplicate flag.");
                  }
                }}
                className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium border border-warning/30 text-warning hover:bg-warning/20 transition-colors"
                title="Dismiss duplicate flag"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Candidate matching section */}
        <div className="border-t border-border pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Candidate Matches
            </h3>
            <button
              onClick={handleMatch}
              disabled={isMatching}
              className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
            >
              {isMatching ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Matching...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {hasMatched ? "Re-match" : "Find Matches"}
                </>
              )}
            </button>
          </div>

          {matchError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 mb-3">
              <p className="text-sm text-destructive">
                {matchError}
              </p>
            </div>
          )}

          {hasMatched && matches.length === 0 && !isMatching && (
            <p className="text-sm text-foreground/40 text-center py-4">
              No matching candidates found
            </p>
          )}

          {matches.length > 0 && (
            <div className="space-y-2">
              {/* Score legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-foreground/40 mb-3">
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-success/60 mr-1" />
                  90-100 Excellent
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-primary/60 mr-1" />
                  70-89 Good
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-warning/60 mr-1" />
                  50-69 Partial
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-warning/40 mr-1" />
                  30-49 Weak
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-destructive/60 mr-1" />
                  0-29 Poor
                </span>
              </div>

              {matches.map((m) => (
                <button
                  key={m.pk}
                  onClick={() => handleProfileClick(m)}
                  disabled={profileLoading === m.pk}
                  className="w-full text-left rounded-xl border border-border/60 p-3 bg-card hover:bg-secondary transition-colors group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {profileLoading === m.pk ? (
                        <div className="shrink-0 h-7 w-7 rounded-full bg-accent flex items-center justify-center">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-foreground" />
                        </div>
                      ) : (
                        <div className="shrink-0 h-7 w-7 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-semibold">
                          {(m.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {m.name || "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ScoreBadge score={m.score} />
                      <ChevronRight className="h-3.5 w-3.5 text-foreground/20 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-foreground/50 ml-9">
                    {m.job_title && <span>{m.job_title}</span>}
                    {m.clearance_level && <span>• {m.clearance_level}</span>}
                    {m.years_of_experience != null && (
                      <span>• {m.years_of_experience}yr</span>
                    )}
                    {m.location_state && <span>• {m.location_state}</span>}
                  </div>
                  {m.rationale && (
                    <p className="text-xs text-foreground/50 mt-2 ml-9 leading-relaxed bg-secondary rounded-lg px-2.5 py-2 border border-border/60">
                      {m.rationale}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-3 border-t border-border bg-secondary/40 space-y-2">
        {archiveError && (
          <p className="text-xs text-destructive">{archiveError}</p>
        )}
        {showDeleteConfirm ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-destructive font-medium">
              Delete this job description?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-destructive text-white hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
              >
                {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button
              onClick={handleArchiveToggle}
              disabled={isArchiving}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              {isArchiving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : jd.archived ? (
                <ArchiveRestore className="h-3.5 w-3.5" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              {jd.archived ? "Unarchive" : "Archive"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-sm text-destructive/70 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
