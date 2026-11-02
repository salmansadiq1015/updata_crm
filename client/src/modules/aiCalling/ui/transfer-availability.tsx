'use client';

import { useEffect, useState } from 'react';
import { Headset, Loader2 } from 'lucide-react';
import { useIntelT } from '../hooks/use-intel-t';
import { useSetTransferPresence, useTransferPresence } from '../hooks/use-calling-intelligence';
import { AgentField, inputClass, panelClass, primaryClass, readableError } from './calling-agent-primitives';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

/** The signed-in person's own "available for AI call transfers" switch, phone and working hours. */
export function TransferAvailability() {
  const t = useIntelT();
  const presence = useTransferPresence();
  const save = useSetTransferPresence();
  const p = presence.data;
  const [phone, setPhone] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!p || loaded) return;
    // One-time form initialisation from the server copy.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhone(p.phone || ''); setStart(p.workingHours?.start || ''); setEnd(p.workingHours?.end || ''); setDays(p.workingHours?.days || []); setLoaded(true);
  }, [p, loaded]);
  const submit = async (patch: Parameters<typeof save.mutateAsync>[0]) => {
    setError(null);
    try { await save.mutateAsync(patch); } catch (e) { setError(readableError(e)); }
  };
  const status = !p ? '' : !p.available ? t('callingIntel.presence.off', 'You will not receive transfers.')
    : !p.online ? t('callingIntel.presence.offline', 'Available, but this CRM tab must stay open to receive transfers.')
      : !p.withinHours ? t('callingIntel.presence.outsideHours', 'Available, but outside your working hours.')
        : t('callingIntel.presence.ready', 'Ready: AI agents can transfer calls to you now.');
  return <section className={`${panelClass} space-y-4`} aria-label={t('callingIntel.presence.title', 'Take calls from AI agents')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><Headset className="h-4 w-4 text-primary" />{t('callingIntel.presence.title', 'Take calls from AI agents')}</h2><p className="mt-1 max-w-xl text-xs text-muted-foreground">{t('callingIntel.presence.subtitle', 'When an agent you are a transfer target for needs a person, you get an incoming-transfer prompt with the conversation so far.')}</p><p role="status" className={`mt-2 text-xs ${p?.available && p.online && p.withinHours ? 'text-primary' : 'text-muted-foreground'}`}>{status}</p></div>
      <button type="button" role="switch" aria-checked={Boolean(p?.available)} disabled={!p || save.isPending} onClick={() => void submit({ available: !p?.available })} className={`relative h-7 w-12 shrink-0 rounded-full transition ${p?.available ? 'bg-gradient-to-r from-blue-600 to-cyan-500' : 'bg-white/15'} disabled:opacity-50`} aria-label={t('callingIntel.presence.toggle', 'Available for transfers')}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${p?.available ? 'left-6' : 'left-1'}`} /></button>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <AgentField label={t('callingIntel.presence.phone', 'Phone for SIP transfers (optional)')} hint={t('callingIntel.presence.phoneHint', 'E.164, e.g. +923001234567. Without it you join from the CRM.')}><input className={inputClass} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+92…" /></AgentField>
      <AgentField label={t('callingIntel.presence.from', 'Working from')}><input type="time" className={inputClass} value={start} onChange={e => setStart(e.target.value)} /></AgentField>
      <AgentField label={t('callingIntel.presence.until', 'Until')}><input type="time" className={inputClass} value={end} onChange={e => setEnd(e.target.value)} /></AgentField>
    </div>
    <fieldset><legend className="text-xs font-medium text-muted-foreground">{t('callingIntel.presence.days', 'Working days (none = every day)')}</legend><div className="mt-2 flex flex-wrap gap-1.5">{DAYS.map(d => <label key={d} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs ${days.includes(d) ? 'border-sky-400/50 bg-sky-400/10 text-primary' : 'border-border text-muted-foreground'}`}><input type="checkbox" className="sr-only" checked={days.includes(d)} onChange={() => setDays(x => (x.includes(d) ? x.filter(y => y !== d) : [...x, d]))} />{t(`callingIntel.day.${d}`, d)}</label>)}</div></fieldset>
    <div className="flex flex-wrap items-center gap-3"><button className={primaryClass} disabled={save.isPending} onClick={() => void submit({ phone: phone.trim() || null, workingHours: { timezone: browserZone(), days, start: start || null, end: end || null } })}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t('callingIntel.presence.save', 'Save hours and phone')}</button><span className="text-[11px] text-muted-foreground">{t('callingIntel.presence.zone', 'Time zone: {zone}', { zone: browserZone() })}</span></div>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
  </section>;
}
