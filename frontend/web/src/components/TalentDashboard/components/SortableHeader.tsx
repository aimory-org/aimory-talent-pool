/**
 * Sortable table header component with sort indicators.
 */
import { ChevronUp, ChevronDown } from "lucide-react"
import type { SortField, SortDirection } from "../types"

interface SortableHeaderProps {
  label: string
  field: SortField
  currentSort: SortField
  currentDirection: SortDirection
  onSort: (field: SortField) => void
}

export function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
}: SortableHeaderProps) {
  const isActive = currentSort === field
  return (
    <button
      className="flex items-center gap-1 hover:text-white transition-colors group"
      onClick={() => onSort(field)}
    >
      {label}
      <span className={`transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}>
        {isActive && currentDirection === "asc" ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </span>
    </button>
  )
}
