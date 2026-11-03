'use client';
import type { AgentConfig, CallingAgentInput, Schedule } from '../types/ai-calling-types';
import { usePairedDevices } from '../hooks/use-paired-phone';
import { useIntelT } from '../hooks/use-intel-t';
import { useAgentLanguages } from '../hooks/use-ai-calling';
import { ConversationPolicyFields } from './conversation-policy-fields';
import { LanguageSelect } from './language-select';
import { AgentField, inputClass, panelClass } from './calling-agent-primitives';

export const defaultAgentInput = (): CallingAgentInput => ({
  name: '', title: '', description: '', availability: 'draft', avatarFileId: null,
  agentConfig: { agentName: '', organizationName: '', objective: '', disclosure: 'Hi, this is an AI assistant calling on behalf of {company}. Do you have a moment to answer a few questions?', voice: 'alloy', speakingStyle: 'professional', maxCallSeconds: 300, silenceTimeoutSeconds: 10, maxClarificationsPerQuestion: 3, allowBargeIn: true, recordCall: false, shareLeadNotes: false },
  questionnaire: { questions: [] }, statusRules: [], transport: 'cloud_sip', pairedDeviceId: null,
  schedule: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', callWindow: { start: '09:00', end: '18:00' }, daysOfWeek: [1, 2, 3, 4, 5], maxAttemptsPerLead: 2, minMinutesBetweenAttempts: 60, retryDelayMinutes: 120, maxConcurrency: 1, maxCallsPerDay: 200, maxCampaignSpend: 0 },
});

export function AgentVoiceFields({ value, onChange }: { value: Partial<AgentConfig>; onChange: (next: Partial<AgentConfig>) => void }) {
  const patch = (change: Partial<AgentConfig>) => onChange({ ...value, ...change });
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><AgentField label="Company name (disclosed)"><input className={inputClass} value={value.organizationName || ''} maxLength={200} onChange={e => patch({ organizationName: e.target.value })} /></AgentField><AgentLanguageField value={value.language} onChange={language => patch({ language })} /></div>
    <div className="grid gap-4 sm:grid-cols-2"><AgentField label="Voice"><select className={inputClass} value={value.voice || 'alloy'} onChange={e => patch({ voice: e.target.value })}>{['alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'].map(v => <option key={v} value={v}>{v}</option>)}</select></AgentField><AgentField label="Speaking style"><select className={inputClass} value={value.speakingStyle || 'professional'} onChange={e => patch({ speakingStyle: e.target.value as AgentConfig['speakingStyle'] })}>{['professional', 'friendly', 'concise', 'formal', 'custom'].map(v => <option key={v} value={v}>{v}</option>)}</select></AgentField></div>
    {value.speakingStyle === 'custom' && <AgentField label="Custom speaking instructions"><textarea className={inputClass} maxLength={500} rows={3} value={value.customStyle || ''} onChange={e => patch({ customStyle: e.target.value })} /></AgentField>}
    <AgentField label="Call objective and instructions"><textarea className={inputClass} rows={3} maxLength={1000} value={value.objective || ''} onChange={e => patch({ objective: e.target.value })} /></AgentField>
    <AgentField label="AI disclosure" hint="Spoken before collecting answers. {company} is replaced with the company name."><textarea className={inputClass} rows={3} maxLength={2000} value={value.disclosure || ''} onChange={e => patch({ disclosure: e.target.value })} /></AgentField>
    <AgentField label="Max call duration (seconds)"><input type="number" className={inputClass} min={30} max={1800} value={value.maxCallSeconds ?? 300} onChange={e => patch({ maxCallSeconds: Number(e.target.value) })} /></AgentField>
    <ConversationPolicyFields value={value} onChange={onChange} />
    <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">{([
      ['allowBargeIn', 'Allow interruptions'], ['recordCall', 'Call recording · unavailable on this connection'], ['shareLeadNotes', 'Include CRM notes in call context'],
    ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(value[key])} disabled={key === 'recordCall' && !value.recordCall} onChange={e => patch({ [key]: e.target.checked })} />{label}</label>)}</div>
  </div>;
}

export function AgentLanguageField({ value, onChange }: { value?: string; onChange: (language: string) => void }) {
  const t = useIntelT();
  const languages = useAgentLanguages();
  return <AgentField label={t('voicePolicy.defaultLanguage', 'Default conversation language')} hint={t('voicePolicy.languageHint', 'The agent opens in this language. Switching follows the saved policy for each call.')} >
    <LanguageSelect className={inputClass} value={value || languages.data?.defaultLanguage || 'auto'} onChange={onChange} />
  </AgentField>;
}

