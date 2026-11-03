'use client';

import { useAgentLanguages } from '../hooks/use-ai-calling';
import { useIntelT } from '../hooks/use-intel-t';
import type { AgentConfig } from '../types/ai-calling-types';
import { AgentField, inputClass, panelClass } from './calling-agent-primitives';

export function ConversationPolicyFields({ value, onChange }: { value: Partial<AgentConfig>; onChange: (next: Partial<AgentConfig>) => void }) {
  const t = useIntelT();
  const languages = useAgentLanguages();
  const patch = (change: Partial<AgentConfig>) => onChange({ ...value, ...change });
  const text = (key: string, fallback: string) => t(`voicePolicy.${key}`, fallback);
  const toggle = (key: keyof AgentConfig, fallback: string) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value[key] !== false} onChange={e => patch({ [key]: e.target.checked })} />{text(key, fallback)}</label>;
  return <div className="space-y-4">
    <section className={`${panelClass} space-y-4`} aria-label={text('languageSettings', 'Language settings')}>
      <h3 className="font-semibold">{text('languageSettings', 'Language settings')}</h3>
      <AgentField label={text('supportedLanguages', 'Supported languages')} hint={text('supportedHint', 'Leave empty to allow all supported languages. The opening language is always allowed.')}>
        <select multiple className={`${inputClass} min-h-36`} value={value.supportedLanguages || []} onChange={e => patch({ supportedLanguages: Array.from(e.target.selectedOptions, o => o.value) })}>
          {(languages.data?.languages || []).filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code}>{l.nativeName} · {l.name}</option>)}
        </select>
      </AgentField>
      <div className="grid gap-3 sm:grid-cols-2">{toggle('automaticLanguageDetection', 'Automatic language detection')}{toggle('automaticLanguageSwitching', 'Automatic language switching')}{toggle('followLeadLanguage', "Follow the lead’s language preference")}</div>
      <AgentField label={text('languageSwitchSensitivity', 'Language switching sensitivity')}><select className={inputClass} value={value.languageSwitchSensitivity || 'medium'} onChange={e => patch({ languageSwitchSensitivity: e.target.value as AgentConfig['languageSwitchSensitivity'] })}>{(['low', 'medium', 'high'] as const).map(v => <option key={v} value={v}>{text(v, v)}</option>)}</select></AgentField>
    </section>
    <section className={`${panelClass} space-y-4`} aria-label={text('conversationBehavior', 'Conversation behavior')}>
      <h3 className="font-semibold">{text('conversationBehavior', 'Conversation behavior')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{([
        ['silenceTimeoutSeconds', 'Silence timeout (seconds)', 2, 60, 10],
        ['repetitionDelaySeconds', 'Repetition delay (seconds)', 0, 30, 3],
        ['maxRepetitionAttempts', 'Maximum repetition attempts', 0, 5, 3],
        ['maxUnansweredQuestions', 'Consecutive unanswered questions', 1, 40, 3],
      ] as const).map(([key, label, min, max, fallback]) => <AgentField key={key} label={text(key, label)}><input className={inputClass} type="number" min={min} max={max} value={value[key] ?? fallback} onChange={e => patch({ [key]: Number(e.target.value) })} /></AgentField>)}</div>
      <AgentField label={text('repetitionStrategy', 'Repetition strategy')}><select className={inputClass} value={value.repetitionStrategy || 'progressive'} onChange={e => patch({ repetitionStrategy: e.target.value as AgentConfig['repetitionStrategy'] })}>{(['exact', 'natural', 'simplified', 'contextual', 'progressive'] as const).map(v => <option key={v} value={v}>{text(v, v)}</option>)}</select></AgentField>
      <div className="grid gap-3 sm:grid-cols-2">{toggle('automaticCallTermination', 'End calls at the unanswered threshold')}{toggle('automaticNextLead', 'Automatically continue to the next lead')}</div>
    </section>
    <section className={`${panelClass} space-y-4`} aria-label={text('leadIntelligence', 'Lead intelligence')}>
      <h3 className="font-semibold">{text('leadIntelligence', 'Lead intelligence')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{toggle('trackResponseBehavior', 'Track response behavior')}{toggle('trackEngagement', 'Track conversation engagement')}{toggle('classifyEngagement', 'Calculate engagement classification')}{toggle('saveBehaviorHistory', 'Save behavior event history')}{toggle('conversationAnalytics', 'Enable conversation analytics')}</div>
    </section>
  </div>;
}
