/**
 * Standardized page header used across all pages.
 * @param {{
 *   title: string,
 *   description?: string,
 *   count?: number | string,
 *   children?: React.ReactNode
 * }} props
 */
export function PageHeader({ title, description, count, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-border">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight text-foreground truncate">
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
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      )}
    </div>
  );
}
