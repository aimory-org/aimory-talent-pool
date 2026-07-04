import { signInWithRedirect, fetchAuthSession } from "aws-amplify/auth";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { allowedEmailSuffixes, microsoftProvider } from "@/lib/auth";
import { useAuth, signOutUser, type UserInfo } from "@/hooks/useAuth";
import { TalentDashboard } from "./components/TalentDashboard";
import { JobDescriptionsDashboard, ArchivedJobDescriptionsDashboard } from "./components/JobDescriptions";
import { HelpCenter } from "./components/HelpCenter";
import { AuditLog } from "./components/AuditLog";
import { NavBar } from "./components/ui/navbar";
import { logoPlum, logoWhite } from "@/assets/brand";

// ---------------------------------------------------------------------------
// Layout shells
// ---------------------------------------------------------------------------

const AuthenticatedRoutes = ({ user }: { user: UserInfo }) => (
  <div className="min-h-screen bg-background">
    <NavBar user={user} onSignOut={signOutUser} />
    <Routes>
      <Route path="/job-descriptions" element={<JobDescriptionsDashboard />} />
      <Route path="/job-descriptions/archived" element={<ArchivedJobDescriptionsDashboard />} />
      <Route path="/help" element={<HelpCenter />} />
      <Route path="/audit" element={<AuditLog />} />
      <Route path="*" element={<TalentDashboard />} />
    </Routes>
  </div>
);

// ---------------------------------------------------------------------------
// App logic
// ---------------------------------------------------------------------------

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  if (user) {
    const accountAllowed =
      allowedEmailSuffixes.length === 0 ||
      allowedEmailSuffixes.some((suffix: string) =>
        user.email.toLowerCase().endsWith(suffix),
      );

    if (!accountAllowed) return <AccessDeniedPanel user={user} />;
    return <AuthenticatedRoutes user={user} />;
  }

  return <LoginPage />;
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;

// ---------------------------------------------------------------------------
// Full-screen states
// ---------------------------------------------------------------------------

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="relative mx-auto mb-6 w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-foreground font-medium mb-1">
          Checking your session
        </p>
        <p className="text-muted-foreground text-sm">Please wait a moment...</p>
      </div>
    </div>
  );
}

function AccessDeniedPanel({ user }: { user: UserInfo }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs font-semibold text-destructive/70 uppercase tracking-wider">
                Access Restricted
              </p>
              <h3 className="text-lg font-semibold text-foreground">
                Company Account Required
              </h3>
            </div>
          </div>

          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            You signed in as{" "}
            <span className="text-foreground font-medium">{user.email}</span>.
            Only accounts ending with{" "}
            <span className="text-foreground font-medium">
              {allowedEmailSuffixes
                .map((s: string) => s.replace(/^@?/, "@"))
                .join(" or ")}
            </span>{" "}
            have access to this environment.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={signOutUser}
              className="px-4 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-sm font-medium"
            >
              Sign out
            </button>
            <p className="text-center text-foreground/30 text-xs">
              Sign out and try again with your company account
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        {/* Brand — same logo lockup + flanked-caption device as the nav, scaled up */}
        <div className="flex flex-col items-center mb-10">
          <div className="h-14 overflow-hidden flex items-start justify-center mb-1">
            <img
              src={logoPlum}
              alt="Aimory Consulting"
              className="h-24 w-auto shrink-0 dark:hidden"
            />
            <img
              src={logoWhite}
              alt="Aimory Consulting"
              className="hidden h-24 w-auto shrink-0 dark:block"
            />
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-px w-4 bg-border-strong" />
            <span className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
              Recruiting Hub
            </span>
            <span className="h-px w-4 bg-border-strong" />
          </div>
          <p className="text-muted-foreground text-sm">Sign in to continue</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-foreground text-center mb-8">
            Welcome back
          </h2>

          <button
            onClick={async () => {
              try {
                const session = await fetchAuthSession();
                if (session.tokens) {
                  window.location.reload();
                  return;
                }
              } catch {
                // No active session — proceed to sign in
              }
              await signInWithRedirect({ provider: microsoftProvider });
            }}
            className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold py-3.5 px-4 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
              <rect width="10" height="10" fill="#f25022" />
              <rect x="11" width="10" height="10" fill="#7fba00" />
              <rect y="11" width="10" height="10" fill="#00a4ef" />
              <rect x="11" y="11" width="10" height="10" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-center text-muted-foreground text-xs">
              Secured with Microsoft Entra ID
            </p>
          </div>
        </div>

        <div className="text-center mt-10 space-y-2">
          <p className="text-foreground/30 text-xs">
            Internal use only • Use your company Microsoft account
          </p>
          <p className="text-foreground/20 text-xs">© 2026 Aimory Consulting</p>
        </div>
      </div>
    </div>
  );
}
