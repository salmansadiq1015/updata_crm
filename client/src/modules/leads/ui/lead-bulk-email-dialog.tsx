'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Mail, Send, XCircle } from 'lucide-react';
import { emailService } from '@/modules/doctpl/services/EmailService';
import type { Lead } from '../types/lead-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useLanguage,
} from './lead-ui-kit';
import { LtrText } from './ltr-text';
import { resolveLeadVars } from './lead-ui-utils';
import {
  bucketLeadsByEmail,
  useLeadBulkActions,
  type BulkLeadResult,
  type ResolveLeadEmail,
} from './use-lead-bulk-actions';

/** Sentinel for the "no template, write it myself" choice in the template select. */
const CUSTOM = '__custom__';
const MAX_SUBJECT_LENGTH = 500;
/** Above this many recipients we warn before a client-orchestrated fan-out. */
const SOFT_CAP = 200;

type EmailTemplate = { _id: string; templateType?: string; isActive?: boolean; language?: string };

type LeadBulkEmailDialogProps = {
  /** Snapshot of the selected leads taken when the dialog opened. */
  leads: Lead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once with the queued/failed result so the caller can show a summary toast. */
  onComplete?: (result: BulkLeadResult) => void;
};

/**
 * Send one e-mail to every selected lead that has a usable address. A template
 * renders per lead server-side (so each gets its own resolved variables); a
 * custom message is personalised client-side with `resolveLeadVars`. Every send
 * goes through `emailService.send`, which queues a tracked EmailRecord — the copy
 * never claims the mail was delivered, only that it was queued.
 */
