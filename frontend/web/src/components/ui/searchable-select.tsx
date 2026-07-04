import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const filtered = query
    ? options.filter((o) => {
        const label = o.label.toLowerCase();
        const q = query.toLowerCase();
        // Exact match or prefix of the full label
        if (label === q || label.startsWith(q)) return true;
        // Word-prefix matching — only when query is 2+ chars to avoid
        // single-letter matches on short tokens like state codes ("DC", "VA")
        if (q.length >= 2) {
          return label.split(/[\s,/()-]+/).some((word) => word.startsWith(q));
        }
        return false;
      })
    : options;

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = () => {
    if (!disabled) {
      setOpen((o) => !o);
    }
  };

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange("");
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "Enter" && filtered.length > 0) {
      handleSelect(filtered[0].value);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-9 w-full cursor-pointer items-center rounded-lg border border-black/10 px-3 text-sm shadow-sm transition-colors dark:border-white/10",
          "bg-black/5 dark:bg-white/5",
          "hover:border-black/20 hover:bg-black/8 dark:hover:border-white/20 dark:hover:bg-white/8",
          open && "border-ring ring-2 ring-inset ring-ring/30",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={handleOpen}
      >
        {open ? (
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={value ? selectedLabel : placeholder}
            className="min-w-0 flex-1 bg-transparent pr-1 text-sm text-foreground/90 outline-none placeholder:text-foreground/40"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={cn(
              "flex-1 truncate text-sm",
              value ? "text-foreground" : "text-foreground/40",
            )}
          >
            {value ? selectedLabel : placeholder}
          </span>
        )}
        <div className="ml-1 flex shrink-0 items-center gap-0.5">
          {value && !open && (
            <button
              onClick={handleClear}
              className="text-foreground/40 transition-colors hover:text-foreground/70"
              tabIndex={-1}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-foreground/50 transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-black/10 dark:border-white/10 bg-popover shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm text-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  option.value === value &&
                    "bg-accent font-medium text-accent-foreground",
                )}
              >
                {option.label}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-foreground/40">
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { SearchableSelect };
