import { useState, useMemo } from "react"
import {
  Search,
  Users,
  Filter,
  X,
  ChevronUp,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  Shield,
  Briefcase,
  Calendar,
  Award,
  Linkedin,
  Github,
  Building,
  FileText,
  Trash2,
  Save,
  Sparkles,
  UserCheck,
  Clock,
  TrendingUp,
  ChevronRight,
  ExternalLink,
  DollarSign,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTalents } from "@/hooks/useTalents"
import { useLookups } from "@/hooks/useLookups"
import { getResumeUrl, updateTalent, deleteTalent } from "@/lib/api"
import type { TalentProfile, CandidateStatus, ClearanceLevel } from "@/types/talent"
import {
  CANDIDATE_STATUSES,
  TALENT_BUCKETS,
  CLEARANCE_LEVELS,
  US_STATES,
  TALENT_CATEGORIES,
} from "@/types/talent"

interface Filters {
  search: string
  status: string
  talent_bucket: string
  talent_category: string
  clearance_level: string
  location_state: string
  city: string
  skills: string[]
  certifications: string[]
  minYears: string
  maxYears: string
}

type SortField = "name" | "date_received" | "years_of_experience" | "status"
type SortDirection = "asc" | "desc"

const statusColors: Record<CandidateStatus, string> = {
  "Potential Candidate": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Active Candidate": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Placed Candidate": "bg-green-500/20 text-green-300 border-green-500/30",
  "Stale Candidate": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Do Not Contact": "bg-red-500/20 text-red-300 border-red-500/30",
}

const clearanceColors: Record<string, string> = {
  Secret: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  TS: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "TS/SCI": "bg-red-500/20 text-red-300 border-red-500/30",
  "TS/SCI/FSP": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "TS/SCI/CI": "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "Yankee White": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
}

function StatusBadge({ status }: { status: CandidateStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
      {status}
    </span>
  )
}

function ClearanceBadge({ level }: { level: ClearanceLevel }) {
  if (!level) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${clearanceColors[level] || "bg-slate-500/20 text-slate-400 border-slate-500/30"}`}>
      <Shield className="h-3 w-3 mr-1" />
      {level}
    </span>
  )
}

function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
}: {
  label: string
  field: SortField
  currentSort: SortField
  currentDirection: SortDirection
  onSort: (field: SortField) => void
}) {
  const isActive = currentSort === field
  return (
    <button
      className="flex items-center gap-1 hover:text-white transition-colors group"
      onClick={() => onSort(field)}
    >
      {label}
      <span className={`transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}>
        {isActive && currentDirection === "asc" ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </span>
    </button>
  )
}

