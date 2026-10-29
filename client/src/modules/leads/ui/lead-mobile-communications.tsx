'use client';

import { AlertTriangle, CalendarClock, ClipboardCheck, Loader2, MessageSquare, Phone, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { useLeadCommunications, useLeadQualification, useLeadQualificationHistory } from '../hooks/use-lead-communications';
import type { LeadCommunication, LeadQualificationField } from '../services/lead-communication-api';
import { useLanguage } from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { formatLeadDateTime } from './lead-ui-utils';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { QualificationFieldHistory } from './qualification-field-history';

/**
 * "Mobile calls & SMS" + "Qualification" for the lead detail drawer. Records
 * come from the mobile app (SIM call via Telecom/dialer, SMS composer). The
 * web only displays them, and says plainly what the evidence shows: an
 * off-hook period is dialing + talk time, never proof the call was answered,
 * and "connected" / "sent" are what the user reported.
 */

const ROUTE_FALLBACK: Record<string, string> = {
  telecom_direct: 'SIM call (in app)',
  dialer_handoff: 'SIM call via dialer',
  sms_composer: 'SMS via composer',
  sms_direct: 'SMS sent from SIM (app)',
  sim_sms_agent: 'AI SMS agent (from the agent phone SIM)',
};

const DISPOSITION_FALLBACK: Record<string, string> = {
  interested: 'Interested',
  not_interested: 'Not interested',
  callback_requested: 'Callback requested',
  no_answer: 'No answer',
  busy: 'Busy',
  voicemail: 'Voicemail',
  wrong_number: 'Wrong number',
  human_follow_up: 'Needs follow-up',
  do_not_contact: 'Do not contact',
  sent: 'Sent',
  not_sent: 'Not sent',
  unknown: 'Unknown',
};

const CONNECTED_FALLBACK: Record<string, string> = { yes: 'Yes', no: 'No', unknown: 'Unknown' };

const SEND_STATUS_FALLBACK: Record<string, string> = {
  composer_opened: 'Composer opened',
  user_reported_sent: 'Sent (user-reported)',
  device_sent: 'Sent by the phone (not delivery)',
  device_failed: 'Phone could not send',
  device_delivered: 'Delivered (carrier report)',
  user_reported_not_sent: 'Not sent (user-reported)',
  sent_by_app: 'Sent by the app (confirmed by the phone)',
  unknown: 'Unknown',
};

const ANSWER_STATUS_FALLBACK: Record<string, string> = {
  answered: 'Answered',
  unknown: 'Unknown',
  refused: 'Refused',
  not_applicable: 'Not applicable',
};

const SOURCE_FALLBACK: Record<string, string> = {
  user: 'Entered by user',
  ai_proposed_user_confirmed: 'AI-suggested, user-confirmed',
  sms_agent: 'Lead reply via AI SMS agent (validated)',
  ai_call_agent: 'AI call agent (from the call)',
  user_correction: 'Corrected by user',
};

const label = (t: TranslateFn, group: string, key: string, fallbacks: Record<string, string>) =>
  t(`leads.mobileComm.${group}.${key}`, fallbacks[key] ?? key);

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Honest one-line summary of what the device's telephony events show. */
export function observedText(comm: LeadCommunication, t: TranslateFn): string | null {
  if (comm.channel !== 'phone') return null;
  const { observed } = comm;
  if (observed.evidence !== 'telephony_events') {
    return t('leads.mobileComm.observed.none', 'No call-state events recorded by the device.');
  }
  if (observed.offhookDurationSec != null) {
    return t(
      'leads.mobileComm.observed.duration',
      'Off-hook observed {duration} (dialing + talk, not proof of answer)',
      { duration: formatDuration(observed.offhookDurationSec) },
    );
  }
  if (observed.offhookAt) {
    return t('leads.mobileComm.observed.offhookOnly', 'Off-hook observed, end not recorded (not proof of answer)');
  }
  return observed.ringingObserved
    ? t('leads.mobileComm.observed.ringing', 'Ringing observed, no off-hook recorded')
    : t('leads.mobileComm.observed.idle', 'Call-state events recorded, no off-hook observed');
}

function CommunicationItem({ comm, locale, t }: { comm: LeadCommunication; locale: string; t: TranslateFn }) {
  const Icon = comm.channel === 'sms' ? MessageSquare : Phone;
  const evidence = observedText(comm, t);
  const failedSteps = Object.entries(comm.receipt.steps).filter(([, step]) => step?.status === 'failed');
  return (
    <li className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">{label(t, 'route', comm.route, ROUTE_FALLBACK)}</span>
            {comm.destinationMasked && <span dir="ltr">{comm.destinationMasked}</span>}
            <span>{formatLeadDateTime(comm.createdAt, locale)}</span>
            {comm.createdByName && <span>· {comm.createdByName}</span>}
          </div>

          {comm.outcome ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                {label(t, 'disposition', comm.outcome.disposition, DISPOSITION_FALLBACK)}
              </span>
              {comm.channel === 'phone' && (
                <span className="text-muted-foreground">
                  {t('leads.mobileComm.connected', 'Connected (user-reported): {value}', {
                    value: label(t, 'connectedValue', comm.outcome.connected, CONNECTED_FALLBACK),
                  })}
                </span>
              )}
              {comm.outcome.doNotContact && (
                <span className="inline-flex items-center gap-1 text-rose-600">
                  <ShieldOff className="h-3 w-3" aria-hidden="true" />
                  {t('leads.mobileComm.doNotContact', 'Do not contact')}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              {t('leads.mobileComm.inProgress', 'Not completed in the app yet')}
            </p>
          )}

          {evidence && <p className="text-xs text-muted-foreground">{evidence}</p>}

          {comm.sms && (
            <div className="space-y-0.5 text-xs">
              {comm.sms.body && <p dir="auto" className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-2 py-1">{comm.sms.body}</p>}
              <p className="text-muted-foreground">{label(t, 'sendStatus', comm.sms.sendStatus, SEND_STATUS_FALLBACK)}</p>
            </div>
          )}

          {comm.outcome?.notes && <p dir="auto" className="whitespace-pre-wrap break-words text-sm">{comm.outcome.notes}</p>}

          {comm.outcome?.followUpAt && (
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              {t('leads.mobileComm.followUp', 'Follow-up: {date}', {
                date: `${formatLeadDateTime(comm.outcome.followUpAt, locale)}${comm.outcome.followUpTimezone ? ` (${comm.outcome.followUpTimezone})` : ''}`,
              })}
            </p>
          )}

          {failedSteps.length > 0 && (
            <p className="inline-flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {t('leads.mobileComm.partial', 'Partially synced: {steps}', { steps: failedSteps.map(([name]) => name).join(', ') })}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function formatAnswerValue(field: LeadQualificationField, options: string[], t: TranslateFn): string {
  if (field.value == null || field.value === '') return '—';
  if (typeof field.value === 'boolean') return label(t, 'connectedValue', field.value ? 'yes' : 'no', CONNECTED_FALLBACK);
  const value = String(field.value);
  if (options.includes(value)) return t(`leads.qualification.option.${value}`, value.replace(/_/g, ' '));
  return value;
}

function QualificationBlock({ leadId, locale, t }: { leadId: string; locale: string; t: TranslateFn }) {
  const qualification = useLeadQualification(leadId);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('lead:write');
  if (qualification.isLoading) return <div className="skeleton-shimmer h-12 rounded-xl bg-muted" aria-hidden="true" />;
  if (qualification.isError) {
    return <p className="text-sm text-muted-foreground">{t('leads.qualification.loadError', 'Qualification could not be loaded.')}</p>;
  }
  const { schema = [], fields = [] } = qualification.data ?? {};
  if (!fields.length) {
    return <p className="text-sm text-muted-foreground">{t('leads.qualification.empty', 'No qualification recorded yet.')}</p>;
  }
  const schemaByKey = new Map(schema.map((f) => [f.fieldKey, f]));
  return (
    <><dl className="divide-y divide-border/60 rounded-xl border border-border/60 bg-background/40">
      {fields.map((field) => {
        const def = schemaByKey.get(field.fieldKey);
        return (
          <div key={field.fieldKey} className="space-y-0.5 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-xs text-muted-foreground">
                {t(`leads.qualification.field.${field.fieldKey}`, def?.label ?? field.label)}
              </dt>
              <dd className="text-end text-sm font-medium">
                {field.status === 'answered'
                  ? formatAnswerValue(field, def?.options ?? [], t)
                  : <em className="font-normal text-muted-foreground">{label(t, 'answerStatus', field.status, ANSWER_STATUS_FALLBACK)}</em>}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground/80">
                {label(t, 'answerSource', field.source ?? 'user', SOURCE_FALLBACK)}
                {field.updatedAt ? ` · ${formatLeadDateTime(field.updatedAt, locale)}` : ''}
              </p>
              <QualificationFieldHistory
                leadId={leadId}
                fieldKey={field.fieldKey}
                label={t(`leads.qualification.field.${field.fieldKey}`, def?.label ?? field.label)}
                options={def?.options ?? []}
                canWrite={canWrite}
              />
            </div>
            {field.evidence && <p dir="auto" className="text-[11px] italic text-muted-foreground">“{field.evidence}”</p>}
          </div>
        );
      })}
    </dl><QualificationHistory leadId={leadId} locale={locale} t={t} /></>
  );
}

function QualificationHistory({ leadId, locale, t }: { leadId: string; locale: string; t: TranslateFn }) {
  const [open, setOpen] = useState(false);
  const history = useLeadQualificationHistory(leadId, open);
  const changes = history.data?.pages.flatMap((page) => page.data) ?? [];
  const display = (field: LeadQualificationField | null) => !field ? '—' : field.status === 'answered'
    ? formatAnswerValue(field, [], t) : label(t, 'answerStatus', field.status, ANSWER_STATUS_FALLBACK);
  return <div className="mt-3">
    <button type="button" className="text-sm text-primary underline underline-offset-4" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? t('leads.qualification.hideHistory', 'Hide answer history') : t('leads.qualification.showHistory', 'Show answer history')}
    </button>
    {open && <div className="mt-2 space-y-2" aria-live="polite">
      {history.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>}
      {history.isError && <button type="button" className="text-sm text-destructive underline" onClick={() => void history.refetch()}>{t('leads.qualification.historyError', 'Could not load history. Retry')}</button>}
      {!history.isLoading && !history.isError && !changes.length && <p className="text-sm text-muted-foreground">{t('leads.qualification.historyEmpty', 'No recorded changes. Older changes may not be available.')}</p>}
      {changes.map((change) => <div key={change.id} className="rounded-lg border border-border/60 p-3 text-sm">
        <p className="font-medium">{change.current.label}</p>
        <p dir="auto" className="break-words">{display(change.previous)} → {display(change.current)}</p>
        <p className="text-xs text-muted-foreground">{label(t, 'answerSource', change.current.source ?? 'user', SOURCE_FALLBACK)}{change.changedAt ? ` · ${formatLeadDateTime(change.changedAt, locale)}` : ''}</p>
        {change.current.evidence && <p dir="auto" className="mt-1 break-words text-xs italic text-muted-foreground">“{change.current.evidence}”</p>}
      </div>)}
      {history.hasNextPage && <button type="button" className="text-sm text-primary underline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{t('common.loadMore', 'Load more')}</button>}
    </div>}
  </div>;
}

export function LeadMobileCommunications({ leadId }: { leadId: string }) {
  const { t, locale } = useLanguage();
  const query = useLeadCommunications(leadId);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <div className="skeleton-shimmer h-12 rounded-xl bg-muted" aria-hidden="true" />
      ) : query.isError ? (
        <p className="text-sm text-muted-foreground">{t('leads.mobileComm.loadError', 'Mobile calls & SMS could not be loaded.')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('leads.mobileComm.empty', 'No calls or SMS from the mobile app yet.')}</p>
      ) : (
        <ul className="space-y-2" aria-label={t('leads.drawer.sectionMobileComm', 'Mobile calls & SMS')}>
          {items.map((comm) => <CommunicationItem key={comm.id} comm={comm} locale={locale} t={t} />)}
        </ul>
      )}
      {query.hasNextPage && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {t('leads.mobileComm.loadMore', 'Load more')}
        </button>
      )}

      <div className="space-y-2">
        <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leads.qualification.title', 'Qualification')}
        </h4>
        <QualificationBlock leadId={leadId} locale={locale} t={t} />
      </div>
    </div>
  );
}
