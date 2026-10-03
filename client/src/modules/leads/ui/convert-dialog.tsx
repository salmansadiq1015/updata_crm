'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CircleCheck,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
  UserRound,
} from 'lucide-react';
import { leadKeys, useConvertLead, useLeadDuplicates } from '../hooks/use-leads';
import type { Lead, LeadConversionResult } from '../types/lead-types';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useLanguage,
} from './lead-ui-kit';
import { UNASSIGNED } from './lead-ui-constants';
import { customerHref, formatAddressOneLine, getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { LeadStatusBadge } from './status-badge';
import { LtrText } from './ltr-text';

const MAX_NOTE_LENGTH = 5000;
const PHONE_FOR_DUPLICATES = /^(\+[1-9]\d{0,2}[\s.-]?)?(\(?\d{1,4}\)?[\s.-]?){1,5}\d{1,4}$/;

type ConvertDialogProps = {
  /** Lead to convert. The dialog renders nothing without one. */
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users?: LeadUser[];
  /** Called once the API confirmed the conversion (lists/detail are already refreshed). */
  onConverted?: (result: LeadConversionResult) => void;
};

/**
 * Convert-to-Customer: confirm, optionally hand the new customer to someone and
 * leave a note, then show the customer that was created.
 */
export function ConvertDialog({ lead, open, onOpenChange, users = [], onConverted }: ConvertDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open && Boolean(lead)}
      onOpenChange={(next) => {
        // Closing mid-request would hide whether the customer was created.
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        {lead && (
          <ConvertDialogBody
            key={lead.id}
            lead={lead}
            users={users}
            onClose={() => onOpenChange(false)}
            onPendingChange={setPending}
            onConverted={onConverted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ConvertDialogBodyProps = {
  lead: Lead;
  users: LeadUser[];
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onConverted?: (result: LeadConversionResult) => void;
};

function ConvertDialogBody({ lead, users, onClose, onPendingChange, onConverted }: ConvertDialogBodyProps) {
  const { t } = useLanguage();
  const uid = useId();
  const queryClient = useQueryClient();
  const convertLead = useConvertLead();

  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<LeadConversionResult | null>(null);

  const alreadyConverted = lead.status === 'converted';

  // Heads-up when the customer base already holds this business. Non-blocking:
  // the server stays the authority on whether the conversion goes through.
  const duplicateParams = useMemo(
    () => ({
      name: lead.name || undefined,
      phone: lead.phone && PHONE_FOR_DUPLICATES.test(lead.phone) ? lead.phone : undefined,
      website: lead.website ?? undefined,
      placeId: lead.sourceMetadata.googlePlaceId ?? undefined,
    }),
    [lead.name, lead.phone, lead.website, lead.sourceMetadata.googlePlaceId],
  );
  const duplicatesQuery = useLeadDuplicates(duplicateParams, { enabled: !alreadyConverted && !result });
  const existingCustomers = (duplicatesQuery.data ?? []).filter(
    (duplicate) => duplicate.entityType === 'customer' && duplicate.id !== lead.convertedCustomerId,
  );

  const handleConvert = async () => {
    onPendingChange(true);
    try {
      const trimmedNote = note.trim();
      // useConvertLead announces the success and refreshes the lists.
      const converted = await convertLead.mutateAsync({
        id: lead.id,
        input: {
          ...(assignedTo ? { assignedTo } : {}),
          ...(trimmedNote ? { note: trimmedNote } : {}),
        },
      });
      // The API may answer with just a customerId, which leaves the cached
      // detail stale — make sure whoever shows this lead reloads it.
      void queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) });
      setResult(converted);
      onConverted?.(converted);
    } catch {
      // useConvertLead already raised the error toast; the dialog stays open to retry.
    } finally {
      onPendingChange(false);
    }
  };

  // ── Outcome ────────────────────────────────────────────────────────────────
  if (result || alreadyConverted) {
    const customerId = result?.customerId ?? lead.convertedCustomerId;
    return (
      <>
        <DialogHeader>
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
              <CircleCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>
                {result
                  ? t('leads.convert.doneTitle', 'Lead converted')
                  : t('leads.convert.alreadyTitle', 'Already converted')}
              </DialogTitle>
              <DialogDescription>
                {result
                  ? t('leads.convert.doneBody', '{name} is now a customer.', { name: lead.name })
                  : t('leads.convert.alreadyBody', '{name} has already been converted into a customer.', {
                      name: lead.name,
                    })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogBody>
          {customerId ? (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('leads.convert.customerId', 'Customer ID')}
              </p>
              <code
                data-testid="converted-customer-id"
                dir="ltr"
                className="mt-1 block break-all text-start font-mono text-sm text-foreground"
              >
                {customerId}
              </code>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('leads.convert.noCustomerId', 'The customer was created, but the server did not return its ID.')}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          {customerId && (
            <Button asChild className="gap-2">
              <Link href={customerHref(customerId)} onClick={onClose}>
                {t('leads.convert.openCustomer', 'Open customer')}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </DialogFooter>
      </>
    );
  }

  // ── Confirmation ───────────────────────────────────────────────────────────
  const address = formatAddressOneLine(lead.address);
  const TypeIcon = lead.type === 'business' ? Building2 : User;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle>{t('leads.convert.title', 'Convert to customer')}</DialogTitle>
            <DialogDescription>
              {t(
                'leads.convert.description',
                'This creates a customer from the lead’s details and marks the lead as converted.',
              )}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-5">
        {/* What will be converted */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
              {lead.leadNumber && (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{lead.leadNumber}</span>
              )}
            </div>
            <LeadStatusBadge status={lead.status} />
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-muted-foreground">
            {(lead.phone ?? lead.mobile) && (
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  <LtrText>{lead.phone ?? lead.mobile}</LtrText>
                </span>
              </li>
            )}
            {lead.email && (
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  <LtrText>{lead.email}</LtrText>
                </span>
              </li>
            )}
            {address && (
              <li className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{address}</span>
              </li>
            )}
          </ul>
        </div>

        {existingCustomers.length > 0 && (
          <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5" data-testid="convert-duplicates">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {t('leads.convert.duplicatesTitle', 'A similar customer already exists')}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {existingCustomers.slice(0, 3).map((customer) => (
                    <li key={customer.id}>
                      <a
                        href={customerHref(customer.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {customer.name ?? customer.id}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-assignee`} className="text-[12px] font-medium text-muted-foreground">
            {t('leads.convert.assignee', 'Assign to (optional)')}
          </Label>
          <Select
            value={assignedTo || UNASSIGNED}
            onValueChange={(value) => setAssignedTo(value === UNASSIGNED ? '' : value)}
          >
            <SelectTrigger id={`${uid}-assignee`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4} className="max-h-72">
              <SelectItem value={UNASSIGNED}>{t('leads.convert.keepAssignee', 'Keep current assignee')}</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id} textValue={getUserDisplayName(user)}>
                  <span className="flex items-center gap-2">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    {getUserDisplayName(user)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-note`} className="text-[12px] font-medium text-muted-foreground">
            {t('leads.convert.note', 'Note (optional)')}
          </Label>
          <Textarea
            id={`${uid}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            placeholder={t('leads.convert.notePlaceholder', 'Saved on the new customer, e.g. how the lead was won')}
            className="min-h-20 text-[13px]"
          />
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={convertLead.isPending}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleConvert} disabled={convertLead.isPending} className="gap-2">
          {convertLead.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t('leads.convert.confirm', 'Convert to customer')}
        </Button>
      </DialogFooter>
    </>
  );
}
