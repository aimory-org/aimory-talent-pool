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
import { getResumeUrl } from "@/lib/api"
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

function ProfileDetailPanel({ profile, onClose }: { profile: TalentProfile; onClose: () => void }) {
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [showResume, setShowResume] = useState(false)
  
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
            <h2 className="text-lg font-semibold text-white">{profile.name} - Resume</h2>
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
            title={`Resume - ${profile.name}`}
          />
        </div>
      </div>
    )
  }
  
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-900/95 backdrop-blur-lg border-l border-white/10 shadow-2xl z-50 overflow-y-auto">
      <div className="sticky top-0 bg-slate-900/95 backdrop-blur-lg border-b border-white/10 p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Profile Details</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">{profile.name}</h3>
              <p className="text-white/60 text-sm">{profile.talent_category}</p>
            </div>
            <StatusBadge status={profile.status} />
          </div>
          {profile.summary && (
            <p className="text-white/70 text-sm leading-relaxed">{profile.summary}</p>
          )}
          
          {/* View Resume Button */}
          {profile.key && (
            <button
              onClick={handleViewResume}
              disabled={resumeLoading}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 transition-all disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {resumeLoading ? "Loading..." : "View Resume"}
            </button>
          )}
        </div>

        {/* Contact */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider">Contact</h4>
          <div className="space-y-2">
            {profile.contact.email && (
              <div className="flex items-center gap-2 text-white/80">
                <Mail className="h-4 w-4 text-white/40" />
                <a href={`mailto:${profile.contact.email}`} className="hover:text-indigo-400 transition-colors">
                  {profile.contact.email}
                </a>
              </div>
            )}
            {profile.contact.phone && (
              <div className="flex items-center gap-2 text-white/80">
                <Phone className="h-4 w-4 text-white/40" />
                {profile.contact.phone}
              </div>
            )}
            {profile.contact.linkedin && (
              <div className="flex items-center gap-2 text-white/80">
                <Linkedin className="h-4 w-4 text-white/40" />
                <a href={`https://${profile.contact.linkedin}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">
                  {profile.contact.linkedin}
                </a>
              </div>
            )}
            {profile.contact.github && (
              <div className="flex items-center gap-2 text-white/80">
                <Github className="h-4 w-4 text-white/40" />
                <a href={`https://${profile.contact.github}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">
                  {profile.contact.github}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 text-white/80">
              <MapPin className="h-4 w-4 text-white/40" />
              {profile.location.city ? `${profile.location.city}, ` : ""}
              {US_STATES.find((s) => s.value === profile.location_state)?.label || profile.location_state}
            </div>
          </div>
        </div>

        {/* Professional */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider">Professional</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                <Briefcase className="h-3 w-3" />
                Bucket
              </div>
              <p className="text-white font-medium text-sm">{profile.talent_bucket}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                <Calendar className="h-3 w-3" />
                Experience
              </div>
              <p className="text-white font-medium text-sm">
                {profile.years_of_experience ? `${profile.years_of_experience} years` : "Not specified"}
              </p>
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-2">
              <Shield className="h-3 w-3" />
              Clearance
            </div>
            <ClearanceBadge level={profile.clearance_level} />
          </div>
          {profile.bill_rate && (
            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="text-white/60 text-xs mb-1">Bill Rate</div>
              <p className="text-white font-medium text-sm">${profile.bill_rate}/hr</p>
            </div>
          )}
        </div>

        {/* Companies */}
        {profile.companies.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider">Companies</h4>
            <div className="space-y-2">
              {profile.companies.map((company, i) => (
                <div key={i} className="flex items-start gap-2 text-white/80">
                  <Building className="h-4 w-4 text-white/40 mt-0.5" />
                  <span>{company.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider">Skills</h4>
          <div className="flex flex-wrap gap-2">
            {profile.skillsets.map((skill, i) => (
              <Badge
                key={i}
                variant="outline"
                className="bg-indigo-500/10 text-indigo-300 border-indigo-500/30 text-xs"
              >
                {skill.name}
              </Badge>
            ))}
          </div>
        </div>

        {/* Certifications */}
        {profile.certifications.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider">Certifications</h4>
            <div className="flex flex-wrap gap-2">
              {profile.certifications.map((cert, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-xs"
                >
                  <Award className="h-3 w-3 mr-1" />
                  {cert}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-white/10 space-y-2 text-sm">
          <div className="flex justify-between text-white/40">
            <span>Date received</span>
            <span className="text-white/60">{new Date(profile.date_received).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-white/40">
            <span>Last updated</span>
            <span className="text-white/60">{new Date(profile.updated_at).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-white/40">
            <span>Profile ID</span>
            <span className="text-white/60 font-mono text-xs">{profile.key}</span>
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
    setFilters((prev) => ({ ...prev, [key]: value }))
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
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/50 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Users className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Talent Pool</h1>
                <p className="text-sm text-white/60">Search and filter candidate profiles</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Quick Stats */}
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-semibold text-white">{stats.total}</p>
                  <p className="text-white/40 text-xs">Total</p>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center">
                  <p className="text-2xl font-semibold text-emerald-400">{stats.potentialCount}</p>
                  <p className="text-white/40 text-xs">Potential</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold text-blue-400">{stats.activeCount}</p>
                  <p className="text-white/40 text-xs">Active</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold text-green-400">{stats.placedCount}</p>
                  <p className="text-white/40 text-xs">Placed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search & Filter Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
            <input
              type="text"
              placeholder="Search by name, email, or skill..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
              showFilters
                ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"
            }`}
          >
            <Filter className="h-4 w-4" />
            <span className="font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-500 text-white text-xs font-medium">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-white/10 p-4 mb-6 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white/80">Filter Candidates</h3>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear all
                </button>
              )}
            </div>
            {/* Row 1: Basic filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={filters.status}
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                  options={CANDIDATE_STATUSES}
                  placeholder="All statuses"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Talent Bucket</Label>
                <Select
                  value={filters.talent_bucket}
                  onChange={(e) => handleFilterChange("talent_bucket", e.target.value)}
                  options={TALENT_BUCKETS}
                  placeholder="All buckets"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={filters.talent_category}
                  onChange={(e) => handleFilterChange("talent_category", e.target.value)}
                  options={TALENT_CATEGORIES}
                  placeholder="All categories"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Clearance</Label>
                <Select
                  value={filters.clearance_level}
                  onChange={(e) => handleFilterChange("clearance_level", e.target.value)}
                  options={CLEARANCE_LEVELS}
                  placeholder="Any clearance"
                />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select
                  value={filters.location_state}
                  onChange={(e) => handleFilterChange("location_state", e.target.value)}
                  options={US_STATES}
                  placeholder="Any state"
                />
              </div>
            </div>
            {/* Row 2: Additional filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Select
                  value={filters.city}
                  onChange={(e) => handleFilterChange("city", e.target.value)}
                  options={lookupCities.map(c => ({ value: c.city, label: `${c.city}, ${c.state}` }))}
                  placeholder="Any city"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Skills {filters.skills.length > 0 && `(${filters.skills.length})`}</Label>
                <div className="relative">
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
                </div>
                {filters.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {filters.skills.map(skill => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30"
                      >
                        {skill}
                        <button
                          onClick={() => setFilters(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))}
                          className="hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Certifications {filters.certifications.length > 0 && `(${filters.certifications.length})`}</Label>
                <div className="relative">
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
                </div>
                {filters.certifications.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {filters.certifications.map(cert => (
                      <span
                        key={cert}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs border border-amber-500/30"
                      >
                        {cert}
                        <button
                          onClick={() => setFilters(prev => ({ ...prev, certifications: prev.certifications.filter(c => c !== cert) }))}
                          className="hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Min Years Exp</Label>
                <input
                  type="number"
                  min="0"
                  value={filters.minYears}
                  onChange={(e) => handleFilterChange("minYears", e.target.value)}
                  placeholder="0"
                  className="flex h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Years Exp</Label>
                <input
                  type="number"
                  min="0"
                  value={filters.maxYears}
                  onChange={(e) => handleFilterChange("maxYears", e.target.value)}
                  placeholder="Any"
                  className="flex h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-white/60">
            {talentsLoading ? (
              <span className="text-white/40">Loading...</span>
            ) : (
              <>
                Showing <span className="text-white font-medium">{sortedProfiles.length}</span> candidates
              </>
            )}
          </p>
          {talentsError && (
            <p className="text-sm text-red-400">
              Error: {talentsError.message}
              <button onClick={refreshTalents} className="ml-2 underline">Retry</button>
            </p>
          )}
        </div>

        {/* Results Table */}
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden">
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
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-white/40">
                      {talentsLoading ? (
                        <>
                          <div className="h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          <p>Loading candidates...</p>
                        </>
                      ) : (
                        <>
                          <Users className="h-8 w-8" />
                          <p>No candidates match your filters</p>
                          <button
                            onClick={clearFilters}
                            className="text-indigo-400 hover:underline text-sm"
                          >
                            Clear all filters
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedProfiles.map((profile) => (
                  <TableRow
                    key={profile.pk}
                    className="border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setSelectedProfile(profile)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-white">{profile.name}</p>
                        <p className="text-xs text-white/40">{profile.contact?.email || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-white/80">{profile.talent_category}</p>
                        <p className="text-xs text-white/40">{profile.talent_bucket}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-white/70">
                        <MapPin className="h-3 w-3" />
                        {profile.location?.city ? `${profile.location.city}, ` : ""}
                        {profile.location_state}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ClearanceBadge level={profile.clearance_level} />
                    </TableCell>
                    <TableCell className="text-white/70">
                      {profile.years_of_experience ? `${profile.years_of_experience} yrs` : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={profile.status} />
                    </TableCell>
                    <TableCell className="text-white/50 text-sm">
                      {new Date(profile.date_received).toLocaleDateString()}
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
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSelectedProfile(null)}
          />
          <ProfileDetailPanel
            profile={selectedProfile}
            onClose={() => setSelectedProfile(null)}
          />
        </>
      )}
    </div>
  )
}
