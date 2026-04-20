import { signInWithRedirect, fetchAuthSession } from "aws-amplify/auth";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import { allowedEmailSuffixes, microsoftProvider } from "@/lib/auth";
import { useAuth, signOutUser, type UserInfo } from "@/hooks/useAuth";
import { TalentDashboard } from "./components/TalentDashboard";
import { HelpCenter } from "./components/HelpCenter";
import { AuditLog } from "./components/AuditLog";
import { NavBar } from "./components/ui/navbar";

// ---------------------------------------------------------------------------
// Layout shells
// ---------------------------------------------------------------------------

const AuthenticatedRoutes = ({ user }: { user: UserInfo }) => (
  <div className="min-h-screen bg-background">
    <NavBar user={user} onSignOut={signOutUser} />
    <Routes>
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-white dark:bg-slate-800 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700 p-10 text-center max-w-sm shadow-2xl">
        <div className="relative mx-auto mb-6 w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30" />
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <div className="absolute inset-3 rounded-full bg-linear-to-br from-indigo-500/20 to-purple-500/20" />
        </div>
        <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
          Checking your session
        </p>
        <p className="text-foreground/40 text-sm">Please wait a moment...</p>
      </div>
    </div>
  );
}

function AccessDeniedPanel({ user }: { user: UserInfo }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-md w-full">
        <div className="absolute -inset-0.5 bg-linear-to-r from-red-500/50 to-pink-500/50 rounded-2xl opacity-30 blur" />
        <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-red-500/20 p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <svg
                className="w-5 h-5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-400/70 uppercase tracking-wider">
                Access Restricted
              </p>
              <h3 className="text-lg font-semibold text-foreground">
                Company Account Required
              </h3>
            </div>
          </div>

          <p className="text-foreground/60 text-sm leading-relaxed mb-6">
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
              className="px-4 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground/60 hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground transition-all duration-200 text-sm font-medium"
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl animate-pulse-glow" />
        <div
          className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl animate-pulse-glow"
          style={{ animationDelay: "1s" }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-linear-to-br from-indigo-500/10 via-transparent to-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 animate-gradient-x" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-linear-to-br from-indigo-500 to-purple-600 rounded-2xl blur-xl opacity-50 animate-pulse-glow" />
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 shadow-2xl shadow-indigo-500/30">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">
            <span className="shimmer-text">Talent Pool</span>
          </h1>
          <p className="text-foreground/40 text-sm font-medium">
            Aimory Consulting
          </p>
        </div>

        {/* Card */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 rounded-2xl opacity-20 blur group-hover:opacity-40 transition-opacity duration-500" />
          <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/10 p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Welcome back
              </h2>
              <p className="text-foreground/50 text-sm leading-relaxed">
                Sign in to access the candidate resume database and manage your
                talent pipeline
              </p>
            </div>

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
              className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-slate-800 font-semibold py-3.5 px-4 rounded-xl transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20 dark:hover:shadow-white/20 hover:scale-[1.02] active:scale-[0.98] group/btn"
            >
              <svg
                className="w-5 h-5 transition-transform group-hover/btn:scale-110"
                viewBox="0 0 21 21"
                fill="none"
              >
                <rect width="10" height="10" fill="#f25022" />
                <rect x="11" width="10" height="10" fill="#7fba00" />
                <rect y="11" width="10" height="10" fill="#00a4ef" />
                <rect x="11" y="11" width="10" height="10" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </button>

            <div className="mt-6 pt-6 border-t border-black/10 dark:border-white/10">
              <p className="text-center text-foreground/30 text-xs">
                🔒 Secured with Microsoft Entra ID
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-10 space-y-2">
          <p className="text-foreground/20 text-xs">
            Internal use only • Use your company Microsoft account
          </p>
          <p className="text-foreground/10 text-xs">© 2026 Aimory Consulting</p>
        </div>
      </div>
    </div>
  );
}
