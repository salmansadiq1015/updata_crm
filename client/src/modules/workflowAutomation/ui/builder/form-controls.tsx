'use client';
import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { ValidationIssue } from '../../types/workflow-types';

export function Field({ label, help, issues = [], children, htmlFor, className }: { label: string; help?: string; issues?: ValidationIssue[]; children: ReactNode; htmlFor?: string; className?: string }) {
  const { t } = useLanguage();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-foreground/90">{label}</label>
      {children}
      {issues.map((i) => (
        <p key={`${i.field}-${i.code}`} role="alert" className="flex items-start gap-1 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{t(`workflowBuilder.validation.${i.code}`, i.code)}
        </p>
      ))}
      {help && !issues.length && <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  );
}

export function TextField({ label, help, value, onChange, issues, placeholder, multiline = false, rows = 4, maxLength, type = 'text' }: {
  label: string; help?: string; value: string; onChange: (v: string) => void; issues?: ValidationIssue[]; placeholder?: string; multiline?: boolean; rows?: number; maxLength?: number; type?: string;
}) {
  const id = useId();
  return (
    <Field label={label} help={help} issues={issues} htmlFor={id}>
      {multiline
        ? <Textarea id={id} value={value} rows={rows} maxLength={maxLength} placeholder={placeholder} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)} aria-invalid={Boolean(issues?.length)} className="resize-y text-sm" />
        : <Input id={id} type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(issues?.length)} className="text-sm" />}
    </Field>
  );
}

export function NumberField({ label, help, value, onChange, issues, min, max, step = 1, suffix }: {
  label: string; help?: string; value: number | ''; onChange: (v: number | '') => void; issues?: ValidationIssue[]; min?: number; max?: number; step?: number; suffix?: string;
}) {
  const id = useId();
  return (
    <Field label={label} help={help} issues={issues} htmlFor={id}>
      <div className="relative">
        <Input id={id} type="number" inputMode="numeric" value={value} min={min} max={max} step={step} aria-invalid={Boolean(issues?.length)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={cn('text-sm', suffix && 'pe-14')} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </Field>
  );
}

export interface Option { value: string; label: string; hint?: string }
export const NONE = '__none__';
export function SelectField({ label, help, value, onChange, options, issues, placeholder, allowNone = false, noneLabel }: {
  label: string; help?: string; value: string | null | undefined; onChange: (v: string | null) => void; options: Option[]; issues?: ValidationIssue[]; placeholder?: string; allowNone?: boolean; noneLabel?: string;
}) {
  const id = useId();
  return (
    <Field label={label} help={help} issues={issues} htmlFor={id}>
      <Select value={value || (allowNone ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger id={id} className="w-full text-sm" aria-invalid={Boolean(issues?.length)}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>{noneLabel || '—'}</SelectItem>}
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}{o.hint ? <span className="ms-1 text-muted-foreground">· {o.hint}</span> : null}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function SwitchField({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-semibold">{label}</label>
        {help && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{help}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="" />
    </div>
  );
}

export function ChipToggleGroup({ label, help, options, value, onChange, issues }: { label: string; help?: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; issues?: ValidationIssue[] }) {
  return (
    <Field label={label} help={help} issues={issues}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** Personalization variables (messaging syntax) inserted at the end of a text field. */
export function VariableChips({ variables, onInsert }: { variables: string[]; onInsert: (token: string) => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="me-1 text-[11px] text-muted-foreground">{t('workflowBuilder.form.insertVariable', 'Insert:')}</span>
      {variables.map((v) => (
        <button key={v} type="button" onClick={() => onInsert(`{{${v}}}`)}
          className="rounded-md border border-dashed border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}
