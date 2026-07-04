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
import { logoPlum, logoWhite } from "@/assets/brand";

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
    <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          {/* Brand — logo lockup image cropped (top-aligned, container shorter
              than the image) to hide the baked-in tagline line, plus our own
              product subtitle in its place. */}
          <Link to="/" className="flex flex-col items-center shrink-0 gap-0.5">
            <div className="h-9 overflow-hidden flex items-start">
              <img
                src={logoPlum}
                alt="Aimory Consulting"
                className="h-16 w-auto shrink-0 dark:hidden"
              />
              <img
                src={logoWhite}
                alt="Aimory Consulting"
                className="hidden h-16 w-auto shrink-0 dark:block"
              />
            </div>
            <span className="hidden sm:flex items-center gap-1.5">
              <span className="h-px w-2.5 bg-border-strong" />
              <span className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
                Recruiting Hub
              </span>
              <span className="h-px w-2.5 bg-border-strong" />
            </span>
          </Link>

          {/* Nav Items */}
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive =
                path === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`relative flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 group ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {/* Hover bg */}
                  <span
                    className={`absolute inset-0 rounded-lg transition-colors duration-150 ${
                      isActive
                        ? "bg-accent"
                        : "bg-transparent group-hover:bg-secondary"
                    }`}
                  />
                  <Icon className="w-3.5 h-3.5 relative" />
                  <span className="hidden lg:inline relative">{label}</span>
                  {/* Active underline */}
                  {isActive && (
                    <span className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: User + Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Theme toggle */}
            <button
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="relative flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground transition-colors duration-150 hover:bg-secondary"
              title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <div className="hidden sm:block h-5 w-px bg-border" />

            {/* User chip */}
            <div className="hidden sm:flex items-center gap-2 pl-1">
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-[11px] shrink-0">
                {initials}
              </div>
              <span className="text-sm text-muted-foreground hidden md:block max-w-[140px] truncate">
                {safeName}
              </span>
            </div>

            <div className="hidden sm:block h-5 w-px bg-border" />

            {/* Sign out */}
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors duration-150"
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
