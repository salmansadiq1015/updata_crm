import * as React from "react"
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive/10 text-destructive [a&]:hover:bg-destructive/20",
        success:
          "border-transparent bg-success/10 text-success [a&]:hover:bg-success/20",
        warning:
          "border-transparent bg-warning/10 text-warning [a&]:hover:bg-warning/20",
        outline:
          "border-border text-foreground [a&]:hover:bg-muted",
        ghost:
          "border-transparent [a&]:hover:bg-muted [a&]:hover:text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props} />
  );
}

export { Badge, badgeVariants }
