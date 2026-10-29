'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { History, Loader2, MessageSquare, PencilLine, ScrollText } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { showError, showSuccess } from '@/lib/toast';
import { useCorrectAnswer, useFieldHistory } from '../hooks/use-lead-workflow';
import type { AnswerCorrectionInput, AnswerHistoryEntry } from '../types/lead-workflow-types';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label, Textarea, useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { formatLeadDateTime } from './lead-ui-utils';
import { CallTranscriptDialog } from './call-transcript-dialog';
import { LeadConversationHistory } from './lead-conversation-history';
import { answerSourceLabel, formatQualificationValue } from './qualification-labels';

/**
 * Per-field answer history: every version (old → new), who/what produced it
 * (user, AI call agent, SMS agent, correction), when, the evidence quote, and
 * links to the evidence — the AI-call transcript opened at the supporting turn,
 * or the SMS in the conversation history. Users with lead:write can correct
 * the current value; a reason is mandatory and the correction links the
 * version it corrects.
 */

type Props = {
  leadId: string;
  fieldKey: string;
  label: string;
  options?: string[];
  canWrite: boolean;
};

const STATUSES: AnswerCorrectionInput['status'][] = ['answered', 'unknown', 'refused', 'not_applicable'];

function VersionItem({ entry, locale, t, onTranscript, onSms }: {
  entry: AnswerHistoryEntry; locale: string; t: TranslateFn;
  onTranscript: (callId: string, turn: number | null, quote: string | null) => void;
  onSms: (smsId: string) => void;
}) {
  const callId = entry.transcriptRef?.callRecordId ?? entry.callRecordId;
  return (
    <li className="space-y-1 rounded-lg border border-border/60 p-2.5 text-xs">
      <p className="break-words text-sm">
        <span className="text-muted-foreground">{entry.previous ? formatQualificationValue(entry.previous.value, entry.previous.status, t) : '—'}</span>
        {' → '}
        <span className="font-medium">{formatQualificationValue(entry.current.value, entry.current.status, t)}</span>
      </p>
      <p className="text-muted-foreground">
        {answerSourceLabel(entry.source, t)}
        {entry.changedByName ? ` · ${entry.changedByName}` : ''}
        {entry.changedAt ? ` · ${formatLeadDateTime(entry.changedAt, locale)}` : ''}
      </p>
      {entry.correctionOf && <p className="text-muted-foreground">{t('leads.answerHistory.correction', 'Correction of an earlier value')}</p>}
      {entry.reason && <p>{t('leads.history.correctionReason', 'Reason: {reason}', { reason: entry.reason })}</p>}
      {entry.current.evidence && <p className="italic text-muted-foreground" dir="auto">“{entry.current.evidence}”</p>}
      <div className="flex flex-wrap gap-3">
        {callId && (
          <button type="button" className="inline-flex items-center gap-1 text-blue-700 underline underline-offset-4 dark:text-cyan-300" onClick={() => onTranscript(callId, entry.transcriptRef?.turnIndex ?? null, entry.transcriptRef?.quote ?? entry.current.evidence)}>
            <ScrollText className="h-3 w-3" aria-hidden="true" />
            {entry.transcriptRef?.turnIndex != null
              ? t('leads.history.openTranscriptAtTurn', 'Open transcript at turn {turn}', { turn: entry.transcriptRef.turnIndex + 1 })
              : t('leads.history.openTranscript', 'Open transcript')}
          </button>
        )}
        {entry.smsMessageId && (
          <button type="button" className="inline-flex items-center gap-1 text-blue-700 underline underline-offset-4 dark:text-cyan-300" onClick={() => onSms(entry.smsMessageId as string)}>
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            {t('leads.answerHistory.openSms', 'Show the SMS')}
          </button>
        )}
      </div>
    </li>
  );
}

