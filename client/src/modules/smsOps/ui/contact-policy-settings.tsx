'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { apiErrorMessage, apiErrorStatus, useContactPolicySettings, useSmsOpsMutations } from '../hooks/use-sms-ops';
import { CONTACT_CHANNELS, type ContactChannel, type ContactPolicySettings } from '../types/sms-ops-types';
import { useSmsOpsLanguage } from './use-sms-ops-language';

const CHANNEL_FALLBACK: Record<ContactChannel, string> = { voice: 'Calls', sms: 'SMS', email: 'E-mail', whatsapp: 'WhatsApp' };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Client-side guard mirroring the server's Joi schema. Returns error keys. */
export function validatePolicy(p: ContactPolicySettings): string[] {
  const errors: string[] = [];
  const int = (v: number, max: number) => Number.isInteger(v) && v >= 0 && v <= max;
  if (!int(p.maxTouchesPerDay, 100)) errors.push('maxTouchesPerDay');
  if (!int(p.maxTouchesPerWeek, 500)) errors.push('maxTouchesPerWeek');
  if (!int(p.minGapMinutes, 10_080)) errors.push('minGapMinutes');
  for (const c of CONTACT_CHANNELS) {
    if (!int(p.channels[c].perDay, 100)) errors.push(`channels.${c}.perDay`);
    if (!int(p.channels[c].perWeek, 500)) errors.push(`channels.${c}.perWeek`);
  }
  if (!HHMM.test(p.quietHours.start)) errors.push('quietHours.start');
  if (!HHMM.test(p.quietHours.end)) errors.push('quietHours.end');
  return errors;
}

/** The PUT body (server rejects unknown keys like configured/updatedAt). */
export function policyPayload(p: ContactPolicySettings) {
  return {
    enabled: p.enabled, maxTouchesPerDay: p.maxTouchesPerDay, maxTouchesPerWeek: p.maxTouchesPerWeek, minGapMinutes: p.minGapMinutes,
    channels: Object.fromEntries(CONTACT_CHANNELS.map((c) => [c, { perDay: p.channels[c].perDay, perWeek: p.channels[c].perWeek }])) as ContactPolicySettings['channels'],
    quietHours: { enabled: p.quietHours.enabled, start: p.quietHours.start, end: p.quietHours.end },
  };
}