export function LeadBulkEmailDialog({ leads, open, onOpenChange, onComplete }: LeadBulkEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && (
          <BulkEmailBody leads={leads} onClose={() => onOpenChange(false)} onComplete={onComplete} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkEmailBody({
  leads,
  onClose,
  onComplete,
}: {
  leads: Lead[];
  onClose: () => void;
  onComplete?: (result: BulkLeadResult) => void;
}) {
  const { t, language } = useLanguage();
  const uid = useId();
  const { bulkEmail } = useLeadBulkActions();

  const buckets = useMemo(() => bucketLeadsByEmail(leads), [leads]);
  const eligible = buckets.valid;
  const firstEligibleId = eligible[0]?.id ?? null;

  const [mode, setMode] = useState<string>(CUSTOM);
  const isTemplate = mode !== CUSTOM;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<BulkLeadResult | null>(null);

  // Active templates for the current UI language (mirrors the single composer).
  const templatesQuery = useQuery({
    queryKey: ['doctpl', 'email-templates'],
    queryFn: async () => ((await emailService.listTemplates())?.data ?? []) as EmailTemplate[],
    staleTime: 5 * 60_000,
  });
  const usableTemplates = (templatesQuery.data ?? []).filter(
    (tpl) => tpl.isActive !== false && tpl.language === language,
  );

  // Preview the chosen template against the first eligible lead, so the sender
  // sees roughly what each recipient will get. The real send re-renders per lead.
  const previewQuery = useQuery({
    queryKey: ['doctpl', 'email-template-preview', mode, firstEligibleId],
    queryFn: async () => {
      const res = await emailService.renderTemplate(mode, { leadId: firstEligibleId });
      return (res?.data ?? { subject: '', bodyHtml: '' }) as { subject: string; bodyHtml: string };
    },
    enabled: isTemplate && Boolean(firstEligibleId),
    staleTime: 60_000,
  });

  const resolveEmail: ResolveLeadEmail = useCallback(
    async (lead) => {
      if (isTemplate) {
        const res = await emailService.renderTemplate(mode, { leadId: lead.id });
        const rendered = (res?.data ?? {}) as { subject?: string; bodyHtml?: string };
        return { subject: rendered.subject ?? '', bodyHtml: rendered.bodyHtml ?? '' };
      }
      // Personalise the typed message for this lead (`{{businessName}}`, …).
      return { subject: resolveLeadVars(subject, lead), bodyHtml: resolveLeadVars(body, lead) };
    },
    [isTemplate, mode, subject, body],
  );

  const sending = bulkEmail.isPending;
  const canSend =
    eligible.length > 0 &&
    !sending &&
    (isTemplate
      ? !previewQuery.isLoading && !previewQuery.isError
      : subject.trim().length > 0 && body.trim().length > 0);

  const handleSend = async () => {
    if (!canSend) return;
    const res = await bulkEmail.mutateAsync({ leads: eligible, resolveEmail });
    setResult(res);
    onComplete?.(res);
  };

  // ── Summary view (after sending) ────────────────────────────────────────────
  if (result) {
    const sent = result.succeeded.length;
    const failed = result.failed.length;
    const failedEmails = result.failed
      .map(({ id }) => eligible.find((lead) => lead.id === id)?.email)
      .filter((email): email is string => Boolean(email));
    return (
      <>
        <DialogHeader>
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>{t('leads.bulk.email', 'Email')}</DialogTitle>
              <DialogDescription>
                {t('leads.bulk.emailDialog.eligible', '{count} of {total} selected leads can be emailed', {
                  count: eligible.length,
                  total: leads.length,
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Alert variant={failed === 0 ? 'default' : 'destructive'}>
            {failed === 0 ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
            <AlertTitle>
              {t('leads.bulk.emailDialog.summary', '{sent} sent, {failed} failed', { sent, failed })}
            </AlertTitle>
          </Alert>

          {/* Addresses whose send was rejected — listed under the "failed" alert,
              which already provides the context, so no (misleading) header. */}
          {failedEmails.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2.5 text-[13px]">
              {failedEmails.map((email, index) => (
                <li key={`${email}-${index}`} className="truncate text-foreground">
                  <LtrText>{email}</LtrText>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose}>{t('common.close', 'Close')}</Button>
        </DialogFooter>
      </>
    );
  }

  // ── Compose view ────────────────────────────────────────────────────────────
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle>{t('leads.bulk.email', 'Email')}</DialogTitle>
            <DialogDescription>
              {t('leads.bulk.emailDialog.eligible', '{count} of {total} selected leads can be emailed', {
                count: eligible.length,
                total: leads.length,
              })}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-5">
        {/* Recipients eligibility summary */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('leads.bulk.emailDialog.recipients', 'Recipients')}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {t('leads.bulk.emailDialog.eligible', '{count} of {total} selected leads can be emailed', {
              count: eligible.length,
              total: leads.length,
            })}
          </p>
          {buckets.missingEmail.length > 0 && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t('leads.bulk.emailDialog.missingEmail', '{count} lead(s) without an email address will be skipped', {
                count: buckets.missingEmail.length,
              })}
            </p>
          )}
          {buckets.invalid.length > 0 && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t('leads.bulk.emailDialog.invalid', '{count} lead(s) with an invalid email address will be skipped', {
                count: buckets.invalid.length,
              })}
            </p>
          )}
        </div>

        {eligible.length === 0 ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              {t('leads.bulk.emailDialog.missingEmail', '{count} lead(s) without an email address will be skipped', {
                count: buckets.missingEmail.length + buckets.invalid.length,
              })}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {eligible.length > SOFT_CAP && (
              <Alert>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>
                  {t('leads.bulk.emailDialog.eligible', '{count} of {total} selected leads can be emailed', {
                    count: eligible.length,
                    total: leads.length,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {/* Template chooser */}
            {usableTemplates.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-template`} className="text-[12px] font-medium text-muted-foreground">
                  {t('leads.bulk.emailDialog.template', 'Template')}
                </Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger id={`${uid}-template`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CUSTOM}>{t('leads.email.custom', 'Custom message')}</SelectItem>
                    {usableTemplates.map((tpl) => (
                      <SelectItem key={tpl._id} value={tpl._id}>
                        {tpl.templateType ?? tpl._id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isTemplate ? (
              /* Read-only preview — the real send re-renders per lead server-side. */
              <div className="space-y-3">
                {previewQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('common.loading', 'Loading…')}
                  </div>
                ) : previewQuery.isError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription>{t('common.error', 'Something went wrong')}</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-medium text-muted-foreground">
                        {t('leads.bulk.emailDialog.subject', 'Subject')}
                      </p>
                      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px] text-foreground">
                        {previewQuery.data?.subject || '—'}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-medium text-muted-foreground">
                        {t('doctpl.message', 'Message')}
                      </p>
                      {/* Admin-authored template HTML, rendered read-only for preview. */}
                      <div
                        className="prose prose-sm dark:prose-invert max-h-64 max-w-none overflow-y-auto rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
                        dangerouslySetInnerHTML={{ __html: previewQuery.data?.bodyHtml ?? '' }}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Custom message — personalised per lead on send via resolveLeadVars. */
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-subject`} className="text-[12px] font-medium text-muted-foreground">
                    {t('leads.bulk.emailDialog.subject', 'Subject')}
                  </Label>
                  <Input
                    id={`${uid}-subject`}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={MAX_SUBJECT_LENGTH}
                    className="text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-body`} className="text-[12px] font-medium text-muted-foreground">
                    {t('doctpl.message', 'Message')}
                  </Label>
                  <Textarea
                    id={`${uid}-body`}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={7}
                    placeholder={t('leads.whatsapp.messagePlaceholder', 'Hi {{businessName}}, ')}
                    className="min-h-32 text-[13px]"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('leads.whatsapp.variables', 'Insert variable')}: <LtrText>{'{{businessName}}'}</LtrText>
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={sending}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={() => void handleSend()} disabled={!canSend} className="gap-2">
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
          )}
          {t('leads.bulk.emailDialog.sendCount', 'Send {count} email(s)', { count: eligible.length })}
        </Button>
      </DialogFooter>
    </>
  );
}
