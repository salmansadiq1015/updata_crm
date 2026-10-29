'use client';

import { Ban, CheckCircle2, Clock } from 'lucide-react';
import { useLeadContactStatus } from '../hooks/use-sms-ops';
import { contactReason, formatDateTime, relativeTime } from '../sms-ops-domain';
import { CONTACT_CHANNELS, type ContactChannel } from '../types/sms-ops-types';
import { useSmsOpsLanguage } from './use-sms-ops-language';

const CHANNEL_FALLBACK: Record<ContactChannel, string> = { voice: 'Calls', sms: 'SMS', email: 'E-mail', whatsapp: 'WhatsApp' };
const SOURCE_FALLBACK: Record<string, string> = { ai_calling: 'AI call', sim_call: 'SIM call', sim_sms: 'SIM SMS', messaging: 'Message', manual: 'Manual' };

/** "Next allowed contact" for the lead drawer (per channel + recent touches). */
export function LeadContactPolicy({ leadId }: { leadId: string }) {
  const { t, locale } = useSmsOpsLanguage();
  const { data, isLoading, isError } = useLeadContactStatus(leadId);
  if (isLoading) return <p className="text-sm text-muted-foreground">{t('smsOps.loading', 'Loading…')}</p>;
  if (isError || !data) return null;
  return (
    <div className="space-y-3" data-testid="lead-contact-policy">
      <p className="text-sm">
        <span className="text-muted-foreground">{t('smsOps.lead.nextAllowed', 'Next allowed contact')}: </span>
        <span className="font-medium">{data.nextAllowedAt ? formatDateTime(data.nextAllowedAt, locale) : t('smsOps.lead.noneAllowed', 'No channel available')}</span>
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {CONTACT_CHANNELS.map((c) => {
          const d = data.channels?.[c];
          if (!d) return null;
          const Icon = d.blocked ? Ban : d.allowed ? CheckCircle2 : Clock;
          const tone = d.blocked ? 'text-destructive' : d.allowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400';
          return (
            <li key={c} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm" data-testid={`channel-${c}`}>
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
              <div className="min-w-0">
                <p className="font-medium">{t(`smsOps.channel.${c}`, CHANNEL_FALLBACK[c])}</p>
                <p className="text-xs text-muted-foreground">
                  {d.allowed ? t('smsOps.lead.allowedNow', 'Allowed now')
                    : d.blocked ? contactReason(t, d.reason)
                      : `${contactReason(t, d.reason)}${d.nextAllowedAt ? ` · ${formatDateTime(d.nextAllowedAt, locale)}` : ''}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {data.recentTouches?.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.lead.recentTouches', 'Recent contacts')}</p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {data.recentTouches.slice(0, 6).map((r, i) => (
              <li key={`${r.at}-${i}`}>
                {t(`smsOps.channel.${r.channel}`, CHANNEL_FALLBACK[r.channel] ?? r.channel)} · {t(`smsOps.source.${r.source}`, SOURCE_FALLBACK[r.source] ?? r.source)} · <time dateTime={r.at} title={formatDateTime(r.at, locale)}>{relativeTime(r.at, locale)}</time>
                {r.policyWarning ? <span className="text-amber-700 dark:text-amber-400"> · {contactReason(t, r.policyWarning)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.channels?.voice && data.channels.voice.policyEnabled === false ? (
        <p className="text-xs text-muted-foreground">{t('smsOps.lead.policyOff', 'Contact limits are off; only do-not-contact and opt-outs apply.')}</p>
      ) : null}
    </div>
  );
}