function ProfileDetailPanel({ 
  profile, 
  onClose, 
  onRefresh 
}: { 
  profile: TalentProfile
  onClose: () => void
  onRefresh: () => Promise<void>
}) {
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [showResume, setShowResume] = useState(false)
  
  // Edit state
  const [editStatus, setEditStatus] = useState<CandidateStatus>(profile.status)
  const [editBillRate, setEditBillRate] = useState(profile.bill_rate?.toString() || '')
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updates: { status?: CandidateStatus; bill_rate?: number | null } = {}
      
      if (editStatus !== profile.status) {
        updates.status = editStatus
      }
      
      const newBillRate = editBillRate ? parseFloat(editBillRate) : null
      if (newBillRate !== profile.bill_rate) {
        updates.bill_rate = newBillRate
      }
      
      if (Object.keys(updates).length > 0) {
        await updateTalent(profile.pk, updates)
        await onRefresh()
      }
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save changes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteTalent(profile.pk)
      await onRefresh()
      onClose()
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete profile. Please try again.')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }
  
  const handleViewResume = async () => {
    if (!profile.key) return
    
    setResumeLoading(true)
    try {
      const { url } = await getResumeUrl(profile.key)
      
      // Check file extension to determine viewer type
      const isDocx = profile.key.toLowerCase().endsWith('.docx') || profile.key.toLowerCase().endsWith('.doc')
      
      if (isDocx) {
        // Use Google Docs viewer for Word documents
        setResumeUrl(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`)
      } else {
        // Use direct URL for PDFs
        setResumeUrl(url)
      }
      setShowResume(true)
    } catch (error) {
      console.error('Failed to get resume URL:', error)
      alert('Failed to load resume. Please try again.')
    } finally {
      setResumeLoading(false)
    }
  }
  
  // If showing resume, render full-screen viewer
  if (showResume && resumeUrl) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-4xl bg-slate-900/95 backdrop-blur-lg border-l border-white/10 shadow-2xl z-50 flex flex-col">
        <div className="flex-none bg-slate-900/95 backdrop-blur-lg border-b border-white/10 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowResume(false)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-white">{profile.name || 'Unknown'} - Resume</h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-colors text-sm"
          >
            Close Panel
          </button>
        </div>
        <div className="flex-1 bg-white">
          <iframe
            src={resumeUrl}
            className="w-full h-full border-0"
            title={`Resume - ${profile.name || 'Unknown'}`}
          />
        </div>
      </div>
    )
  }
  
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-900/98 backdrop-blur-2xl border-l border-white/10 shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
      {/* Gradient accent */}
      <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-indigo-500/50 via-purple-500/50 to-transparent" />
      
      <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl border-b border-white/10 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-white/10 text-white font-semibold">
            {(profile.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Profile Details</h2>
            <p className="text-xs text-white/40">{profile.talent_category}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-1">{profile.name || 'Unknown'}</h3>
              <div className="flex items-center gap-2">
                <StatusBadge status={profile.status} />
              </div>
            </div>
          </div>
          {profile.summary && (
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <p className="text-white/70 text-sm leading-relaxed italic">&ldquo;{profile.summary}&rdquo;</p>
            </div>
          )}
          
          {/* View Resume Button */}
          {profile.key && (
            <button
              onClick={handleViewResume}
              disabled={resumeLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300 hover:from-indigo-500/30 hover:to-purple-500/30 transition-all disabled:opacity-50 font-medium"
            >
              <FileText className="h-4 w-4" />
              {resumeLoading ? "Loading Resume..." : "View Original Resume"}
              <ExternalLink className="h-3.5 w-3.5 ml-1 opacity-50" />
            </button>
          )}
        </div>

        {/* Contact Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded-lg">
              <Mail className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Contact Information</h4>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/5 divide-y divide-white/5">
            {profile.contact.email && (
              <div className="flex items-center gap-3 px-4 py-3">
                <Mail className="h-4 w-4 text-white/30" />
                <a href={`mailto:${profile.contact.email}`} className="text-white/80 hover:text-indigo-400 transition-colors flex-1 truncate">
                  {profile.contact.email}
                </a>
              </div>
            )}
            {profile.contact.phone && (
              <div className="flex items-center gap-3 px-4 py-3">
                <Phone className="h-4 w-4 text-white/30" />
                <span className="text-white/80">{profile.contact.phone}</span>
              </div>
            )}
            {profile.contact.linkedin && (
              <div className="flex items-center gap-3 px-4 py-3">
                <Linkedin className="h-4 w-4 text-white/30" />
                <a href={`https://${profile.contact.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-indigo-400 transition-colors flex-1 truncate">
                  {profile.contact.linkedin}
                </a>
              </div>
            )}
            {profile.contact.github && (
              <div className="flex items-center gap-3 px-4 py-3">
                <Github className="h-4 w-4 text-white/30" />
                <a href={`https://${profile.contact.github}`} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-indigo-400 transition-colors flex-1 truncate">
                  {profile.contact.github}
                </a>
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-3">
              <MapPin className="h-4 w-4 text-white/30" />
              <span className="text-white/80">
                {profile.location.city ? `${profile.location.city}, ` : ""}
                {US_STATES.find((s) => s.value === profile.location_state)?.label || profile.location_state}
              </span>
            </div>
          </div>
        </div>

        {/* Professional Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-500/20 rounded-lg">
              <Briefcase className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Professional Details</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
                <Briefcase className="h-3.5 w-3.5" />
                <span>Talent Bucket</span>
              </div>
              <p className="text-white font-semibold">{profile.talent_bucket}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
                <Clock className="h-3.5 w-3.5" />
                <span>Experience</span>
              </div>
              <p className="text-white font-semibold">
                {profile.years_of_experience ? `${profile.years_of_experience} years` : "Not specified"}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
                <Shield className="h-3.5 w-3.5" />
                <span>Clearance</span>
              </div>
              {profile.clearance_level ? (
                <ClearanceBadge level={profile.clearance_level} />
              ) : (
                <span className="text-white/40 text-sm">None</span>
              )}
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
                <DollarSign className="h-3.5 w-3.5" />
                <span>Bill Rate</span>
              </div>
              {profile.bill_rate ? (
                <p className="text-emerald-400 font-semibold">${profile.bill_rate}<span className="text-white/40 font-normal">/hr</span></p>
              ) : (
                <span className="text-white/40 text-sm">Not set</span>
              )}
            </div>
          </div>
        </div>

        {/* Companies */}
        {profile.companies.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 rounded-lg">
                <Building className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Work History</h4>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/5 divide-y divide-white/5">
              {profile.companies.map((company, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Building className="h-4 w-4 text-white/30" />
                  <span className="text-white/80">{company.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/20 rounded-lg">
              <Award className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Skills & Expertise</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.skillsets.map((skill, i) => (
              <Badge
                key={i}
                variant="outline"
                className="bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
              >
                {skill.name}
              </Badge>
            ))}
            {profile.skillsets.length === 0 && (
              <span className="text-white/40 text-sm">No skills listed</span>
            )}
          </div>
        </div>

        {/* Certifications */}
        {profile.certifications.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 rounded-lg">
                <Award className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Certifications</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.certifications.map((cert, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                >
                  <Award className="h-3 w-3 mr-1" />
                  {cert}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-500/20 rounded-lg">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Record Info</h4>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/5 divide-y divide-white/5 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-white/40">Date received</span>
              <span className="text-white/70">{new Date(profile.date_received).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-white/40">Last updated</span>
              <span className="text-white/70">{new Date(profile.updated_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-white/40">Profile ID</span>
              <span className="text-white/50 font-mono text-xs truncate max-w-[180px]">{profile.key}</span>
            </div>
          </div>
        </div>

        {/* Edit/Manage Section */}
        <div className="pt-4 border-t border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-lg">
              <Save className="h-3.5 w-3.5 text-green-400" />
            </div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Manage Profile</h4>
          </div>
          
          {/* Status */}
          <div className="space-y-2">
            <Label className="text-white/60">Status</Label>
            <Select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as CandidateStatus)}
              className="bg-white/5 border-white/10 text-white"
              options={CANDIDATE_STATUSES}
            />
          </div>
          
          {/* Bill Rate */}
          <div className="space-y-2">
            <Label className="text-white/60">Bill Rate ($/hr)</Label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editBillRate}
              onChange={(e) => setEditBillRate(e.target.value)}
              placeholder="Enter bill rate"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
            />
          </div>
          
          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-400 hover:from-green-500/30 hover:to-emerald-500/30 transition-all disabled:opacity-50 font-medium"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving Changes..." : "Save Changes"}
          </button>
          
          {/* Delete Section */}
          <div className="pt-4 border-t border-white/10">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400/80 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-all"
              >
                <Trash2 className="h-4 w-4" />
                Delete Profile
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                <div className="flex items-center gap-2 text-red-400">
                  <Trash2 className="h-4 w-4" />
                  <p className="text-sm font-medium">Delete this profile?</p>
                </div>
                <p className="text-red-300/70 text-sm">
                  This action cannot be undone. The candidate record will be permanently removed.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all text-sm font-medium"
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
        </div>
      </div>
    </div>
  )
}

export function TalentDashboard() {
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "",
    talent_bucket: "",
    talent_category: "",
    clearance_level: "",
    location_state: "",
    city: "",
    skills: [],
    certifications: [],
    minYears: "",
    maxYears: "",
  })

  const [sortField, setSortField] = useState<SortField>("date_received")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [selectedProfile, setSelectedProfile] = useState<TalentProfile | null>(null)
  const [showFilters, setShowFilters] = useState(true)

  // Fetch data from API
  const {
    talents,
    isLoading: talentsLoading,
    error: talentsError,
    refresh: refreshTalents,
    updateStatus: _updateStatus, // For future use in detail panel
  } = useTalents({
    status: filters.status || undefined,
    talent_bucket: filters.talent_bucket || undefined,
    talent_category: filters.talent_category || undefined,
    clearance_level: filters.clearance_level || undefined,
    location_state: filters.location_state || undefined,
    search: filters.search || undefined,
    skills: filters.skills.length > 0 ? filters.skills : undefined,
    certifications: filters.certifications.length > 0 ? filters.certifications : undefined,
    minYears: filters.minYears ? parseInt(filters.minYears, 10) : undefined,
    maxYears: filters.maxYears ? parseInt(filters.maxYears, 10) : undefined,
  })

  const {
    skills: lookupSkills,
    certifications: lookupCertifications,
    cities: lookupCities,
    isLoading: _lookupsLoading, // For future loading indicator
  } = useLookups()

  const handleFilterChange = (key: keyof Filters, value: string) => {
    if (key === "location_state") {
      // Reset city when state changes, unless the city exists in the new state
      const cityExistsInState = lookupCities.some(c => c.city === filters.city && c.state === value)
      setFilters((prev) => ({ 
        ...prev, 
        [key]: value,
        city: cityExistsInState ? prev.city : ""
      }))
    } else {
      setFilters((prev) => ({ ...prev, [key]: value }))
    }
  }

  const clearFilters = () => {
    setFilters({
      search: "",
      status: "",
      talent_bucket: "",
      talent_category: "",
      clearance_level: "",
      location_state: "",
      city: "",
      skills: [],
      certifications: [],
      minYears: "",
      maxYears: "",
    })
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  // Client-side sorting (filtering is done server-side via useTalents hook)
  const sortedProfiles = useMemo(() => {
    // City filtering is still client-side since it's not a GSI key
    let result = filters.city
      ? talents.filter((p) => p.location?.city === filters.city)
      : talents

    // Apply sorting
    result = [...result].sort((a, b) => {
      let aVal: string | number = ""
      let bVal: string | number = ""

      switch (sortField) {
        case "name":
          aVal = a.name_lower
          bVal = b.name_lower
          break
        case "date_received":
          aVal = a.date_received
          bVal = b.date_received
          break
        case "years_of_experience":
          aVal = a.years_of_experience || 0
          bVal = b.years_of_experience || 0
          break
        case "status":
          aVal = a.status
          bVal = b.status
          break
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [talents, filters.city, sortField, sortDirection])

  const activeFilterCount = Object.entries(filters).filter(([key, v]) => 
    key === "skills" || key === "certifications" ? (v as string[]).length > 0 : v !== ""
  ).length

  // Stats (based on currently loaded data)
  const stats = useMemo(() => {
    return {
      total: talents.length,
      potentialCount: talents.filter((p) => p.status === "Potential Candidate").length,
      activeCount: talents.filter((p) => p.status === "Active Candidate").length,
      placedCount: talents.filter((p) => p.status === "Placed Candidate").length,
    }
  }, [talents])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
      {/* Animated gradient accent bar */}
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-x" />
      
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl blur-lg opacity-50" />
                <div className="relative p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Talent Pool</h1>
                <p className="text-sm text-white/50">Discover and manage your candidate pipeline</p>
              </div>
            </div>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="group relative bg-white/5 hover:bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/10 hover:border-white/20 transition-all duration-300 cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Total</span>
                  </div>
                  <p className="text-3xl font-bold text-white tabular-nums">{stats.total}</p>
                </div>
              </div>
              
              <div className="group relative bg-emerald-500/10 hover:bg-emerald-500/20 backdrop-blur-lg rounded-xl p-4 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider">Potential</span>
                  </div>
                  <p className="text-3xl font-bold text-emerald-400 tabular-nums">{stats.potentialCount}</p>
                </div>
              </div>
              
              <div className="group relative bg-blue-500/10 hover:bg-blue-500/20 backdrop-blur-lg rounded-xl p-4 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                    <span className="text-xs font-medium text-blue-400/70 uppercase tracking-wider">Active</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-400 tabular-nums">{stats.activeCount}</p>
                </div>
              </div>
              
              <div className="group relative bg-green-500/10 hover:bg-green-500/20 backdrop-blur-lg rounded-xl p-4 border border-green-500/20 hover:border-green-500/40 transition-all duration-300 cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <UserCheck className="h-4 w-4 text-green-400" />
                    <span className="text-xs font-medium text-green-400/70 uppercase tracking-wider">Placed</span>
                  </div>
                  <p className="text-3xl font-bold text-green-400 tabular-nums">{stats.placedCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search & Filter Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 group">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 group-focus-within:text-indigo-400 transition-colors" />
              <input
                type="text"
                placeholder="Search candidates by name, skills, or keywords..."
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                className="w-full h-12 pl-12 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-white/10 transition-all duration-300"
              />
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border transition-all duration-300 font-medium ${
              showFilters
                ? "bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-indigo-500/40 text-indigo-300 shadow-lg shadow-indigo-500/10"
                : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/10"
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="relative bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6 animate-in slide-in-from-top-2 duration-300 shadow-xl shadow-black/20">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 rounded-2xl pointer-events-none" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <Filter className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Filter Candidates</h3>
                    <p className="text-xs text-white/40">Narrow down your search with specific criteria</p>
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-white/50 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                    Clear all ({activeFilterCount})
                  </button>
                )}
              </div>
              
              {/* Row 1: Basic filters */}
              <div className="mb-4">
                <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3">Primary Filters</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label className="text-white/70">Status</Label>
                    <Select
                      value={filters.status}
                      onChange={(e) => handleFilterChange("status", e.target.value)}
                      options={CANDIDATE_STATUSES}
                      placeholder="All statuses"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Talent Bucket</Label>
                    <Select
                      value={filters.talent_bucket}
                      onChange={(e) => handleFilterChange("talent_bucket", e.target.value)}
                      options={TALENT_BUCKETS}
                      placeholder="All buckets"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Category</Label>
                    <Select
                      value={filters.talent_category}
                      onChange={(e) => handleFilterChange("talent_category", e.target.value)}
                      options={TALENT_CATEGORIES}
                      placeholder="All categories"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Clearance</Label>
                    <Select
                      value={filters.clearance_level}
                      onChange={(e) => handleFilterChange("clearance_level", e.target.value)}
                      options={CLEARANCE_LEVELS}
                      placeholder="Any clearance"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">State</Label>
                    <Select
                      value={filters.location_state}
                      onChange={(e) => handleFilterChange("location_state", e.target.value)}
                      options={US_STATES}
                      placeholder="Any state"
                    />
                  </div>
                </div>
              </div>
              
              {/* Row 2: Additional filters */}
              <div>
                <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3">Additional Filters</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label className="text-white/70">City</Label>
                    <Select
                      value={filters.city}
                      onChange={(e) => handleFilterChange("city", e.target.value)}
                      options={
                        (filters.location_state 
                          ? lookupCities.filter(c => c.state === filters.location_state)
                          : lookupCities
                        ).map(c => ({ value: c.city, label: filters.location_state ? c.city : `${c.city}, ${c.state}` }))
                      }
                      placeholder="Any city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Skills {filters.skills.length > 0 && <span className="text-indigo-400">({filters.skills.length})</span>}</Label>
                    <Select
                      value=""
                      onChange={(e) => {
                        const skill = e.target.value
                        if (skill && !filters.skills.includes(skill)) {
                          setFilters(prev => ({ ...prev, skills: [...prev.skills, skill] }))
                        }
                      }}
                      options={lookupSkills.filter(s => !filters.skills.includes(s)).map(s => ({ value: s, label: s }))}
                      placeholder="Add skill..."
                    />
                    {filters.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {filters.skills.map(skill => (
                          <span
                            key={skill}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors"
                          >
                            {skill}
                            <button
                              onClick={() => setFilters(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))}
                              className="hover:text-white ml-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Certifications {filters.certifications.length > 0 && <span className="text-amber-400">({filters.certifications.length})</span>}</Label>
                    <Select
                      value=""
                      onChange={(e) => {
                        const cert = e.target.value
                        if (cert && !filters.certifications.includes(cert)) {
                          setFilters(prev => ({ ...prev, certifications: [...prev.certifications, cert] }))
                        }
                      }}
                      options={lookupCertifications.filter(c => !filters.certifications.includes(c)).map(c => ({ value: c, label: c }))}
                      placeholder="Add certification..."
                    />
                    {filters.certifications.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {filters.certifications.map(cert => (
                          <span
                            key={cert}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                          >
                            {cert}
                            <button
                              onClick={() => setFilters(prev => ({ ...prev, certifications: prev.certifications.filter(c => c !== cert) }))}
                              className="hover:text-white ml-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Min Years</Label>
                    <input
                      type="number"
                      min="0"
                      value={filters.minYears}
                      onChange={(e) => handleFilterChange("minYears", e.target.value)}
                      placeholder="0"
                      className="flex h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 hover:border-white/20 hover:bg-white/8 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Max Years</Label>
                    <input
                      type="number"
                      min="0"
                      value={filters.maxYears}
                      onChange={(e) => handleFilterChange("maxYears", e.target.value)}
                      placeholder="Any"
                      className="flex h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 hover:border-white/20 hover:bg-white/8 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {talentsLoading ? (
              <div className="flex items-center gap-2 text-white/40">
                <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading candidates...</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-white/60">
                  Showing <span className="text-white font-semibold">{sortedProfiles.length}</span> {sortedProfiles.length === 1 ? 'candidate' : 'candidates'}
                </p>
                {activeFilterCount > 0 && (
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                    {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} active
                  </span>
                )}
              </>
            )}
          </div>
          {talentsError && (
            <p className="text-sm text-red-400 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-red-500" />
              Error: {talentsError.message}
              <button onClick={refreshTalents} className="underline hover:text-red-300">Retry</button>
            </p>
          )}
        </div>

        {/* Results Table */}
        <div className="relative bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-xl shadow-black/20">
          {/* Table gradient accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/60">
                  <SortableHeader
                    label="Candidate"
                    field="name"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="text-white/60">Category</TableHead>
                <TableHead className="text-white/60">Location</TableHead>
                <TableHead className="text-white/60">Clearance</TableHead>
                <TableHead className="text-white/60">Rate</TableHead>
                <TableHead className="text-white/60">
                  <SortableHeader
                    label="Experience"
                    field="years_of_experience"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="text-white/60">
                  <SortableHeader
                    label="Status"
                    field="status"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="text-white/60">
                  <SortableHeader
                    label="Received"
                    field="date_received"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-4">
                      {talentsLoading ? (
                        <>
                          <div className="relative">
                            <div className="h-12 w-12 border-2 border-indigo-500/30 rounded-full" />
                            <div className="absolute inset-0 h-12 w-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                          <div className="text-center">
                            <p className="text-white/60 font-medium">Loading candidates...</p>
                            <p className="text-white/30 text-sm mt-1">This may take a moment</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="relative">
                            <div className="p-4 bg-slate-700/50 rounded-2xl">
                              <Users className="h-10 w-10 text-white/20" />
                            </div>
                            <div className="absolute -top-1 -right-1 p-1.5 bg-slate-700 rounded-full border border-white/10">
                              <Search className="h-4 w-4 text-white/30" />
                            </div>
                          </div>
                          <div className="text-center max-w-sm">
                            <p className="text-white/70 font-medium text-lg mb-1">No candidates found</p>
                            <p className="text-white/40 text-sm">
                              {activeFilterCount > 0 
                                ? "Try adjusting your filters to see more results"
                                : "Add candidates to get started"
                              }
                            </p>
                          </div>
                          {activeFilterCount > 0 && (
                            <button
                              onClick={clearFilters}
                              className="mt-2 px-4 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 transition-all text-sm font-medium flex items-center gap-2"
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
                sortedProfiles.map((profile) => (
                  <TableRow
                    key={profile.pk}
                    className="border-white/5 cursor-pointer hover:bg-white/5 hover:shadow-lg transition-all duration-200 group"
                    onClick={() => setSelectedProfile(profile)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-white/10 text-white font-medium text-sm">
                          {(profile.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white group-hover:text-indigo-300 transition-colors">{profile.name || 'Unknown'}</p>
                          <p className="text-xs text-white/40">{profile.contact?.email || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-white/80">{profile.talent_category}</p>
                        <p className="text-xs text-white/40">{profile.talent_bucket}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-white/70">
                        <MapPin className="h-3.5 w-3.5 text-white/40" />
                        <span>{profile.location?.city ? `${profile.location.city}, ` : ""}{profile.location_state}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ClearanceBadge level={profile.clearance_level} />
                    </TableCell>
                    <TableCell className="text-white/70 font-medium">
                      {profile.bill_rate ? (
                        <span className="text-emerald-400">${profile.bill_rate}<span className="text-white/40 text-xs">/hr</span></span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-white/70">
                      {profile.years_of_experience ? (
                        <span>{profile.years_of_experience} <span className="text-white/40">yrs</span></span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={profile.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between">
                        <span className="text-white/50 text-sm">{new Date(profile.date_received).toLocaleDateString()}</span>
                        <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
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
          />
        </>
      )}
    </div>
  )
}
