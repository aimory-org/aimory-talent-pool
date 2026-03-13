import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-500 hover:text-gray-900 dark:hover:text-white transition-all duration-200"
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4" />
      )}
    </button>
  );
}

// Dropdown version for more explicit selection
export function ThemeDropdown() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border text-foreground/60 hover:bg-secondary hover:text-foreground transition-all duration-200 text-sm"
        title="Change theme"
      >
        {resolvedTheme === "dark" ? (
          <Moon className="w-4 h-4" />
        ) : (
          <Sun className="w-4 h-4" />
        )}
        <span className="hidden sm:inline capitalize">{theme}</span>
      </button>

      <div className="absolute right-0 top-full mt-2 py-2 bg-card border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-35 z-50">
        <button
          onClick={() => setTheme("light")}
          className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-secondary/50 transition-colors ${
            theme === "light" ? "text-primary" : "text-foreground/70"
          }`}
        >
          <Sun className="w-4 h-4" />
          Light
        </button>
        <button
          onClick={() => setTheme("dark")}
          className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-secondary/50 transition-colors ${
            theme === "dark" ? "text-primary" : "text-foreground/70"
          }`}
        >
          <Moon className="w-4 h-4" />
          Dark
        </button>
        <button
          onClick={() => setTheme("system")}
          className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-secondary/50 transition-colors ${
            theme === "system" ? "text-primary" : "text-foreground/70"
          }`}
        >
          <Monitor className="w-4 h-4" />
          System
        </button>
      </div>
    </div>
  );
}
