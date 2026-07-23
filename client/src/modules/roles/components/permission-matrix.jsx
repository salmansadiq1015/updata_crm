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

/**
 * The four columns cover the standard CRUD actions. Roughly half of the
 * permissions use module-specific actions instead (crm:merge, ap:approve,
 * project:status:override, …); those get a trailing column of badges so a role
 * never appears to hold fewer rights than it actually does.
 */
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

  // Everything the four standard columns cannot represent, grouped per module.
  const extrasByModule = {};
  permSet.forEach((key) => {
    const [module, ...rest] = key.split(':');
    const action = rest.join(':');
    if (!action || actions.includes(action)) return;
    (extrasByModule[module] ||= []).push(action);
  });
  const hasExtras = Object.keys(extrasByModule).length > 0;

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
            {hasExtras && (
              <th className="text-left py-3 px-3 font-semibold text-xs uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-brand-600 dark:text-brand-300">
                  Weitere
                </span>
              </th>
            )}
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
              {hasExtras && (
                <td className="py-2.5 px-3">
                  <div className="flex flex-wrap gap-1">
                    {(extrasByModule[module] || []).sort().map((action) => (
                      <span
                        key={action}
                        className="inline-flex items-center rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-brand-600 dark:text-brand-300"
                      >
                        {action}
                      </span>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
