/**
 * Profile detail panel for viewing and editing candidate profiles.
 * Supports editing all profile fields with an edit mode toggle.
 */
import { useState, useEffect } from "react";
import {
  X,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  Award,
  Linkedin,
  Github,
  Building,
  FileText,
  Trash2,
  Save,
  Clock,
  ExternalLink,
  DollarSign,
  Shield,
  Edit3,
  XCircle,
  Plus,
  Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getResumeUrl, updateTalent, deleteTalent, getTalent } from "@/lib/api";
import type { JobDescription, CandidateMatch } from "@/types/jobDescription";
import type {
  TalentProfile,
  CandidateStatus,
  ClearanceLevel,
  ServiceCategory,
} from "@/types/talent";
import {
  CANDIDATE_STATUSES,
  SERVICE_CATEGORIES,
  CLEARANCE_LEVELS,
  US_STATES,
} from "@/types/talent";
import { StatusBadge } from "./components/StatusBadge";
import { ClearanceBadge } from "./components/ClearanceBadge";
import { ProfileHistory } from "./components/ProfileHistory";

interface ProfileDetailPanelProps {
  profile: TalentProfile;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onProfileUpdated?: (updated: TalentProfile) => void;
  lookupTags?: string[];
  matchContext?: {
    jd: JobDescription;
    match: CandidateMatch | null;
  };
}

interface EditableProfile {
  name: string;
  contact: {
    email: string;
    phone: string;
    linkedin: string;
    github: string;
  };
  summary: string;
  service_category: ServiceCategory;
  industry_category: string;
  job_title: string;
  clearance_level: string;
  skillsets: { name: string }[];
  certifications: string[];
  companies: { name: string }[];
  location: {
    city: string;
    state: string;
  };
  years_of_experience: string;
  requested_salary: string;
  notes: string;
  tags: string[];
  status: CandidateStatus;
}

interface MatchInsights {
  score: number | null;
  rationale: string | null;
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedDesiredSkills: string[];
  missingDesiredSkills: string[];
  matchedRequiredCertifications: string[];
  missingRequiredCertifications: string[];
  matchedDesiredCertifications: string[];
  missingDesiredCertifications: string[];
  matchedChecks: string[];
  missingChecks: string[];
}

const CLEARANCE_RANK: Record<string, number> = {
  Secret: 1,
  TS: 2,
  "TS/SCI": 3,
  "TS/SCI/CI": 4,
  "TS/SCI/FSP": 5,
  "Yankee White": 6,
};

const TITLE_STOPWORDS = new Set([
  "sr",
  "senior",
  "jr",
  "junior",
  "ii",
  "iii",
  "iv",
  "lead",
  "principal",
  "staff",
]);

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTerms(values: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values || []) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = normalizeText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function toNormalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => normalizeText(value)).filter(Boolean));
}

function tokenizeTitle(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !TITLE_STOPWORDS.has(token));
}

function titleMatches(
  required: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  const req = normalizeText(required);
  const act = normalizeText(actual);
  if (!req) return true;
  if (!act) return false;
  if (req === act || req.includes(act) || act.includes(req)) return true;

  const reqTokens = tokenizeTitle(required);
  if (reqTokens.length === 0) return true;
  const actTokenSet = new Set(tokenizeTitle(actual));
  const overlap = reqTokens.filter((token) => actTokenSet.has(token)).length;
  return overlap / reqTokens.length >= 0.5;
}

function clearanceMeets(
  required: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  if (!required) return true;
  if (!actual) return false;
  const requiredRank = CLEARANCE_RANK[required] ?? -1;
  const actualRank = CLEARANCE_RANK[actual] ?? -1;
  if (requiredRank < 0 || actualRank < 0) {
    return normalizeText(required) === normalizeText(actual);
  }
  return actualRank >= requiredRank;
}

function computeMatchInsights(
  profile: TalentProfile,
  matchContext?: { jd: JobDescription; match: CandidateMatch | null },
): MatchInsights | null {
  if (!matchContext) {
    return null;
  }

  const { jd, match } = matchContext;
  const candidateSkills = toNormalizedSet(
    (profile.skillsets || []).map((skill) => skill.name || ""),
  );
  const candidateCerts = toNormalizedSet(profile.certifications || []);

  const requiredSkills = uniqueTerms(jd.required_skills);
  const desiredSkills = uniqueTerms(jd.desired_skills);
  const requiredCerts = uniqueTerms(jd.required_certifications);
  const desiredCerts = uniqueTerms(jd.desired_certifications);

  const matchedRequiredSkills = requiredSkills.filter((skill) =>
    candidateSkills.has(normalizeText(skill)),
  );
  const missingRequiredSkills = requiredSkills.filter(
    (skill) => !candidateSkills.has(normalizeText(skill)),
  );
  const matchedDesiredSkills = desiredSkills.filter((skill) =>
    candidateSkills.has(normalizeText(skill)),
  );
  const missingDesiredSkills = desiredSkills.filter(
    (skill) => !candidateSkills.has(normalizeText(skill)),
  );

  const matchedRequiredCertifications = requiredCerts.filter((cert) =>
    candidateCerts.has(normalizeText(cert)),
  );
  const missingRequiredCertifications = requiredCerts.filter(
    (cert) => !candidateCerts.has(normalizeText(cert)),
  );
  const matchedDesiredCertifications = desiredCerts.filter((cert) =>
    candidateCerts.has(normalizeText(cert)),
  );
  const missingDesiredCertifications = desiredCerts.filter(
    (cert) => !candidateCerts.has(normalizeText(cert)),
  );

  const matchedChecks: string[] = [];
  const missingChecks: string[] = [];

  if (jd.required_clearance) {
    if (clearanceMeets(jd.required_clearance, profile.clearance_level)) {
      matchedChecks.push(
        `Clearance meets requirement (${profile.clearance_level || "None"} vs ${jd.required_clearance})`,
      );
    } else {
      missingChecks.push(
        `Clearance below requirement (needs ${jd.required_clearance}, has ${profile.clearance_level || "None"})`,
      );
    }
  }

  if (jd.min_experience_years != null) {
    const years = profile.years_of_experience;
    if (years != null && years >= jd.min_experience_years) {
      matchedChecks.push(
        `Experience meets minimum (${years}y vs ${jd.min_experience_years}y)`,
      );
    } else {
      missingChecks.push(
        `Experience below minimum (${years != null ? `${years}y` : "unknown"} vs ${jd.min_experience_years}y)`,
      );
    }
  }

  const requiredState = normalizeText(
    jd.location?.state || jd.location_state || null,
  );
  const remoteMode = normalizeText(jd.location?.remote || null);
  const candidateState = normalizeText(
    profile.location?.state || profile.location_state || null,
  );
  if (requiredState && remoteMode !== "remote") {
    if (candidateState && candidateState === requiredState) {
      matchedChecks.push(
        `Location aligned (${(jd.location?.state || jd.location_state || "").toUpperCase()})`,
      );
    } else {
      missingChecks.push(
        `Location mismatch (needs ${(jd.location?.state || jd.location_state || "").toUpperCase()}, has ${(profile.location?.state || profile.location_state || "unknown").toUpperCase()})`,
      );
    }
  }

  if (jd.job_title) {
    if (titleMatches(jd.job_title, profile.job_title)) {
      matchedChecks.push(
        `Job title aligned (${profile.job_title || "Unknown"})`,
      );
    } else {
      missingChecks.push(
        `Job title differs (needs ${jd.job_title}, has ${profile.job_title || "Unknown"})`,
      );
    }
  }

  const requiredIndustry = normalizeText(jd.industry_category || null);
  const candidateIndustry = normalizeText(profile.industry_category || null);
  if (requiredIndustry) {
    if (
      candidateIndustry &&
      (candidateIndustry === requiredIndustry ||
        candidateIndustry.includes(requiredIndustry) ||
        requiredIndustry.includes(candidateIndustry))
    ) {
      matchedChecks.push(
        `Industry aligned (${profile.industry_category || "Unknown"})`,
      );
    } else {
      missingChecks.push(
        `Industry differs (needs ${jd.industry_category || "Unknown"}, has ${profile.industry_category || "Unknown"})`,
      );
    }
  }

  return {
    score: match?.score ?? null,
    rationale: match?.rationale ?? null,
    matchedRequiredSkills,
    missingRequiredSkills,
    matchedDesiredSkills,
    missingDesiredSkills,
    matchedRequiredCertifications,
    missingRequiredCertifications,
    matchedDesiredCertifications,
    missingDesiredCertifications,
    matchedChecks,
    missingChecks,
  };
}

