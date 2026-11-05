'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Loader2, RotateCcw, Save } from 'lucide-react';
import { useAssignableAgents, useInboundDevices, useInboundSettings, useSettingsMutations } from '../hooks/use-inbound-calls';
import { deviceAgentFor, enumLabel, errorMessage, isConflict, parseList, settingsPatch, simLabel, simName, upsertDeviceAgent, type T } from '../inbound-domain';
import {
  CALLER_FIELD_KEYS, LEAD_CREATION_POLICIES, QUALIFICATION_RESULTS, RULE_ACTIONS,
  type InboundDevice, type InboundSettings, type QualificationResult,
} from '../types/inbound-call-types';
import { ErrorState, Field, Section, SkeletonBlocks, Toggle, cardClass, inputClass, primaryClass, secondaryClass } from './inbound-primitives';
import { NoPhoneEmpty } from './live-monitor-tab';
import { useInboundLanguage } from './use-inbound-language';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const TIMEZONES: string[] = (() => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { return []; } })();

export function SettingsTab() {
  const { t } = useInboundLanguage();
  const settings = useInboundSettings();
  if (settings.isLoading) return <SkeletonBlocks count={4} className="h-40" label={t('inbound.common.loading', 'Loading…')} />;
  if (settings.isError || !settings.data) return <div className={cardClass}><ErrorState t={t} onRetry={() => settings.refetch()} /></div>;
  return <SettingsForm key={settings.data.version} base={settings.data} t={t} />;
}

