/**
 * Profile detail panel for viewing and editing candidate profiles.
 */
import { useState } from "react"
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
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { getResumeUrl, updateTalent, deleteTalent } from "@/lib/api"
import type { TalentProfile, CandidateStatus } from "@/types/talent"
import { CANDIDATE_STATUSES, US_STATES } from "@/types/talent"
import { StatusBadge } from "./components/StatusBadge"
import { ClearanceBadge } from "./components/ClearanceBadge"

interface ProfileDetailPanelProps {
  profile: TalentProfile
  onClose: () => void
  onRefresh: () => Promise<void>
}

export function ProfileDetailPanel({ 
  profile, 
  onClose, 
  onRefresh 
}: ProfileDetailPanelProps) {
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
