'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Mail, Paperclip, User,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useLanguage } from '@/lib/i18n/language-context';
import { EmptyState } from '@/shared/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const STATUS_META = {
  QUEUED: { label: 'In Warteschlange', icon: Clock, cls: 'bg-muted text-muted-foreground' },
  SENT: { label: 'Gesendet', icon: CheckCircle2, cls: 'bg-sky-500/10 text-sky-600' },
  DELIVERED: { label: 'Zugestellt', icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600' },
  BOUNCED: { label: 'Unzustellbar', icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-600' },
  FAILED: { label: 'Fehlgeschlagen', icon: AlertTriangle, cls: 'bg-red-500/10 text-red-600' },
};

/**
 * Sent-email history of one record, newest first. Reads the existing
 * EmailRecord log, which already stores recipients, subject, body,
 * attachments, sender, status and timestamps per sourceModule/sourceRecordId.
 */
export function EmailHistoryPanel({ sourceModule = 'crm', sourceRecordId, highlightId }) {
  const { t } = useLanguage();
  // Which entry is expanded, held here rather than per row: the row for a
  // just-sent email mounts after its list refetches, so an initial-state-only
  // flag would be read before that id exists.
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    if (highlightId) setOpenId(String(highlightId));
  }, [highlightId]);

  const { data, isLoading } = useQuery({
    queryKey: ['doctpl', 'emails', sourceModule, sourceRecordId],
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.DOCTPL.EMAILS, {
        params: { sourceModule, sourceRecordId, limit: 50, sortOrder: 'desc' },
      });
      return res.data;
    },
    enabled: !!sourceRecordId,
    staleTime: 20_000,
  });

  const emails = Array.isArray(data) ? data : (data?.items || data?.data || []);

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  }

  if (!emails.length) {
    return (
      <EmptyState
        icon={Mail}
        title={t('doctpl.email.historyEmpty', 'Keine E-Mails gesendet')}
        description={t('doctpl.email.historyEmptyDesc', 'Hier erscheinen alle von hier aus gesendeten E-Mails.')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('doctpl.email.historyTitle', 'Gesendete E-Mails')}</h3>
        <span className="text-xs text-muted-foreground">({emails.length})</span>
      </div>
      <ul className="space-y-2">
        {emails.map((email) => (
          <EmailRow
            key={email._id || email.id}
            email={email}
            t={t}
            open={openId === String(email._id || email.id)}
            onToggle={() => setOpenId((current) => (
              current === String(email._id || email.id) ? null : String(email._id || email.id)
            ))}
          />
        ))}
      </ul>
    </div>
  );
}

function EmailRow({ email, t, open, onToggle }) {
  const meta = STATUS_META[email.status] || STATUS_META.QUEUED;
  const StatusIcon = meta.icon;
  const sender = email.createdBy
    ? [email.createdBy.firstName, email.createdBy.lastName].filter(Boolean).join(' ') || email.createdBy.email
    : null;
  const recipients = [...(email.to || []), ...(email.cc || [])].join(', ');

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-foreground">
              {email.subject || t('doctpl.email.noSubject', 'Ohne Betreff')}
            </span>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', meta.cls)}>
              <StatusIcon className="h-3 w-3" />
              {t(`doctpl.email.status.${email.status}`, meta.label)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {t('doctpl.to', 'An')}: {recipients || '—'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDateTime(email.sentAt || email.createdAt)}
            </span>
            {sender && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {sender}
              </span>
            )}
            {!!email.attachments?.length && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> {email.attachments.length}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border bg-muted/20 p-3.5">
          {!!email.bcc?.length && (
            <Line label={t('doctpl.bcc', 'BCC')} value={email.bcc.join(', ')} />
          )}
          {email.senderAddress && (
            <Line label={t('doctpl.senderAddress', 'Absender')} value={`${email.senderName || ''} ${email.senderAddress}`.trim()} />
          )}
          {email.errorMessage && (
            <Line label={t('doctpl.email.error', 'Fehler')} value={email.errorMessage} tone="text-red-600" />
          )}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('doctpl.message', 'Nachricht')}
            </p>
            <div
              className="prose prose-sm max-w-none rounded-lg border border-border bg-background p-3 text-[13px] dark:prose-invert"
              // The body is authored in-app by staff and stored as HTML; rendering
              // it is the only way the history shows what was actually sent.
              dangerouslySetInnerHTML={{ __html: email.bodyHtml || email.bodyText || '' }}
            />
          </div>
          {!!email.attachments?.length && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('doctpl.attachments', 'Anhänge')}
              </p>
              <ul className="space-y-1">
                {email.attachments.map((attachment, index) => (
                  <li key={attachment.fileId || attachment.documentId || index} className="flex items-center gap-1.5 text-[12px] text-foreground">
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono">{attachment.fileName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Line({ label, value, tone }) {
  return (
    <p className={cn('text-[12px]', tone || 'text-foreground')}>
      <span className="text-muted-foreground">{label}: </span>{value}
    </p>
  );
}
