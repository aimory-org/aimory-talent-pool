import { Link, useLocation } from "react-router-dom";
import { Users, HelpCircle, LogOut, Moon, Sun } from "lucide-react";
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
  { path: "/", label: "Talent Pool", icon: Users },
  { path: "/help", label: "Help Center", icon: HelpCircle },
];

export function NavBar({ user, onSignOut }: NavBarProps) {
  const location = useLocation();
  const safeName = user.name || user.email;
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-black/5 dark:border-white/5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Nav */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      : "text-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: User + Actions */}
          <div className="flex items-center gap-3">
            {/* User */}
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium text-xs shadow-sm">
                {safeName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-foreground/70 hidden sm:block max-w-[120px] truncate">
                {safeName}
              </span>
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-black/10 dark:bg-white/10" />

            {/* Theme toggle */}
            <button
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="flex items-center justify-center w-8 h-8 rounded-lg text-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200"
              title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* Sign out */}
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
