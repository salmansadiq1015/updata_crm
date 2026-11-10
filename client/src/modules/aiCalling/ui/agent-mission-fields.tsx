'use client';
import { Info, ListChecks, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntelT } from '../hooks/use-intel-t';
import { AgentField, inputClass } from './calling-agent-primitives';
import type { AgentConfig, AgentMission, CallingAgentInput } from '../types/ai-calling-types';

const BEHAVIORS = ['naturalConversation', 'skipAnswered', 'clarifyAmbiguous', 'respectRefusals'] as const;

/**
 * Goal-driven ("mission") conversation mode. The questionnaire stays the single list of
 * information to collect: required questions = required information, optional = optional.
 * Answers keep the same validation, structured output and lead mapping.
 */
export function AgentMissionFields({ value, onChange }: { value: CallingAgentInput; onChange: (next: CallingAgentInput) => void }) {
  const t = useIntelT();
  const config: Partial<AgentConfig> = value.agentConfig || {};
  const mode = config.conversationMode || 'questions';
  const mission: AgentMission = config.mission || {};
  const behavior = { naturalConversation: true, skipAnswered: true, clarifyAmbiguous: true, respectRefusals: true, ...(mission.behavior || {}) };
  const setConfig = (patch: Partial<AgentConfig>) => onChange({ ...value, agentConfig: { ...config, ...patch } as AgentConfig });
  const setMission = (patch: Partial<AgentMission>) => setConfig({ mission: { ...mission, ...patch } });
  const questions = value.questionnaire?.questions || [];
  const required = questions.filter((q) => q.required !== false);
  const optional = questions.filter((q) => q.required === false);

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label={t('aiMission.mode', 'Conversation mode')} className="grid gap-3 sm:grid-cols-2">
        {(['questions', 'mission'] as const).map((m) => {
          const Icon = m === 'questions' ? ListChecks : Target;
          return (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setConfig({ conversationMode: m })}
              className={cn('rounded-xl border p-4 text-start transition-colors', mode === m ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40' : 'border-border hover:border-sky-500/40')}>
              <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-sky-500" />{t(`aiMission.mode.${m}`, m)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t(`aiMission.mode.${m}.hint`, '')}</span>
            </button>
          );
        })}
      </div>

      {mode === 'mission' && (
        <div className="space-y-5">
          <AgentField label={t('aiMission.objective', 'Objective — what should the conversation achieve?')}>
            <textarea className={`${inputClass} resize-y`} rows={3} maxLength={1000} value={config.objective || ''} onChange={(e) => setConfig({ objective: e.target.value })}
              placeholder={t('aiMission.objectivePlaceholder', 'Find out whether the company plans a heating replacement this year and who decides.')} />
          </AgentField>
          <AgentField label={t('aiMission.persona', 'Persona — how should the agent come across?')}>
            <textarea className={`${inputClass} resize-y`} rows={2} maxLength={1000} value={mission.persona || ''} onChange={(e) => setMission({ persona: e.target.value })}
              placeholder={t('aiMission.personaPlaceholder', 'A calm, knowledgeable energy advisor from a Swiss family business.')} />
          </AgentField>
          <AgentField label={t('aiMission.completion', 'Completion — when is the mission done?')}>
            <textarea className={`${inputClass} resize-y`} rows={2} maxLength={1000} value={mission.completionCriteria || ''} onChange={(e) => setMission({ completionCriteria: e.target.value })}
              placeholder={t('aiMission.completionPlaceholder', 'We know the interest, the timeline and the decision maker — or the person declined.')} />
          </AgentField>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('aiMission.behavior', 'Conversation behaviour')}</legend>
            {BEHAVIORS.map((key) => (
              <label key={key} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-500" checked={behavior[key] !== false} onChange={(e) => setMission({ behavior: { ...behavior, [key]: e.target.checked } })} />
                <span>{t(`aiMission.behavior.${key}`, key)}</span>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">{t('aiMission.alwaysOn', 'Always on: one question at a time, never inventing answers, honouring stop and do-not-contact requests.')}</p>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold">{t('aiMission.required', 'Required information')} · {required.length}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{required.map((q) => <li key={q.fieldKey}>• {q.label || q.text}</li>)}</ul>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold">{t('aiMission.optional', 'Optional information')} · {optional.length}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{optional.map((q) => <li key={q.fieldKey}>• {q.label || q.text}</li>)}</ul>
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            {t('aiMission.infoHint', 'The information to collect comes from “Conversation questions” (required or optional). Business facts and approved answers come from the agent’s knowledge base. Results stay structured and validated, so workflows can branch on them.')}
          </p>
        </div>
      )}
    </div>
  );
}
