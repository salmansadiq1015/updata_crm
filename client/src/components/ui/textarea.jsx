import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-xl border border-input bg-muted/40 px-3.5 py-2.5 text-sm shadow-sm transition-all duration-200 outline-none",
        "placeholder:text-muted-foreground/60",
        "hover:border-ring/40 hover:bg-muted/60",
        "focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/15 focus-visible:shadow-[0_0_0_1px_var(--color-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
        className
      )}
      {...props} />
  );
}

export { Textarea }