function profileToEditable(profile: TalentProfile): EditableProfile {
  const contact = profile.contact || {};
  const location = profile.location || {};
  return {
    name: profile.name || "",
    contact: {
      email: contact.email || "",
      phone: contact.phone || "",
      linkedin: contact.linkedin || "",
      github: contact.github || "",
    },
    summary: profile.summary || "",
    service_category: profile.service_category as ServiceCategory,
    industry_category: profile.industry_category || "",
    job_title: profile.job_title || "",
    clearance_level: profile.clearance_level || "",
    skillsets: (profile.skillsets || []).map((s) => ({ name: s.name })),
    certifications: [...(profile.certifications || [])],
    companies: (profile.companies || []).map((c) => ({ name: c.name })),
    location: {
      city: location.city || "",
      state: location.state || profile.location_state || "",
    },
    years_of_experience: profile.years_of_experience?.toString() || "",
    requested_salary: profile.requested_salary?.toString() || "",
    notes: profile.notes || "",
    tags: [...(profile.tags || [])],
    status: profile.status,
  };
}

export function ProfileDetailPanel({
  profile,
  onClose,
  onRefresh,
  onProfileUpdated,
  lookupTags = [],
  matchContext,
}: ProfileDetailPanelProps) {
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState<EditableProfile>(() =>
    profileToEditable(profile),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "history">("profile");

  // Reset edit data when profile changes
  useEffect(() => {
    setEditData(profileToEditable(profile));
    setActiveTab("profile");
  }, [profile]);

  const matchInsights = computeMatchInsights(profile, matchContext);

  const handleCancelEdit = () => {
    setEditData(profileToEditable(profile));
    setIsEditMode(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates: Parameters<typeof updateTalent>[1] = {};

      // Compare and add changed fields
      if (editData.name !== (profile.name || "")) {
        updates.name = editData.name;
      }
      if (editData.status !== profile.status) {
        updates.status = editData.status;
      }

      const newSalary = editData.requested_salary
        ? parseFloat(editData.requested_salary)
        : null;
      if (newSalary !== profile.requested_salary) {
        updates.requested_salary = newSalary;
      }

      // Contact
      const contactChanged =
        editData.contact.email !== (profile.contact.email || "") ||
        editData.contact.phone !== (profile.contact.phone || "") ||
        editData.contact.linkedin !== (profile.contact.linkedin || "") ||
        editData.contact.github !== (profile.contact.github || "");
      if (contactChanged) {
        updates.contact = {
          email: editData.contact.email || null,
          phone: editData.contact.phone || null,
          linkedin: editData.contact.linkedin || null,
          github: editData.contact.github || null,
        };
      }

      if (editData.summary !== (profile.summary || "")) {
        updates.summary = editData.summary || null;
      }

      if (editData.service_category !== (profile.service_category as string)) {
        updates.service_category = editData.service_category;
      }

      if (editData.industry_category !== (profile.industry_category || "")) {
        updates.industry_category = editData.industry_category;
      }

      if (editData.job_title !== (profile.job_title || "")) {
        updates.job_title = editData.job_title;
      }

      const newClearance = editData.clearance_level || null;
      if (newClearance !== profile.clearance_level) {
        updates.clearance_level = newClearance;
      }

      // Skillsets - compare names only
      const oldSkillNames = profile.skillsets
        .map((s) => s.name)
        .sort()
        .join(",");
      const newSkillNames = editData.skillsets
        .map((s) => s.name)
        .filter((n) => n.trim())
        .sort()
        .join(",");
      if (newSkillNames !== oldSkillNames) {
        updates.skillsets = editData.skillsets
          .filter((s) => s.name.trim())
          .map((s) => ({ name: s.name.trim() }));
      }

      // Certifications
      const oldCerts = [...profile.certifications].sort().join(",");
      const newCerts = editData.certifications
        .filter((c) => c.trim())
        .sort()
        .join(",");
      if (newCerts !== oldCerts) {
        updates.certifications = editData.certifications.filter((c) =>
          c.trim(),
        );
      }

      // Companies - compare names only
      const oldCompanyNames = profile.companies
        .map((c) => c.name)
        .sort()
        .join(",");
      const newCompanyNames = editData.companies
        .map((c) => c.name)
        .filter((n) => n.trim())
        .sort()
        .join(",");
      if (newCompanyNames !== oldCompanyNames) {
        updates.companies = editData.companies
          .filter((c) => c.name.trim())
          .map((c) => ({ name: c.name.trim() }));
      }

      // Location
      const locationChanged =
        editData.location.city !== (profile.location.city || "") ||
        editData.location.state !==
          (profile.location.state || profile.location_state || "");
      if (locationChanged) {
        updates.location = {
          city: editData.location.city || null,
          state: editData.location.state || null,
        };
      }

      const newYoe = editData.years_of_experience
        ? parseInt(editData.years_of_experience, 10)
        : null;
      if (newYoe !== profile.years_of_experience) {
        updates.years_of_experience = newYoe;
      }

      if (editData.notes !== (profile.notes || "")) {
        updates.notes = editData.notes;
      }

      const oldTags = [...(profile.tags || [])].sort().join(",");
      const newTags = editData.tags
        .filter((t) => t.trim())
        .sort()
        .join(",");
      if (newTags !== oldTags) {
        updates.tags = editData.tags.filter((t) => t.trim());
      }

      if (Object.keys(updates).length > 0) {
        const updatedProfile = await updateTalent(profile.pk, updates);
        onProfileUpdated?.(updatedProfile);
        await onRefresh();
        setIsEditMode(false);
      } else {
        setIsEditMode(false);
      }
    } catch (error) {
      console.error("Failed to save:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteTalent(profile.pk);
      await onRefresh();
      onClose();
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete profile. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleViewResume = async () => {
    if (!profile.key) return;

    setResumeLoading(true);
    try {
      const { url } = await getResumeUrl(profile.key);
      const isDocx =
        profile.key.toLowerCase().endsWith(".docx") ||
        profile.key.toLowerCase().endsWith(".doc");

      if (isDocx) {
        setResumeUrl(
          `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`,
        );
      } else {
        setResumeUrl(url);
      }
      setShowResume(true);
    } catch (error) {
      console.error("Failed to get resume URL:", error);
      alert("Failed to load resume. Please try again.");
    } finally {
      setResumeLoading(false);
    }
  };

  // Array field helpers
  const addSkill = () => {
    setEditData((prev) => ({
      ...prev,
      skillsets: [...prev.skillsets, { name: "" }],
    }));
  };

  const removeSkill = (index: number) => {
    setEditData((prev) => ({
      ...prev,
      skillsets: prev.skillsets.filter((_, i) => i !== index),
    }));
  };

  const updateSkill = (index: number, name: string) => {
    setEditData((prev) => ({
      ...prev,
      skillsets: prev.skillsets.map((s, i) => (i === index ? { name } : s)),
    }));
  };

  const addCertification = () => {
    setEditData((prev) => ({
      ...prev,
      certifications: [...prev.certifications, ""],
    }));
  };

  const removeCertification = (index: number) => {
    setEditData((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index),
    }));
  };

  const updateCertification = (index: number, value: string) => {
    setEditData((prev) => ({
      ...prev,
      certifications: prev.certifications.map((c, i) =>
        i === index ? value : c,
      ),
    }));
  };

  const addCompany = () => {
    setEditData((prev) => ({
      ...prev,
      companies: [...prev.companies, { name: "" }],
    }));
  };

  const removeCompany = (index: number) => {
    setEditData((prev) => ({
      ...prev,
      companies: prev.companies.filter((_, i) => i !== index),
    }));
  };

  const updateCompany = (index: number, name: string) => {
    setEditData((prev) => ({
      ...prev,
      companies: prev.companies.map((c, i) => (i === index ? { name } : c)),
    }));
  };

  // Resume viewer — side-by-side split layout: resume left, profile right (editable)
  if (showResume && resumeUrl) {
    return (
      <div className="fixed inset-y-0 right-0 w-full bg-white/95 dark:bg-slate-800/95 backdrop-blur-lg border-l border-black/10 dark:border-white/10 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Top bar */}
        <div className="flex-none bg-white/95 dark:bg-slate-800/95 backdrop-blur-lg border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-linear-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-black/10 dark:border-white/10 text-foreground font-semibold text-sm">
              {(profile.name || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {profile.name || "Unknown"}
              </h2>
              <p className="text-xs text-foreground/40">
                Resume &middot;{" "}
                {profile.job_title || profile.industry_category || "Candidate"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResume(false)}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors text-sm font-medium flex items-center gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Back to Profile
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-foreground/60 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Split content: resume (left) + editable profile (right) */}
        <div className="flex-1 flex min-h-0">
          {/* Resume iframe — takes majority of space */}
          <div className="flex-1 bg-white dark:bg-slate-900 border-r border-black/10 dark:border-white/10">
            <iframe
              src={resumeUrl}
              className="w-full h-full border-0"
              title={`Resume - ${profile.name || "Unknown"}`}
            />
          </div>
          {/* Editable profile sidebar */}
          <div className="w-96 shrink-0 overflow-y-auto bg-white/50 dark:bg-slate-800/50">
            <div className="p-4 space-y-4">
              {/* Edit toggle + status header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={isEditMode ? editData.status : profile.status}
                  />
                  <ClearanceBadge
                    level={
                      (isEditMode
                        ? editData.clearance_level
                        : profile.clearance_level) as ClearanceLevel
                    }
                  />
                </div>
                {!isEditMode ? (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-foreground/50 hover:text-indigo-500"
                    title="Edit profile"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-2 py-1 rounded-md bg-green-500/20 border border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/30 transition-colors text-xs font-medium disabled:opacity-50"
                    >
                      {isSaving ? "…" : "Save"}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-foreground/50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Name */}
              {isEditMode ? (
                <Input
                  value={editData.name}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-sm font-semibold"
                  placeholder="Full name"
                />
              ) : (
                <h3 className="text-base font-bold text-foreground">
                  {profile.name || "Unknown"}
                </h3>
              )}

              {/* Status (edit only) */}
              {isEditMode && (
                <div className="space-y-1">
                  <Label className="text-foreground/50 text-[10px]">
                    Status
                  </Label>
                  <Select
                    value={editData.status}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        status: e.target.value as CandidateStatus,
                      }))
                    }
                    className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                    options={CANDIDATE_STATUSES}
                  />
                </div>
              )}

              {/* Summary */}
              {isEditMode ? (
                <div className="space-y-1">
                  <Label className="text-foreground/50 text-[10px]">
                    Summary
                  </Label>
                  <textarea
                    value={editData.summary}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        summary: e.target.value,
                      }))
                    }
                    rows={4}
                    className="w-full px-2 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground text-xs placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                    placeholder="Professional summary"
                  />
                </div>
              ) : profile.summary ? (
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-3 border border-black/5 dark:border-white/5">
                  <p className="text-foreground/70 text-xs leading-relaxed italic line-clamp-6">
                    &ldquo;{profile.summary}&rdquo;
                  </p>
                </div>
              ) : null}

              {/* Notes & Tags */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider flex items-center gap-1">
                  <FileText className="h-2.5 w-2.5" /> Notes
                </h4>
                {isEditMode ? (
                  <textarea
                    value={editData.notes}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full px-2 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground text-xs placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                    placeholder="Internal notes..."
                  />
                ) : (
                  <p className="text-xs text-foreground/50 line-clamp-3">
                    {profile.notes || (
                      <span className="italic text-foreground/30">
                        No notes
                      </span>
                    )}
                  </p>
                )}

                {/* Tags */}
                <h4 className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider flex items-center gap-1 pt-1">
                  <Plus className="h-2.5 w-2.5" /> Tags
                </h4>
                {isEditMode ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {editData.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] border border-purple-500/20"
                        >
                          {tag}
                          <button
                            onClick={() =>
                              setEditData((prev) => ({
                                ...prev,
                                tags: prev.tags.filter((_, j) => j !== i),
                              }))
                            }
                            className="hover:text-foreground ml-0.5"
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      list={`tags-datalist-${profile.pk.replace(/[^a-zA-Z0-9-_]/g, "-")}`}
                      placeholder="Select or type new tag…"
                      className="flex h-8 w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-2 py-1.5 text-xs text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = (
                            e.target as HTMLInputElement
                          ).value.trim();
                          if (val && !editData.tags.includes(val)) {
                            setEditData((prev) => ({
                              ...prev,
                              tags: [...prev.tags, val],
                            }));
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (
                          lookupTags.includes(val) &&
                          !editData.tags.includes(val)
                        ) {
                          setEditData((prev) => ({
                            ...prev,
                            tags: [...prev.tags, val],
                          }));
                          e.target.value = "";
                        }
                      }}
                    />
                    <datalist
                      id={`tags-datalist-${profile.pk.replace(/[^a-zA-Z0-9-_]/g, "-")}`}
                    >
                      {lookupTags
                        .filter((t) => !editData.tags.includes(t))
                        .map((t) => (
                          <option key={t} value={t} />
                        ))}
                    </datalist>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
                    {profile.tags && profile.tags.length > 0 ? (
                      profile.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="italic text-[10px] text-foreground/30">
                        No tags
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Contact & details */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
                  Details
                </h4>
                {isEditMode ? (
                  <div className="space-y-2">
                    <Input
                      value={editData.job_title}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          job_title: e.target.value,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                      placeholder="Job title"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="email"
                        value={editData.contact.email}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            contact: { ...prev.contact, email: e.target.value },
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                        placeholder="Email"
                      />
                      <Input
                        type="tel"
                        value={editData.contact.phone}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            contact: { ...prev.contact, phone: e.target.value },
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                        placeholder="Phone"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={editData.location.city}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            location: {
                              ...prev.location,
                              city: e.target.value,
                            },
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                        placeholder="City"
                      />
                      <Select
                        value={editData.location.state}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            location: {
                              ...prev.location,
                              state: e.target.value,
                            },
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                        options={[{ value: "", label: "State" }, ...US_STATES]}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={editData.years_of_experience}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            years_of_experience: e.target.value,
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                        placeholder="Years exp."
                      />
                      <Input
                        type="number"
                        min="0"
                        step="1000"
                        value={editData.requested_salary}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            requested_salary: e.target.value,
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                        placeholder="Salary $/yr"
                      />
                    </div>
                    <Select
                      value={editData.service_category}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          service_category: e.target.value as ServiceCategory,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                      options={SERVICE_CATEGORIES}
                    />
                    <Input
                      value={editData.industry_category}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          industry_category: e.target.value,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                      placeholder="Industry category"
                    />
                    <Select
                      value={editData.clearance_level}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          clearance_level: e.target.value,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                      options={[
                        { value: "", label: "No clearance" },
                        ...CLEARANCE_LEVELS,
                      ]}
                    />
                    <Input
                      value={editData.contact.linkedin}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          contact: {
                            ...prev.contact,
                            linkedin: e.target.value,
                          },
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                      placeholder="LinkedIn URL"
                    />
                    <Input
                      value={editData.contact.github}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          contact: { ...prev.contact, github: e.target.value },
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs"
                      placeholder="GitHub URL"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 text-xs">
                    {profile.job_title && (
                      <div className="flex items-center gap-2 text-foreground/70">
                        <Briefcase className="h-3 w-3 text-foreground/30 shrink-0" />
                        <span className="truncate">{profile.job_title}</span>
                      </div>
                    )}
                    {(profile.location?.city || profile.location_state) && (
                      <div className="flex items-center gap-2 text-foreground/70">
                        <MapPin className="h-3 w-3 text-foreground/30 shrink-0" />
                        <span className="truncate">
                          {profile.location?.city
                            ? `${profile.location.city}, `
                            : ""}
                          {profile.location_state}
                        </span>
                      </div>
                    )}
                    {profile.contact?.email && (
                      <div className="flex items-center gap-2 text-foreground/70">
                        <Mail className="h-3 w-3 text-foreground/30 shrink-0" />
                        <span className="truncate">
                          {profile.contact.email}
                        </span>
                      </div>
                    )}
                    {profile.contact?.phone && (
                      <div className="flex items-center gap-2 text-foreground/70">
                        <Phone className="h-3 w-3 text-foreground/30 shrink-0" />
                        <span>{profile.contact.phone}</span>
                      </div>
                    )}
                    {profile.years_of_experience && (
                      <div className="flex items-center gap-2 text-foreground/70">
                        <Clock className="h-3 w-3 text-foreground/30 shrink-0" />
                        <span>
                          {profile.years_of_experience} years experience
                        </span>
                      </div>
                    )}
                    {profile.requested_salary && (
                      <div className="flex items-center gap-2 text-foreground/70">
                        <DollarSign className="h-3 w-3 text-foreground/30 shrink-0" />
                        <span className="text-emerald-500 font-medium">
                          ${profile.requested_salary.toLocaleString()}/yr
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Skills */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
                    Skills
                  </h4>
                  {isEditMode && (
                    <button
                      onClick={addSkill}
                      className="p-0.5 rounded text-indigo-500 hover:bg-indigo-500/10 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {isEditMode ? (
                  <div className="space-y-1">
                    {editData.skillsets.map((skill, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input
                          value={skill.name}
                          onChange={(e) => updateSkill(i, e.target.value)}
                          className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs flex-1"
                          placeholder="Skill"
                        />
                        <button
                          onClick={() => removeSkill(i)}
                          className="p-1 text-red-400 hover:text-red-500 transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {profile.skillsets.slice(0, 12).map((skill, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                      >
                        {skill.name}
                      </span>
                    ))}
                    {profile.skillsets.length > 12 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] text-foreground/40">
                        +{profile.skillsets.length - 12} more
                      </span>
                    )}
                    {profile.skillsets.length === 0 && (
                      <span className="text-foreground/30 text-[10px] italic">
                        None
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Certifications */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
                    Certifications
                  </h4>
                  {isEditMode && (
                    <button
                      onClick={addCertification}
                      className="p-0.5 rounded text-amber-500 hover:bg-amber-500/10 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {isEditMode ? (
                  <div className="space-y-1">
                    {editData.certifications.map((cert, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input
                          value={cert}
                          onChange={(e) =>
                            updateCertification(i, e.target.value)
                          }
                          className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs flex-1"
                          placeholder="Certification"
                        />
                        <button
                          onClick={() => removeCertification(i)}
                          className="p-1 text-red-400 hover:text-red-500 transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {profile.certifications.slice(0, 8).map((cert, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                      >
                        {cert}
                      </span>
                    ))}
                    {profile.certifications.length > 8 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] text-foreground/40">
                        +{profile.certifications.length - 8} more
                      </span>
                    )}
                    {profile.certifications.length === 0 && (
                      <span className="text-foreground/30 text-[10px] italic">
                        None
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Work history */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
                    Work History
                  </h4>
                  {isEditMode && (
                    <button
                      onClick={addCompany}
                      className="p-0.5 rounded text-amber-500 hover:bg-amber-500/10 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {isEditMode ? (
                  <div className="space-y-1">
                    {editData.companies.map((c, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input
                          value={c.name}
                          onChange={(e) => updateCompany(i, e.target.value)}
                          className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground text-xs flex-1"
                          placeholder="Company"
                        />
                        <button
                          onClick={() => removeCompany(i)}
                          className="p-1 text-red-400 hover:text-red-500 transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : profile.companies.length > 0 ? (
                  <div className="space-y-1 text-xs text-foreground/60">
                    {profile.companies.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Building className="h-3 w-3 text-foreground/25 shrink-0" />
                        <span className="truncate">{c.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-foreground/30 text-[10px] italic">
                    None
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white/98 dark:bg-slate-800/98 backdrop-blur-2xl border-l border-black/10 dark:border-white/10 shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
      {/* Gradient accent */}
      <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-indigo-500/50 via-purple-500/50 to-transparent" />

      {/* Header */}
      <div className="sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-linear-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-black/10 dark:border-white/10 text-foreground font-semibold">
            {(profile.name || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isEditMode
                ? "Edit Profile"
                : activeTab === "history"
                  ? "Candidate History"
                  : "Profile Details"}
            </h2>
            <p className="text-xs text-foreground/40">
              {activeTab === "history"
                ? profile.name || profile.key
                : profile.job_title || profile.industry_category}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditMode && activeTab === "profile" && (
            <button
              onClick={() => {
                setActiveTab("profile");
                setIsEditMode(true);
              }}
              className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-foreground/60 hover:text-indigo-600 dark:text-indigo-400"
              title="Edit profile"
            >
              <Edit3 className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-foreground/60 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {!isEditMode && (
          <div className="inline-flex items-center rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-1">
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "profile"
                  ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "history"
                  ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              History
            </button>
          </div>
        )}

        {activeTab === "history" && !isEditMode ? (
          <ProfileHistory pk={profile.pk} />
        ) : (
          <>
            {/* Edit Mode Header Actions */}
            {isEditMode && (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-linear-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-600 dark:text-green-400 hover:from-green-500/30 hover:to-emerald-500/30 transition-all disabled:opacity-50 font-medium"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground/60 hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground transition-all font-medium"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Basic Info Section */}
            <div className="space-y-4">
              {isEditMode ? (
                <>
                  {/* Name */}
                  <div className="space-y-2">
                    <Label className="text-foreground/60">Name</Label>
                    <Input
                      value={editData.name}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      placeholder="Full name"
                    />
                  </div>

                  {/* Status */}
                  <div className="space-y-2">
                    <Label className="text-foreground/60">Status</Label>
                    <Select
                      value={editData.status}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          status: e.target.value as CandidateStatus,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      options={CANDIDATE_STATUSES}
                    />
                  </div>

                  {/* Summary */}
                  <div className="space-y-2">
                    <Label className="text-foreground/60">Summary</Label>
                    <textarea
                      value={editData.summary}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          summary: e.target.value,
                        }))
                      }
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none"
                      placeholder="Brief professional summary"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-foreground mb-1">
                        {profile.name || "Unknown"}
                      </h3>
                      <StatusBadge status={profile.status} />
                    </div>
                  </div>
                  {profile.summary && (
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5">
                      <p className="text-foreground/70 text-sm leading-relaxed italic">
                        &ldquo;{profile.summary}&rdquo;
                      </p>
                    </div>
                  )}
                </>
              )}

              {!isEditMode && matchInsights && (
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] dark:bg-indigo-500/[0.08] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        Match Breakdown
                      </h4>
                      <p className="text-xs text-foreground/60 mt-0.5">
                        What aligns and what is missing against this job
                        description.
                      </p>
                    </div>
                    {matchInsights.score != null && (
                      <span className="inline-flex items-center rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        Score {matchInsights.score}
                      </span>
                    )}
                  </div>

                  {matchInsights.rationale && (
                    <p className="text-xs text-foreground/70 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg p-2.5">
                      {matchInsights.rationale}
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Matching
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {matchInsights.matchedRequiredSkills.map((skill) => (
                          <span
                            key={`matched-required-skill-${skill}`}
                            className="px-2 py-0.5 rounded text-[11px] border bg-emerald-500/15 border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                          >
                            Skill: {skill}
                          </span>
                        ))}
                        {matchInsights.matchedRequiredCertifications.map(
                          (cert) => (
                            <span
                              key={`matched-required-cert-${cert}`}
                              className="px-2 py-0.5 rounded text-[11px] border bg-emerald-500/15 border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                            >
                              Cert: {cert}
                            </span>
                          ),
                        )}
                        {matchInsights.matchedChecks.map((check) => (
                          <span
                            key={`matched-check-${check}`}
                            className="px-2 py-0.5 rounded text-[11px] border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          >
                            {check}
                          </span>
                        ))}
                        {matchInsights.matchedRequiredSkills.length === 0 &&
                          matchInsights.matchedRequiredCertifications.length ===
                            0 &&
                          matchInsights.matchedChecks.length === 0 && (
                            <p className="text-xs text-foreground/40 italic">
                              No strong matches found yet.
                            </p>
                          )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                        Not Matching
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {matchInsights.missingRequiredSkills.map((skill) => (
                          <span
                            key={`missing-required-skill-${skill}`}
                            className="px-2 py-0.5 rounded text-[11px] border bg-red-500/15 border-red-500/25 text-red-700 dark:text-red-300"
                          >
                            Missing skill: {skill}
                          </span>
                        ))}
                        {matchInsights.missingRequiredCertifications.map(
                          (cert) => (
                            <span
                              key={`missing-required-cert-${cert}`}
                              className="px-2 py-0.5 rounded text-[11px] border bg-red-500/15 border-red-500/25 text-red-700 dark:text-red-300"
                            >
                              Missing cert: {cert}
                            </span>
                          ),
                        )}
                        {matchInsights.missingChecks.map((check) => (
                          <span
                            key={`missing-check-${check}`}
                            className="px-2 py-0.5 rounded text-[11px] border bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300"
                          >
                            {check}
                          </span>
                        ))}
                        {matchInsights.missingRequiredSkills.length === 0 &&
                          matchInsights.missingRequiredCertifications.length ===
                            0 &&
                          matchInsights.missingChecks.length === 0 && (
                            <p className="text-xs text-foreground/40 italic">
                              No required mismatches.
                            </p>
                          )}
                      </div>
                    </div>
                  </div>

                  {(matchInsights.matchedDesiredSkills.length > 0 ||
                    matchInsights.missingDesiredSkills.length > 0 ||
                    matchInsights.matchedDesiredCertifications.length > 0 ||
                    matchInsights.missingDesiredCertifications.length > 0) && (
                    <div className="pt-1 border-t border-indigo-500/20 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        Desired Criteria
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {matchInsights.matchedDesiredSkills.map((skill) => (
                          <span
                            key={`matched-desired-skill-${skill}`}
                            className="px-2 py-0.5 rounded text-[11px] border bg-indigo-500/15 border-indigo-500/25 text-indigo-700 dark:text-indigo-300"
                          >
                            Desired skill met: {skill}
                          </span>
                        ))}
                        {matchInsights.matchedDesiredCertifications.map(
                          (cert) => (
                            <span
                              key={`matched-desired-cert-${cert}`}
                              className="px-2 py-0.5 rounded text-[11px] border bg-indigo-500/15 border-indigo-500/25 text-indigo-700 dark:text-indigo-300"
                            >
                              Desired cert met: {cert}
                            </span>
                          ),
                        )}
                        {matchInsights.missingDesiredSkills.map((skill) => (
                          <span
                            key={`missing-desired-skill-${skill}`}
                            className="px-2 py-0.5 rounded text-[11px] border bg-amber-500/15 border-amber-500/25 text-amber-700 dark:text-amber-300"
                          >
                            Desired skill missing: {skill}
                          </span>
                        ))}
                        {matchInsights.missingDesiredCertifications.map(
                          (cert) => (
                            <span
                              key={`missing-desired-cert-${cert}`}
                              className="px-2 py-0.5 rounded text-[11px] border bg-amber-500/15 border-amber-500/25 text-amber-700 dark:text-amber-300"
                            >
                              Desired cert missing: {cert}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* View Resume Button */}
              {profile.key && !isEditMode && (
                <button
                  onClick={handleViewResume}
                  disabled={resumeLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-linear-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:from-indigo-500/30 hover:to-purple-500/30 transition-all disabled:opacity-50 font-medium"
                >
                  <FileText className="h-4 w-4" />
                  {resumeLoading ? "Loading Resume..." : "View Original Resume"}
                  <ExternalLink className="h-3.5 w-3.5 ml-1 opacity-50" />
                </button>
              )}
            </div>

            {/* Notes & Tags (positioned high for recruiter visibility) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-green-500/20 rounded-lg">
                  <FileText className="h-3.5 w-3.5 text-green-400" />
                </div>
                <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  Recruiter Notes
                </h4>
              </div>

              {isEditMode ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">Notes</Label>
                    <textarea
                      value={editData.notes}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none"
                      placeholder="Internal notes about this candidate..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">Tags</Label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editData.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs border border-purple-500/30"
                        >
                          {tag}
                          <button
                            onClick={() =>
                              setEditData((prev) => ({
                                ...prev,
                                tags: prev.tags.filter((_, j) => j !== i),
                              }))
                            }
                            className="hover:text-foreground ml-0.5"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        list={`tags-datalist-full-${profile.pk.replace(/[^a-zA-Z0-9-_]/g, "-")}`}
                        placeholder="Select or type new tag…"
                        className="flex h-9 w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 text-sm text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = (
                              e.target as HTMLInputElement
                            ).value.trim();
                            if (val && !editData.tags.includes(val)) {
                              setEditData((prev) => ({
                                ...prev,
                                tags: [...prev.tags, val],
                              }));
                              (e.target as HTMLInputElement).value = "";
                            }
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (
                            lookupTags.includes(val) &&
                            !editData.tags.includes(val)
                          ) {
                            setEditData((prev) => ({
                              ...prev,
                              tags: [...prev.tags, val],
                            }));
                            e.target.value = "";
                          }
                        }}
                      />
                    </div>
                    <datalist
                      id={`tags-datalist-full-${profile.pk.replace(/[^a-zA-Z0-9-_]/g, "-")}`}
                    >
                      {lookupTags
                        .filter((t) => !editData.tags.includes(t))
                        .map((t) => (
                          <option key={t} value={t} />
                        ))}
                    </datalist>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.notes ? (
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5">
                      <p className="text-foreground/70 text-sm whitespace-pre-wrap">
                        {profile.notes}
                      </p>
                    </div>
                  ) : (
                    <p className="text-foreground/30 text-sm italic">
                      No notes yet
                    </p>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-1.5">
                      Tags
                    </p>
                    {profile.tags && profile.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.tags.map((tag, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-foreground/30 text-sm italic">
                        No tags
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Possible Duplicate Warning */}
            {!isEditMode && profile.possible_duplicate_of && (
              <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/30">
                <p className="text-amber-700 dark:text-amber-300 text-sm font-medium mb-1">
                  ⚠ Possible duplicate of another candidate
                </p>
                <p className="text-amber-600/70 dark:text-amber-400/70 text-xs mb-3 break-all">
                  {profile.possible_duplicate_of}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const original = await getTalent(
                          profile.possible_duplicate_of!,
                        );
                        onProfileUpdated?.(original);
                      } catch {
                        alert("Could not load the original profile.");
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                  >
                    View Original
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !confirm(
                          "Delete this profile and keep the original? This cannot be undone.",
                        )
                      )
                        return;
                      try {
                        await deleteTalent(profile.pk);
                        onClose();
                        await onRefresh();
                      } catch {
                        alert("Failed to delete this profile.");
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    Delete This
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const updated = await updateTalent(profile.pk, {
                          dismiss_duplicate: true,
                        });
                        onProfileUpdated?.(updated);
                      } catch {
                        alert("Failed to dismiss duplicate flag.");
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
                  >
                    Not a Duplicate
                  </button>
                </div>
              </div>
            )}

            {/* Contact Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/20 rounded-lg">
                  <Mail className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  Contact Information
                </h4>
              </div>

              {isEditMode ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">Email</Label>
                    <Input
                      type="email"
                      value={editData.contact.email}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          contact: { ...prev.contact, email: e.target.value },
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">Phone</Label>
                    <Input
                      type="tel"
                      value={editData.contact.phone}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          contact: { ...prev.contact, phone: e.target.value },
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">
                      LinkedIn
                    </Label>
                    <Input
                      value={editData.contact.linkedin}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          contact: {
                            ...prev.contact,
                            linkedin: e.target.value,
                          },
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      placeholder="linkedin.com/in/username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">GitHub</Label>
                    <Input
                      value={editData.contact.github}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          contact: { ...prev.contact, github: e.target.value },
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      placeholder="github.com/username"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-foreground/60 text-xs">City</Label>
                      <Input
                        value={editData.location.city}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            location: {
                              ...prev.location,
                              city: e.target.value,
                            },
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground/60 text-xs">
                        State
                      </Label>
                      <Select
                        value={editData.location.state}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            location: {
                              ...prev.location,
                              state: e.target.value,
                            },
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                        options={[
                          { value: "", label: "Select state" },
                          ...US_STATES,
                        ]}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 divide-y divide-black/5 dark:divide-white/5">
                  {profile.contact.email && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Mail className="h-4 w-4 text-foreground/30" />
                      <a
                        href={`mailto:${profile.contact.email}`}
                        className="text-foreground/80 hover:text-indigo-600 dark:text-indigo-400 transition-colors flex-1 truncate"
                      >
                        {profile.contact.email}
                      </a>
                    </div>
                  )}
                  {profile.contact.phone && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Phone className="h-4 w-4 text-foreground/30" />
                      <span className="text-foreground/80">
                        {profile.contact.phone}
                      </span>
                    </div>
                  )}
                  {profile.contact.linkedin && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Linkedin className="h-4 w-4 text-foreground/30" />
                      <a
                        href={`https://${profile.contact.linkedin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground/80 hover:text-indigo-600 dark:text-indigo-400 transition-colors flex-1 truncate"
                      >
                        {profile.contact.linkedin}
                      </a>
                    </div>
                  )}
                  {profile.contact.github && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Github className="h-4 w-4 text-foreground/30" />
                      <a
                        href={`https://${profile.contact.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground/80 hover:text-indigo-600 dark:text-indigo-400 transition-colors flex-1 truncate"
                      >
                        {profile.contact.github}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <MapPin className="h-4 w-4 text-foreground/30" />
                    <span className="text-foreground/80">
                      {profile.location.city
                        ? `${profile.location.city}, `
                        : ""}
                      {US_STATES.find((s) => s.value === profile.location_state)
                        ?.label || profile.location_state}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Professional Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-500/20 rounded-lg">
                  <Briefcase className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                  Professional Details
                </h4>
              </div>

              {isEditMode ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">
                      Service Category
                    </Label>
                    <Select
                      value={editData.service_category}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          service_category: e.target.value as ServiceCategory,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      options={SERVICE_CATEGORIES}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">
                      Industry Category
                    </Label>
                    <Input
                      value={editData.industry_category}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          industry_category: e.target.value,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      placeholder="e.g. Healthcare, Government"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">
                      Job Title
                    </Label>
                    <Input
                      value={editData.job_title}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          job_title: e.target.value,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      placeholder="e.g. Senior Software Engineer"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-foreground/60 text-xs">
                        Years of Experience
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={editData.years_of_experience}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            years_of_experience: e.target.value,
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                        placeholder="Years"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground/60 text-xs">
                        Requested Salary ($/yr)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="1000"
                        value={editData.requested_salary}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            requested_salary: e.target.value,
                          }))
                        }
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                        placeholder="Annual salary"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground/60 text-xs">
                      Clearance Level
                    </Label>
                    <Select
                      value={editData.clearance_level}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          clearance_level: e.target.value,
                        }))
                      }
                      className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground"
                      options={[
                        { value: "", label: "None" },
                        ...CLEARANCE_LEVELS,
                      ]}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-foreground/50 text-xs mb-2">
                        <Briefcase className="h-3.5 w-3.5" />
                        <span>Job Title</span>
                      </div>
                      <p className="text-foreground font-semibold text-sm">
                        {profile.job_title || "—"}
                      </p>
                      <p className="text-foreground/40 text-xs mt-1">
                        {profile.service_category}
                      </p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-foreground/50 text-xs mb-2">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Experience</span>
                      </div>
                      <p className="text-foreground font-semibold">
                        {profile.years_of_experience
                          ? `${profile.years_of_experience} years`
                          : "Not specified"}
                      </p>
                    </div>
                  </div>
                  {profile.industry_category && (
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-foreground/50 text-xs mb-2">
                        <Briefcase className="h-3.5 w-3.5" />
                        <span>Industry</span>
                      </div>
                      <p className="text-foreground font-semibold text-sm">
                        {profile.industry_category}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-foreground/50 text-xs mb-2">
                        <Shield className="h-3.5 w-3.5" />
                        <span>Clearance</span>
                      </div>
                      {profile.clearance_level ? (
                        <ClearanceBadge level={profile.clearance_level} />
                      ) : (
                        <span className="text-foreground/40 text-sm">None</span>
                      )}
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2 text-foreground/50 text-xs mb-2">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>Requested Salary</span>
                      </div>
                      {profile.requested_salary ? (
                        <p className="text-emerald-400 font-semibold">
                          ${profile.requested_salary.toLocaleString()}
                          <span className="text-foreground/40 font-normal">
                            /yr
                          </span>
                        </p>
                      ) : (
                        <span className="text-foreground/40 text-sm">
                          Not set
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Companies */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/20 rounded-lg">
                    <Building className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Work History
                  </h4>
                </div>
                {isEditMode && (
                  <button
                    onClick={addCompany}
                    className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isEditMode ? (
                <div className="space-y-2">
                  {editData.companies.map((company, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={company.name}
                        onChange={(e) => updateCompany(i, e.target.value)}
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground flex-1"
                        placeholder="Company name"
                      />
                      <button
                        onClick={() => removeCompany(i)}
                        className="p-2 rounded-lg text-red-600 dark:text-red-400/60 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {editData.companies.length === 0 && (
                    <p className="text-foreground/40 text-sm">
                      No companies added
                    </p>
                  )}
                </div>
              ) : profile.companies.length > 0 ? (
                <div className="bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 divide-y divide-black/5 dark:divide-white/5">
                  {profile.companies.map((company, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <Building className="h-4 w-4 text-foreground/30" />
                      <span className="text-foreground/80">{company.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-foreground/40 text-sm">
                  No work history listed
                </p>
              )}
            </div>

            {/* Skills */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/20 rounded-lg">
                    <Award className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Skills & Expertise
                  </h4>
                </div>
                {isEditMode && (
                  <button
                    onClick={addSkill}
                    className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/30 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isEditMode ? (
                <div className="space-y-2">
                  {editData.skillsets.map((skill, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={skill.name}
                        onChange={(e) => updateSkill(i, e.target.value)}
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground flex-1"
                        placeholder="Skill name"
                      />
                      <button
                        onClick={() => removeSkill(i)}
                        className="p-2 rounded-lg text-red-600 dark:text-red-400/60 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {editData.skillsets.length === 0 && (
                    <p className="text-foreground/40 text-sm">
                      No skills added
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile.skillsets.map((skill, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
                    >
                      {skill.name}
                    </Badge>
                  ))}
                  {profile.skillsets.length === 0 && (
                    <span className="text-foreground/40 text-sm">
                      No skills listed
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Certifications */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/20 rounded-lg">
                    <Award className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Certifications
                  </h4>
                </div>
                {isEditMode && (
                  <button
                    onClick={addCertification}
                    className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isEditMode ? (
                <div className="space-y-2">
                  {editData.certifications.map((cert, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={cert}
                        onChange={(e) => updateCertification(i, e.target.value)}
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-foreground flex-1"
                        placeholder="Certification name"
                      />
                      <button
                        onClick={() => removeCertification(i)}
                        className="p-2 rounded-lg text-red-600 dark:text-red-400/60 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {editData.certifications.length === 0 && (
                    <p className="text-foreground/40 text-sm">
                      No certifications added
                    </p>
                  )}
                </div>
              ) : profile.certifications.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.certifications.map((cert, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                    >
                      <Award className="h-3 w-3 mr-1" />
                      {cert}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-foreground/40 text-sm">
                  No certifications listed
                </p>
              )}
            </div>

            {/* Metadata (view mode only) */}
            {!isEditMode && (
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-500/20 rounded-lg">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Record Info
                  </h4>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 divide-y divide-black/5 dark:divide-white/5 text-sm">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-foreground/40">Date received</span>
                    <span className="text-foreground/70">
                      {new Date(profile.date_received).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-foreground/40">Last updated</span>
                    <span className="text-foreground/70">
                      {new Date(profile.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-foreground/40">Profile ID</span>
                    <span className="text-foreground/50 font-mono text-xs truncate max-w-[180px]">
                      {profile.key}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Section (view mode only) */}
            {!isEditMode && (
              <div className="pt-4 border-t border-white/10">
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400/80 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-600 dark:text-red-400 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Profile
                  </button>
                ) : (
                  <div className="space-y-3 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <Trash2 className="h-4 w-4" />
                      <p className="text-sm font-medium">
                        Delete this profile?
                      </p>
                    </div>
                    <p className="text-red-300/70 text-sm">
                      This action cannot be undone. The candidate record will be
                      permanently removed.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground/60 hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground transition-all text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/30 border border-red-500/40 text-red-300 hover:bg-red-500/40 transition-all text-sm font-medium disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting..." : "Yes, Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
