import * as React from "react"
import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-xs font-medium text-white/60 uppercase tracking-wider",
        className
      )}
      {...props}
    />
  )
}

export { Label }
