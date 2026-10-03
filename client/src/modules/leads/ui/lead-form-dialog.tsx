'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Building2, Loader2, User, UserRound } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useCreateLead, useLeadDuplicates, useUpdateLead } from '../hooks/use-leads';
import type { Lead, LeadDuplicate } from '../types/lead-types';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useLanguage,
} from './lead-ui-kit';
import {
  buildLeadCreateInput,
  buildLeadPatch,
  createLeadFormSchema,
  isEmptyPatch,
  leadToFormValues,
  normalizeWebsite,
} from './lead-form-schema';
import type { LeadFormValues } from './lead-form-schema';
import { LEAD_EDITABLE_STATUSES, LEAD_STATUSES, LEAD_TYPES, UNASSIGNED, getLeadStatusLabel, getLeadTypeLabel } from './lead-ui-constants';
import { LEAD_STATUS_META } from './status-badge';
import { customerHref, getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { useDiscardGuard } from './use-discard-guard';

const NO_CANTON = '__none__';
const PHONE_FOR_DUPLICATES = /^(\+[1-9]\d{0,2}[\s.-]?)?(\(?\d{1,4}\)?[\s.-]?){1,5}\d{1,4}$/;

// ── Field chrome ─────────────────────────────────────────────────────────────

type FieldProps = {
  id: string;
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

function Field({ id, label, required, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function FormSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

// Default control heights, so inputs and selects line up in the two-column grid.
const inputClass = 'text-[13px]';

// ── Possible duplicates (create mode) ────────────────────────────────────────

function DuplicateNotice({ duplicates }: { duplicates: LeadDuplicate[] }) {
  const { t } = useLanguage();
  if (duplicates.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5"
      data-testid="lead-duplicates"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t('leads.form.duplicatesTitle', 'Possible duplicates found')}
          </p>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
            {t('leads.form.duplicatesBody', 'These records look like the lead you are entering. You can still save it.')}
          </p>
          <ul className="mt-2 space-y-1">
            {duplicates.slice(0, 5).map((duplicate) => (
              <li key={`${duplicate.entityType}-${duplicate.id}`}>
                <a
                  href={duplicate.entityType === 'customer' ? customerHref(duplicate.id) : `/leads?detail=${duplicate.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate font-medium">{duplicate.name ?? duplicate.id}</span>
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                    {duplicate.entityType === 'customer'
                      ? t('leads.form.duplicateCustomer', 'Customer')
                      : t('leads.form.duplicateLead', 'Lead')}
                  </span>
                  {duplicate.matchedBy.length > 0 && (
                    <span className="truncate text-xs text-muted-foreground">
                      {duplicate.matchedBy.join(', ').toLowerCase().replace(/_/g, ' ')}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── The form itself (shared by the dialog and the drawer's edit mode) ────────

type LeadFormProps = {
  /** Lead being edited; omit (or null) to create a new one. */
  lead?: Lead | null;
  /** DOM id of the <form>, so a submit button rendered elsewhere can target it. */
  formId: string;
  users?: LeadUser[];
  onSaved?: (lead: Lead) => void;
  /** Called instead of hitting the API when an edit changed nothing. */
  onUnchanged?: () => void;
  onPendingChange?: (pending: boolean) => void;
  /** Reports whether there are unsaved edits (and `false` again on unmount). */
  onDirtyChange?: (dirty: boolean) => void;
};

export function LeadForm({
  lead,
  formId,
  users = [],
  onSaved,
  onUnchanged,
  onPendingChange,
  onDirtyChange,
}: LeadFormProps) {
  const { t } = useLanguage();
  const uid = useId();
  const isEdit = Boolean(lead);
  const isConverted = lead?.status === 'converted';

  const schema = useMemo(() => createLeadFormSchema(t), [t]);
  const [initialValues] = useState<LeadFormValues>(() => leadToFormValues(lead));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    reValidateMode: 'onChange',
  });

  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const isPending = createLead.isPending || updateLead.isPending;
  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  // Whoever shows the form must not keep believing in edits that no longer exist.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Duplicate check while creating: name, phone and website feed the same
  // endpoint the import uses. Inputs that would fail server validation are
  // simply not sent.
  const [watchedName, watchedPhone, watchedWebsite] = useWatch({ control, name: ['name', 'phone', 'website'] });
  const debouncedName = useDebounce(watchedName.trim(), 400);
  const debouncedPhone = useDebounce(watchedPhone.trim(), 400);
  const debouncedWebsite = useDebounce(watchedWebsite.trim(), 400);
  const duplicatesQuery = useLeadDuplicates(
    {
      ...(debouncedName.length >= 3 ? { name: debouncedName } : {}),
      ...(PHONE_FOR_DUPLICATES.test(debouncedPhone) ? { phone: debouncedPhone } : {}),
      ...(debouncedWebsite.length >= 4 ? { website: normalizeWebsite(debouncedWebsite) } : {}),
    },
    { enabled: !isEdit },
  );
  const duplicates = !isEdit ? (duplicatesQuery.data ?? []) : [];

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (lead) {
        const patch = buildLeadPatch(initialValues, values);
        if (isEmptyPatch(patch)) {
          onUnchanged?.();
          return;
        }
        const saved = await updateLead.mutateAsync({ id: lead.id, patch });
        showSuccess(t('leads.toast.updated', 'Lead updated'));
        onSaved?.(saved);
      } else {
        // useCreateLead announces the success itself.
        const saved = await createLead.mutateAsync(buildLeadCreateInput(values));
        onSaved?.(saved);
      }
    } catch {
      // The mutation hooks already show the failure as a toast. Stay open so
      // the person can correct the input and retry.
    }
  });

  const fieldId = (name: string) => `${uid}-${name}`;
  const invalid = (name: keyof LeadFormValues) => (errors[name] ? true : undefined);
  const describedBy = (name: keyof LeadFormValues) => (errors[name] ? `${fieldId(name)}-error` : undefined);

  const statusOptions = isConverted ? LEAD_STATUSES : LEAD_EDITABLE_STATUSES;

  // `@container`: the grids below follow the width of the form itself, so they
  // stay single-column in a narrow drawer and open up to two columns in the dialog.
  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="@container space-y-6" aria-busy={isPending}>
      {!isEdit && <DuplicateNotice duplicates={duplicates} />}

      {/* ── Basics ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <FormSectionTitle>{t('leads.form.sectionBasics', 'Basics')}</FormSectionTitle>

        <Field id={fieldId('name')} label={t('leads.form.name', 'Name')} required error={errors.name?.message}>
          <Input
            id={fieldId('name')}
            placeholder={t('leads.form.namePlaceholder', 'e.g. Muster GmbH')}
            autoComplete="off"
            aria-invalid={invalid('name')}
            aria-describedby={describedBy('name')}
            className={inputClass}
            {...register('name')}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  {t('leads.form.type', 'Type')}
                </Label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('leads.form.type', 'Type')}>
                  {LEAD_TYPES.map((type) => {
                    const Icon = type === 'business' ? Building2 : User;
                    const selected = field.value === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => field.onChange(type)}
                        className={cn(
                          'flex h-9 items-center justify-center gap-2 rounded-lg border text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {getLeadTypeLabel(t, type)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          />

          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Field id={fieldId('status')} label={t('leads.form.status', 'Status')}>
                <Select value={field.value} onValueChange={field.onChange} disabled={isConverted}>
                  <SelectTrigger id={fieldId('status')} className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    {statusOptions.map((status) => {
                      const Icon = LEAD_STATUS_META[status].icon;
                      return (
                        <SelectItem key={status} value={status} textValue={getLeadStatusLabel(t, status)}>
                          <span className="flex items-center gap-2">
                            <Icon className={cn('h-3.5 w-3.5', LEAD_STATUS_META[status].iconClassName)} aria-hidden="true" />
                            {getLeadStatusLabel(t, status)}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </div>
      </section>

      {/* ── Contact ────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <FormSectionTitle>{t('leads.form.sectionContact', 'Contact')}</FormSectionTitle>
        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
          <Field id={fieldId('phone')} label={t('leads.form.phone', 'Phone')} error={errors.phone?.message}>
            <Input
              id={fieldId('phone')}
              dir="ltr"
              type="tel"
              placeholder="+41 44 123 45 67"
              autoComplete="off"
              aria-invalid={invalid('phone')}
              aria-describedby={describedBy('phone')}
              className={inputClass}
              {...register('phone')}
            />
          </Field>
          <Field id={fieldId('mobile')} label={t('leads.form.mobile', 'Mobile')} error={errors.mobile?.message}>
            <Input
              id={fieldId('mobile')}
              dir="ltr"
              type="tel"
              placeholder="+41 79 123 45 67"
              autoComplete="off"
              aria-invalid={invalid('mobile')}
              aria-describedby={describedBy('mobile')}
              className={inputClass}
              {...register('mobile')}
            />
          </Field>
          <Field id={fieldId('email')} label={t('leads.form.email', 'Email')} error={errors.email?.message}>
            <Input
              id={fieldId('email')}
              dir="ltr"
              type="email"
              placeholder="info@example.ch"
              autoComplete="off"
              aria-invalid={invalid('email')}
              aria-describedby={describedBy('email')}
              className={inputClass}
              {...register('email')}
            />
          </Field>
          <Field id={fieldId('website')} label={t('leads.form.website', 'Website')} error={errors.website?.message}>
            <Input
              id={fieldId('website')}
              dir="ltr"
              inputMode="url"
              placeholder="https://example.ch"
              autoComplete="off"
              aria-invalid={invalid('website')}
              aria-describedby={describedBy('website')}
              className={inputClass}
              {...register('website')}
            />
          </Field>
        </div>
      </section>

      {/* ── Address ────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <FormSectionTitle>{t('leads.form.sectionAddress', 'Address')}</FormSectionTitle>
        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
          <Field id={fieldId('street')} label={t('leads.form.street', 'Street')} error={errors.street?.message}>
            <Input
              id={fieldId('street')}
              autoComplete="off"
              aria-invalid={invalid('street')}
              aria-describedby={describedBy('street')}
              className={inputClass}
              {...register('street')}
            />
          </Field>
          <Field
            id={fieldId('addressSupplement')}
            label={t('leads.form.addressSupplement', 'Address supplement')}
            error={errors.addressSupplement?.message}
          >
            <Input
              id={fieldId('addressSupplement')}
              autoComplete="off"
              aria-invalid={invalid('addressSupplement')}
              aria-describedby={describedBy('addressSupplement')}
              className={inputClass}
              {...register('addressSupplement')}
            />
          </Field>
          <Field
            id={fieldId('postalCode')}
            label={t('leads.form.postalCode', 'Postal code')}
            error={errors.postalCode?.message}
          >
            <Input
              id={fieldId('postalCode')}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={invalid('postalCode')}
              aria-describedby={describedBy('postalCode')}
              className={inputClass}
              {...register('postalCode')}
            />
          </Field>
          <Field id={fieldId('city')} label={t('leads.form.city', 'City')} error={errors.city?.message}>
            <Input
              id={fieldId('city')}
              autoComplete="off"
              aria-invalid={invalid('city')}
              aria-describedby={describedBy('city')}
              className={inputClass}
              {...register('city')}
            />
          </Field>
          <Controller
            control={control}
            name="canton"
            render={({ field }) => (
              <Field id={fieldId('canton')} label={t('leads.form.canton', 'Canton')} error={errors.canton?.message}>
                <Select
                  value={field.value ? field.value.toUpperCase() : NO_CANTON}
                  onValueChange={(value) => field.onChange(value === NO_CANTON ? '' : value)}
                >
                  <SelectTrigger id={fieldId('canton')} className={inputClass}>
                    <SelectValue placeholder={t('leads.form.cantonNone', 'No canton')} />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="max-h-72">
                    <SelectItem value={NO_CANTON}>{t('leads.form.cantonNone', 'No canton')}</SelectItem>
                    {CH_CANTONS.map((canton: { code: string; name: string }) => (
                      <SelectItem key={canton.code} value={canton.code} textValue={`${canton.code} ${canton.name}`}>
                        {canton.code} · {canton.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Field id={fieldId('country')} label={t('leads.form.country', 'Country')} error={errors.country?.message}>
            <Input
              id={fieldId('country')}
              maxLength={2}
              autoComplete="off"
              aria-invalid={invalid('country')}
              aria-describedby={describedBy('country')}
              className={cn(inputClass, 'uppercase')}
              {...register('country')}
            />
          </Field>
        </div>
      </section>

      {/* ── Assignment & notes ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <FormSectionTitle>{t('leads.form.sectionNotes', 'Assignment & notes')}</FormSectionTitle>
        <Controller
          control={control}
          name="assignedTo"
          render={({ field }) => (
            <Field id={fieldId('assignedTo')} label={t('leads.form.assignedTo', 'Assigned to')}>
              <Select
                value={field.value || UNASSIGNED}
                onValueChange={(value) => field.onChange(value === UNASSIGNED ? '' : value)}
              >
                <SelectTrigger id={fieldId('assignedTo')} className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4} className="max-h-72">
                  <SelectItem value={UNASSIGNED}>{t('leads.assignee.unassigned', 'Unassigned')}</SelectItem>
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
            </Field>
          )}
        />
        <Field
          id={fieldId('tagsText')}
          label={t('leads.form.tags', 'Tags')}
          error={errors.tagsText?.message}
          hint={t('leads.form.tagsHint', 'Separate tags with commas')}
        >
          <Input
            id={fieldId('tagsText')}
            autoComplete="off"
            aria-invalid={invalid('tagsText')}
            aria-describedby={describedBy('tagsText')}
            className={inputClass}
            {...register('tagsText')}
          />
        </Field>
        <Field id={fieldId('notes')} label={t('leads.form.notes', 'Notes')} error={errors.notes?.message}>
          <Textarea
            id={fieldId('notes')}
            rows={4}
            aria-invalid={invalid('notes')}
            aria-describedby={describedBy('notes')}
            className="min-h-24 text-[13px]"
            {...register('notes')}
          />
        </Field>
      </section>
    </form>
  );
}

// ── Dialog (create from the list header, edit from a row action) ─────────────

type LeadFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lead to edit; omit (or null) to create a new one. */
  lead?: Lead | null;
  users?: LeadUser[];
  onSaved?: (lead: Lead) => void;
};

export function LeadFormDialog({ open, onOpenChange, lead, users = [], onSaved }: LeadFormDialogProps) {
  const { t } = useLanguage();
  const formId = useId();
  const [pending, setPending] = useState(false);
  const discard = useDiscardGuard();
  const isEdit = Boolean(lead);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Never drop the dialog mid-request: the person would lose the outcome.
          if (pending) return;
          // Escape / the close button must not silently throw away typed input.
          if (next) onOpenChange(true);
          else discard.guard(() => onOpenChange(false));
        }}
      >
        <DialogContent className="max-h-[92dvh] gap-0 p-0 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? t('leads.form.editTitle', 'Edit lead') : t('leads.form.createTitle', 'New lead')}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? t('leads.form.editDescription', 'Update the details of this lead.')
                : t('leads.form.createDescription', 'Add a prospective customer to your pipeline.')}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <LeadForm
              key={lead?.id ?? 'new'}
              lead={lead}
              formId={formId}
              users={users}
              onPendingChange={setPending}
              onDirtyChange={discard.setDirty}
              onUnchanged={() => onOpenChange(false)}
              onSaved={(saved) => {
                onOpenChange(false);
                onSaved?.(saved);
              }}
            />
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" form={formId} disabled={pending} className="gap-2">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {isEdit ? t('common.save', 'Save') : t('leads.form.create', 'Create lead')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {discard.dialog}
    </>
  );
}
