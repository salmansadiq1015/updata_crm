'use client';

import { useId, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, MessageCircle, Send, SkipForward } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { useLogLeadWhatsApp } from '../hooks/use-leads';
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
  Label,
  Textarea,
  useLanguage,
} from './lead-ui-kit';
import { LtrText } from './ltr-text';
import { copyText, resolveLeadVars, toWhatsAppHref } from './lead-ui-utils';
import { bucketLeadsByWhatsApp, whatsAppPhoneFor } from './use-lead-bulk-actions';

const MAX_MESSAGE_LENGTH = 2000;
/** Variables the hint chips offer; they resolve in `resolveLeadVars`. */
const MESSAGE_VARIABLES = ['businessName', 'contactName', 'city'] as const;

export type BulkWhatsAppSummary = { opened: number; skipped: number };

type LeadBulkWhatsAppDialogProps = {
  /** Snapshot of the selected leads taken when the dialog opened. */
  leads: Lead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once when the stepper reaches the end, with the honest open/skip tally. */
  onComplete?: (summary: BulkWhatsAppSummary) => void;
};

/**
 * Bulk WhatsApp for selected leads. WhatsApp deep links cannot send on their own
 * and browsers block opening many tabs at once, so this is deliberately NOT a
 * "message everyone" button: it steps through eligible leads one chat at a time
 * (each `window.open` stays inside its own click so pop-up blockers allow it) and
 * offers a "copy all links" escape hatch. It logs every chat it opens and never
 * claims a message was delivered.
 */
export function LeadBulkWhatsAppDialog({ leads, open, onOpenChange, onComplete }: LeadBulkWhatsAppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <BulkWhatsAppBody leads={leads} onClose={() => onOpenChange(false)} onComplete={onComplete} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkWhatsAppBody({
  leads,
  onClose,
  onComplete,
}: {
  leads: Lead[];
  onClose: () => void;
  onComplete?: (summary: BulkWhatsAppSummary) => void;
}) {
  const { t } = useLanguage();
  const uid = useId();
  const logWhatsApp = useLogLeadWhatsApp();

  const buckets = useMemo(() => bucketLeadsByWhatsApp(leads), [leads]);
  const eligible = buckets.eligible;

  const [message, setMessage] = useState(() => t('leads.whatsapp.messagePlaceholder', 'Hi {{businessName}}, '));
  const [index, setIndex] = useState(0);
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());

  const done = eligible.length > 0 && index >= eligible.length;
  const current = eligible[index] ?? null;

  const insertVariable = (name: string) =>
    setMessage((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}{{${name}}}`);

  const advance = (opened: Set<string>, nextIndex: number) => {
    setOpenedIds(opened);
    setIndex(nextIndex);
    if (nextIndex >= eligible.length) {
      onComplete?.({ opened: opened.size, skipped: eligible.length - opened.size });
    }
  };

  const handleOpenCurrent = () => {
    if (!current) return;
    const resolved = resolveLeadVars(message, current);
    const href = toWhatsAppHref(whatsAppPhoneFor(current), resolved);
    // Opened synchronously inside the click so the pop-up blocker treats it as
    // user-driven; the person still sends the message from WhatsApp.
    if (href) window.open(href, '_blank', 'noopener');
    const opened = new Set(openedIds);
    if (href) opened.add(current.id);
    logWhatsApp.mutate({ id: current.id, message: resolved });
    advance(opened, index + 1);
  };

  const handleSkipCurrent = () => advance(new Set(openedIds), index + 1);

  const handleCopyLinks = async () => {
    const links = eligible
      .map((lead) => toWhatsAppHref(whatsAppPhoneFor(lead), resolveLeadVars(message, lead)))
      .filter((href): href is string => Boolean(href));
    if (await copyText(links.join('\n'))) {
      showSuccess(t('leads.bulk.whatsapp.linksCopied', 'Links copied'));
    } else {
      showError(t('leads.toast.copyFailed', 'Could not copy to the clipboard'));
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle>{t('leads.bulk.whatsapp', 'WhatsApp')}</DialogTitle>
            <DialogDescription>
              {t('leads.bulk.whatsapp.eligible', '{count} of {total} selected leads can be messaged', {
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
            {t('leads.bulk.whatsapp.recipients', 'Recipients')}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {t('leads.bulk.whatsapp.eligible', '{count} of {total} selected leads can be messaged', {
              count: eligible.length,
              total: leads.length,
            })}
          </p>
          {buckets.missingPhone.length > 0 && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t('leads.bulk.whatsapp.missingPhone', '{count} lead(s) without a usable phone number will be skipped', {
                count: buckets.missingPhone.length,
              })}
            </p>
          )}
        </div>

        {/* Honest deep-link caveat */}
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {t(
              'leads.bulk.whatsapp.cannotBulkOpen',
              'Your browser blocks opening many tabs at once. Copy the links and open each chat yourself.',
            )}
          </AlertDescription>
        </Alert>

        {eligible.length === 0 ? null : (
          <>
            {/* Message */}
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-message`} className="text-[12px] font-medium text-muted-foreground">
                {t('leads.whatsapp.message', 'Message')}
              </Label>
              <Textarea
                id={`${uid}-message`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MAX_MESSAGE_LENGTH}
                rows={4}
                placeholder={t('leads.whatsapp.messagePlaceholder', 'Hi {{businessName}}, ')}
                className="min-h-24 text-[13px]"
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-muted-foreground">
                  {t('leads.whatsapp.variables', 'Insert variable')}:
                </span>
                {MESSAGE_VARIABLES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => insertVariable(name)}
                    className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <LtrText>{`{{${name}}}`}</LtrText>
                  </button>
                ))}
              </div>
            </div>

            {/* Stepper, or the final tally */}
            {done ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>
                  {t('leads.bulk.whatsapp.summary', '{opened} opened, {skipped} skipped', {
                    opened: openedIds.size,
                    skipped: eligible.length - openedIds.size,
                  })}
                </AlertTitle>
              </Alert>
            ) : (
              current && (
                <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{current.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        <LtrText>{whatsAppPhoneFor(current) ?? ''}</LtrText>
                      </p>
                    </div>
                    <span
                      aria-live="polite"
                      className="shrink-0 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      <LtrText>{`${index + 1} / ${eligible.length}`}</LtrText>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleOpenCurrent} className="flex-1 gap-2">
                      <Send className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                      {t('leads.bulk.whatsapp.send', 'Open WhatsApp')}
                    </Button>
                    <Button variant="outline" onClick={handleSkipCurrent} className="gap-1.5">
                      <SkipForward className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                      {t('common.skip', 'Skip')}
                    </Button>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </DialogBody>

      <DialogFooter>
        {eligible.length > 0 && (
          <Button variant="outline" onClick={() => void handleCopyLinks()} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leads.bulk.whatsapp.copyLinks', 'Copy links')}
          </Button>
        )}
        <Button variant={done || eligible.length === 0 ? 'default' : 'ghost'} onClick={onClose}>
          {t('common.close', 'Close')}
        </Button>
      </DialogFooter>
    </>
  );
}
