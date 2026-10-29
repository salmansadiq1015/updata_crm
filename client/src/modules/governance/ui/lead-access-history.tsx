'use client';

import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLeadAccessLog } from '../hooks/use-governance';
import { accessActionLabel } from './access-log-labels';

/** "Who accessed this lead" — governance audit events for one lead (audit:read). */
export function LeadAccessHistory({ leadId }: { leadId: string }) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const allowed = hasPermission('audit:read');
  const query = useLeadAccessLog(leadId, allowed);
  if (!allowed) return null;
  const entries = query.data?.data ?? [];

  return (
    <section aria-labelledby={`lead-access-${leadId}`} className="space-y-2">
      <h3 id={`lead-access-${leadId}`} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden />{t('governance.leadAccess.title', 'Who accessed this lead')}
      </h3>
      {query.isLoading ? (
        <div className="skeleton-shimmer h-12 rounded-lg bg-muted" aria-hidden />
      ) : query.isError ? (
        <p className="text-xs text-destructive">{t('governance.leadAccess.error', 'The access history could not be loaded.')}</p>
      ) : !entries.length ? (
        <p className="text-xs text-muted-foreground">{t('governance.leadAccess.empty', 'No supervisor access, reveals or exports recorded.')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-0.5 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{entry.userName || t('governance.log.unknownUser', 'Unknown user')}</span>
                <time className="text-muted-foreground" dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
              </div>
              <p className="text-muted-foreground">
                {accessActionLabel(entry, t)}
                {entry.result === 'failure' && <span className="ms-1 text-destructive">({t('governance.log.denied', 'denied')})</span>}
              </p>
              {entry.reason && <p className="text-foreground">“{entry.reason}”</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default LeadAccessHistory;
