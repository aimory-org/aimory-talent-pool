/**
 * Sortable table header component with sort indicators.
 */
import { ChevronUp, ChevronDown } from "lucide-react";

interface SortableHeaderProps<T extends string> {
  label: string;
  field: T;
  currentSort: T;
  currentDirection: "asc" | "desc";
  onSort: (field: T) => void;
}

export function SortableHeader<T extends string>({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
}: SortableHeaderProps<T>) {
  const isActive = currentSort === field;
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors group"
      onClick={() => onSort(field)}
    >
      {label}
      <span
        className={`transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
      >
        {isActive && currentDirection === "asc" ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </span>
    </button>
  );
}
