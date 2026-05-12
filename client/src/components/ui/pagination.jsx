"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

function Pagination({
  className,
  ...props
}) {
  const { t } = useLanguage()

  return (
    <nav
      role="navigation"
      aria-label={t('common.pagination', 'Pagination')}
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props} />
  );
}

function PaginationContent({
  className,
  ...props
}) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props} />
  );
}

function PaginationItem({
  ...props
}) {
  return <li data-slot="pagination-item" {...props} />;
}

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}) {
  return (
    <Button
      asChild
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}>
      <a
        aria-current={isActive ? "page" : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props} />
    </Button>
  );
}

function PaginationPrevious({
  className,
  text,
  ...props
}) {
  const { t } = useLanguage()
  const label = text ?? t('common.previous', 'Previous')

  return (
    <PaginationLink
      aria-label={t('common.previousPage', 'Go to previous page')}
      size="default"
      className={cn("pl-1.5!", className)}
      {...props}>
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{label}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  text,
  ...props
}) {
  const { t } = useLanguage()
  const label = text ?? t('common.next', 'Next')

  return (
    <PaginationLink
      aria-label={t('common.nextPage', 'Go to next page')}
      size="default"
      className={cn("pr-1.5!", className)}
      {...props}>
      <span className="hidden sm:block">{label}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  ...props
}) {
  const { t } = useLanguage()

  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}>
      <MoreHorizontalIcon />
      <span className="sr-only">{t('common.morePages', 'More pages')}</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
