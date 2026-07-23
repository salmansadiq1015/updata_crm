'use client';

import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const actions = ['read', 'write', 'delete', 'admin'];

const actionLabels = {
  read: 'Lesen',
  write: 'Schreiben',
  delete: 'Löschen',
  admin: 'Admin',
};

const actionColors = {
  read: 'bg-sky-500/15 text-sky-600',
  write: 'bg-emerald-500/15 text-emerald-600',
  delete: 'bg-rose-500/15 text-rose-600',
  admin: 'bg-amber-500/15 text-amber-600',
};

export function PermissionMatrix({ permissions = [] }) {
  const permSet = new Set(
    permissions.map((p) => {
      if (typeof p === 'string') return p;
      if (p.key) return p.key;
      if (p.module && p.action) return `${p.module}:${p.action}`;
      return '';
    })
  );

  const modules = [...new Set(
    permissions.map((p) => {
      if (typeof p === 'string') return p.split(':')[0];
      return p.module || p.key?.split(':')[0] || '';
    }).filter(Boolean)
  )].sort();

  if (!modules.length) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Keine Berechtigungen zugewiesen.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/30">
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-40">
              Modul
            </th>
            {actions.map((action) => (
              <th key={action} className="text-center py-3 px-3 font-semibold text-xs uppercase tracking-wider w-24">
                <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.6rem] font-bold', actionColors[action])}>
                  {actionLabels[action]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((module, i) => (
            <tr
              key={module}
              className={cn(
                'hover:bg-muted/20 transition-colors',
                i < modules.length - 1 && 'border-b border-border/30'
              )}
            >
              <td className="py-2.5 px-4 font-medium capitalize text-sm">{module}</td>
              {actions.map((action) => {
                const hasIt = permSet.has(`${module}:${action}`);
                return (
                  <td key={action} className="text-center py-2.5 px-3">
                    {hasIt ? (
                      <div className="mx-auto h-6 w-6 rounded-md bg-success/15 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-success" />
                      </div>
                    ) : (
                      <div className="mx-auto h-6 w-6 rounded-md bg-muted/30 flex items-center justify-center">
                        <X className="h-3 w-3 text-muted-foreground/25" />
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
