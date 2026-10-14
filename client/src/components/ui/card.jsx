import * as React from "react"

import { cn } from "@/lib/utils"

/** @param {React.ComponentProps<'div'>} props */
function Card({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-xl border border-border bg-card text-sm text-card-foreground shadow-theme-sm transition-colors",
        className
      )}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'>} props */
function CardHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex flex-col gap-1 px-5 pt-5 pb-3",
        className
      )}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'>} props */
function CardTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-none tracking-tight",
        className
      )}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'>} props */
function CardDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'>} props */
function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'>} props */
function CardContent({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 pb-5", className)}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'>} props */
function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-border px-5 py-4",
        className
      )}
      {...props} />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
