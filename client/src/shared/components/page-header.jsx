/**
 * Standardized page header used across all pages.
 * @param {{
 *   title: string,
 *   description?: string,
 *   icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>,
 *   count?: number | string,
 *   children?: React.ReactNode
 * }} props
 */
export function PageHeader({ title, description, icon: Icon, count, children }) {
  return (
    <div data-slot="page-header" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon && <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/10 bg-primary/5"><Icon className="size-5 text-primary" aria-hidden="true" /></span>}
          <h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight text-foreground break-words">
            {title}
          </h1>
          {count !== undefined && (
            <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-2 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{children}</div>
      )}
    </div>
  );
}
