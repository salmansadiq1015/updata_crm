'use client';
import { useState } from 'react';
import { ArrowRight, Camera, CheckCircle2, Images, Loader2 } from 'lucide-react';
import { useAgentMutations } from '../hooks/use-calling-agents';
import type { Lead } from '@/modules/leads/types/lead-types';
import { CampaignLeadPicker } from './campaign-lead-picker';
import { AGENT_TYPES, type AgentType, type AgentUsage, type CallingAgentInput } from '../types/ai-calling-types';
import { useAgentTemplates } from '../hooks/use-follow-up-calling';
import { useIntelT } from '../hooks/use-intel-t';
import { AgentImageGallery } from './agent-image-gallery';
import { AgentExecutionFields, AgentLanguageField, AgentVoiceFields, defaultAgentInput } from './agent-settings-fields';
import { QuestionEditor, QualificationRulesEditor } from './question-configuration';
import { AgentMissionFields } from './agent-mission-fields';
import { AgentAvatar, AgentDialog, AgentField, AgentTabs, inputClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';

export function AgentIdentityFields({ value, onChange, avatarUrl, onAvatarChange, showUsage = true }: { value: CallingAgentInput; onChange: (next: CallingAgentInput) => void; avatarUrl?: string | null; onAvatarChange: (url: string | null) => void; showUsage?: boolean }) {
  const [gallery, setGallery] = useState(false);
  const t = useIntelT();
  const templates = useAgentTemplates();
  const type = value.agentType || 'custom';
  const template = templates.data?.find(x => x.type === type);
  // Picking a type fills the objective/instructions only while they are still empty.
  const chooseType = (next: AgentType) => {
    const tpl = templates.data?.find(x => x.type === next);
    const config = { ...(value.agentConfig || {}) };
    if (tpl && !config.objective?.trim()) config.objective = tpl.objective;
    if (tpl && !config.instructions?.trim()) config.instructions = tpl.instructions;
    onChange({ ...value, agentType: next, agentConfig: config });
  };
  return <div className="space-y-6">
    <div className="flex flex-col gap-5 rounded-2xl border border-sky-300/15 bg-card p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <button type="button" aria-label="Change agent avatar" onClick={() => setGallery(true)} className="group relative w-fit shrink-0 rounded-2xl ring-4 ring-sky-400/5 transition hover:ring-sky-400/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400">
        <AgentAvatar name={value.name} url={avatarUrl} large />
        <span className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border border-sky-300/25 bg-card text-primary shadow-lg transition group-hover:bg-blue-600"><Camera aria-hidden="true" className="h-3.5 w-3.5" /></span>
      </button>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">Agent avatar</h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">Give your agent a familiar face. Choose a premium portrait or upload your own image.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" className={`${secondaryClass} border-sky-300/20 bg-sky-400/10 text-primary hover:bg-sky-400/15`} onClick={() => setGallery(true)}><Images aria-hidden="true" className="h-4 w-4" />Choose avatar</button>
          {(value.avatarFileId || value.avatarPresetId) && <button type="button" className="rounded-md py-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-sky-400" onClick={() => { onChange({ ...value, avatarFileId: null, avatarPresetId: null }); onAvatarChange(null); }}>Use initials</button>}
        </div>
      </div>
    </div>
    <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
      <AgentField label="Agent name *"><input className={inputClass} required maxLength={120} autoComplete="off" value={value.name} placeholder="Sarah Sales" onChange={e => onChange({ ...value, name: e.target.value })} /></AgentField>
      <AgentField label="Title / role"><input className={inputClass} maxLength={160} value={value.title || ''} placeholder="Sales Qualification Agent" onChange={e => onChange({ ...value, title: e.target.value })} /></AgentField>
      <div className="sm:col-span-2"><AgentField label={t('aiFollowUp.agentType.label', 'Agent type')} hint={template?.objective || t('aiFollowUp.agentType.hint', 'A starting template for the objective and instructions. You can create several agents of the same type and change everything.')}>
        <select aria-label={t('aiFollowUp.agentType.label', 'Agent type')} className={inputClass} value={type} onChange={e => chooseType(e.target.value as AgentType)}>{AGENT_TYPES.map(k => <option key={k} value={k}>{t(`aiFollowUp.type.${k}`, k.replaceAll('_', ' '))}</option>)}</select>
      </AgentField></div>
      {showUsage && <div className="sm:col-span-2"><AgentField label={t('inbound.usage.label', 'Used for')} hint={t('inbound.usage.hint', 'Incoming-only agents answer calls to your connected phones and cannot run campaigns.')}><select aria-label={t('inbound.usage.label', 'Used for')} className={inputClass} value={value.usage || 'outbound'} onChange={e => onChange({ ...value, usage: e.target.value as AgentUsage })}>{(['outbound', 'inbound', 'both'] as const).map(u => <option key={u} value={u}>{t(`inbound.usage.${u}`, u)}</option>)}</select></AgentField></div>}
      <div className="sm:col-span-2"><AgentLanguageField value={value.agentConfig?.language} onChange={language => onChange({ ...value, agentConfig: { ...value.agentConfig, language } })} /></div>
      <div className="sm:col-span-2"><AgentField label="Description"><textarea rows={4} className={`${inputClass} resize-y`} maxLength={1000} value={value.description || ''} placeholder="Describe what this agent helps your team accomplish." onChange={e => onChange({ ...value, description: e.target.value })} /></AgentField></div>
    </div>
    {gallery && <AgentImageGallery selectedId={value.avatarPresetId ? `preset:${value.avatarPresetId}` : value.avatarFileId} onClose={() => setGallery(false)} onSelect={image => { onChange({ ...value, avatarFileId: image.presetId ? null : image._id, avatarPresetId: image.presetId || null }); onAvatarChange(image.url); }} />}
  </div>;
}

export function AgentQuestionTabs({ value, onChange, includeBehavior = false }: { value: CallingAgentInput; onChange: (next: CallingAgentInput) => void; includeBehavior?: boolean }) {
  const t = useIntelT();
  const [tab, setTab] = useState('questions');
  const questions = value.questionnaire?.questions || [];
  return <AgentTabs label="Question configuration" value={tab} onChange={setTab} items={[{ value: 'questions', label: 'Conversation questions' }, { value: 'mission', label: t('aiMission.tab', 'Conversation mode') }, { value: 'rules', label: 'Qualification rules' }, { value: 'preview', label: 'Conversation preview' }, ...(includeBehavior ? [{ value: 'behavior', label: 'Calling behavior' }] : [])]}>
    {tab === 'questions' && <QuestionEditor questions={questions} onChange={next => onChange({ ...value, questionnaire: { questions: next } })} rules={value.statusRules || []} onImport={(next, rules) => onChange({ ...value, questionnaire: { questions: next }, statusRules: rules })} />}
    {tab === 'mission' && <AgentMissionFields value={value} onChange={onChange} />}
    {tab === 'rules' && <QualificationRulesEditor questions={questions} rules={value.statusRules || []} onChange={rules => onChange({ ...value, statusRules: rules })} />}
    {tab === 'behavior' && <AgentExecutionFields value={value} onChange={onChange} />}
    {tab === 'preview' && <div className="space-y-4"><p className="text-xs text-muted-foreground">Preview the current question sequence. The agent keeps each question&apos;s meaning and validates answers using the selected types.</p><div className="rounded-xl border border-border p-4 text-sm"><p className="mb-2 text-xs font-medium text-primary">Opening disclosure</p><p>{value.agentConfig?.disclosure?.replaceAll('{company}', value.agentConfig?.organizationName || '{company}') || 'Add an opening disclosure in Voice & instructions.'}</p></div><ol className="space-y-3">{questions.map((q, i) => <li key={q.fieldKey} className="rounded-xl border border-border p-4 text-sm"><p className="mb-1 text-xs text-muted-foreground">{i + 1} · {q.type.replaceAll('_', ' ')}{q.required ? ' · Required' : ' · Optional'}</p><p>{q.text || 'Question text is not complete.'}</p>{q.condition && <p className="mt-2 text-xs text-amber-300">Asked when its configured conditions match earlier answers.</p>}</li>)}</ol>{!questions.length && <p className="text-sm text-muted-foreground">Add questions to preview the conversation.</p>}</div>}
  </AgentTabs>;
}

export function CallingAgentEditor({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [draft, setDraft] = useState(defaultAgentInput);
  const [leadSelectionBusy, setLeadSelectionBusy] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Map<string, Lead>>(new Map());
  const [initialSnapshot] = useState(() => JSON.stringify(draft));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tab, setTab] = useState('identity');
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { create } = useAgentMutations();
  const steps = [{ value: 'identity', label: '1 · Identity & avatar' }, { value: 'voice', label: '2 · Voice & instructions' }, { value: 'questions', label: '3 · Questions & behavior' }, { value: 'leads', label: '4 · Assign leads' }, { value: 'review', label: '5 · Review & save' }];
  const save = async (active: boolean) => {
    setError(null);
    if (!draft.name.trim()) { setTab('identity'); setError('Give your agent a name before saving.'); return; }
    try { const saved = await create.mutateAsync({ ...draft, assignedLeadIds: [...selectedLeads.keys()], name: draft.name.trim(), agentConfig: { ...draft.agentConfig, agentName: draft.name.trim() }, availability: active ? 'active' : 'draft' }); onCreated(saved._id); } catch (e) { setError(readableError(e)); }
  };
  const requestClose = () => { if (create.isPending || leadSelectionBusy) return; if (JSON.stringify(draft) !== initialSnapshot || selectedLeads.size > 0) setDiscard(true); else onClose(); };
  const footer = <div className="flex flex-wrap items-center justify-between gap-4"><button className={secondaryClass} disabled={create.isPending || leadSelectionBusy} onClick={() => void save(false)}>{create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save draft</button>{tab === 'review' ? <button className={primaryClass} disabled={create.isPending || leadSelectionBusy} onClick={() => void save(true)}>Create active agent <CheckCircle2 className="h-4 w-4" /></button> : <button className={primaryClass} disabled={create.isPending || leadSelectionBusy} onClick={() => setTab(steps[steps.findIndex(s => s.value === tab) + 1].value)}>Continue <ArrowRight className="h-4 w-4" /></button>}</div>;
  return <AgentDialog footer={footer} title="Create Agent" description="Set up your agent, configure questions, and assign leads. Launch a campaign when you are ready." onClose={requestClose} wide>
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-400/5 p-3 text-sm text-rose-300">{error}</p>}
      <AgentTabs label="Create agent steps" value={tab} onChange={next => { if (!create.isPending && !leadSelectionBusy) setTab(next); }} items={steps}>
        {tab === 'identity' && <AgentIdentityFields value={draft} onChange={setDraft} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />}
        {tab === 'voice' && <AgentVoiceFields value={draft.agentConfig || {}} onChange={agentConfig => setDraft({ ...draft, agentConfig })} />}
        {tab === 'questions' && <AgentQuestionTabs value={draft} onChange={setDraft} includeBehavior />}
        {tab === 'leads' && <div className="space-y-4"><div><h3 className="text-sm font-semibold">Assign leads to this agent</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Search and filter your CRM leads, then select individuals or all matching results. This step is optional. Assignments are saved with the agent; calls start only when you launch a campaign.</p></div><CampaignLeadPicker purpose="assignment" onBusyChange={setLeadSelectionBusy} selected={selectedLeads} onChange={setSelectedLeads} /></div>}
        {tab === 'review' && <div className="space-y-4"><div className="flex items-center gap-4"><AgentAvatar name={draft.name} url={avatarUrl} large /><div><h3 className="text-lg font-semibold">{draft.name || 'Unnamed agent'}</h3><p className="text-sm text-muted-foreground">{draft.title || 'Add a title in Identity & avatar'}</p></div></div><p className="text-sm text-muted-foreground">{draft.description || 'No description added.'}</p><div className="grid gap-3 text-sm sm:grid-cols-2">{[
          ['Voice', `${draft.agentConfig?.voice} · ${draft.agentConfig?.language}`], ['Questions', String(draft.questionnaire?.questions.length || 0)], ['Assigned leads', String(selectedLeads.size)], ['Calling hours', `${draft.schedule?.callWindow?.start}–${draft.schedule?.callWindow?.end}`], ['Timezone', draft.schedule?.timezone || 'UTC'],
        ].map(([label, text]) => <div key={label} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1">{text}</p></div>)}</div><p className="flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />Save a draft at any stage, or activate when the company, objective, disclosure and questions are complete.</p></div>}
      </AgentTabs>
      {discard && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/25 p-3 text-xs text-amber-200"><span className="flex-1">Discard this unsaved agent?</span><button className={secondaryClass} onClick={() => setDiscard(false)}>Keep editing</button><button className={secondaryClass} onClick={onClose}>Discard agent</button></div>}
    </div>
  </AgentDialog>;
}
