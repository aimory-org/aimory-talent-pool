import { useEffect, useState, useCallback } from "react";
import {
  signInWithRedirect,
  signOut,
  fetchAuthSession,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import "./App.css";
import { allowedEmailSuffixes, microsoftProvider } from "@/lib/auth";
import { TalentDashboard } from "./components/TalentDashboard";
import { HowItWorks } from "./components/HowItWorks";

interface UserInfo {
  username: string;
  email: string;
  name?: string;
}

const SignOutButton = () => {
  const handleClick = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign-out failed", error);
    }
  };

  return (
    <button
      className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-200 text-sm font-medium"
      onClick={handleClick}
    >
      Sign out
    </button>
  );
};

const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkUser = useCallback(async () => {
    try {
      // Fetch session and parse user info from ID token
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;

      if (!idToken) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Parse claims from the ID token payload
      const payload = idToken.payload;
      setUser({
        username: (payload.sub as string) || "unknown",
        email:
          (payload.email as string) || (payload.sub as string) || "unknown",
        name: payload.name as string | undefined,
      });

      // Clear the OAuth code from URL after successful auth
      if (window.location.search.includes("code=")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (err) {
      console.debug("No authenticated user:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Listen for auth events
    const unsubscribe = Hub.listen(
      "auth",
      ({ payload }: { payload: { event: string } }) => {
        console.debug("Auth event:", payload.event);
        switch (payload.event) {
          case "signedIn":
          case "signInWithRedirect":
          case "tokenRefresh":
            checkUser();
            break;
          case "signedOut":
            setUser(null);
            setIsLoading(false);
            break;
          case "signInWithRedirect_failure":
            console.error("OAuth redirect failed");
            setIsLoading(false);
            break;
        }
      },
    );

    // Initial auth check
    checkUser();

    return unsubscribe;
  }, [checkUser]);

  return { user, isLoading };
};

const InsightsGrid = ({ user }: { user: UserInfo }) => {
  const safeName = user.name || user.email;

  return (
    <div className="w-full">
      {/* User Info Bar */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-linear-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-white/10 text-white font-semibold text-sm shadow-lg shadow-indigo-500/10">
              {safeName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{safeName}</p>
              <p className="text-xs text-white/40">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/how-it-works"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-200 text-sm"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">How It Works</span>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* Talent Dashboard */}
      <TalentDashboard />
    </div>
  );
};

// Authenticated routes wrapper
const AuthenticatedRoutes = ({ user }: { user: UserInfo }) => {
  return (
    <Routes>
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="*" element={<InsightsGrid user={user} />} />
    </Routes>
  );
};

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 -left-20 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl" />
        </div>

        <div className="relative bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-white/10 p-10 text-center max-w-sm shadow-2xl">
          <div className="relative mx-auto mb-6 w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30" />
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full bg-linear-to-br from-indigo-500/20 to-purple-500/20" />
          </div>
          <p className="text-white/70 font-medium mb-1">
            Checking your session
          </p>
          <p className="text-white/40 text-sm">Please wait a moment...</p>
        </div>
      </div>
    );
  }

  // Signed in - check access and show routes
  if (user) {
    const accountAllowed =
      allowedEmailSuffixes.length === 0 ||
      allowedEmailSuffixes.some((suffix: string) =>
        user.email.toLowerCase().endsWith(suffix),
      );

    if (!accountAllowed) {
      return <AccessDeniedPanel user={user} />;
    }

    return <AuthenticatedRoutes user={user} />;
  }

  // Not signed in - show landing
  return <LoginPage />;
}

// Access denied panel (extracted for clarity)
const AccessDeniedPanel = ({ user }: { user: UserInfo }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-md w-full">
        <div className="absolute -inset-0.5 bg-linear-to-r from-red-500/50 to-pink-500/50 rounded-2xl opacity-30 blur" />
        <div className="relative bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-red-500/20 p-8 shadow-2xl">
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
              <h3 className="text-lg font-semibold text-white">
                Company Account Required
              </h3>
            </div>
          </div>

          <p className="text-white/60 text-sm leading-relaxed mb-6">
            You signed in as{" "}
            <span className="text-white font-medium">{user.email}</span>. Only
            accounts ending with{" "}
            <span className="text-white font-medium">
              {allowedEmailSuffixes
                .map((suffix: string) => suffix.replace(/^@?/, "@"))
                .join(" or ")}
            </span>{" "}
            have access to this environment.
          </p>

          <div className="flex flex-col gap-3">
            <SignOutButton />
            <p className="text-center text-white/30 text-xs">
              Sign out and try again with your company account
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Login page (extracted for clarity)
const LoginPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl animate-pulse-glow" />
        <div
          className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl animate-pulse-glow"
          style={{ animationDelay: "1s" }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-linear-to-br from-indigo-500/10 via-transparent to-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Gradient line at top */}
      <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-x" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Brand */}
        <div className="text-center mb-10">
          <div className="relative inline-block mb-6">
            {/* Glow effect */}
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
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
            Talent Pool
          </h1>
          <p className="text-white/40 text-sm font-medium">Aimory Consulting</p>
        </div>

        {/* Login Card */}
        <div className="relative group">
          {/* Gradient border effect */}
          <div className="absolute -inset-0.5 bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl opacity-30 blur group-hover:opacity-50 transition-opacity duration-500" />

          <div className="relative bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-white mb-2">
                Welcome back
              </h2>
              <p className="text-white/50 text-sm leading-relaxed">
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
                  // No session - proceed to sign in
                }
                await signInWithRedirect({ provider: microsoftProvider });
              }}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-slate-800 font-semibold py-3.5 px-4 rounded-xl transition-all duration-300 hover:shadow-xl hover:shadow-white/20 hover:scale-[1.02] active:scale-[0.98] group/btn"
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

            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-center text-white/30 text-xs">
                🔒 Secured with Microsoft Entra ID
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-10 space-y-2">
          <p className="text-white/20 text-xs">
            Internal use only • Use your company Microsoft account
          </p>
          <p className="text-white/10 text-xs">© 2026 Aimory Consulting</p>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
