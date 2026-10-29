'use client';

import { ShieldAlert } from 'lucide-react';
import { useCampaignSkips } from '../hooks/use-sms-ops';
import { contactReason, formatDateTime } from '../sms-ops-domain';
import type { SkipSource } from '../types/sms-ops-types';
import { useSmsOpsLanguage } from './use-sms-ops-language';

/**
 * "Skipped: contact limit N" for a campaign view. Renders nothing while loading,
 * on error (e.g. an older server without the contact policy) or when nothing
 * was skipped, so it is safe to drop into any campaign screen.
 */
export function ContactLimitSkips({ source, campaignId, className = '' }: { source: SkipSource; campaignId: string | null | undefined; className?: string }) {
  const { t, locale } = useSmsOpsLanguage();
  const { data } = useCampaignSkips(source, campaignId ?? null);
  if (!data || (!data.skippedContactLimit && !data.blocked)) return null;
  const reasons = Object.entries(data.byReason || {});
  const next = reasons.map(([, r]) => r.nextAllowedAt).filter(Boolean).sort()[0] ?? null;
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-sm ${className}`} data-testid="contact-limit-skips">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden />
      <div className="space-y-0.5">
        <p className="font-medium">
          {t('smsOps.skips.limit', 'Skipped: contact limit {n}', { n: data.skippedContactLimit })}
          {data.blocked ? <span className="text-muted-foreground"> · {t('smsOps.skips.blocked', 'Blocked (do not contact / opted out) {n}', { n: data.blocked })}</span> : null}
        </p>
        {reasons.length ? (
          <p className="text-xs text-muted-foreground">
            {reasons.map(([code, r]) => `${contactReason(t, code)}: ${r.leads}`).join(' · ')}
          </p>
        ) : null}
        {next && data.skippedContactLimit ? <p className="text-xs text-muted-foreground">{t('smsOps.skips.nextAllowed', 'Earliest next contact: {when}', { when: formatDateTime(next, locale) })}</p> : null}
      </div>
    </div>
  );
}