function NumberField({ label, value, onChange, max, invalid, disabled, hint }: { label: string; value: number; onChange: (n: number) => void; max: number; invalid?: boolean; disabled?: boolean; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number" min={0} max={max} inputMode="numeric" disabled={disabled}
        aria-invalid={invalid || undefined}
        className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm tabular-nums ${invalid ? 'border-destructive' : 'border-border'}`}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
      {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function ContactPolicySettingsForm() {
  const { t } = useSmsOpsLanguage();
  const { data, isLoading, isError, refetch } = useContactPolicySettings();
  if (isLoading) return <p className="text-sm text-muted-foreground">{t('smsOps.loading', 'Loading…')}</p>;
  if (isError || !data) return <button type="button" className="text-sm text-brand-500" onClick={() => void refetch()}>{t('smsOps.loadError', 'Could not load. Retry')}</button>;
  // Keyed by the saved version: a save (or another admin's change) resets the draft.
  return <PolicyForm key={data.updatedAt ?? 'unsaved'} initial={data} />;
}

function PolicyForm({ initial }: { initial: ContactPolicySettings }) {
  const { t } = useSmsOpsLanguage();
  const m = useSmsOpsMutations();
  const [form, setFormState] = useState<ContactPolicySettings>(() => structuredClone(initial));
  const setForm = (fn: (f: ContactPolicySettings | null) => ContactPolicySettings | null) => setFormState((f) => fn(f) ?? f);
  const [readOnly, setReadOnly] = useState(false);

  const errors = validatePolicy(form);
  const set = (patch: Partial<ContactPolicySettings>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setChannel = (c: ContactChannel, key: 'perDay' | 'perWeek', v: number) => setForm((f) => (f ? { ...f, channels: { ...f.channels, [c]: { ...f.channels[c], [key]: v } } } : f));
  const save = () => {
    if (errors.length) return;
    m.savePolicy.mutate(policyPayload(form), {
      onSuccess: () => showSuccess(t('smsOps.policy.saved', 'Contact policy saved')),
      onError: (e) => {
        if (apiErrorStatus(e) === 403) { setReadOnly(true); showError(t('smsOps.policy.forbidden', 'Only administrators can change the contact policy.')); }
        else showError(apiErrorMessage(e));
      },
    });
  };

  return (
    <form className="max-w-3xl space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }} aria-label={t('smsOps.tabs.policy', 'Contact limits')}>
      <div className="flex items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">{t('smsOps.policy.title', 'One contact limit for calls, SMS and messages')}</p>
          <p className="text-muted-foreground">{t('smsOps.policy.hint', 'Every campaign (AI calls, SIM calls, SIM SMS, provider messages) checks these limits before it contacts a lead. Do-not-contact, opt-outs and revoked consent always block, even when the limits are off. Manual contacts by a user are counted but never blocked by the limits.')}</p>
          {!form.configured ? <p className="mt-1 text-amber-700 dark:text-amber-400">{t('smsOps.policy.notConfigured', 'No policy saved yet: limits are off until you save one.')}</p> : null}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.enabled} disabled={readOnly} onChange={(e) => set({ enabled: e.target.checked })} />
        {t('smsOps.policy.enabled', 'Enforce contact limits')}
      </label>

      <fieldset className="grid gap-3 sm:grid-cols-3" disabled={readOnly}>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.policy.allChannels', 'All channels together')}</legend>
        <NumberField label={t('smsOps.policy.perDay', 'Max contacts per 24 h')} value={form.maxTouchesPerDay} max={100} invalid={errors.includes('maxTouchesPerDay')} onChange={(n) => set({ maxTouchesPerDay: n })} hint={t('smsOps.policy.zeroOff', '0 = no limit')} />
        <NumberField label={t('smsOps.policy.perWeek', 'Max contacts per 7 days')} value={form.maxTouchesPerWeek} max={500} invalid={errors.includes('maxTouchesPerWeek')} onChange={(n) => set({ maxTouchesPerWeek: n })} hint={t('smsOps.policy.zeroOff', '0 = no limit')} />
        <NumberField label={t('smsOps.policy.minGap', 'Minimum gap between contacts (minutes)')} value={form.minGapMinutes} max={10_080} invalid={errors.includes('minGapMinutes')} onChange={(n) => set({ minGapMinutes: n })} />
      </fieldset>

      <fieldset disabled={readOnly}>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.policy.perChannel', 'Per channel')}</legend>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">{t('smsOps.policy.channel', 'Channel')}</th>
                <th className="px-3 py-2 text-start">{t('smsOps.policy.perDayShort', 'Per 24 h')}</th>
                <th className="px-3 py-2 text-start">{t('smsOps.policy.perWeekShort', 'Per 7 days')}</th>
              </tr>
            </thead>
            <tbody>
              {CONTACT_CHANNELS.map((c) => (
                <tr key={c} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{t(`smsOps.channel.${c}`, CHANNEL_FALLBACK[c])}</td>
                  {(['perDay', 'perWeek'] as const).map((k) => (
                    <td key={k} className="px-3 py-2">
                      <input
                        type="number" min={0} inputMode="numeric"
                        aria-label={`${t(`smsOps.channel.${c}`, CHANNEL_FALLBACK[c])} ${k === 'perDay' ? t('smsOps.policy.perDayShort', 'Per 24 h') : t('smsOps.policy.perWeekShort', 'Per 7 days')}`}
                        aria-invalid={errors.includes(`channels.${c}.${k}`) || undefined}
                        className={`w-24 rounded-lg border bg-background px-2 py-1 tabular-nums ${errors.includes(`channels.${c}.${k}`) ? 'border-destructive' : 'border-border'}`}
                        value={Number.isFinite(form.channels[c][k]) ? form.channels[c][k] : ''}
                        onChange={(e) => setChannel(c, k, e.target.value === '' ? Number.NaN : Number(e.target.value))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={readOnly}>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.policy.quietHours', 'Quiet hours (lead’s local time)')}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.quietHours.enabled} onChange={(e) => set({ quietHours: { ...form.quietHours, enabled: e.target.checked } })} />
          {t('smsOps.policy.quietEnabled', 'Do not contact leads during their night')}
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="text-muted-foreground">{t('smsOps.policy.from', 'From')}</span>
            <input type="time" dir="ltr" aria-invalid={errors.includes('quietHours.start') || undefined} className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.quietHours.start} onChange={(e) => set({ quietHours: { ...form.quietHours, start: e.target.value } })} />
          </label>
          <label className="text-sm"><span className="text-muted-foreground">{t('smsOps.policy.until', 'Until')}</span>
            <input type="time" dir="ltr" aria-invalid={errors.includes('quietHours.end') || undefined} className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.quietHours.end} onChange={(e) => set({ quietHours: { ...form.quietHours, end: e.target.value } })} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{t('smsOps.policy.quietHint', 'The lead’s time zone comes from their country. For countries with several time zones it is unknown, and only each campaign’s own hours apply.')}</p>
      </fieldset>

      {errors.length ? <p className="text-sm text-destructive" role="alert">{t('smsOps.policy.invalid', 'Please fix the highlighted values.')}</p> : null}
      {readOnly ? <p className="text-sm text-muted-foreground">{t('smsOps.policy.forbidden', 'Only administrators can change the contact policy.')}</p> : (
        <div className="flex justify-end">
          <button type="submit" disabled={m.savePolicy.isPending || errors.length > 0} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {t('smsOps.policy.save', 'Save contact policy')}
          </button>
        </div>
      )}
    </form>
  );
}
