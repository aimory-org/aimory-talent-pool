import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center justify-center w-9 h-9 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground/60 hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground transition-all duration-200"
      title={`Theme: ${theme} (click to cycle)`}
    >
      {theme === "dark" && <Moon className="w-4 h-4" />}
      {theme === "light" && <Sun className="w-4 h-4" />}
      {theme === "system" && <Monitor className="w-4 h-4" />}
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
