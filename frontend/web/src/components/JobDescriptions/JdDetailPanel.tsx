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
import { ProfileDetailPanel } from "@/components/TalentDashboard/ProfileDetailPanel";

interface JdDetailPanelProps {
  jd: JobDescription;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated?: (jd: JobDescription) => void;
  onArchived?: () => void;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null)
    return (
      <span className="text-xs text-foreground/30 italic">not scored</span>
    );
  let color = "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/25";
  let labelColor = "text-red-500/70 dark:text-red-400/70";
  let label = "Poor";
  if (score >= 90) {
    color =
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25";
    labelColor = "text-emerald-600/80 dark:text-emerald-400/80";
    label = "Excellent";
  } else if (score >= 70) {
    color =
      "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/25";
    labelColor = "text-indigo-600/80 dark:text-indigo-400/80";
    label = "Good";
  } else if (score >= 50) {
    color =
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25";
    labelColor = "text-amber-600/80 dark:text-amber-400/80";
    label = "Partial";
  } else if (score >= 30) {
    color =
      "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/25";
    labelColor = "text-orange-600/80 dark:text-orange-400/80";
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
      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20"
      : "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20";
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/40 mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {skills.map((s) => (
          <span
            key={s}
            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium border ${colors}`}
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
    try {
      await updateJobDescription(jd.pk, { archived: !jd.archived });
      onArchived?.();
    } catch {
      setIsArchiving(false);
    }
  }, [jd.pk, jd.archived, onArchived]);

  const handleViewDocument = useCallback(async () => {
    if (!jd.key) return;
    setDocumentLoading(true);
    try {
      const { url } = await getResumeUrl(jd.key);
      const isDocx =
        jd.key.toLowerCase().endsWith(".docx") ||
        jd.key.toLowerCase().endsWith(".doc");
      if (isDocx) {
        setDocumentUrl(
          `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`,
        );
      } else {
        setDocumentUrl(url);
      }
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
      <div className="fixed inset-y-0 right-0 w-full bg-white/95 dark:bg-slate-800/95 backdrop-blur-lg border-l border-black/10 dark:border-white/10 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Top bar */}
        <div className="flex-none bg-white/95 dark:bg-slate-800/95 backdrop-blur-lg border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-linear-to-br from-violet-500/30 to-purple-500/30 flex items-center justify-center border border-black/10 dark:border-white/10 text-violet-600 dark:text-violet-300">
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
              className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 transition-colors text-sm font-medium flex items-center gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Back to Details
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-foreground/60 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Split content: document (left) + summary sidebar (right) */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 bg-white dark:bg-slate-900 border-r border-black/10 dark:border-white/10">
            <iframe
              src={documentUrl}
              className="w-full h-full border-0"
              title={`Job Description - ${jd.title || "Document"}`}
            />
          </div>
          {/* Summary sidebar */}
          <div className="w-96 shrink-0 overflow-y-auto bg-white/50 dark:bg-slate-800/50">
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
    <div className="fixed inset-y-0 right-0 w-full max-w-lg z-50 flex flex-col bg-white dark:bg-slate-900 border-l border-black/10 dark:border-white/10 shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10 bg-linear-to-r from-violet-500/5 to-purple-500/5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 h-10 w-10 rounded-full bg-linear-to-br from-violet-500/40 to-purple-600/40 flex items-center justify-center border border-violet-500/20 text-violet-600 dark:text-violet-300">
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
          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <X className="h-5 w-5 text-foreground/50" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* View Document button */}
        {jd.key && (
          <button
            onClick={handleViewDocument}
            disabled={documentLoading}
            className="w-full px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium flex items-center justify-center gap-2"
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
          <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/30">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-amber-700 dark:text-amber-300 text-sm font-medium">
                  ⚠ Possible duplicate of another job description
                </p>
                <p className="text-amber-600/70 dark:text-amber-400/70 text-xs mt-1 break-all">
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
                className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
                title="Dismiss duplicate flag"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Candidate matching section */}
        <div className="border-t border-black/10 dark:border-white/10 pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              Candidate Matches
            </h3>
            <button
              onClick={handleMatch}
              disabled={isMatching}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium flex items-center gap-2"
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
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 mb-3">
              <p className="text-sm text-red-600 dark:text-red-300">
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
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500/60 mr-1" />
                  90-100 Excellent
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500/60 mr-1" />
                  70-89 Good
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500/60 mr-1" />
                  50-69 Partial
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-orange-500/60 mr-1" />
                  30-49 Weak
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500/60 mr-1" />
                  0-29 Poor
                </span>
              </div>

              {matches.map((m) => (
                <button
                  key={m.pk}
                  onClick={() => handleProfileClick(m)}
                  disabled={profileLoading === m.pk}
                  className="w-full text-left rounded-xl border border-black/6 dark:border-white/6 p-3 bg-white/40 dark:bg-slate-800/40 hover:bg-indigo-500/5 hover:border-indigo-500/20 transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {profileLoading === m.pk ? (
                        <div className="shrink-0 h-7 w-7 rounded-full bg-indigo-500/10 flex items-center justify-center">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                        </div>
                      ) : (
                        <div className="shrink-0 h-7 w-7 rounded-full bg-linear-to-br from-indigo-500/40 to-violet-600/40 flex items-center justify-center text-indigo-600 dark:text-indigo-300 text-xs font-semibold border border-indigo-500/20">
                          {(m.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-sm text-foreground truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                        {m.name || "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ScoreBadge score={m.score} />
                      <ChevronRight className="h-3.5 w-3.5 text-foreground/20 group-hover:text-indigo-500 transition-colors" />
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
                    <p className="text-xs text-foreground/50 mt-2 ml-9 leading-relaxed bg-black/2 dark:bg-white/2 rounded-lg px-2.5 py-2 border border-black/4 dark:border-white/4">
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
      <div className="px-5 py-3 border-t border-black/10 dark:border-white/10 bg-gray-50/50 dark:bg-slate-800/50">
        {showDeleteConfirm ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              Delete this job description?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-foreground/60 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-all flex items-center gap-1.5"
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
              className="flex items-center gap-1.5 text-sm text-foreground/50 hover:text-foreground disabled:opacity-50 transition-colors"
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
              className="flex items-center gap-1.5 text-sm text-red-500/70 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
