'use client';

import { useState } from 'react';
import { FlaskConical, ListChecks, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { AgentDialog } from '@/modules/aiCalling/ui/calling-agent-primitives';
import { showError } from '@/lib/toast';
import { useAssignableAgents, useInboundDevices, useInboundSettings, useSettingsMutations } from '../hooks/use-inbound-calls';
import { enumLabel, errorMessage, reportedSimOptions, ruleToDraft, rulePayload, simLabel, simName, sortRules, type RuleDraft, type T } from '../inbound-domain';
import { RULE_ACTIONS, RULE_CALLER_TYPES, type InboundDevice, type InboundRule, type RuleTestResult } from '../types/inbound-call-types';
import { ConfirmAction, EmptyState, ErrorState, Field, Pill, Section, SkeletonBlocks, Toggle, cardClass, inputClass, primaryClass, secondaryClass } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const;

export function RulesTab() {
  const { t } = useInboundLanguage();
  const settings = useInboundSettings();
  const agents = useAssignableAgents();
  const devices = useInboundDevices();
  const m = useSettingsMutations(t);
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [deleting, setDeleting] = useState<InboundRule | null>(null);
  const fail = (e: unknown) => showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.')));

  if (settings.isLoading) return <SkeletonBlocks count={3} className="h-16" label={t('inbound.common.loading', 'Loading…')} />;
  if (settings.isError || !settings.data) return <div className={cardClass}><ErrorState t={t} onRetry={() => settings.refetch()} /></div>;
  const rules = sortRules(settings.data.rules);
  const simOptions = reportedSimOptions(devices.data);
  const simText = (slot: number) => simOptions.find((o) => o.slot === slot)?.label ?? simLabel(slot);
  const agentName = (id: string | null) => (id ? agents.agents.find((a) => a._id === String(id))?.name ?? t('inbound.rules.unknownAgent', 'Unknown agent') : t('inbound.rules.phoneAgent', 'Phone or default agent'));
  const nextPriority = rules.length ? Math.min(1000, (rules[rules.length - 1].priority ?? 100) + 10) : 100;

  const toggle = (rule: InboundRule) => m.saveRule.mutate(rulePayload({ ...ruleToDraft(rule), enabled: !rule.enabled }), { onError: fail });

  return (
    <div className="space-y-5">
      <Section id="inbound-rules" title={t('inbound.rules.title', 'Answering rules')} description={t('inbound.rules.hint', 'Rules decide who answers each call. The first enabled rule that matches wins (lowest priority number first). Blocked numbers and do-not-contact callers are never answered by the AI.')}
        actions={<button type="button" className={primaryClass} onClick={() => setEditing(ruleToDraft(null, nextPriority))}><Plus className="size-4" />{t('inbound.rules.add', 'Add rule')}</button>}>
        {!rules.length ? <EmptyState icon={ListChecks} title={t('inbound.rules.empty', 'No rules yet')} hint={t('inbound.rules.emptyHint', 'Without rules, the AI answers every call while AI answering is on, and a person answers otherwise.')} />
          : (
            <ol className="divide-y divide-border">
              {rules.map((rule, index) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold tabular-nums" title={t('inbound.rules.priority', 'Priority')}>{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{rule.name}<Pill tone={rule.action === 'ai_answer' ? 'live' : rule.action === 'ignore' ? 'neutral' : 'info'}>{enumLabel(t, 'ruleAction', rule.action)}</Pill>{!rule.enabled ? <Pill>{t('inbound.rules.disabled', 'Disabled')}</Pill> : null}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{describeConditions(rule, t, simText)}{rule.action === 'ai_answer' ? ` · ${agentName(rule.agentId)}` : ''} · {t('inbound.rules.priorityValue', 'priority {value}', { value: rule.priority })}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Toggle compact label={t('inbound.rules.enabledNamed', 'Enable {name}', { name: rule.name })} checked={rule.enabled} disabled={m.saveRule.isPending} onChange={() => toggle(rule)} />
                    <button type="button" aria-label={t('inbound.rules.edit', 'Edit {name}', { name: rule.name })} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => setEditing(ruleToDraft(rule))}><Pencil className="size-4" /></button>
                    <button type="button" aria-label={t('inbound.rules.delete', 'Delete {name}', { name: rule.name })} className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10" onClick={() => setDeleting(rule)}><Trash2 className="size-4" /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}
      </Section>
      <RuleTester t={t} devices={devices.data ?? []} agentName={agentName} test={m.testRules} />
      {editing ? <RuleDialog t={t} draft={editing} agents={agents.agents.map((a) => ({ id: a._id, name: a.name, availability: a.availability }))} devices={(devices.data ?? []).map((d) => ({ id: d.id, name: d.name }))} sims={simOptions} busy={m.saveRule.isPending}
        onClose={() => setEditing(null)} onSave={(d) => m.saveRule.mutate(rulePayload(d), { onSuccess: () => setEditing(null), onError: fail })} /> : null}
      {deleting ? <ConfirmAction danger title={t('inbound.rules.deleteTitle', 'Delete “{name}”?', { name: deleting.name })} description={t('inbound.rules.deleteHint', 'Calls this rule matched will follow the next matching rule or the default.')} confirmLabel={t('inbound.common.delete', 'Delete')} cancelLabel={t('inbound.common.cancel', 'Cancel')} busy={m.deleteRule.isPending}
        onClose={() => setDeleting(null)} onConfirm={() => m.deleteRule.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: fail })} /> : null}
    </div>
  );
}

function describeConditions(rule: InboundRule, t: T, simText: (slot: number) => string): string {
  const c = rule.conditions;
  const parts: string[] = [];
  if (c.callerType && c.callerType !== 'any') parts.push(enumLabel(t, 'ruleCallerType', c.callerType));
  if (c.numbers?.length) parts.push(t('inbound.rules.nNumbers', '{count} numbers', { count: c.numbers.length }));
  if (c.numberPrefixes?.length) parts.push(t('inbound.rules.prefixes', 'starts with {list}', { list: c.numberPrefixes.join(', ') }));
  if (c.deviceIds?.length) parts.push(t('inbound.rules.nDevices', '{count} phones', { count: c.deviceIds.length }));
  if (c.simSlots?.length) parts.push(c.simSlots.map(simText).join(', '));
  if (c.withinBusinessHours === true) parts.push(t('inbound.rules.inHours', 'during business hours'));
  if (c.withinBusinessHours === false) parts.push(t('inbound.rules.outHours', 'outside business hours'));
  if (c.leadStatuses?.length) parts.push(c.leadStatuses.join(', '));
  return parts.length ? parts.join(' · ') : t('inbound.rules.allCalls', 'All calls');
}

function RuleDialog({ t, draft, agents, devices, sims, busy, onSave, onClose }: {
  t: T; draft: RuleDraft; agents: Array<{ id: string; name: string; availability: string }>; devices: Array<{ id: string; name: string }>; sims: Array<{ slot: number; label: string }>; busy: boolean;
  onSave: (d: RuleDraft) => void; onClose: () => void;
}) {
  const [d, setD] = useState<RuleDraft>(draft);
  const set = (patch: Partial<RuleDraft>) => setD((v) => ({ ...v, ...patch }));
  const toggleIn = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  // Reported SIMs, plus any slot this rule already uses (so it can still be removed).
  const simChoices = [...sims, ...draft.simSlots.filter((s) => !sims.some((o) => o.slot === s)).map((slot) => ({ slot, label: simLabel(slot) }))];
  return (
    <AgentDialog wide title={d.id ? t('inbound.rules.editTitle', 'Edit rule') : t('inbound.rules.newTitle', 'New rule')} description={t('inbound.rules.dialogHint', 'Leave a condition empty to match every call for it.')} onClose={() => { if (!busy) onClose(); }}
      footer={<div className="flex justify-end gap-2"><button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>{t('inbound.common.cancel', 'Cancel')}</button><button type="submit" form="inbound-rule-form" className={primaryClass} disabled={busy || !d.name.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{t('inbound.common.save', 'Save')}</button></div>}>
      <form id="inbound-rule-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (d.name.trim()) onSave(d); }}>
        <Field label={t('inbound.rules.name', 'Name')}><input required maxLength={120} className={inputClass} value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t('inbound.rules.priority', 'Priority')} hint={t('inbound.rules.priorityHint', 'Lower numbers are checked first (0–1000).')}><input type="number" min={0} max={1000} className={inputClass} value={d.priority} onChange={(e) => set({ priority: Number(e.target.value) })} /></Field>
        <Field label={t('inbound.rules.action', 'Then')}>
          <select className={inputClass} value={d.action} onChange={(e) => set({ action: e.target.value as RuleDraft['action'] })}>{RULE_ACTIONS.map((a) => <option key={a} value={a}>{enumLabel(t, 'ruleAction', a)}</option>)}</select>
        </Field>
        {d.action === 'ai_answer' ? (
          <Field label={t('inbound.rules.agent', 'AI agent')}>
            <select className={inputClass} value={d.agentId} onChange={(e) => set({ agentId: e.target.value })}>
              <option value="">{t('inbound.rules.phoneAgent', 'Phone or default agent')}</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.availability !== 'active' ? ` (${a.availability})` : ''}</option>)}
            </select>
          </Field>
        ) : <div />}
        <Field label={t('inbound.rules.callerType', 'Caller')}>
          <select className={inputClass} value={d.callerType} onChange={(e) => set({ callerType: e.target.value as RuleDraft['callerType'] })}>{RULE_CALLER_TYPES.map((c) => <option key={c} value={c}>{enumLabel(t, 'ruleCallerType', c)}</option>)}</select>
        </Field>
        <Field label={t('inbound.rules.hours', 'Business hours')}>
          <select className={inputClass} value={d.hours} onChange={(e) => set({ hours: e.target.value as RuleDraft['hours'] })}>
            <option value="any">{t('inbound.rules.anyTime', 'Any time')}</option><option value="inside">{t('inbound.rules.inHours', 'during business hours')}</option><option value="outside">{t('inbound.rules.outHours', 'outside business hours')}</option>
          </select>
        </Field>
        <Field label={t('inbound.rules.numbers', 'Exact numbers')} hint={t('inbound.rules.numbersHint', 'One per line or comma separated; saved in international format.')}><textarea rows={3} className={inputClass} value={d.numbers} onChange={(e) => set({ numbers: e.target.value })} /></Field>
        <Field label={t('inbound.rules.prefixesLabel', 'Number prefixes')} hint={t('inbound.rules.prefixesHint', 'For example +41, +4179')}><input className={inputClass} value={d.prefixes} onChange={(e) => set({ prefixes: e.target.value })} /></Field>
        <fieldset className="space-y-1.5 text-xs"><legend className="mb-1 font-medium text-muted-foreground">{t('inbound.rules.devices', 'Phones')}</legend>
          {devices.length ? devices.map((dev) => <label key={dev.id} className="flex items-center gap-2"><input type="checkbox" checked={d.deviceIds.includes(dev.id)} onChange={() => set({ deviceIds: toggleIn(d.deviceIds, dev.id) })} />{dev.name}</label>) : <p className="text-muted-foreground">{t('inbound.rules.noDevices', 'No phones connected.')}</p>}
        </fieldset>
        <fieldset className="space-y-1.5 text-xs"><legend className="mb-1 font-medium text-muted-foreground">{t('inbound.rules.sims', 'SIMs')}</legend>
          {simChoices.length ? simChoices.map((o) => <label key={o.slot} className="flex items-center gap-2"><input type="checkbox" checked={d.simSlots.includes(o.slot)} onChange={() => set({ simSlots: toggleIn(d.simSlots, o.slot) })} />{o.label}</label>)
            : <p className="text-muted-foreground">{t('inbound.sims.noneReported', 'No phone has reported its SIM cards yet. Open the Updata app on the phone to detect them.')}</p>}
        </fieldset>
        <fieldset className="space-y-1.5 text-xs sm:col-span-2"><legend className="mb-1 font-medium text-muted-foreground">{t('inbound.rules.leadStatuses', 'Existing lead status')}</legend>
          <div className="flex flex-wrap gap-3">{LEAD_STATUSES.map((s) => <label key={s} className="flex items-center gap-2"><input type="checkbox" checked={d.leadStatuses.includes(s)} onChange={() => set({ leadStatuses: toggleIn(d.leadStatuses, s) })} />{t(`inbound.leadStatus.${s}`, s)}</label>)}</div>
        </fieldset>
        <div className="sm:col-span-2"><Toggle label={t('inbound.rules.enabled', 'Enabled')} checked={d.enabled} onChange={(v) => set({ enabled: v })} /></div>
      </form>
    </AgentDialog>
  );
}

