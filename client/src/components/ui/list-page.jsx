'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

export function ListPage({ children, className }) {
  return <div className={cn('space-y-4', className)}>{children}</div>;
}

function Header({ icon: Icon, title, description, action }) {
  return (
    <div data-slot="page-header" className="flex flex-wrap items-start justify-between gap-4 pb-2">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Toolbar({ children, className }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

function DefaultSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
    </div>
  );
}

function Body({ isLoading, isError, isEmpty, empty, skeleton, errorMessage, children }) {
  if (isLoading) return skeleton ?? <DefaultSkeleton />;
  if (isError) {
    return (
      <EmptyState
        icon={empty?.icon}
        title={errorMessage || 'Something went wrong'}
        description="Please try again."
      />
    );
  }
  if (isEmpty) return <EmptyState {...empty} />;
  return children;
}

ListPage.Header = Header;
ListPage.Toolbar = Toolbar;
ListPage.Body = Body;
