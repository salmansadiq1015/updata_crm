'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useSmsCallbacks } from '../hooks/use-sms-ops';
import { formatDateTime, relativeTime } from '../sms-ops-domain';
import { useSmsOpsLanguage } from './use-sms-ops-language';

/** Leads who asked by SMS to be called back. */
export function SmsCallbacksList() {
  const { t, locale } = useSmsOpsLanguage();
  const { data, isLoading, isError, refetch } = useSmsCallbacks();
  const [now] = useState(() => Date.now());
  if (isLoading) return <p className="text-sm text-muted-foreground">{t('smsOps.loading', 'Loading…')}</p>;
  if (isError) return <button type="button" className="text-sm text-brand-500" onClick={() => void refetch()}>{t('smsOps.loadError', 'Could not load. Retry')}</button>;
  if (!data?.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <CalendarClock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{t('smsOps.callbacks.empty', 'No callback requests')}</p>
      </div>
    );
  }
  return (
    <ul className="rounded-xl border border-border bg-card">
      {data.map((c) => {
        const overdue = c.dueAt && !c.needsTime && new Date(c.dueAt).getTime() < now;
        return (
          <li key={c.id} className="flex flex-wrap items-start gap-3 border-t border-border px-4 py-3 first:border-t-0" data-testid="sms-callback">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium" dir="auto">{c.leadName || t('smsOps.reviews.unknownLead', 'Lead')}</p>
              {c.evidence || c.requestedTimeText ? <p className="rounded-lg bg-muted/60 px-3 py-1.5 text-sm" dir="auto">“{c.evidence || c.requestedTimeText}”</p> : null}
              {c.note ? <p className="text-xs text-muted-foreground" dir="auto">{c.note}</p> : null}
            </div>
            <div className="text-end text-sm">
              {c.needsTime ? (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">{t('smsOps.callbacks.needsTime', 'Time not given — agree a time')}</span>
              ) : (
                <>
                  <p className={overdue ? 'font-semibold text-destructive' : 'font-medium'}>{formatDateTime(c.dueAt, locale)}</p>
                  <p className="text-xs text-muted-foreground">{relativeTime(c.dueAt, locale)}</p>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
