import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  FileSearch,
  Brain,
  Database,
  Search,
  Shield,
  Cloud,
  Zap,
  HelpCircle,
} from "lucide-react";

export function HowItWorks() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-black/10 dark:border-white/10 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground/60 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            How the Talent Pool Works
          </h1>
          <p className="text-xl text-foreground/60">
            A simple guide to understanding how resumes become searchable
            candidate profiles.
          </p>
        </div>

        {/* The Big Picture */}
        <Section title="The Big Picture" icon={<Zap className="w-6 h-6" />}>
          <p>
            The Talent Pool is a system that automatically reads resumes,
            extracts important information (like skills, experience, and contact
            details), and makes candidates easy to search and manage.
          </p>
          <p>
            Think of it like a smart filing cabinet that not only stores resumes
            but actually
            <strong> reads and understands them</strong>, so you can quickly
            find the right candidates without manually reading through hundreds
            of documents.
          </p>
        </Section>

        {/* How Resumes Get Into the System */}
        <Section
          title="How Resumes Get Into the System"
          icon={<Upload className="w-6 h-6" />}
        >
          <p>Resumes can enter the system in several ways:</p>

          <SubSection title="OneDrive / Power Automate (Current)">
            <p>
              When a resume is saved to a specific OneDrive folder, Microsoft
              Power Automate automatically detects the new file and uploads it
              to our cloud storage. This happens in the background — you just
              drop the resume in the folder and the system takes care of the
              rest.
            </p>
          </SubSection>

          <SubSection title="Direct Upload (Coming Soon)">
            <p>
              We're planning to add more ways to get resumes into the system,
              such as:
            </p>
            <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
              <li>Drag-and-drop upload directly from this website</li>
              <li>
                Email forwarding — send resumes to a special email address
              </li>
              <li>Integration with job boards and LinkedIn</li>
              <li>Bulk import from existing folders</li>
            </ul>
          </SubSection>

          <Callout>
            <strong>Why multiple options?</strong> Different recruiters work
            differently. Some prefer OneDrive, others might want to upload
            directly. We're building flexibility so everyone can use what works
            best for them.
          </Callout>
        </Section>

        {/* What Happens to a Resume */}
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
              The PDF is saved to secure cloud storage (Amazon S3). This
              triggers the processing pipeline to start.
            </TimelineStep>

            <TimelineStep number={2} title="Text Extraction">
              The system reads the text from the PDF. If the PDF is a scanned
              image (like a photo of a printed resume), we use OCR technology to
              "read" the image and convert it to text. This takes about 30-60
              seconds for scanned documents.
            </TimelineStep>

            <TimelineStep number={3} title="AI Analysis">
              An AI assistant (Claude, made by Anthropic) reads the extracted
              text and identifies key information:
              <ul className="list-disc list-inside text-foreground/60 mt-2 ml-4 space-y-1">
                <li>Name and contact information</li>
                <li>Skills and technologies</li>
                <li>Years of experience</li>
                <li>Security clearance level</li>
                <li>Certifications</li>
                <li>Work history and companies</li>
                <li>Location</li>
              </ul>
            </TimelineStep>

            <TimelineStep number={4} title="Save to Database">
              The structured information is saved to a database, making the
              candidate searchable. The original resume is also kept for
              reference.
            </TimelineStep>
          </Timeline>

          <Callout>
            <strong>How long does this take?</strong> Most resumes are fully
            processed in 1-2 minutes. Scanned documents (images) take a bit
            longer because of the extra step to read the image.
          </Callout>
        </Section>

        {/* The AI Behind the Scenes */}
        <Section
          title="The AI Behind the Scenes"
          icon={<Brain className="w-6 h-6" />}
        >
          <p>
            We use AI to understand resumes because humans write them in
            countless different formats. Some use bullet points, others use
            paragraphs. Some list skills in a sidebar, others sprinkle them
            throughout work experience.
          </p>
          <p>
            The AI (Claude) is trained to understand these variations and
            extract the right information regardless of format. It's like having
            a very fast assistant who can read and summarize a resume in
            seconds.
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
                Identifies security clearances mentioned anywhere in the
                document
              </li>
            </ul>
          </SubSection>

          <SubSection title="What the AI Might Miss">
            <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
              <li>Information in images or graphics within the PDF</li>
              <li>Very unusual abbreviations or internal company jargon</li>
              <li>Details that are implied but not explicitly stated</li>
            </ul>
          </SubSection>

          <Callout>
            <strong>Can I fix mistakes?</strong> Yes! You can edit candidate
            information directly in the dashboard. The AI gives us a great
            starting point, but you have full control to correct or add anything
            it missed.
          </Callout>
        </Section>

        {/* Finding Candidates */}
        <Section
          title="Finding Candidates"
          icon={<Search className="w-6 h-6" />}
        >
          <p>
            The main dashboard lets you search and filter candidates in several
            ways:
          </p>

          <SubSection title="Search Bar">
            <p>
              Type any keyword to search across names, skills, certifications,
              and more. For example, searching "Python AWS" will find candidates
              who have both Python and AWS mentioned in their profile.
            </p>
          </SubSection>

          <SubSection title="Filters">
            <p>Narrow down results using the filter panel:</p>
            <ul className="list-disc list-inside text-foreground/70 space-y-1 ml-4">
              <li>
                <strong>Status</strong> — Active, Potential, Placed, Stale, or
                Do Not Contact
              </li>
              <li>
                <strong>Talent Bucket</strong> — IT, Accounting/Finance, HR,
                Business Dev/Sales
              </li>
              <li>
                <strong>Category</strong> — Developer, Project Manager, Cloud
                Expert, etc.
              </li>
              <li>
                <strong>Clearance</strong> — Secret, TS, TS/SCI, and higher
              </li>
              <li>
                <strong>Location</strong> — Filter by state
              </li>
            </ul>
          </SubSection>

          <SubSection title="Sorting">
            <p>
              Click any column header to sort. Click again to reverse the order.
              Most useful: sort by "Date Received" to see newest candidates
              first.
            </p>
          </SubSection>
        </Section>

        {/* Candidate Statuses */}
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
              description="Successfully placed in a position. Keep for future reference."
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
            marks candidates as "Stale" if their profile hasn't been updated in
            a while. This helps you focus on fresh candidates.
          </Callout>
        </Section>

        {/* Security & Privacy */}
        <Section
          title="Security & Privacy"
          icon={<Shield className="w-6 h-6" />}
        >
          <p>Candidate information is sensitive. Here's how we keep it safe:</p>

          <SubSection title="Who Can Access">
            <p>
              Only people with approved company Microsoft accounts can sign in.
              We use your existing Microsoft login — the same one you use for
              Outlook and Teams. No extra passwords to remember.
            </p>
          </SubSection>

          <SubSection title="Data Storage">
            <p>
              All data is stored in Amazon Web Services (AWS) data centers with
              enterprise-grade security. Resumes and candidate information are
              encrypted both when stored and when transmitted.
            </p>
          </SubSection>

          <SubSection title="Access Logging">
            <p>
              The system logs who accesses what and when. This creates an audit
              trail for compliance purposes.
            </p>
          </SubSection>
        </Section>

        {/* Technical Architecture (Simplified) */}
        <Section
          title="Under the Hood (For the Curious)"
          icon={<Cloud className="w-6 h-6" />}
        >
          <p>
            You don't need to know this, but if you're curious about what's
            actually running behind the scenes:
          </p>

          <div className="bg-black/5 dark:bg-slate-700/50 rounded-xl p-6 mt-4 font-mono text-sm">
            <pre className="text-foreground/70 whitespace-pre-wrap">
              {`Resume Upload (OneDrive/Power Automate)
         ↓
    S3 Storage (Amazon cloud file storage)
         ↓
    Lambda Functions (small programs that process the resume)
         ↓
    Textract (Amazon's service that reads text from PDFs/images)
         ↓
    Bedrock/Claude (AI that understands the resume content)
         ↓
    DynamoDB (database that stores structured candidate info)
         ↓
    This Website (React app that shows you everything)`}
            </pre>
          </div>

          <p className="mt-4 text-foreground/50 text-sm">
            Everything runs on Amazon Web Services (AWS) and scales
            automatically. Whether we have 10 resumes or 10,000, the system
            handles it the same way.
          </p>
        </Section>

        {/* FAQ */}
        <Section
          title="Frequently Asked Questions"
          icon={<HelpCircle className="w-6 h-6" />}
        >
          <FAQ question="How long until a new resume appears in the system?">
            Usually 1-2 minutes. Scanned documents (images) may take up to 3-4
            minutes because of the extra OCR step.
          </FAQ>

          <FAQ question="Can I upload resumes directly from this website?">
            Not yet, but it's on our roadmap. For now, use the OneDrive folder
            and Power Automate will handle the rest.
          </FAQ>

          <FAQ question="What if the AI extracts wrong information?">
            Click on any candidate to open their details, then click the edit
            button to fix any information. Your changes are saved immediately.
          </FAQ>

          <FAQ question="Can I download the original resume?">
            Yes! Click on a candidate and use the "Download Resume" button to
            get the original PDF file.
          </FAQ>

          <FAQ question="Why did a candidate become 'Stale'?">
            The system automatically marks candidates as stale if their profile
            hasn't had any activity for an extended period. This helps you focus
            on active candidates. You can change their status anytime.
          </FAQ>

          <FAQ question="Is candidate data backed up?">
            Yes. All data is stored redundantly across multiple AWS data
            centers. We also keep versioned backups of the database.
          </FAQ>

          <FAQ question="Who built this system?">
            The AIMORY Talent Pool was developed by Ben and Kyle as an internal
            tool to streamline the recruiting process.
          </FAQ>
        </Section>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-black/10 dark:border-white/10 text-center">
          <p className="text-foreground/40 text-sm">
            Questions or feedback? Reach out to the development team.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 mt-4 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

// Helper Components

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
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
  color: string;
  description: string;
}) {
  const colorClasses: Record<string, string> = {
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
