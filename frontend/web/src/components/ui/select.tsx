import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.ComponentProps<"select">, "children"> {
  options: SelectOption[];
  placeholder?: string;
}

function Select({
  className,
  options,
  placeholder = "Select...",
  ...props
}: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "flex h-9 w-full appearance-none rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 pr-8 text-sm text-foreground/90 shadow-sm transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring",
          "hover:border-black/20 dark:hover:border-white/20 hover:bg-black/8 dark:hover:bg-white/8",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&>option]:bg-popover [&>option]:text-foreground",
          className,
        )}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
    </div>
  );
}

export { Select };