export function CallingWindowFields({ value, onChange }: { value: Schedule; onChange: (next: Schedule) => void }) {
  return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3">
    <AgentField label="Calling window start"><input type="time" className={inputClass} value={value.callWindow?.start || '09:00'} onChange={e => onChange({ ...value, callWindow: { start: e.target.value, end: value.callWindow?.end || '18:00' } })} required /></AgentField>
    <AgentField label="Calling window end"><input type="time" className={inputClass} value={value.callWindow?.end || '18:00'} onChange={e => onChange({ ...value, callWindow: { start: value.callWindow?.start || '09:00', end: e.target.value } })} required /></AgentField>
    <AgentField label="Timezone (IANA)"><input className={inputClass} value={value.timezone || 'UTC'} onChange={e => onChange({ ...value, timezone: e.target.value })} placeholder="Asia/Karachi" required /></AgentField></div>
    <fieldset><legend className="mb-2 text-xs font-medium text-muted-foreground">Permitted calling days</legend><div className="flex flex-wrap gap-2">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, n) => <label key={day} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs has-focus-visible:ring-2 has-focus-visible:ring-sky-400 ${value.daysOfWeek?.includes(n) ? 'border-sky-400/50 bg-blue-500/15 text-primary' : 'border-border text-muted-foreground'}`}><input type="checkbox" className="sr-only" checked={value.daysOfWeek?.includes(n) || false} onChange={e => onChange({ ...value, daysOfWeek: e.target.checked ? [...(value.daysOfWeek || []), n].sort() : value.daysOfWeek?.filter(d => d !== n) })} />{day}</label>)}</div></fieldset>
  </div>;
}

export function AgentExecutionFields({ value, onChange }: { value: CallingAgentInput; onChange: (next: CallingAgentInput) => void }) {
  const devices = usePairedDevices();
  const schedule = value.schedule || {};
  return <div className="space-y-5">
    <div className={panelClass}><h3 className="mb-4 text-sm font-semibold">Calling connection</h3><div className="grid gap-4 sm:grid-cols-2"><AgentField label="Calls from"><select className={inputClass} value={value.transport || 'cloud_sip'} onChange={e => onChange({ ...value, transport: e.target.value as CallingAgentInput['transport'], pairedDeviceId: null })}><option value="cloud_sip">Cloud phone line · LiveKit SIP</option><option value="paired_phone">My paired phone · SIM</option></select></AgentField>{value.transport === 'paired_phone' && <AgentField label="Paired phone"><select className={inputClass} value={value.pairedDeviceId || ''} onChange={e => onChange({ ...value, pairedDeviceId: e.target.value || null })}><option value="">Choose a paired phone</option>{devices.data?.filter(d => !d.revoked && !d.archived).map(d => <option value={d.id} key={d.id}>{d.name} · {d.readiness.ok ? 'ready' : 'not ready'}</option>)}</select></AgentField>}</div><p className="mt-3 text-xs text-muted-foreground">Manage phones, verify call sound, and inspect provider readiness in Connections.</p></div>
    <div className={panelClass}><h3 className="mb-4 text-sm font-semibold">Default calling hours</h3><CallingWindowFields value={schedule} onChange={next => onChange({ ...value, schedule: next })} /></div>
    <div className={panelClass}><h3 className="mb-4 text-sm font-semibold">Queue, retries and limits</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{([
      ['maxConcurrency', 'Concurrent calls', 1, 25, 1], ['maxAttemptsPerLead', 'Maximum attempts per lead', 1, 10, 2], ['minMinutesBetweenAttempts', 'Minimum minutes between attempts', 0, 10080, 60], ['retryDelayMinutes', 'Retry delay (minutes)', 1, 10080, 120], ['maxCallsPerDay', 'Maximum calls per day', 1, 100000, 200], ['maxCampaignSpend', 'Campaign spend cap (0 = none)', 0, 100000, 0],
    ] as const).map(([key, label, min, max, fallback]) => <AgentField key={key} label={label}><input type="number" className={inputClass} min={min} max={max} step={key === 'maxCampaignSpend' ? 0.01 : 1} disabled={key === 'maxConcurrency' && value.transport === 'paired_phone'} value={key === 'maxConcurrency' && value.transport === 'paired_phone' ? 1 : schedule[key] ?? fallback} onChange={e => onChange({ ...value, schedule: { ...schedule, [key]: Number(e.target.value) } })} /></AgentField>)}</div></div>
  </div>;
}
