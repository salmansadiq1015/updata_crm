'use client';

import { useId, useMemo, useState } from 'react';
import { AtSign, CheckCircle2, Loader2, Phone, ShieldCheck, Smartphone } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useUpdateLead } from '../hooks/use-leads';
import type { Lead, LeadPatch } from '../types/lead-types';
import {
  isValidLeadEmail,
  isValidLeadPhone,
  normalizeLeadEmail,
  normalizeLeadPhone,
} from './lead-contact-validation';
import {
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
  useLanguage,
} from './lead-ui-kit';

export type LeadContactField = 'email' | 'phone';

type LeadContactEditorProps = {
  lead: Lead | null;
  open: boolean;
  initialFocus?: LeadContactField;
  onOpenChange: (open: boolean) => void;
};

type ContactInputProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  icon: typeof AtSign;
  type: 'email' | 'tel';
  valid: boolean;
  error: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
};

function ContactInput({ id, label, value, placeholder, icon: Icon, type, valid, error, autoFocus, onChange }: ContactInputProps) {
  const hasValue = value.trim().length > 0;
  return (
    <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {label}
        </Label>
        {hasValue && valid && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Valid
          </span>
        )}
      </div>
      <Input
        id={id}
        dir="ltr"
        type={type}
        inputMode={type === 'email' ? 'email' : 'tel'}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        aria-invalid={hasValue && !valid ? true : undefined}
        aria-describedby={hasValue && !valid ? `${id}-error` : `${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-10 bg-background text-[13px]', hasValue && !valid && 'border-destructive focus-visible:ring-destructive/25')}
      />
      {hasValue && !valid ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-medium text-destructive">{error}</p>
      ) : (
        <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
          {type === 'email' ? 'Example: hello@company.com' : 'Use Swiss national format or include the international country code.'}
        </p>
      )}
    </div>
  );
}

export function LeadContactEditor({ lead, open, initialFocus = 'email', onOpenChange }: LeadContactEditorProps) {
  const { t } = useLanguage();
  const baseId = useId();
  const updateLead = useUpdateLead();
  // The parent mounts a fresh editor for each open action, so local form state
  // starts from the selected lead without an effect-driven reset or stale flash.
  const [email, setEmail] = useState(lead?.email ?? '');
  const [phone, setPhone] = useState(lead?.phone ?? '');
  const [mobile, setMobile] = useState(lead?.mobile ?? '');

  const emailValid = isValidLeadEmail(email);
  const phoneValid = isValidLeadPhone(phone);
  const mobileValid = isValidLeadPhone(mobile);
  const patch = useMemo<LeadPatch>(() => {
    if (!lead) return {};
    const next: LeadPatch = {};
    const normalizedEmail = normalizeLeadEmail(email);
    const normalizedPhone = normalizeLeadPhone(phone);
    const normalizedMobile = normalizeLeadPhone(mobile);
    if ((lead.email ?? null) !== normalizedEmail) next.email = normalizedEmail;
    if ((lead.phone ?? null) !== normalizedPhone) next.phone = normalizedPhone;
    if ((lead.mobile ?? null) !== normalizedMobile) next.mobile = normalizedMobile;
    return next;
  }, [email, lead, mobile, phone]);

  const canSave = Boolean(lead) && emailValid && phoneValid && mobileValid && Object.keys(patch).length > 0;
  const close = () => {
    if (!updateLead.isPending) onOpenChange(false);
  };

  const save = async () => {
    if (!lead || !canSave) return;
    try {
      await updateLead.mutateAsync({ id: lead.id, patch });
      showSuccess(t('leads.contact.saved', 'Contact details updated'));
      onOpenChange(false);
    } catch {
      // The mutation hook presents the sanitized API error and keeps this open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border/70 bg-gradient-to-br from-primary/[0.08] via-background to-background">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <AtSign className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>{t('leads.contact.title', 'Contact details for {name}', { name: lead?.name ?? '' })}</DialogTitle>
          <DialogDescription>
            {t('leads.contact.description', 'Add verified contact details before starting Email, SMS, or WhatsApp outreach.')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 py-5">
          <ContactInput
            id={`${baseId}-email`}
            label={t('leads.form.email', 'Email')}
            value={email}
            placeholder="hello@company.com"
            icon={AtSign}
            type="email"
            valid={emailValid}
            error={t('leads.form.error.email', 'Enter a valid email address')}
            autoFocus={initialFocus === 'email'}
            onChange={setEmail}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <ContactInput
              id={`${baseId}-phone`}
              label={t('leads.form.phone', 'Phone')}
              value={phone}
              placeholder="+41 44 123 45 67"
              icon={Phone}
              type="tel"
              valid={phoneValid}
              error={t('leads.form.error.phone', 'Enter a valid phone number with country code')}
              autoFocus={initialFocus === 'phone'}
              onChange={setPhone}
            />
            <ContactInput
              id={`${baseId}-mobile`}
              label={t('leads.form.mobile', 'Mobile')}
              value={mobile}
              placeholder="+41 79 123 45 67"
              icon={Smartphone}
              type="tel"
              valid={mobileValid}
              error={t('leads.form.error.phone', 'Enter a valid phone number with country code')}
              onChange={setMobile}
            />
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p>{t('leads.contact.consentNote', 'Saving contact data does not grant outreach consent. Channel consent and suppression checks still apply before every send.')}</p>
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-border/70 bg-muted/20">
          <Button variant="outline" onClick={close} disabled={updateLead.isPending}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={() => void save()} disabled={!canSave || updateLead.isPending} className="gap-2">
            {updateLead.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
