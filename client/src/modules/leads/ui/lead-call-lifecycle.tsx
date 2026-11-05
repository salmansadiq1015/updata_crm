'use client';

import type { LeadCallLifecycle as Lifecycle } from '../schemas/lead-call-lifecycle';
import { useLanguage } from './lead-ui-kit';

export function LeadCallLifecycle({ value }: { value?: Lifecycle | null }) {
  const { t } = useLanguage();
  if (!value) return null;
  const label = (status: string) => t(`leads.lifecycle.${status}`, status.replace(/_/g, ' ').toLowerCase());
  return <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-muted-foreground">{t('leads.lifecycle.latestCall', 'Latest call')}</span>
      {value.callStatus && <span className="rounded-md border border-border px-2 py-1 capitalize">{label(value.callStatus)}</span>}
      {value.qualificationStatus && <span className={`rounded-md px-2 py-1 capitalize ${value.qualificationStatus === 'QUALIFIED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-foreground'}`}>{label(value.qualificationStatus)}</span>}
    </div>
    {value.missingFields.length > 0 && <p className="text-xs text-muted-foreground">{t('leads.lifecycle.missingFields', 'Required answers to review')}: {value.missingFields.join(', ')}</p>}
    {value.recommendedAction && <p className="text-xs text-muted-foreground">{t('leads.lifecycle.nextAction', 'Recommended next action')}: <span className="capitalize">{label(value.recommendedAction)}</span></p>}
  </div>;
}
