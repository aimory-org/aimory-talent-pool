import {
  Upload,
  FileSearch,
  Brain,
  Database,
  Search,
  Shield,
  Zap,
  HelpCircle,
  FileText,
  UserCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Layout helpers
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
    <section id={sectionId} className="mb-12 scroll-mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
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
    <div className="mt-4">
      <h3 className="text-lg font-medium text-foreground/90 mb-2">{title}</h3>
      <div className="text-foreground/70">{children}</div>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-foreground/80">
      {children}
    </div>
  );
}

function Timeline({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-black/10 dark:before:bg-white/10">
      {children}
    </div>
  );
}

function TimelineStep({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 relative">
      <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-sm shrink-0">
        {number}
      </div>
      <div className="pb-4">
        <h4 className="font-medium text-foreground mb-1">{title}</h4>
        <p className="text-foreground/60">{children}</p>
      </div>
    </div>
  );
}

function StatusCard({
  status,
  color,
  description,
}: {
  status: string;
  color: "blue" | "green" | "purple" | "yellow" | "red";
  description: string;
}) {
  const colorClasses: Record<typeof color, string> = {
    blue: "bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-400",
    green:
      "bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    purple:
      "bg-purple-500/20 border-purple-500/30 text-purple-600 dark:text-purple-400",
    yellow:
      "bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/20 border-red-500/30 text-red-600 dark:text-red-400",
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="font-medium mb-1">{status}</div>
      <div className="text-foreground/60 text-sm">{description}</div>
    </div>
  );
}