export function QualificationFieldHistory({ leadId, fieldKey, label, options = [], canWrite }: Props) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [status, setStatus] = useState<AnswerCorrectionInput['status']>('answered');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [transcript, setTranscript] = useState<{ callId: string; turn: number | null; quote: string | null } | null>(null);
  const [smsFocus, setSmsFocus] = useState<string | null>(null);
  const history = useFieldHistory(leadId, fieldKey, open);
  const correct = useCorrectAnswer(leadId);
  const versions = history.data ?? [];
  const latest = versions[0] ?? null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return;
    correct.mutate({
      fieldKey,
      status,
      value: status === 'answered' ? value : null,
      reason: reason.trim(),
      correctionOf: latest?.id ?? null,
    }, {
      onSuccess: () => {
        showSuccess(t('leads.answerHistory.corrected', 'Answer corrected'));
        setCorrecting(false); setValue(''); setReason('');
      },
      onError: (err) => {
        const code = (err as { code?: string }).code;
        showError(code === 'QUALIFICATION_STALE'
          ? t('leads.answerHistory.stale', 'This answer changed meanwhile. Review the latest value and try again.')
          : err);
        if (code === 'QUALIFICATION_STALE') void history.refetch();
      },
    });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-cyan-300"
            aria-label={t('leads.answerHistory.openFor', 'Answer history for {field}', { field: label })}
          >
            <History className="h-3 w-3" aria-hidden="true" />
            {t('leads.answerHistory.button', 'History')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] space-y-3">
          <p className="text-sm font-semibold">{t('leads.answerHistory.title', '{field}: answer history', { field: label })}</p>
          {history.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t('common.loading', 'Loading…')} />}
          {history.isError && (
            <button type="button" className="text-sm text-destructive underline" onClick={() => void history.refetch()}>
              {t('leads.qualification.historyError', 'Could not load history. Retry')}
            </button>
          )}
          {!history.isLoading && !history.isError && versions.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('leads.answerHistory.empty', 'No recorded changes. Changes made before history was kept are not available.')}</p>
          )}
          {versions.length > 0 && (
            <ol className="max-h-72 space-y-2 overflow-y-auto pe-1" aria-label={t('leads.answerHistory.versions', 'Versions, newest first')}>
              {versions.map((entry) => (
                <VersionItem
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  t={t}
                  onTranscript={(callId, turn, quote) => { setOpen(false); setTranscript({ callId, turn, quote }); }}
                  onSms={(id) => { setOpen(false); setSmsFocus(id); }}
                />
              ))}
            </ol>
          )}
          {canWrite && !correcting && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCorrecting(true)}>
              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leads.answerHistory.correct', 'Correct this answer')}
            </Button>
          )}
          {canWrite && correcting && (
            <form className="space-y-2 border-t border-border pt-3" onSubmit={submit}>
              <div className="space-y-1">
                <Label htmlFor={`corr-status-${fieldKey}`}>{t('leads.answerHistory.status', 'Status')}</Label>
                <select
                  id={`corr-status-${fieldKey}`}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AnswerCorrectionInput['status'])}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{t(`leads.mobileComm.answerStatus.${s}`, s.replace(/_/g, ' '))}</option>)}
                </select>
              </div>
              {status === 'answered' && (
                <div className="space-y-1">
                  <Label htmlFor={`corr-value-${fieldKey}`}>{t('leads.answerHistory.value', 'Correct value')}</Label>
                  {options.length ? (
                    <select id={`corr-value-${fieldKey}`} required className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={value} onChange={(e) => setValue(e.target.value)}>
                      <option value="" disabled>{t('leads.answerHistory.choose', 'Choose…')}</option>
                      {options.map((o) => <option key={o} value={o}>{formatQualificationValue(o, 'answered', t)}</option>)}
                    </select>
                  ) : (
                    <Input id={`corr-value-${fieldKey}`} required value={value} maxLength={5000} onChange={(e) => setValue(e.target.value)} />
                  )}
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor={`corr-reason-${fieldKey}`}>{t('leads.answerHistory.reason', 'Reason (required)')}</Label>
                <Textarea id={`corr-reason-${fieldKey}`} required rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setCorrecting(false)}>{t('common.cancel', 'Cancel')}</Button>
                <Button type="submit" size="sm" disabled={correct.isPending || !reason.trim() || (status === 'answered' && !value.trim())}>
                  {correct.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {t('leads.answerHistory.save', 'Save correction')}
                </Button>
              </div>
            </form>
          )}
        </PopoverContent>
      </Popover>
      <CallTranscriptDialog
        leadId={leadId}
        callId={transcript?.callId ?? null}
        turnIndex={transcript?.turn ?? null}
        quote={transcript?.quote ?? null}
        onOpenChange={(o) => { if (!o) setTranscript(null); }}
      />
      <Dialog open={Boolean(smsFocus)} onOpenChange={(o) => { if (!o) setSmsFocus(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('leads.answerHistory.smsTitle', 'SMS conversation')}</DialogTitle>
            <DialogDescription>{t('leads.answerHistory.smsDescription', 'The highlighted message is the evidence for this answer.')}</DialogDescription>
          </DialogHeader>
          {smsFocus && (
            <div className="max-h-[60dvh] overflow-y-auto pe-1">
              <LeadConversationHistory leadId={leadId} initialFilter="sms" focusEntryId={`sms_message:${smsFocus}`} hideFilters />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
