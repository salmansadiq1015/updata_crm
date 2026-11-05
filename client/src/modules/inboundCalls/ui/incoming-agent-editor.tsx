'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useAgentMutations } from '@/modules/aiCalling/hooks/use-calling-agents';
import { AgentIdentityFields } from '@/modules/aiCalling/ui/calling-agent-editor';
import { AgentVoiceFields, defaultAgentInput } from '@/modules/aiCalling/ui/agent-settings-fields';
import { AgentDialog, AgentTabs, primaryClass, readableError, secondaryClass } from '@/modules/aiCalling/ui/calling-agent-primitives';
import type { CallingAgentInput } from '@/modules/aiCalling/types/ai-calling-types';
import { inboundCallsApi } from '../services/inbound-calls-api';
import { inboundPayload } from '../inbound-domain';
import type { InboundSettings } from '../types/inbound-call-types';
import { AgentInboundFields } from './agent-inbound-fields';
import { Toggle } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

/** A new receptionist: identity + voice/disclosure/languages + greeting/instructions. No questionnaire or leads. */
export function incomingAgentDraft(title = 'Receptionist'): CallingAgentInput {
  const base = defaultAgentInput();
  return {
    ...base,
    usage: 'inbound',
    title,
    agentConfig: { ...base.agentConfig, objective: '', disclosure: 'You are speaking with an AI assistant for {company}.' },
    inbound: { greeting: '', instructions: '', escalationInstructions: '' },
  };
}

/** The create payload: usage inbound (or both), the receptionist fields, agentName mirrored from the name. */
export function incomingAgentPayload(draft: CallingAgentInput, opts: { alsoOutbound: boolean; active: boolean }): CallingAgentInput {
  const name = draft.name.trim();
  return { ...draft, name, usage: opts.alsoOutbound ? 'both' : 'inbound', availability: opts.active ? 'active' : 'draft', agentConfig: { ...draft.agentConfig, agentName: name },
    ...(draft.inbound ? { inbound: inboundPayload(draft.inbound) as CallingAgentInput['inbound'] } : {}) };
}

export function IncomingAgentEditor({ settings, onClose, onCreated }: { settings: InboundSettings | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useInboundLanguage();
  const [draft, setDraft] = useState<CallingAgentInput>(() => incomingAgentDraft(t('inbound.agents.receptionist', 'Receptionist')));
  const qc = useQueryClient();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tab, setTab] = useState('identity');
  const [alsoOutbound, setAlsoOutbound] = useState(false);
  const [makeDefault, setMakeDefault] = useState(() => !settings?.defaultAgentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { create } = useAgentMutations();
  const steps = [
    { value: 'identity', label: t('inbound.agentEditor.stepIdentity', '1 · Identity') },
    { value: 'voice', label: t('inbound.agentEditor.stepVoice', '2 · Voice & disclosure') },
    { value: 'receptionist', label: t('inbound.agentEditor.stepReceptionist', '3 · Receptionist') },
  ];
  const last = tab === steps[steps.length - 1].value;

  const save = async (active: boolean) => {
    setError(null);
    if (!draft.name.trim()) { setTab('identity'); setError(t('inbound.agentEditor.nameRequired', 'Give your agent a name before saving.')); return; }
    setBusy(true);
    try {
      const saved = await create.mutateAsync(incomingAgentPayload(draft, { alsoOutbound, active }));
      if (makeDefault && settings) {
        // Best effort: the agent exists either way; a conflict only means settings changed elsewhere.
        try { await inboundCallsApi.updateSettings({ defaultAgentId: saved._id, version: settings.version }); } catch { /* set it from the agent card */ }
        void qc.invalidateQueries({ queryKey: queryKeys.inboundCalls.settings() });
      }
      onCreated(saved._id);
    } catch (e) { setError(readableError(e)); } finally { setBusy(false); }
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <button type="button" className={secondaryClass} disabled={busy} onClick={() => void save(false)}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{t('inbound.agentEditor.saveDraft', 'Save draft')}</button>
      {last
        ? <button type="button" className={primaryClass} disabled={busy} onClick={() => void save(true)}>{t('inbound.agentEditor.createActive', 'Create active agent')}<CheckCircle2 className="size-4" /></button>
        : <button type="button" className={primaryClass} disabled={busy} onClick={() => setTab(steps[steps.findIndex((s) => s.value === tab) + 1].value)}>{t('inbound.agentEditor.continue', 'Continue')}<ArrowRight className="size-4 rtl:rotate-180" /></button>}
    </div>
  );

  return (
    <AgentDialog wide footer={footer} title={t('inbound.agents.create', 'Create incoming agent')} description={t('inbound.agentEditor.hint', 'A receptionist that answers calls to your connected phones. It needs no questionnaire or lead list.')} onClose={() => { if (!busy) onClose(); }}>
      <div className="space-y-5">
        {error ? <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-400/5 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
        <AgentTabs label={t('inbound.agentEditor.steps', 'Create incoming agent steps')} value={tab} onChange={(v) => { if (!busy) setTab(v); }} items={steps}>
          {tab === 'identity' && <AgentIdentityFields value={draft} onChange={setDraft} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} showUsage={false} />}
          {tab === 'voice' && <AgentVoiceFields value={draft.agentConfig || {}} onChange={(agentConfig) => setDraft({ ...draft, agentConfig })} />}
          {tab === 'receptionist' && (
            <div className="space-y-5">
              <AgentInboundFields value={draft.inbound} onChange={(inbound) => setDraft({ ...draft, inbound })} />
              <div className="rounded-xl border border-border p-3">
                <Toggle label={t('inbound.agentEditor.default', 'Use as the default incoming agent')} description={t('inbound.agentEditor.defaultHint', 'Answers every connected phone that has no agent of its own.')} checked={makeDefault} onChange={setMakeDefault} disabled={!settings} />
                <Toggle label={t('inbound.agentEditor.alsoOutbound', 'Use for outbound campaigns too')} description={t('inbound.agentEditor.alsoOutboundHint', 'Campaigns additionally need a call objective and questions, set in AI Calling.')} checked={alsoOutbound} onChange={setAlsoOutbound} />
              </div>
            </div>
          )}
        </AgentTabs>
      </div>
    </AgentDialog>
  );
}
