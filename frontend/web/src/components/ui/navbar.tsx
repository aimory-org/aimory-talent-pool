import { Link, useLocation } from "react-router-dom";
import {
  Users,
  FileText,
  HelpCircle,
  LogOut,
  Moon,
  Sun,
  ClipboardList,
} from "lucide-react";
import { useTheme } from "@/lib/theme";

interface UserInfo {
  username: string;
  email: string;
  name?: string;
}

interface NavBarProps {
  user: UserInfo;
  onSignOut: () => void;
}

const navItems = [
  { path: "/", label: "Talent Pool", icon: Users, orange: false },
  { path: "/job-descriptions", label: "Job Descriptions", icon: FileText, orange: true },
  { path: "/audit", label: "Activity", icon: ClipboardList, orange: false },
  { path: "/help", label: "Help Center", icon: HelpCircle, orange: false },
];

export function NavBar({ user, onSignOut }: NavBarProps) {
  const location = useLocation();
  const safeName = user.name || user.email;
  const { resolvedTheme, setTheme } = useTheme();
  const initials = safeName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-b border-black/6 dark:border-white/6 sticky top-0 z-50 shadow-sm shadow-black/5">
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-indigo-500 via-violet-500 to-purple-500" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Nav Items */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive =
                path === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-foreground/50 hover:text-foreground"
                  }`}
                >
                  {/* Hover bg */}
                  <span
                    className={`absolute inset-0 rounded-lg transition-all duration-200 ${
                      isActive
                        ? "bg-indigo-500/10"
                        : "bg-transparent group-hover:bg-black/5 dark:group-hover:bg-white/5"
                    }`}
                  />
                  <Icon className="w-3.5 h-3.5 relative" />
                  <span className="hidden sm:inline relative">{label}</span>
                  {/* Active underline dot */}
                  {isActive && (
                    <span className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-linear-to-r from-indigo-500 to-violet-500" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: User + Actions */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="relative flex items-center justify-center w-8 h-8 rounded-lg text-foreground/40 hover:text-foreground transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5"
              title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="w-4 h-4 transition-transform duration-300 hover:rotate-45" />
              ) : (
                <Moon className="w-4 h-4 transition-transform duration-300 hover:-rotate-12" />
              )}
            </button>

            <div className="h-5 w-px bg-black/10 dark:bg-white/10" />

            {/* User chip */}
            <div className="flex items-center gap-2 pl-1">
              <div className="h-7 w-7 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-semibold text-[11px] shadow-md shadow-indigo-500/30 shrink-0">
                {initials}
              </div>
              <span className="text-sm text-foreground/60 hidden md:block max-w-[140px] truncate">
                {safeName}
              </span>
            </div>

            <div className="h-5 w-px bg-black/10 dark:bg-white/10" />

            {/* Sign out */}
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-foreground/40 hover:text-red-500 hover:bg-red-500/8 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
