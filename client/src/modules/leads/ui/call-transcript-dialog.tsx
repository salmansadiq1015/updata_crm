'use client';

import { useEffect, useRef } from 'react';
import { Bot, Loader2, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallTranscript } from '../hooks/use-lead-workflow';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, useLanguage } from './lead-ui-kit';
import { formatLeadDateTime } from './lead-ui-utils';

/**
 * Full AI-call transcript, opened at a given turn (the evidence for an
 * answer). The requested turn is highlighted and scrolled into view; a quote
 * that the transcript no longer contains is shown, never silently dropped.
 */
export function CallTranscriptDialog({
  leadId, callId, turnIndex = null, quote = null, onOpenChange,
}: {
  leadId: string;
  callId: string | null;
  turnIndex?: number | null;
  quote?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useLanguage();
  const query = useCallTranscript(leadId, callId);
  const target = useRef<HTMLLIElement | null>(null);
  const turns = query.data?.turns ?? [];
  // Prefer the recorded turn index; fall back to the first turn quoting the evidence.
  const highlight = turnIndex != null && turns.some((x) => x.index === turnIndex)
    ? turnIndex
    : quote ? turns.find((x) => x.text.includes(quote))?.index ?? null : null;

  useEffect(() => {
    if (highlight != null) target.current?.scrollIntoView({ block: 'center' });
  }, [highlight, query.data]);

  const status = (query.error as { statusCode?: number } | null)?.statusCode;
  return (
    <Dialog open={Boolean(callId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('leads.history.transcriptTitle', 'Call transcript')}</DialogTitle>
          <DialogDescription>
            {query.data?.campaignName ?? t('leads.history.aiCall', 'AI call')}
            {query.data?.startedAt ? ` · ${formatLeadDateTime(query.data.startedAt, locale)}` : ''}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label={t('common.loading', 'Loading…')} />}
        {query.isError && (
          <p className="text-sm text-muted-foreground">
            {status === 403
              ? t('leads.history.transcriptRestricted', 'Only the call owner or an AI-calling admin can read this transcript.')
              : t('leads.history.transcriptError', 'The transcript could not be loaded.')}
          </p>
        )}
        {query.data && (query.data.expired || !turns.length) && (
          <p className="text-sm text-muted-foreground">
            {query.data.expired ? t('leads.history.transcriptExpired', 'This transcript has expired under the retention policy.') : t('leads.history.transcriptEmpty', 'No transcript was recorded for this call.')}
          </p>
        )}
        {quote && highlight == null && query.data && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            {t('leads.history.quoteNotFound', 'The quoted evidence was not found in the stored transcript:')} “{quote}”
          </p>
        )}
        {turns.length > 0 && (
          <ol className="max-h-[60dvh] space-y-2 overflow-y-auto pe-1" aria-label={t('leads.history.transcriptTitle', 'Call transcript')}>
            {turns.map((turn) => {
              const assistant = turn.role === 'assistant';
              const Icon = assistant ? Bot : UserRound;
              const active = turn.index === highlight;
              return (
                <li
                  key={turn.index}
                  ref={active ? target : undefined}
                  aria-current={active ? 'true' : undefined}
                  className={cn('flex items-start gap-2 rounded-xl border px-3 py-2', active ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30' : 'border-border/60')}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">
                      {assistant ? t('leads.history.agent', 'AI agent') : t('leads.history.lead', 'Lead')} · #{turn.index + 1}
                      {turn.at ? ` · ${formatLeadDateTime(turn.at, locale)}` : ''}
                    </p>
                    <p dir="auto" className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{turn.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
