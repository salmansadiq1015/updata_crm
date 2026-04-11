'use client';

import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';

export function Breadcrumbs() {
  const crumbs = useBreadcrumbs();

  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/dashboard" className="hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          {i === crumbs.length - 1 ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link href={crumb.path} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