function SettingsForm({ base, t }: { base: InboundSettings; t: T }) {
  const [draft, setDraft] = useState<InboundSettings>(base);
  const [blockedText, setBlockedText] = useState(() => base.blockedNumbers.join('\n'));
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agents = useAssignableAgents();
  const devices = useInboundDevices();
  const m = useSettingsMutations(t);
  const patch = useMemo(() => settingsPatch(base, draft), [base, draft]);
  const set = (p: Partial<InboundSettings>) => setDraft((d) => ({ ...d, ...p }));
  const timezones = TIMEZONES;

  const save = () => {
    if (!patch) return;
    setError(null);
    m.update.mutate(patch, {
      onError: (e) => { if (isConflict(e)) setConflict(true); else setError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))); },
    });
  };
  const agentOptions = agents.agents.map((a) => <option key={a._id} value={a._id}>{a.name}{a.availability !== 'active' ? ` (${t(`inbound.agentAvailability.${a.availability}`, a.availability)})` : ''}</option>);
  const toggleIn = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const defaultAgent = agents.agents.find((a) => a._id === draft.defaultAgentId);

  return (
    <div className="space-y-5 pb-20">
      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4" /><span className="flex-1">{t('inbound.settings.conflict', 'These settings were changed elsewhere. Reload to get the latest version, then make your change again.')}</span>
          <button type="button" className={secondaryClass} onClick={() => void m.reload()}><RotateCcw className="size-4" />{t('inbound.settings.reload', 'Reload settings')}</button>
        </div>
      ) : null}

      <Section id="is-ai" title={t('inbound.settings.aiTitle', 'AI answering')}>
        <Toggle label={t('inbound.settings.enabled', 'AI answers incoming calls')} description={t('inbound.settings.enabledHint', 'When off, nobody but you answers: calls ring on the phone as usual and are still logged here.')} checked={draft.enabled} onChange={(v) => set({ enabled: v })} />
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={t('inbound.settings.defaultAgent', 'Default agent')} hint={t('inbound.settings.defaultAgentHint', 'Used when no phone, SIM or rule picks another agent.')}>
            <select className={inputClass} value={draft.defaultAgentId ?? ''} onChange={(e) => set({ defaultAgentId: e.target.value || null })}><option value="">{t('inbound.settings.noAgent', 'No agent')}</option>{agentOptions}</select>
          </Field>
          <Field label={t('inbound.settings.organization', 'Business name the AI uses')}><input maxLength={200} className={inputClass} value={draft.organizationName} onChange={(e) => set({ organizationName: e.target.value })} /></Field>
        </div>
        <Toggle label={t('inbound.settings.disclosure', 'Tell callers they are speaking with an AI')} checked={draft.aiDisclosure} onChange={(v) => set({ aiDisclosure: v })} />
      </Section>

      <Section id="is-receptionist" title={t('inbound.settings.receptionistTitle', 'Receptionist behaviour')} description={t('inbound.settings.receptionistHint', 'The greeting, instructions and escalation rules live on each calling agent (Settings → Incoming calls), so every phone or SIM can have its own receptionist.')}
        actions={<Link className={secondaryClass} href={defaultAgent ? `/incoming-calls?agent=${defaultAgent._id}` : '/incoming-calls?tab=agents'}>{defaultAgent ? t('inbound.settings.editAgent', 'Edit {name}', { name: defaultAgent.name }) : t('inbound.settings.openAgents', 'Open incoming agents')}<ArrowRight className="size-3.5 rtl:rotate-180" /></Link>}>
        <p className="text-xs text-muted-foreground">{t('inbound.settings.receptionistNote', 'The AI never invents prices or commitments and respects a caller who does not want to share details.')}</p>
      </Section>

      <Section id="is-devices" title={t('inbound.settings.devicesTitle', 'Agents per phone and SIM')} description={t('inbound.settings.devicesHint', 'A SIM-specific choice wins over the phone-wide one; empty uses the default agent.')}>
        {devices.isLoading ? <SkeletonBlocks count={2} className="h-10" label={t('inbound.common.loading', 'Loading…')} />
          : !devices.data?.length ? <NoPhoneEmpty t={t} />
            : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead><tr className="border-b border-border text-start text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-2 text-start">{t('inbound.filter.device', 'Phone')}</th><th className="py-2 text-start">{t('inbound.col.sim', 'SIM')}</th><th className="py-2 text-start">{t('inbound.col.agent', 'Agent')}</th><th className="py-2 text-start">{t('inbound.settings.aiOnLine', 'AI answers')}</th></tr></thead>
                  <tbody>
                    {devices.data.flatMap((dev: InboundDevice) => deviceSimRows(dev, draft.deviceAgents).map(({ slot, name }) => {
                      const row = deviceAgentFor(draft.deviceAgents, dev.id, slot);
                      const simText = slot === null ? t('inbound.settings.allSims', 'All SIMs') : name;
                      return (
                        <tr key={`${dev.id}-${slot}`} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pe-3 align-top font-medium">{slot === null ? dev.name : ''}</td>
                          <td className="py-2 pe-3 align-top text-muted-foreground">{simText}{slot === null && !dev.sims?.length ? <span className="mt-0.5 block text-[11px] font-normal">{t('inbound.sims.unknownHint', 'Open the Updata app on this phone to detect its SIM cards.')}</span> : null}</td>
                          <td className="py-2 pe-3"><select aria-label={`${dev.name} · ${simText}`} className={`${inputClass} min-h-0 py-1.5 text-xs`} value={row.agentId ?? ''} onChange={(e) => set({ deviceAgents: upsertDeviceAgent(draft.deviceAgents, { ...row, agentId: e.target.value || null }) })}><option value="">{slot === null ? t('inbound.settings.useDefault', 'Default agent') : t('inbound.settings.usePhone', 'Same as phone')}</option>{agentOptions}</select></td>
                          <td className="py-2"><Toggle compact label={t('inbound.settings.aiOnFor', 'AI answers on {target}', { target: `${dev.name} ${slot === null ? '' : name}`.trim() })} checked={row.aiEnabled} onChange={(v) => set({ deviceAgents: upsertDeviceAgent(draft.deviceAgents, { ...row, aiEnabled: v }) })} /></td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            )}
      </Section>

      <Section id="is-handling" title={t('inbound.settings.handlingTitle', 'Call handling')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('inbound.settings.answerDelay', 'Answer after (seconds)')} hint={t('inbound.settings.answerDelayHint', 'Gives you time to pick up yourself first (0–30).')}><input type="number" min={0} max={30} className={inputClass} value={draft.answerDelaySeconds} onChange={(e) => set({ answerDelaySeconds: Number(e.target.value) })} /></Field>
          <Field label={t('inbound.settings.ringTimeout', 'Ring timeout (seconds)')} hint="15–120"><input type="number" min={15} max={120} className={inputClass} value={draft.ringTimeoutSeconds} onChange={(e) => set({ ringTimeoutSeconds: Number(e.target.value) })} /></Field>
          <Field label={t('inbound.settings.maxSessions', 'Simultaneous AI calls')} hint="1–10"><input type="number" min={1} max={10} className={inputClass} value={draft.maxConcurrentAiSessions} onChange={(e) => set({ maxConcurrentAiSessions: Number(e.target.value) })} /></Field>
          <Field label={t('inbound.settings.fallback', 'When the AI cannot answer')}><select className={inputClass} value={draft.fallbackAction} onChange={(e) => set({ fallbackAction: e.target.value as InboundSettings['fallbackAction'] })}><option value="human">{enumLabel(t, 'ruleAction', 'human')}</option><option value="ignore">{enumLabel(t, 'ruleAction', 'ignore')}</option></select></Field>
          <Field label={t('inbound.settings.handoffWait', 'Wait for a person (seconds)')} hint={t('inbound.settings.handoffWaitHint', 'How long the AI holds when a caller asks for a person (10–120).')}><input type="number" min={10} max={120} className={inputClass} value={draft.handoffWaitSeconds} onChange={(e) => set({ handoffWaitSeconds: Number(e.target.value) })} /></Field>
          <Field label={t('inbound.settings.region', 'Default country code')} hint={t('inbound.settings.regionHint', 'Two letters, used to read local numbers (e.g. CH).')}><input maxLength={2} className={`${inputClass} uppercase`} value={draft.defaultRegion} onChange={(e) => set({ defaultRegion: e.target.value.toUpperCase().slice(0, 2) })} /></Field>
        </div>
      </Section>

      <Section id="is-hours" title={t('inbound.settings.hoursTitle', 'Business hours')}>
        <Toggle label={t('inbound.settings.hoursEnabled', 'Use business hours')} checked={draft.businessHours.enabled} onChange={(v) => set({ businessHours: { ...draft.businessHours, enabled: v } })} />
        <fieldset disabled={!draft.businessHours.enabled} className="mt-2 grid gap-4 disabled:opacity-50 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('inbound.settings.timezone', 'Time zone')}><input list="inbound-timezones" className={inputClass} value={draft.businessHours.timezone} onChange={(e) => set({ businessHours: { ...draft.businessHours, timezone: e.target.value } })} /><datalist id="inbound-timezones">{timezones.map((z) => <option key={z} value={z} />)}</datalist></Field>
          <Field label={t('inbound.settings.start', 'Opens')}><input type="time" className={inputClass} value={draft.businessHours.start} onChange={(e) => set({ businessHours: { ...draft.businessHours, start: e.target.value } })} /></Field>
          <Field label={t('inbound.settings.end', 'Closes')}><input type="time" className={inputClass} value={draft.businessHours.end} onChange={(e) => set({ businessHours: { ...draft.businessHours, end: e.target.value } })} /></Field>
          <Field label={t('inbound.settings.outsideAction', 'Outside business hours')}><select className={inputClass} value={draft.outsideHoursAction} onChange={(e) => set({ outsideHoursAction: e.target.value as InboundSettings['outsideHoursAction'] })}>{RULE_ACTIONS.map((a) => <option key={a} value={a}>{enumLabel(t, 'ruleAction', a)}</option>)}</select></Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4" role="group" aria-label={t('inbound.settings.days', 'Open days')}>
            {DAYS.map((d) => <button key={d} type="button" aria-pressed={draft.businessHours.days.includes(d)} onClick={() => set({ businessHours: { ...draft.businessHours, days: toggleIn(draft.businessHours.days, d).sort() } })} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${draft.businessHours.days.includes(d) ? 'border-sky-400/50 bg-sky-400/10 text-sky-700 dark:text-sky-300' : 'border-border text-muted-foreground'}`}>{t(`inbound.day.${d}`, String(d))}</button>)}
          </div>
        </fieldset>
      </Section>

      <Section id="is-blocked" title={t('inbound.settings.blockedTitle', 'Blocked numbers')} description={t('inbound.settings.blockedHint', 'The AI never answers these numbers.')}>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label={t('inbound.settings.blockedList', 'Numbers (one per line)')}><textarea rows={4} className={inputClass} value={blockedText} onChange={(e) => { setBlockedText(e.target.value); set({ blockedNumbers: parseList(e.target.value).slice(0, 500) }); }} /></Field>
          <Field label={t('inbound.settings.blockedAction', 'For blocked numbers')}><select className={inputClass} value={draft.blockedAction} onChange={(e) => set({ blockedAction: e.target.value as InboundSettings['blockedAction'] })}><option value="human">{enumLabel(t, 'ruleAction', 'human')}</option><option value="ignore">{enumLabel(t, 'ruleAction', 'ignore')}</option></select></Field>
        </div>
      </Section>

      <Section id="is-leads" title={t('inbound.settings.leadsTitle', 'Leads and qualification')}>
        <Field label={t('inbound.settings.leadCreation', 'Create a lead for a new caller')} className="max-w-md">
          <select className={inputClass} value={draft.leadCreation} onChange={(e) => set({ leadCreation: e.target.value as InboundSettings['leadCreation'] })}>{LEAD_CREATION_POLICIES.map((p) => <option key={p} value={p}>{enumLabel(t, 'leadCreation', p)}</option>)}</select>
        </Field>
        <fieldset className="mt-4"><legend className="text-xs font-medium text-muted-foreground">{t('inbound.settings.required', 'Required for “qualified” (all of these)')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">{CALLER_FIELD_KEYS.map((k) => <Chip key={k} on={draft.qualification.required.includes(k)} label={enumLabel(t, 'field', k)} onClick={() => { const next = toggleIn(draft.qualification.required, k); if (next.length) set({ qualification: { ...draft.qualification, required: next.slice(0, 10) } }); }} />)}</div>
        </fieldset>
        <fieldset className="mt-4"><legend className="text-xs font-medium text-muted-foreground">{t('inbound.settings.anyOf', 'Plus at least one of these')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">{CALLER_FIELD_KEYS.map((k) => <Chip key={k} on={draft.qualification.anyOf.includes(k)} label={enumLabel(t, 'field', k)} onClick={() => set({ qualification: { ...draft.qualification, anyOf: toggleIn(draft.qualification.anyOf, k).slice(0, 10) } })} />)}</div>
        </fieldset>
        <Toggle label={t('inbound.settings.promote', 'Mark the lead as qualified when the call qualifies')} checked={draft.qualification.promoteLeadStatus} onChange={(v) => set({ qualification: { ...draft.qualification, promoteLeadStatus: v } })} />
      </Section>

      <Section id="is-automation" title={t('inbound.settings.automationTitle', 'After the call')}>
        <Toggle label={t('inbound.settings.createFollowUps', 'Create follow-up tasks automatically')} checked={draft.automation.createFollowUps} onChange={(v) => set({ automation: { ...draft.automation, createFollowUps: v } })} />
        <fieldset disabled={!draft.automation.createFollowUps} className="mb-2 disabled:opacity-50"><legend className="text-xs text-muted-foreground">{t('inbound.settings.followUpFor', 'For these results')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">{QUALIFICATION_RESULTS.map((q) => <Chip key={q} on={draft.automation.followUpFor.includes(q)} label={enumLabel(t, 'qualification', q)} onClick={() => set({ automation: { ...draft.automation, followUpFor: toggleIn<QualificationResult>(draft.automation.followUpFor, q) } })} />)}</div>
        </fieldset>
        <Toggle label={t('inbound.settings.returnMissed', 'Create a task to return missed calls')} checked={draft.automation.returnMissedCalls} onChange={(v) => set({ automation: { ...draft.automation, returnMissedCalls: v } })} />
        <Toggle label={t('inbound.settings.notifyMissed', 'Notify me about missed calls')} checked={draft.automation.notifyMissed} onChange={(v) => set({ automation: { ...draft.automation, notifyMissed: v } })} />
        <Toggle label={t('inbound.settings.notifyHandoff', 'Notify me when a caller asks for a person')} checked={draft.automation.notifyHandoff} onChange={(v) => set({ automation: { ...draft.automation, notifyHandoff: v } })} />
        <Toggle label={t('inbound.settings.notifyQualified', 'Notify me about qualified callers')} checked={draft.automation.notifyQualified} onChange={(v) => set({ automation: { ...draft.automation, notifyQualified: v } })} />
        <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{t('inbound.settings.messagesNote', 'Messages are never sent to callers automatically unless you switch this on. Follow-up tasks above are internal only.')}</p>
          <Toggle label={t('inbound.settings.autoSms', 'Send SMS automatically')} checked={draft.automation.autoSendSms} onChange={(v) => set({ automation: { ...draft.automation, autoSendSms: v } })} />
          <Toggle label={t('inbound.settings.autoEmail', 'Send e-mail automatically')} checked={draft.automation.autoSendEmail} onChange={(v) => set({ automation: { ...draft.automation, autoSendEmail: v } })} />
        </div>
        <Field label={t('inbound.settings.retention', 'Keep transcripts for (days)')} className="mt-3 max-w-xs"><input type="number" min={1} max={3650} className={inputClass} value={draft.transcriptRetentionDays} onChange={(e) => set({ transcriptRetentionDays: Number(e.target.value) })} /></Field>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {error ? <p role="alert" className="me-auto text-xs text-rose-600 dark:text-rose-400">{error}</p> : patch ? <p className="me-auto text-xs text-muted-foreground">{t('inbound.settings.unsaved', 'You have unsaved changes.')}</p> : null}
        <button type="button" className={secondaryClass} disabled={!patch || m.update.isPending} onClick={() => { setDraft(base); setBlockedText(base.blockedNumbers.join('\n')); setError(null); }}>{t('inbound.settings.discard', 'Discard')}</button>
        <button type="button" className={primaryClass} disabled={!patch || m.update.isPending || conflict} onClick={save}>{m.update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{t('inbound.settings.save', 'Save settings')}</button>
      </div>
    </div>
  );
}

/** "All SIMs" + every SIM the phone reported (+ any SIM a saved row still names). Unknown SIMs → "All SIMs" only. */
function deviceSimRows(dev: InboundDevice, rows: InboundSettings['deviceAgents']): Array<{ slot: number | null; name: string }> {
  const reported = (dev.sims ?? []).map((s) => ({ slot: s.slot as number | null, name: simName(s) }));
  const saved = rows.filter((r) => String(r.deviceId) === dev.id && r.simSlot != null && !reported.some((x) => x.slot === r.simSlot)).map((r) => ({ slot: r.simSlot, name: simLabel(r.simSlot) }));
  return [{ slot: null, name: '' }, ...reported, ...saved];
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-sky-400/50 bg-sky-400/10 text-sky-700 dark:text-sky-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>{label}</button>;
}
