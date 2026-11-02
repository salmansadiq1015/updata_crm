'use client';

import { useState } from 'react';
import { BookCheck, Loader2, PhoneForwarded } from 'lucide-react';
import { useIntelT } from '../hooks/use-intel-t';
import { useAgentIntelligenceSettings, useKnowledgeVersions, useTransferTargets } from '../hooks/use-calling-intelligence';
import type { CallingAgent } from '../types/ai-calling-types';
import type { AgentIntelligenceConfig } from '../types/calling-intelligence-types';
import { AgentField, inputClass, panelClass, primaryClass, readableError } from './calling-agent-primitives';

/** Per agent: which approved knowledge version it speaks from, and who takes its transfers. */
export function AgentIntelligenceSettings({ agent, canManage }: { agent: CallingAgent & AgentIntelligenceConfig; canManage: boolean }) {
  const t = useIntelT();
  const versions = useKnowledgeVersions();
  const targets = useTransferTargets(canManage);
  const save = useAgentIntelligenceSettings(agent._id);
  const [mode, setMode] = useState(agent.knowledge?.mode || 'latest');
  const [versionId, setVersionId] = useState(agent.knowledge?.versionId || '');
  const [enabled, setEnabled] = useState(Boolean(agent.transfer?.enabled));
  const [selected, setSelected] = useState<string[]>((agent.transfer?.targetUserIds || []).map(String));
  const [timeout, setTimeoutSeconds] = useState(agent.transfer?.timeoutSeconds || 30);
  const [allowPhone, setAllowPhone] = useState(agent.transfer?.allowPhoneTransfer !== false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const list = versions.data?.data || [];
  const run = async (fn: () => Promise<unknown>) => {
    setMessage(null);
    try { await fn(); setMessage({ ok: true, text: t('callingIntel.agent.saved', 'Saved. New calls use this setting.') }); } catch (e) { setMessage({ ok: false, text: readableError(e) }); }
  };
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className={`${panelClass} space-y-4`} aria-label={t('callingIntel.agent.knowledgeTitle', 'Business knowledge')}>
      <h3 className="flex items-center gap-2 font-semibold"><BookCheck className="h-4 w-4 text-primary" />{t('callingIntel.agent.knowledgeTitle', 'Business knowledge')}</h3>
      <p className="text-xs text-muted-foreground">{t('callingIntel.agent.knowledgeHint', 'The agent may state only prices and promises from this published version; anything else it leaves to a person. The version used is recorded on every call.')}</p>
      <div className="space-y-2">{(['latest', 'pinned', 'none'] as const).map(m => <label key={m} className="flex cursor-pointer items-start gap-2 text-sm"><input type="radio" name={`knowledge-${agent._id}`} className="mt-1 accent-sky-400" disabled={!canManage} checked={mode === m} onChange={() => setMode(m)} /><span><span className="text-foreground">{t(`callingIntel.knowledgeMode.${m}`, m)}</span><span className="block text-[11px] text-muted-foreground">{t(`callingIntel.agent.mode.${m}`, { latest: 'Always the newest published version.', pinned: 'A fixed version until you change it.', none: 'No business knowledge: the agent never quotes prices or promises.' }[m])}</span></span></label>)}</div>
      {mode === 'pinned' && <AgentField label={t('callingIntel.agent.pinVersion', 'Version')}><select className={inputClass} disabled={!canManage} value={versionId} onChange={e => setVersionId(e.target.value)}><option value="">{t('callingIntel.agent.chooseVersion', 'Choose a version…')}</option>{list.map(v => <option key={v._id} value={v._id}>{t('callingIntel.kb.versionN', 'Version {v}', { v: v.version })} · {new Date(v.publishedAt).toLocaleDateString()}</option>)}</select></AgentField>}
      {!list.length && versions.isSuccess && <p className="text-[11px] text-amber-200">{t('callingIntel.agent.noVersions', 'Nothing is published yet. Publish approved entries in the Knowledge section.')}</p>}
      {canManage && <button className={primaryClass} disabled={save.knowledge.isPending || (mode === 'pinned' && !versionId)} onClick={() => void run(() => save.knowledge.mutateAsync({ mode, versionId: mode === 'pinned' ? versionId : null }))}>{save.knowledge.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t('callingIntel.agent.saveKnowledge', 'Save knowledge setting')}</button>}
    </section>
    <section className={`${panelClass} space-y-4`} aria-label={t('callingIntel.agent.transferTitle', 'Human transfer')}>
      <div className="flex items-start justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><PhoneForwarded className="h-4 w-4 text-primary" />{t('callingIntel.agent.transferTitle', 'Human transfer')}</h3><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="accent-sky-400" disabled={!canManage} checked={enabled} onChange={e => setEnabled(e.target.checked)} />{t('callingIntel.agent.transferEnabled', 'Allow transfers')}</label></div>
      <p className="text-xs text-muted-foreground">{t('callingIntel.agent.transferHint', 'When the caller asks for a person, everyone below who is available, has the CRM open and is within working hours is offered the call. If nobody accepts in time, the agent offers a callback and a follow-up is added to your follow-up inbox.')}</p>
      <fieldset disabled={!canManage || !enabled} className="space-y-2 disabled:opacity-50"><legend className="text-xs font-medium text-muted-foreground">{t('callingIntel.agent.targets', 'Team members to ring')}</legend>
        {targets.isLoading && <p className="text-xs text-muted-foreground">{t('callingIntel.common.loading', 'Loading…')}</p>}
        <ul className="max-h-60 space-y-1 overflow-y-auto">{(targets.data || []).map(u => <li key={u._id}><label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50"><input type="checkbox" className="accent-sky-400" checked={selected.includes(u._id)} onChange={() => setSelected(s => (s.includes(u._id) ? s.filter(x => x !== u._id) : [...s, u._id]))} /><span className="min-w-0 flex-1 truncate text-foreground">{u.name}</span><span className={`text-[10px] ${u.available && u.online && u.withinHours ? 'text-primary' : 'text-muted-foreground'}`}>{!u.available ? t('callingIntel.agent.notAvailable', 'Not available') : !u.online ? t('callingIntel.agent.offline', 'Offline') : !u.withinHours ? t('callingIntel.agent.outsideHours', 'Outside hours') : t('callingIntel.agent.ready', 'Ready')}{u.hasPhone ? ' · ☎' : ''}</span></label></li>)}</ul>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <AgentField label={t('callingIntel.agent.timeout', 'Ring for (seconds)')}><input type="number" min={10} max={120} className={inputClass} disabled={!canManage || !enabled} value={timeout} onChange={e => setTimeoutSeconds(Number(e.target.value))} /></AgentField>
        <label className="flex items-center gap-2 self-end pb-3 text-xs text-muted-foreground"><input type="checkbox" className="accent-sky-400" disabled={!canManage || !enabled} checked={allowPhone} onChange={e => setAllowPhone(e.target.checked)} />{t('callingIntel.agent.allowPhone', 'Allow transfer to a person’s phone (SIP calls)')}</label>
      </div>
      {canManage && <button className={primaryClass} disabled={save.transfer.isPending || (enabled && !selected.length)} onClick={() => void run(() => save.transfer.mutateAsync({ enabled, targetUserIds: selected, timeoutSeconds: Math.min(120, Math.max(10, timeout || 30)), allowPhoneTransfer: allowPhone }))}>{save.transfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t('callingIntel.agent.saveTransfer', 'Save transfer setting')}</button>}
    </section>
    {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm xl:col-span-2 ${message.ok ? 'text-primary' : 'text-rose-300'}`}>{message.text}</p>}
  </div>;
}
