import {
  Server,
  Database,
  Cloud,
  Shield,
  Cpu,
  GitBranch,
  Terminal,
  Network,
  Key,
  Search,
  ArrowDown,
  ArrowRight,
  ChevronRight,
  Lock,
  Zap,
  RefreshCw,
  FileText,
  Upload,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const sectionId = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return (
    <section id={sectionId} className="mb-14 scroll-mt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-violet-500/15 rounded-xl text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/20">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">
          {title}
        </h2>
      </div>
      <div className="text-foreground/70 space-y-4 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-foreground/80 uppercase tracking-widest mb-3">
        {title}
      </h3>
      <div className="text-foreground/70">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative mt-4 rounded-xl overflow-hidden border border-black/10 dark:border-white/5">
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-black/10 dark:bg-slate-900/90 border-b border-black/10 dark:border-white/5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
      </div>
      <div className="bg-[#0d1117] dark:bg-[#0a0e1a] p-5 overflow-x-auto">
        <pre className="text-[13px] text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
          {children}
        </pre>
      </div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 rounded text-[0.82em] font-mono border border-violet-500/15">
      {children}
    </code>
  );
}

function Pill({
  children,
  color = "slate",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  const colors: Record<string, string> = {
    slate:
      "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    violet:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    emerald:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    amber:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors[color]}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Architecture Diagram
// ---------------------------------------------------------------------------

function ArchNode({
  label,
  sub,
  icon,
  color = "slate",
  wide,
}: {
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  color?: "violet" | "blue" | "emerald" | "amber" | "slate" | "red";
  wide?: boolean;
}) {
  const colors: Record<typeof color, string> = {
    violet:
      "bg-violet-500/10 border-violet-500/25 text-violet-700 dark:text-violet-300",
    blue: "bg-blue-500/10 border-blue-500/25 text-blue-700 dark:text-blue-300",
    emerald:
      "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300",
    amber:
      "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300",
    slate:
      "bg-slate-500/10 border-slate-500/25 text-slate-700 dark:text-slate-300",
    red: "bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-300",
  };
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-center ${colors[color]} ${wide ? "min-w-[140px]" : "min-w-[110px]"}`}
    >
      {icon && <div className="mb-0.5 opacity-80">{icon}</div>}
      <span className="text-xs font-semibold leading-tight">{label}</span>
      {sub && (
        <span className="text-[10px] opacity-60 leading-tight">{sub}</span>
      )}
    </div>
  );
}

function FlowArrow({
  label,
  vertical,
}: {
  label?: string;
  vertical?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center ${vertical ? "flex-col" : ""} gap-1 shrink-0`}
    >
      {label && (
        <span className="text-[10px] text-foreground/40 font-medium">
          {label}
        </span>
      )}
      {vertical ? (
        <ArrowDown className="w-4 h-4 text-foreground/25" />
      ) : (
        <ArrowRight className="w-4 h-4 text-foreground/25" />
      )}
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div className="mt-6 rounded-2xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-violet-500" />
        <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
          System Architecture
        </span>
      </div>

      <div className="p-6 space-y-6 overflow-x-auto">
        {/* Resume Pipeline row */}
        <div>
          <p className="text-[10px] font-bold text-foreground/35 uppercase tracking-widest mb-3">
            Resume Pipeline
          </p>
          <div className="flex items-center gap-2 min-w-max">
            <ArchNode
              label="OneDrive"
              sub="Resume folder"
              icon={<FileText className="w-4 h-4" />}
              color="slate"
            />
            <FlowArrow label="Power Automate" />
            <ArchNode
              label="S3 Bucket"
              sub="resumes/raw/"
              icon={<Cloud className="w-4 h-4" />}
              color="blue"
            />
            <FlowArrow label="S3 Event" />
            <ArchNode
              label="Document Pipeline"
              sub="detect → extract → analyze → normalize → persist"
              icon={<RefreshCw className="w-4 h-4" />}
              color="violet"
              wide
            />
            <FlowArrow />
            <ArchNode
              label="DynamoDB"
              sub="talent_profiles"
              icon={<Database className="w-4 h-4" />}
              color="emerald"
            />
          </div>
        </div>

        {/* JD Pipeline row */}
        <div>
          <p className="text-[10px] font-bold text-foreground/35 uppercase tracking-widest mb-3">
            JD Pipeline
          </p>
          <div className="flex items-center gap-2 min-w-max">
            <ArchNode
              label="Frontend"
              sub="Drag & drop"
              icon={<Upload className="w-4 h-4" />}
              color="slate"
            />
            <FlowArrow label="Presigned PUT" />
            <ArchNode
              label="S3 Bucket"
              sub="job-descriptions/raw/"
              icon={<Cloud className="w-4 h-4" />}
              color="blue"
            />
            <FlowArrow label="S3 Event" />
            <ArchNode
              label="Document Pipeline"
              sub="detect → extract → analyze → normalize → persist"
              icon={<RefreshCw className="w-4 h-4" />}
              color="violet"
              wide
            />
            <FlowArrow />
            <ArchNode
              label="DynamoDB"
              sub="job_descriptions"
              icon={<Database className="w-4 h-4" />}
              color="emerald"
            />
          </div>
          <p className="text-[10px] text-foreground/40 mt-2 ml-1">
            Both pipelines share the same reusable Step Functions workflow
            (detect_type → extract_text → analyze → normalize → persist) with
            pipeline-specific prompts and persist logic
          </p>
        </div>

        {/* Storage + Search row */}
        <div>
          <p className="text-[10px] font-bold text-foreground/35 uppercase tracking-widest mb-3">
            Storage & Search
          </p>
          <div className="flex items-center gap-2 min-w-max">
            <ArchNode
              label="DynamoDB"
              sub="talent_profiles"
              icon={<Database className="w-4 h-4" />}
              color="emerald"
            />
            <FlowArrow label="DynamoDB Streams" />
            <ArchNode
              label="opensearch_sync"
              sub="Lambda"
              icon={<RefreshCw className="w-4 h-4" />}
              color="violet"
            />
            <FlowArrow label="Bulk index" />
            <ArchNode
              label="OpenSearch"
              sub="talent-profiles"
              icon={<Search className="w-4 h-4" />}
              color="blue"
            />
          </div>
        </div>

        {/* API + Frontend row */}
        <div>
          <p className="text-[10px] font-bold text-foreground/35 uppercase tracking-widest mb-3">
            API & Frontend
          </p>
          <div className="flex items-center gap-2 min-w-max">
            <ArchNode
              label="React SPA"
              sub="CloudFront + S3"
              icon={<Cloud className="w-4 h-4" />}
              color="slate"
            />
            <FlowArrow label="Bearer JWT" />
            <ArchNode
              label="API Gateway"
              sub="HTTP API"
              icon={<Network className="w-4 h-4" />}
              color="amber"
            />
            <FlowArrow label="JWT Authorizer" />
            <ArchNode
              label="Lambda APIs"
              sub="CRUD + Search + Match"
              icon={<Zap className="w-4 h-4" />}
              color="violet"
            />
            <FlowArrow />
            <ArchNode
              label="OpenSearch"
              sub="/ DynamoDB"
              icon={<Database className="w-4 h-4" />}
              color="emerald"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline flow diagram
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  {
    step: "starter",
    trigger: "S3 PutObject",
    action:
      "Checks for duplicate in-flight executions (idempotency by S3 key). Starts a Step Functions execution passing { bucket, key }.",
    color: "violet" as const,
  },
  {
    step: "detect_type",
    trigger: "Step Functions",
    action:
      "Uses pdfminer to attempt native text extraction. If text is too short or empty, routes to the OCR branch. Otherwise skips directly to analyze.",
    color: "blue" as const,
  },
  {
    step: "extract_text",
    trigger: "OCR branch only",
    action:
      "Calls Amazon Textract DetectDocumentText. Returns raw text from scanned images. Typically adds 30–60 s to processing time.",
    color: "amber" as const,
  },
  {
    step: "analyze",
    trigger: "Step Functions",
    action:
      "Calls Amazon Bedrock (Claude Sonnet) with a pipeline-specific prompt and JSON schema. Resume extraction: name, contact, skills, clearance, companies, certifications, location, experience, summary. JD extraction: title, summary, required/desired skills, certifications, clearance, experience, location, salary range.",
    color: "violet" as const,
  },
  {
    step: "normalize",
    trigger: "Step Functions",
    action:
      "Validates and deduplicates extracted fields. Maps clearance strings to the enum. Builds skill_names and cert_names as comma-separated strings for OpenSearch.",
    color: "blue" as const,
  },
  {
    step: "persist",
    trigger: "Step Functions",
    action:
      "Upserts the profile to DynamoDB. For resumes: updates talent_profiles and all 6 lookup tables; checks for name-based duplicates and flags matches. For JDs: updates job_descriptions with title-based duplicate detection. DynamoDB Streams then triggers opensearch_sync.",
    color: "emerald" as const,
  },
];

const stepColors: Record<string, string> = {
  violet:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  amber:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  emerald:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function PipelineDiagram() {
  return (
    <div className="mt-6 rounded-2xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-slate-800/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-violet-500" />
        <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
          Step Functions Express Workflow
        </span>
      </div>
      <div className="p-5 space-y-0">
        {PIPELINE_STEPS.map((s, i) => (
          <div key={s.step}>
            <div className="flex gap-4 items-start">
              {/* Step number + connector */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${stepColors[s.color]}`}
                >
                  {i + 1}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="w-px flex-1 min-h-[32px] bg-black/10 dark:bg-white/10 my-1" />
                )}
              </div>
              {/* Content */}
              <div className="pb-6 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <code
                    className={`text-sm font-mono font-bold px-2.5 py-0.5 rounded-lg border ${stepColors[s.color]}`}
                  >
                    {s.step}
                  </code>
                  <Pill color="slate">
                    <ChevronRight className="w-3 h-3 mr-0.5 opacity-60" />
                    {s.trigger}
                  </Pill>
                </div>
                <p className="text-sm text-foreground/60 leading-relaxed">
                  {s.action}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth flow diagram
// ---------------------------------------------------------------------------

function AuthFlowDiagram() {
  const steps = [
    {
      actor: "User",
      action: 'Clicks "Sign in with Microsoft"',
      result: "Amplify initiates OAuth PKCE flow",
    },
    {
      actor: "Cognito",
      action: "Redirects to Microsoft Entra ID",
      result: "User authenticates with company credentials",
    },
    {
      actor: "Microsoft",
      action: "Returns OIDC assertion to Cognito",
      result: "Cognito issues JWT tokens (access + id + refresh)",
    },
    {
      actor: "Amplify",
      action: "Exchanges ?code= for tokens (PKCE)",
      result: "ID token held in memory; code cleared from URL",
    },
    {
      actor: "API Call",
      action: "Authorization: Bearer {id_token}",
      result: "API Gateway validates signature, iss, aud, exp",
    },
    {
      actor: "Lambda",
      action: "Invoked only if JWT is valid",
      result: "User claims available in request context",
    },
  ];

  const actorColors: Record<string, string> = {
    User: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/25",
    Cognito:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
    Microsoft:
      "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/25",
    Amplify:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25",
    "API Call":
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    Lambda:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  };

  return (
    <div className="mt-6 rounded-2xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-slate-800/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
          OAuth 2.0 PKCE Flow
        </span>
      </div>
      <div className="divide-y divide-black/5 dark:divide-white/5">
        {steps.map((s, i) => (
          <div
            key={i}
            className="flex items-start gap-4 px-5 py-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <span
              className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap ${actorColors[s.actor]}`}
            >
              {s.actor}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground/80 mb-0.5">
                {s.action}
              </p>
              <p className="text-xs text-foreground/45">{s.result}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module cards
// ---------------------------------------------------------------------------

const MODULES = [
  {
    name: "api/",
    color: "amber" as const,
    icon: <Network className="w-4 h-4" />,
    desc: "API Gateway HTTP API + Lambda handlers. Talent endpoints: list, get, update, delete, lookups, resume-url, tag deletion. JD endpoints: list, get, update, delete, match_candidates, jd-upload-url. JWT Authorizer validates Cognito tokens on every request.",
  },
  {
    name: "auth/",
    color: "blue" as const,
    icon: <Key className="w-4 h-4" />,
    desc: "Cognito User Pool + Microsoft Entra ID federation. App client configured for PKCE OAuth. Hosted UI handles the sign-in redirect.",
  },
  {
    name: "document_pipeline/",
    color: "violet" as const,
    icon: <Cpu className="w-4 h-4" />,
    desc: "Reusable Step Functions Express Workflow + Lambda functions + pdfminer layer. Instantiated twice: once for resumes (raw/ prefix → talent_profiles) and once for job descriptions (job-descriptions/raw/ → job_descriptions). Each instance has its own persist Lambda with pipeline-specific logic.",
  },
  {
    name: "storage/",
    color: "emerald" as const,
    icon: <Database className="w-4 h-4" />,
    desc: "DynamoDB talent_profiles + job_descriptions tables, 6 lookup tables, S3 resume/JD bucket (with CORS for presigned uploads), OpenSearch 2.11 domain, DynamoDB Streams sync Lambda, audit_log table.",
  },
  {
    name: "frontend/",
    color: "slate" as const,
    icon: <Cloud className="w-4 h-4" />,
    desc: "S3 static site bucket + CloudFront distribution. Origin Access Control (OAC) enforces CloudFront-only access to S3.",
  },
  {
    name: "jobs/",
    color: "red" as const,
    icon: <RefreshCw className="w-4 h-4" />,
    desc: "Scheduled EventBridge rules for stale candidate detection (stale_checker) and AI-powered lookup deduplication (lookup-dedup).",
  },
];

const moduleColors: Record<string, string> = {
  violet:
    "bg-violet-500/10 border-violet-500/25 text-violet-700 dark:text-violet-300",
  blue: "bg-blue-500/10 border-blue-500/25 text-blue-700 dark:text-blue-300",
  emerald:
    "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300",
  amber:
    "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300",
  slate:
    "bg-slate-500/10 border-slate-500/25 text-slate-700 dark:text-slate-300",
  red: "bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-300",
};

// ---------------------------------------------------------------------------
// API endpoint table
// ---------------------------------------------------------------------------

const API_ENDPOINTS = [
  {
    method: "GET",
    path: "/talents",
    desc: "List / search profiles via OpenSearch. Accepts: status, service_category, industry_category, job_title, clearance_level, location_state, city, skills (CSV), certifications (CSV), tags (CSV), search (full-text), minYears, maxYears.",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  {
    method: "GET",
    path: "/talents/{pk}",
    desc: "Fetch a single profile by primary key (URL-encoded). Returns the full DynamoDB item.",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  {
    method: "PATCH",
    path: "/talents?pk={pk}",
    desc: "Partial update of any profile fields. Body is a subset of the profile schema. Returns the updated profile from DynamoDB.",
    methodColor:
      "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/25",
  },
  {
    method: "DELETE",
    path: "/talents?pk={pk}",
    desc: "Permanently delete a profile from DynamoDB and OpenSearch.",
    methodColor:
      "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25",
  },
  {
    method: "GET",
    path: "/lookups",
    desc: "Fetch dropdown option sets. Optional: ?include=skills,certifications,job_titles,cities,tags. Returns all sets by default.",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  {
    method: "GET",
    path: "/resume-url?key={s3_key}",
    desc: "Generate a short-lived presigned S3 URL for viewing the original document (resume or JD). Default expiry: 15 minutes.",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  {
    method: "DELETE",
    path: "/tags?tag={tag}",
    desc: "Permanently delete a tag from the lookup table and remove it from all matching profiles in DynamoDB and OpenSearch.",
    methodColor:
      "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25",
  },
  {
    method: "GET",
    path: "/job-descriptions",
    desc: "List all job descriptions. Supports filters: required_clearance, location_state, industry_category, job_title. Sorted newest-first by created_at.",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  {
    method: "GET",
    path: "/job-descriptions/{pk}",
    desc: "Fetch a single job description by primary key (URL-encoded).",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  {
    method: "DELETE",
    path: "/job-descriptions?pk={pk}",
    desc: "Permanently delete a job description from DynamoDB.",
    methodColor:
      "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25",
  },
  {
    method: "PATCH",
    path: "/job-descriptions",
    desc: "Update a job description's editable fields (title, skills, clearance, etc.). Also supports dismiss_duplicate: true to clear the possible duplicate flag.",
    methodColor:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
  },
  {
    method: "POST",
    path: "/job-descriptions/{pk}/match",
    desc: "AI-powered candidate matching. Compares JD requirements against all talent profiles using Bedrock/Claude and returns ranked matches with scores and rationale. Optional: ?limit=N.",
    methodColor:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25",
  },
  {
    method: "GET",
    path: "/jd-upload-url?filename={name}&contentType={type}",
    desc: "Generate a presigned S3 PUT URL for uploading a job description file (PDF/DOC/DOCX). Returns { uploadUrl, key, expiresIn }. Default expiry: 15 minutes.",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
  {
    method: "GET",
    path: "/resume-upload-url?filename={name}&contentType={type}",
    desc: "Generate a presigned S3 PUT URL for uploading a resume file (PDF/DOC/DOCX). Returns { uploadUrl, key, expiresIn }. Default expiry: 15 minutes.",
    methodColor:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
];

// ---------------------------------------------------------------------------
// Security grid
// ---------------------------------------------------------------------------

const SECURITY_ITEMS = [
  {
    icon: <Lock className="w-4 h-4" />,
    label: "Transport",
    value: "TLS 1.2+ everywhere",
    detail:
      "CloudFront, API Gateway, and OpenSearch all enforce HTTPS. HTTP is redirected.",
  },
  {
    icon: <Shield className="w-4 h-4" />,
    label: "Encryption at rest",
    value: "AES-256",
    detail:
      "S3 SSE-S3, DynamoDB default encryption, OpenSearch domain encryption enabled.",
  },
  {
    icon: <Key className="w-4 h-4" />,
    label: "IAM",
    value: "Least-privilege roles",
    detail:
      "Each Lambda has a dedicated IAM role with only the permissions it needs. No wildcard resources.",
  },
  {
    icon: <Lock className="w-4 h-4" />,
    label: "Secrets",
    value: "SSM Parameter Store",
    detail:
      "No secrets in environment variables or code. All sensitive config in SSM Parameter Store.",
  },
  {
    icon: <Network className="w-4 h-4" />,
    label: "Network",
    value: "VPC (OpenSearch)",
    detail:
      "OpenSearch is VPC-internal. Lambda functions connect via VPC ENIs. No public OpenSearch endpoint.",
  },
  {
    icon: <FileText className="w-4 h-4" />,
    label: "Audit",
    value: "CloudTrail + access logs",
    detail:
      "All AWS API calls logged to CloudTrail. API Gateway access logs capture every request.",
  },
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function TechReference() {
  return (
    <div>
      {/* Architecture Overview */}
      <Section
        title="Architecture Overview"
        icon={<Cloud className="w-6 h-6" />}
      >
        <p>
          Fully serverless on AWS, managed with Terraform. The frontend is a
          Vite-bundled React SPA served via CloudFront + S3. All infrastructure
          lives in <Mono>infra/</Mono>.
        </p>
        <ArchitectureDiagram />
        <p className="text-sm text-foreground/45 mt-3">
          Every component is stateless and scales automatically. Resumes are
          processed independently — a failure in one execution does not affect
          others.
        </p>
      </Section>

      {/* Infrastructure Modules */}
      <Section title="Terraform Modules" icon={<Server className="w-6 h-6" />}>
        <p>
          Modules live under <Mono>infra/modules/</Mono>. The environment entry
          point <Mono>infra/envs/dev/modules.tf</Mono> wires them together.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          {MODULES.map((m) => (
            <div
              key={m.name}
              className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-800/60 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span
                  className={`p-1.5 rounded-lg border ${moduleColors[m.color]}`}
                >
                  {m.icon}
                </span>
                <code className="text-sm font-bold font-mono text-foreground">
                  {m.name}
                </code>
              </div>
              <p className="text-xs leading-relaxed text-foreground/60">
                {m.desc}
              </p>
            </div>
          ))}
        </div>

        <SubSection title="Resource Naming">
          <CodeBlock>{`aimory-talent-pool-{env}-{resource}

aimory-talent-pool-dev-talent-profiles      # DynamoDB
aimory-talent-pool-dev-pipeline             # Step Functions
aimory-talent-pool-dev-lookup-dedup         # Lambda
aimory-talent-pool-dev-frontend-{acct-id}   # S3`}</CodeBlock>
        </SubSection>
      </Section>

      {/* Pipeline */}
      <Section
        title="Document Processing Pipeline"
        icon={<Cpu className="w-6 h-6" />}
      >
        <p>
          Reusable Step Functions Express Workflow defined in{" "}
          <Mono>infra/modules/document_pipeline/</Mono>. Instantiated twice:
          once for resumes (<Mono>resumes/raw/</Mono> →{" "}
          <Mono>talent_profiles</Mono>) and once for job descriptions (
          <Mono>job-descriptions/raw/</Mono> → <Mono>job_descriptions</Mono>).
          Each instance shares the same core steps but uses a pipeline-specific
          persist Lambda with its own extraction prompt and target table.
        </p>
        <PipelineDiagram />
        <SubSection title="Error Handling">
          <p className="text-sm">
            Each state has Step Functions <Mono>Catch</Mono> blocks with
            exponential backoff retries. Failed executions are visible in the
            AWS Step Functions console. Idempotency at the persist layer uses
            DynamoDB conditional writes on the <Mono>pk</Mono> key to prevent
            duplicate profiles.
          </p>
        </SubSection>
      </Section>

      {/* Data Model */}
      <Section title="Data Model" icon={<Database className="w-6 h-6" />}>
        <SubSection title="DynamoDB — talent_profiles">
          <p className="text-sm mb-3">
            Primary table. Partition key: <Mono>pk</Mono> ={" "}
            <Mono>{"{bucket}#{s3_key}"}</Mono>. No sort key. Streams enabled
            (NEW_AND_OLD_IMAGES) for OpenSearch sync.
          </p>
          <CodeBlock>{`{
  pk:                   string    // "{bucket}#{s3_key}"
  name:                 string
  name_lower:           string    // for prefix sort/search
  contact:              { email, phone, linkedin, github }
  summary:              string | null
  service_category:     "IT" | "Accounting" | "Cybersecurity" | "FSP Headhunting" | "Unknown"
  industry_category:    string
  job_title:            string
  skillsets:            { name: string; evidence: string[] }[]
  skill_names:          string    // comma-separated → OpenSearch term queries
  certifications:       string[]
  cert_names:           string    // comma-separated
  companies:            { name: string; evidence: string[] }[]
  location:             { city: string | null; state: string | null }
  location_state:       string    // top-level copy for filter queries
  clearance_level:      "Secret" | "TS" | "TS/SCI" | "TS/SCI/CI" | "TS/SCI/FSP" | "Yankee White" | null
  years_of_experience:  number | null
  requested_salary:     number | null
  tags:                 string[]
  notes:                string
  status:               "Potential Candidate" | "Active Candidate" | "Placed at Other Company" | "Placed with us" | "Stale Candidate" | "Do Not Contact"
  date_received:        string    // ISO 8601
  updated_at:           string    // ISO 8601
  resume_text:          string    // full extracted text (not shown in UI)
  possible_duplicate_of?: string
}`}</CodeBlock>
        </SubSection>

        <SubSection title="DynamoDB — job_descriptions">
          <p className="text-sm mb-3">
            Job description profiles. Partition key: <Mono>pk</Mono> ={" "}
            <Mono>{"{uuid}"}</Mono>. No sort key. Populated by the JD processing
            pipeline.
          </p>
          <CodeBlock>{`{
  pk:                        string    // "{uuid}"
  title:                     string
  required_skills:           string[]
  desired_skills:            string[]
  required_certifications:   string[]
  desired_certifications:    string[]
  required_clearance:        string | null
  min_experience_years:      number | null
  location:                  { city: string | null; state: string | null; remote: string | null }
  location_state:            string
  industry_category:         string
  job_title:                 string
  salary_range:              { min: number | null; max: number | null } | null
  skill_names:               string    // comma-separated
  cert_names:                string    // comma-separated
  bucket:                    string
  key:                       string
  possible_duplicate_of?:    string    // pk of duplicate JD
  created_at:                string    // ISO 8601
  updated_at:                string    // ISO 8601
}`}</CodeBlock>
        </SubSection>

        <SubSection title="Lookup Tables">
          <p className="text-sm mb-3">
            Six DynamoDB tables, each a simple set of values used to populate
            filter dropdowns. Upserted atomically at persist time.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              "skills-lookup",
              "certifications-lookup",
              "job-titles-lookup",
              "industry-categories-lookup",
              "cities-lookup",
              "tags-lookup",
            ].map((t) => (
              <div
                key={t}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
              >
                <Database className="w-3.5 h-3.5 text-foreground/30 shrink-0" />
                <code className="text-xs font-mono text-foreground/70">
                  …-{t}
                </code>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title="OpenSearch — talent-profiles index">
          <p className="text-sm">
            Documents replicated from DynamoDB via Streams Lambda. Used for all{" "}
            <Mono>GET /talents</Mono> queries. <Mono>skill_names</Mono> and{" "}
            <Mono>cert_names</Mono> are stored as arrays for term-level
            filtering. Engine: OpenSearch 2.11, single-node{" "}
            <Mono>t3.small.search</Mono>, 10 GB gp3.
          </p>
        </SubSection>
      </Section>

      {/* Search */}
      <Section
        title="Search Implementation"
        icon={<Search className="w-6 h-6" />}
      >
        <p>
          All <Mono>GET /talents</Mono> requests query OpenSearch via a
          dynamically built compound query. Filtering is entirely server-side.
        </p>

        <div className="mt-5 rounded-2xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-slate-800/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
              Query Strategy
            </span>
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {[
              {
                type: "prefix",
                field: "name_lower",
                use: "Name search",
                detail:
                  "Instant prefix matching as users type. Zero latency feel.",
              },
              {
                type: "match / fuzziness:1",
                field: "resume_text, summary",
                use: "Full-text keyword search",
                detail:
                  "Fuzzy matching with edit distance 1. Returns highlight fragments with <mark> tags.",
              },
              {
                type: "term",
                field: "status, clearance, location, category",
                use: "Dropdown filters",
                detail:
                  "Exact-match filtering on enumerated fields. Combinable.",
              },
              {
                type: "terms_set",
                field: "skill_names, cert_names",
                use: "Multi-skill / multi-cert filters",
                detail:
                  "minimum_should_match_script ensures ALL selected values must be present.",
              },
              {
                type: "range",
                field: "years_of_experience",
                use: "Experience range filter",
                detail:
                  "gte / lte bounds. Either or both can be set independently.",
              },
            ].map((row) => (
              <div
                key={row.type}
                className="grid grid-cols-[1fr_1fr_2fr] gap-4 px-5 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs"
              >
                <div>
                  <code className="font-mono font-semibold text-violet-600 dark:text-violet-400">
                    {row.type}
                  </code>
                  <div className="text-[10px] text-foreground/40 mt-0.5 font-mono">
                    {row.field}
                  </div>
                </div>
                <div className="font-medium text-foreground/70 self-center">
                  {row.use}
                </div>
                <div className="text-foreground/50 self-center leading-relaxed">
                  {row.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Auth */}
      <Section
        title="Authentication & Authorization"
        icon={<Key className="w-6 h-6" />}
      >
        <p>
          Cognito with Microsoft Entra ID (Azure AD) federation. The frontend
          uses AWS Amplify v6 for token management and the PKCE OAuth flow.
        </p>
        <AuthFlowDiagram />
        <SubSection title="Email Domain Restriction">
          <p className="text-sm">
            <Mono>VITE_ALLOWED_EMAIL_SUFFIXES</Mono> (e.g.{" "}
            <Mono>@aimory.com</Mono>) enforces a domain check at the UI layer
            after sign-in. This is supplemental — the API independently
            validates the JWT on every request via API Gateway's JWT Authorizer
            regardless of client-side checks.
          </p>
        </SubSection>
      </Section>

      {/* API Reference */}
      <Section title="API Reference" icon={<Network className="w-6 h-6" />}>
        <p>
          All endpoints require{" "}
          <Mono>Authorization: Bearer {"<cognito_id_token>"}</Mono>. Base URL
          from <Mono>VITE_API_ENDPOINT</Mono> (Terraform output:{" "}
          <Mono>api_endpoint</Mono>).
        </p>

        <div className="mt-5 rounded-2xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-slate-800/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
              Endpoints
            </span>
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {API_ENDPOINTS.map((e) => (
              <div
                key={e.method + e.path}
                className="flex gap-4 px-5 py-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors items-start"
              >
                <span
                  className={`shrink-0 px-2.5 py-0.5 rounded-md border text-[11px] font-mono font-bold ${e.methodColor}`}
                >
                  {e.method}
                </span>
                <div className="min-w-0">
                  <code className="text-sm font-mono text-foreground/80 block mb-1">
                    {e.path}
                  </code>
                  <p className="text-xs text-foreground/50 leading-relaxed">
                    {e.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Deployment */}
      <Section
        title="Deployment & Operations"
        icon={<GitBranch className="w-6 h-6" />}
      >
        <SubSection title="Infrastructure">
          <CodeBlock>{`# First-time state backend (one-time only)
cd infra/bootstrap-state
terraform init && terraform apply

# Deploy / update
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan && terraform apply

# Get frontend env values
terraform output cognito_frontend_config`}</CodeBlock>
        </SubSection>

        <SubSection title="Frontend">
          <CodeBlock>{`cd frontend/web
npm run build

AWS_DEFAULT_REGION=us-east-1 \\
  aws s3 sync dist/ s3://{frontend-bucket} --delete

aws cloudfront create-invalidation \\
  --distribution-id {dist-id} --paths "/*"`}</CodeBlock>
        </SubSection>

        <SubSection title="Scheduled Jobs">
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-800/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400">
                  <RefreshCw className="w-3.5 h-3.5" />
                </span>
                <code className="text-xs font-mono font-bold text-foreground">
                  stale_checker
                </code>
              </div>
              <p className="text-xs text-foreground/55 leading-relaxed">
                Runs on an EventBridge schedule. Scans profiles where{" "}
                <Mono>updated_at</Mono> exceeds the configured threshold and
                sets their status to "Stale Candidate".
              </p>
            </div>
            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-800/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-400">
                  <Zap className="w-3.5 h-3.5" />
                </span>
                <code className="text-xs font-mono font-bold text-foreground">
                  lookup-dedup
                </code>
              </div>
              <p className="text-xs text-foreground/55 leading-relaxed">
                Uses Bedrock/Claude to canonicalize near-duplicate skill and
                cert names (e.g. "JavaScript" → "Javascript"). Run manually via{" "}
                <Mono>run_dedup.py --dry-run</Mono> to preview first.
              </p>
            </div>
          </div>
        </SubSection>
      </Section>

      {/* Scripts */}
      <Section
        title="Operational Scripts"
        icon={<Terminal className="w-6 h-6" />}
      >
        <p>
          Located in <Mono>scripts/</Mono>. Require AWS credentials with
          DynamoDB, Lambda, S3, and Step Functions permissions.
        </p>

        <div className="mt-5 rounded-2xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-slate-800/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
              scripts/
            </span>
          </div>
          {[
            {
              script: "backfill_lookups.py",
              desc: "Scans talent_profiles and repopulates all 7 lookup tables. Idempotent.",
              usage:
                "python scripts/backfill_lookups.py --env dev --region us-east-1",
            },
            {
              script: "backfill_opensearch.py",
              desc: "Bulk-indexes all DynamoDB profiles into OpenSearch. Use after index recreation or sync drift.",
              usage:
                "python scripts/backfill_opensearch.py --table aimory-talent-pool-dev-talent-profiles --endpoint <endpoint>",
            },
            {
              script: "reprocess_resumes.py",
              desc: "Re-triggers all resumes through Step Functions. Use --batch-size to avoid rate limits.",
              usage:
                "python scripts/reprocess_resumes.py --bucket <bucket> --sfn-arn <arn> --batch-size 5",
            },
            {
              script: "run_dedup.py",
              desc: "Invokes the lookup-dedup Lambda. Always preview with --dry-run first.",
              usage: "python scripts/run_dedup.py --dry-run",
            },
          ].map(({ script, desc, usage }, i, arr) => (
            <div
              key={script}
              className={`px-5 py-4 ${i < arr.length - 1 ? "border-b border-black/5 dark:border-white/5" : ""}`}
            >
              <code className="text-sm font-mono font-bold text-violet-600 dark:text-violet-400">
                {script}
              </code>
              <p className="text-xs text-foreground/55 mt-1 mb-3">{desc}</p>
              <div className="bg-[#0d1117] rounded-lg px-4 py-2.5 font-mono text-xs text-slate-400 border border-white/5">
                <pre className="whitespace-pre-wrap">{usage}</pre>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Security */}
      <Section title="Security" icon={<Shield className="w-6 h-6" />}>
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          {SECURITY_ITEMS.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-800/60 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-400">
                  {item.icon}
                </span>
                <div>
                  <div className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">
                    {item.label}
                  </div>
                  <div className="text-sm font-semibold text-foreground leading-tight">
                    {item.value}
                  </div>
                </div>
              </div>
              <p className="text-xs text-foreground/55 leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