function RuleTester({ t, devices, agentName, test }: {
  t: T; devices: InboundDevice[]; agentName: (id: string | null) => string; test: ReturnType<typeof useSettingsMutations>['testRules'];
}) {
  const [number, setNumber] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sim, setSim] = useState('');
  const [at, setAt] = useState('');
  const [result, setResult] = useState<RuleTestResult | null>(null);
  const chosen = devices.find((d) => d.id === deviceId);
  const testerSims = chosen ? (chosen.sims ?? []).map((s) => ({ slot: s.slot, label: simName(s) })) : reportedSimOptions(devices);
  const run = () => {
    const when = at ? new Date(at) : null;
    test.mutate({ number: number.trim(), deviceId: deviceId || null, simSlot: sim === '' ? null : Number(sim), at: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null }, {
      onSuccess: setResult, onError: (e) => showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))),
    });
  };
  const dcs = result?.decision;
  return (
    <Section id="inbound-rule-tester" title={t('inbound.tester.title', 'Rule tester')} description={t('inbound.tester.hint', 'See what would happen if this number called now. Nothing is saved and no call is made.')}>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.7fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <Field label={t('inbound.tester.number', 'Caller number')}><input className={inputClass} placeholder="+41 79 123 45 67" value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label={t('inbound.filter.device', 'Phone')}><select className={inputClass} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">{t('inbound.tester.anyDevice', 'Any phone')}</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        {testerSims.length ? <Field label={t('inbound.col.sim', 'SIM')}><select className={inputClass} value={sim} onChange={(e) => setSim(e.target.value)}><option value="">—</option>{testerSims.map((o) => <option key={o.slot} value={String(o.slot)}>{o.label}</option>)}</select></Field> : <div />}
        <Field label={t('inbound.tester.at', 'At (optional)')}><input type="datetime-local" className={inputClass} value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <div className="flex items-end"><button type="submit" className={`${primaryClass} w-full`} disabled={test.isPending}>{test.isPending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}{t('inbound.tester.run', 'Test')}</button></div>
      </form>
      {result && dcs ? (
        <div role="status" className="mt-4 space-y-2 rounded-xl border border-sky-400/25 bg-sky-400/5 p-4 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium">{t('inbound.tester.result', 'Decision:')}<Pill tone={dcs.action === 'ai_answer' ? 'live' : dcs.action === 'ignore' ? 'neutral' : 'info'}>{enumLabel(t, 'ruleAction', dcs.action)}</Pill>{dcs.action === 'ai_answer' ? <span className="text-xs text-muted-foreground">{agentName(dcs.agentId)}</span> : null}</p>
          <p className="text-xs">{t('inbound.tester.because', 'Why')}: <strong>{enumLabel(t, 'reason', dcs.reason)}</strong>{dcs.ruleName ? ` — ${dcs.ruleName}` : ''}</p>
          {dcs.aiBlockedBy ? <p className="text-xs text-amber-700 dark:text-amber-300">{t('inbound.tester.blocked', 'The AI could not take it: {reason}', { reason: enumLabel(t, 'reason', dcs.aiBlockedBy) })}</p> : null}
          <p className="text-xs text-muted-foreground">{[
            result.caller.e164 || t('inbound.caller.withheld', 'Withheld number'),
            enumLabel(t, 'ruleCallerType', dcs.callerType),
            dcs.inBusinessHours ? t('inbound.rules.inHours', 'during business hours') : t('inbound.rules.outHours', 'outside business hours'),
            dcs.action === 'ai_answer' ? t('inbound.tester.after', 'answers after {seconds}s', { seconds: Math.round(dcs.answerAfterMs / 1000) }) : null,
          ].filter(Boolean).join(' · ')}</p>
        </div>
      ) : null}
    </Section>
  );
}