function FAQ({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 p-4 bg-black/5 dark:bg-slate-700/50 rounded-lg">
      <h4 className="font-medium text-foreground mb-2">{question}</h4>
      <p className="text-foreground/60">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function UserGuide() {
  return (
    <div>
      <Section title="The Big Picture" icon={<Zap className="w-6 h-6" />}>
        <p>
          The Talent Pool automatically reads resumes, extracts important
          information (skills, experience, contact details), and makes
          candidates easy to search and manage.
        </p>
        <p>
          Think of it like a smart filing cabinet that not only stores resumes
          but actually <strong>reads and understands them</strong> — so you can
          quickly find the right candidates without reading through hundreds of
          documents manually.
        </p>
      </Section>

      <Section title="Finding Candidates" icon={<Search className="w-6 h-6" />}>
        <p>
          The dashboard lets you search and filter candidates in several ways:
        </p>

        <SubSection title="Search Bar">
          <p>
            Type any keyword to search across names, skills, certifications, and
            resume content. Searching "Python AWS" finds candidates who mention
            both in their profile. Press Enter or click Search to run the query.
          </p>
        </SubSection>

        <SubSection title="Filters">
          <p>Narrow down results using the filter panel:</p>
          <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
            <li>
              <strong>Status</strong> — Active, Potential, Placed, Stale, or Do
              Not Contact
            </li>
            <li>
              <strong>Service Category</strong> — IT, Accounting, Cybersecurity,
              etc.
            </li>
            <li>
              <strong>Industry</strong> — Filter by industry category from the
              imported resume data.
            </li>
            <li>
              <strong>Job Title</strong> — Match candidates by role title.
            </li>
            <li>
              <strong>Clearance</strong> — Secret, TS, TS/SCI, and higher
            </li>
            <li>
              <strong>Location</strong> — Filter by state and city
            </li>
            <li>
              <strong>Skills</strong> — Add multiple skills to require all
              selected skills.
            </li>
            <li>
              <strong>Certifications</strong> — Add multiple certifications to
              require all selected certifications.
            </li>
            <li>
              <strong>Tags</strong> — Filter by recruiter-managed tags.
            </li>
            <li>
              <strong>Years of Experience</strong> — Set a min and/or max range
              for total experience.
            </li>
          </ul>
        </SubSection>

        <SubSection title="Sorting">
          <p>
            Click any column header to sort. Click again to reverse the order.
            Most useful: sort by "Date Received" to see the newest candidates
            first.
          </p>
        </SubSection>
      </Section>

      <Section
        title="Understanding Candidate Statuses"
        icon={<Database className="w-6 h-6" />}
      >
        <p>
          Each candidate has a status that helps track where they are in your
          process:
        </p>

        <div className="grid gap-3 mt-4">
          <StatusCard
            status="Potential Candidate"
            color="blue"
            description="Newly added to the system. Resume has been processed but no action taken yet."
          />
          <StatusCard
            status="Active Candidate"
            color="green"
            description="Currently being considered for opportunities. Actively in your pipeline."
          />
          <StatusCard
            status="Placed Candidate"
            color="purple"
            description="Successfully placed in a position. Kept for future reference."
          />
          <StatusCard
            status="Stale Candidate"
            color="yellow"
            description="No activity for an extended period. May need to re-engage or refresh their info."
          />
          <StatusCard
            status="Do Not Contact"
            color="red"
            description="Should not be reached out to. Could be due to their request, bad fit, or other reasons."
          />
        </div>

        <Callout>
          <strong>Automatic Stale Detection:</strong> The system automatically
          marks candidates as "Stale" if their profile hasn't been updated in a
          while, helping you focus on fresh, active candidates.
        </Callout>
      </Section>

      <Section
        title="How Resumes Get Into the System"
        icon={<Upload className="w-6 h-6" />}
      >
        <p>Resumes can enter the system in several ways:</p>

        <SubSection title="OneDrive / Power Automate">
          <p>
            When a resume is saved to a specific OneDrive folder, Microsoft
            Power Automate automatically detects it and uploads it to cloud
            storage. This happens in the background — just drop the resume in
            the folder and the system takes care of the rest.
          </p>
        </SubSection>

        <SubSection title="Future Upload Options">
          <p>We're planning to add more ways to get resumes into the system:</p>
          <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
            <li>Drag-and-drop upload directly from this website</li>
            <li>Email forwarding — send resumes to a special email address</li>
            <li>Integration with job boards and LinkedIn</li>
            <li>Bulk import from existing folders</li>
          </ul>
        </SubSection>
      </Section>

      <Section
        title="What Happens to a Resume"
        icon={<FileSearch className="w-6 h-6" />}
      >
        <p>
          Once a resume enters the system, it goes through an automated
          pipeline. Here's what happens, step by step:
        </p>

        <Timeline>
          <TimelineStep number={1} title="Resume Arrives">
            The PDF is saved to secure cloud storage. This triggers the
            processing pipeline to start automatically.
          </TimelineStep>

          <TimelineStep number={2} title="Text Extraction">
            The system reads the text from the PDF. If the PDF is a scanned
            image, OCR technology converts it to readable text. This step takes
            about 30–60 seconds for scanned documents.
          </TimelineStep>

          <TimelineStep number={3} title="AI Analysis">
            An AI assistant reads the extracted text and identifies key
            information: name and contact details, skills and technologies,
            years of experience, security clearance, certifications, work
            history, and location.
          </TimelineStep>

          <TimelineStep number={4} title="Saved to the Database">
            The structured profile is saved, making the candidate immediately
            searchable. The original resume is kept for reference.
          </TimelineStep>
        </Timeline>

        <Callout>
          <strong>How long does this take?</strong> Most resumes are fully
          processed in 1–2 minutes. Scanned documents take a bit longer due to
          the extra OCR step.
        </Callout>
      </Section>

      <Section
        title="The AI Behind the Scenes"
        icon={<Brain className="w-6 h-6" />}
      >
        <p>
          We use AI to understand resumes because people write them in countless
          different formats. The AI (Claude by Anthropic) recognizes these
          variations and extracts the right information regardless of layout —
          like having a very fast assistant who can read and summarize a resume
          in seconds.
        </p>

        <SubSection title="What the AI Does Well">
          <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
            <li>Finds contact information even when formatted unusually</li>
            <li>
              Recognizes skills by different names (e.g., "AWS" vs "Amazon Web
              Services")
            </li>
            <li>Estimates years of experience from work history dates</li>
            <li>
              Identifies security clearances mentioned anywhere in the document
            </li>
          </ul>
        </SubSection>

        <SubSection title="What the AI Might Miss">
          <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
            <li>Information embedded in images or graphics within the PDF</li>
            <li>Very unusual abbreviations or internal company jargon</li>
            <li>Details that are implied but not explicitly stated</li>
          </ul>
        </SubSection>

        <Callout>
          <strong>Can I fix mistakes?</strong> Yes — click on any candidate to
          open their profile, then click Edit to correct or add anything the AI
          missed. Your changes are saved immediately.
        </Callout>
      </Section>

      <Section
        title="Job Descriptions & Candidate Matching"
        icon={<FileText className="w-6 h-6" />}
      >
        <p>
          The Job Descriptions tab lets you upload job requirements and
          automatically find the best-matching candidates in your talent pool.
        </p>

        <SubSection title="Uploading a Job Description">
          <p>
            Click the <strong>Upload</strong> button on the Job Descriptions
            page. You can drag-and-drop or browse for a PDF, DOC, or DOCX file
            (up to 10 MB). The system processes the document through the same AI
            pipeline as resumes — extracting required skills, certifications,
            clearance level, experience requirements, salary range, and
            location.
          </p>
        </SubSection>

        <SubSection title="Matching Candidates">
          <p>
            Open any job description and click <strong>Find Matches</strong>.
            The AI compares the job requirements against every candidate in the
            talent pool and returns a ranked list with match scores and a brief
            rationale explaining why each candidate is (or isn't) a strong fit.
          </p>
        </SubSection>

        <SubSection title="Filtering &amp; Sorting">
          <p>
            The Job Descriptions table supports the same filter and sort
            controls as the Talent Dashboard — filter by clearance, location,
            industry, or required skills, and click column headers to sort.
          </p>
        </SubSection>

        <Callout>
          <strong>Processing time:</strong> Uploaded job descriptions are
          typically processed in 1–2 minutes, just like resumes.
        </Callout>
      </Section>

      <Section
        title="Duplicate Detection"
        icon={<UserCheck className="w-6 h-6" />}
      >
        <p>
          When the same person submits multiple resumes (different file names,
          updated versions, etc.), the system flags potential duplicates
          automatically.
        </p>

        <SubSection title="How It Works">
          <p>
            During processing, the system compares the candidate's name against
            existing profiles. If a match is found, the new profile gets an
            amber notification dot on its avatar in the talent table.
          </p>
        </SubSection>

        <SubSection title="Reviewing Duplicates">
          <p>
            Click on a flagged candidate to open their profile. A yellow warning
            banner shows which existing profile they may be a duplicate of. You
            can:
          </p>
          <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
            <li>
              <strong>Dismiss</strong> — Click the Dismiss button if it's a
              false positive (different person with the same name). The warning
              is removed permanently.
            </li>
            <li>
              <strong>Review manually</strong> — Compare both profiles and
              decide which to keep or update.
            </li>
          </ul>
        </SubSection>
      </Section>

      <Section title="Security & Privacy" icon={<Shield className="w-6 h-6" />}>
        <p>Candidate information is sensitive. Here's how we keep it safe:</p>

        <SubSection title="Who Can Access">
          <p>
            Only people with approved company Microsoft accounts can sign in. We
            use your existing Microsoft login — the same one you use for Outlook
            and Teams. No extra passwords to remember.
          </p>
        </SubSection>

        <SubSection title="Data Storage">
          <p>
            All data is stored in Amazon Web Services (AWS) data centers with
            enterprise-grade security. Resumes and candidate information are
            encrypted both at rest and in transit.
          </p>
        </SubSection>

        <SubSection title="Access Logging">
          <p>
            The system logs who accesses what and when, creating an audit trail
            for compliance purposes.
          </p>
        </SubSection>
      </Section>

      <Section
        title="Frequently Asked Questions"
        icon={<HelpCircle className="w-6 h-6" />}
      >
        <FAQ question="How long until a new resume appears in the system?">
          Usually 1–2 minutes. Scanned documents (images) may take up to 3–4
          minutes because of the extra OCR step.
        </FAQ>

        <FAQ question="Can I upload resumes directly from this website?">
          Not yet, but it's on our roadmap. For now, use the designated OneDrive
          folder and Power Automate will handle the rest.
        </FAQ>

        <FAQ question="What if the AI extracts wrong information?">
          Click on any candidate to open their profile, then click Edit to fix
          any information. Your changes are saved immediately.
        </FAQ>

        <FAQ question="Can I download the original resume?">
          Yes — open a candidate's profile and use the "View Resume" or
          "Download Resume" button to access the original PDF.
        </FAQ>

        <FAQ question="Why did a candidate become 'Stale'?">
          The system automatically marks candidates as Stale if their profile
          hasn't had any activity for an extended period. This helps you focus
          on active candidates. You can change their status at any time.
        </FAQ>

        <FAQ question="Is candidate data backed up?">
          Yes. All data is stored redundantly across multiple AWS data centers
          with automated, versioned backups.
        </FAQ>

        <FAQ question="Who built this system?">
          The AIMORY Talent Pool was developed by Ben and Kyle as an internal
          tool to streamline the recruiting process.
        </FAQ>

        <FAQ question="How does duplicate detection work?">
          When a new resume is processed, the system checks if a candidate with
          the same name already exists. If a match is found, the new profile is
          flagged as a possible duplicate. You can review the flagged profile
          and either dismiss the warning or merge the records.
        </FAQ>

        <FAQ question="How do I upload a job description?">
          Go to the Job Descriptions tab and click the Upload button. You can
          drag-and-drop or browse for a PDF, DOC, or DOCX file. The system will
          process it automatically and extract requirements like skills,
          clearance, and experience.
        </FAQ>
      </Section>
    </div>
  );
}
