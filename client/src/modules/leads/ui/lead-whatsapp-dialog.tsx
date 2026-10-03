'use client';

import { useId, useState } from 'react';
import { AlertTriangle, Loader2, MessageCircle, Send } from 'lucide-react';
import { useLogLeadWhatsApp } from '../hooks/use-leads';
import type { Lead } from '../types/lead-types';
import {
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
import { resolveLeadVars, toWhatsAppHref } from './lead-ui-utils';
import { LtrText } from './ltr-text';

const MAX_MESSAGE_LENGTH = 2000;

/** Variables the message hint chips offer; they resolve in `resolveLeadVars`. */
const MESSAGE_VARIABLES = ['businessName', 'contactName', 'city'] as const;

type LeadWhatsAppDialogProps = {
  /** Lead to message. The dialog renders nothing without one. */
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Compose a WhatsApp message for a single lead. "Open WhatsApp" launches a
 * `wa.me` deep link pre-filled with the resolved message and logs the intent —
 * the person sends it from WhatsApp, so the copy never claims it was delivered.
 */
export function LeadWhatsAppDialog({ lead, open, onOpenChange }: LeadWhatsAppDialogProps) {
  return (
    <Dialog open={open && Boolean(lead)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {lead && <LeadWhatsAppBody key={lead.id} lead={lead} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LeadWhatsAppBody({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { t } = useLanguage();
  const uid = useId();
  const logWhatsApp = useLogLeadWhatsApp();

  const phone = lead.normalizedPhone ?? lead.phone ?? lead.mobile ?? null;
  const displayPhone = lead.phone ?? lead.mobile ?? lead.normalizedPhone ?? null;
  const hasUsablePhone = Boolean(toWhatsAppHref(phone));

  const [message, setMessage] = useState(() =>
    t('leads.whatsapp.messagePlaceholder', 'Hi {{businessName}}, '),
  );

  const insertVariable = (name: string) =>
    setMessage((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}{{${name}}}`);

  const handleOpen = () => {
    const resolved = resolveLeadVars(message, lead);
    const href = toWhatsAppHref(phone, resolved);
    if (!href) return;
    // Open synchronously inside the click so the browser treats it as user-driven
    // (otherwise popup blockers swallow it).
    window.open(href, '_blank', 'noopener');
    logWhatsApp.mutate({ id: lead.id, message: resolved });
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle>{t('leads.whatsapp.title', 'Send a WhatsApp message')}</DialogTitle>
            <DialogDescription>
              {t('leads.whatsapp.note', 'Opens WhatsApp with your message — you send it from WhatsApp.')}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-5">
        {/* Recipient */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('leads.whatsapp.to', 'To')}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{lead.name}</p>
          {displayPhone && (
            <p className="text-[13px] text-muted-foreground">
              <LtrText>{displayPhone}</LtrText>
            </p>
          )}
        </div>

        {!hasUsablePhone && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              {t('leads.whatsapp.noPhone', 'This lead has no usable phone number for WhatsApp.')}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-message`} className="text-[12px] font-medium text-muted-foreground">
            {t('leads.whatsapp.message', 'Message')}
          </Label>
          <Textarea
            id={`${uid}-message`}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={5}
            placeholder={t('leads.whatsapp.messagePlaceholder', 'Hi {{businessName}}, ')}
            className="min-h-28 text-[13px]"
          />
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] text-muted-foreground">{t('leads.whatsapp.variables', 'Insert variable')}:</span>
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
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleOpen} disabled={!hasUsablePhone || logWhatsApp.isPending} className="gap-2">
          {logWhatsApp.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
          )}
          {t('leads.whatsapp.open', 'Open WhatsApp')}
        </Button>
      </DialogFooter>
    </>
  );
}
