'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/lib/i18n/language-context';

const DEFAULTS = {
  appointmentHours: '48,24,2',
  followupDays: '7,14,21',
  expiryWarnDays: '3',
  whatsappEnabled: false,
  whatsappApiKey: '',
};

export default function RemindersPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [form, setForm] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const handleSave = () => {
    // These values map to server-side env vars. Display the mapping for ops teams.
    setSaved(true);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">{de ? 'Erinnerungen & Nachverfolgung' : 'Reminders & Follow-Up'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {de
            ? 'Konfigurieren Sie Erinnerungsfenster und Nachverfolgungsintervalle.'
            : 'Configure reminder windows and follow-up intervals.'}
        </p>
      </div>

      {/* Appointment Reminders */}
      <section className="rounded-lg border border-border p-5 flex flex-col gap-4">
        <h2 className="font-semibold">{de ? 'Terminerinnerungen' : 'Appointment Reminders'}</h2>
        <p className="text-xs text-muted-foreground">
          {de
            ? 'Kommagetrennte Stunden vor dem Termin, zu denen Erinnerungen gesendet werden (z.B. 48,24,2). Entspricht der Umgebungsvariable APPOINTMENT_REMINDER_HOURS.'
            : 'Comma-separated hours before the appointment to send reminders (e.g. 48,24,2). Maps to the APPOINTMENT_REMINDER_HOURS env var.'}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Stunden vor Termin' : 'Hours before appointment'}</Label>
          <Input
            className="h-8 font-mono"
            value={form.appointmentHours}
            onChange={(e) => set('appointmentHours', e.target.value)}
            placeholder="48,24,2"
          />
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded px-3 py-2">
          {de
            ? 'Tritt nur in Kraft, wenn der Server mit dieser Einstellung als APPOINTMENT_REMINDER_HOURS neu gestartet wird.'
            : 'Only takes effect when the server is restarted with this value as APPOINTMENT_REMINDER_HOURS.'}
        </p>
      </section>

      {/* Quotation Follow-Up */}
      <section className="rounded-lg border border-border p-5 flex flex-col gap-4">
        <h2 className="font-semibold">{de ? 'Offerten-Nachverfolgung' : 'Quotation Follow-Up'}</h2>
        <p className="text-xs text-muted-foreground">
          {de
            ? 'Tage nach dem Versand, an denen Follow-up-Erinnerungen erstellt werden. Entspricht QUOTATION_FOLLOWUP_INTERVALS.'
            : 'Days after sending at which follow-up reminders are created. Maps to QUOTATION_FOLLOWUP_INTERVALS.'}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Intervalle (Tage)' : 'Intervals (days)'}</Label>
          <Input
            className="h-8 font-mono"
            value={form.followupDays}
            onChange={(e) => set('followupDays', e.target.value)}
            placeholder="7,14,21"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Ablaufwarnung (Tage vorher)' : 'Expiry warning (days before)'}</Label>
          <Input
            type="number"
            className="h-8 w-24"
            min={1}
            max={30}
            value={form.expiryWarnDays}
            onChange={(e) => set('expiryWarnDays', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {de
              ? 'Entspricht QUOTATION_EXPIRY_WARN_DAYS.'
              : 'Maps to QUOTATION_EXPIRY_WARN_DAYS.'}
          </p>
        </div>
      </section>

      {/* WhatsApp */}
      <section className="rounded-lg border border-border p-5 flex flex-col gap-4">
        <h2 className="font-semibold">WhatsApp</h2>
        <div className="flex items-center gap-3">
          <Switch
            checked={form.whatsappEnabled}
            onCheckedChange={(v) => set('whatsappEnabled', v)}
          />
          <Label className="text-sm">
            {de ? 'WhatsApp-Benachrichtigungen aktivieren' : 'Enable WhatsApp notifications'}
          </Label>
        </div>
        {form.whatsappEnabled && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">API Key</Label>
            <Input
              className="h-8 font-mono"
              type="password"
              value={form.whatsappApiKey}
              onChange={(e) => set('whatsappApiKey', e.target.value)}
              placeholder="whatsapp_api_key_..."
            />
            <p className="text-xs text-muted-foreground">
              {de ? 'Entspricht WHATSAPP_API_KEY.' : 'Maps to WHATSAPP_API_KEY.'}
            </p>
          </div>
        )}
      </section>

      {/* Env var reference */}
      <section className="rounded-lg border border-dashed border-border p-4 flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {de ? 'Server-Umgebungsvariablen' : 'Server env vars'}
        </p>
        <pre className="text-xs font-mono bg-muted rounded p-3 whitespace-pre-wrap leading-5">
{`APPOINTMENT_REMINDER_HOURS=${form.appointmentHours}
QUOTATION_FOLLOWUP_INTERVALS=${form.followupDays}
QUOTATION_EXPIRY_WARN_DAYS=${form.expiryWarnDays}${form.whatsappEnabled ? `\nWHATSAPP_API_KEY=${form.whatsappApiKey || '<key>'}` : ''}`}
        </pre>
        <p className="text-xs text-muted-foreground">
          {de
            ? 'Kopieren Sie diese Werte in Ihre .env-Datei und starten Sie den Server neu.'
            : 'Copy these values into your .env file and restart the server.'}
        </p>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave}>
          {de ? 'Speichern' : 'Save'}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            {de ? 'Gespeichert — Umgebungsvariablen aktualisieren und Server neu starten.' : 'Saved — update env vars and restart server.'}
          </span>
        )}
      </div>
    </div>
  );
}
