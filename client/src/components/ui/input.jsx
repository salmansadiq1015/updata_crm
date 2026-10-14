import * as React from "react"

import { cn } from "@/lib/utils"

/** @param {React.ComponentProps<'input'>} props */
function Input({
  className,
  type,
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-input bg-muted/40 px-3.5 py-2 text-sm shadow-sm transition-all duration-200 outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground/60",
        "hover:border-ring/40 hover:bg-muted/60",
        "focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/15 focus-visible:shadow-[0_0_0_1px_var(--color-ring)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
        className
      )}
      {...props} />
  );
}

export { Input }
