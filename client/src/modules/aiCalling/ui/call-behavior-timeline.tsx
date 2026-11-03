'use client';
import { useIntelT } from '../hooks/use-intel-t';
import type { CallRecord } from '../types/ai-calling-types';

export function CallBehaviorTimeline({ call }: { call: CallRecord }) {
  const t = useIntelT();
  const text = (key: string, fallback: string) => t(`voicePolicy.${key}`, fallback);
  const metrics = call.behaviorAnalytics;
  const language = call.conversationLanguage;
  const events = call.conversationState?.events || [];
  const start = Date.parse(call.answeredAt || call.initiatedAt || call.createdAt || '');
  const elapsed = (at: string) => { const seconds = Math.max(0, Math.floor((Date.parse(at) - start) / 1000)); return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—'; };
  return <section className="space-y-4" aria-label={text('callIntelligence', 'Call intelligence')}>
    <h3 className="text-sm font-semibold">{text('callIntelligence', 'Call intelligence')}</h3>
    <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
      {([
        ['initialLanguage', 'Initial language', language?.initial], ['finalLanguage', 'Current / final language', language?.current],
        ['engagement', 'Engagement', metrics?.engagement ? text(metrics.engagement, metrics.engagement.replaceAll('_', ' ')) : null],
        ['questionsAsked', 'Questions asked', metrics?.questionsAsked], ['incompleteAnswers', 'Incomplete answers', metrics?.incompleteAnswers], ['clarificationRequests', 'Clarification requests', metrics?.clarificationRequests], ['answered', 'Answered', metrics?.answered], ['unanswered', 'Unanswered', metrics?.unanswered], ['repeats', 'Repeated questions', metrics?.repeats],
        ['silenceEvents', 'Silence events', metrics?.silenceEvents], ['interruptions', 'Interruptions', metrics?.interruptions],
        ['averageResponse', 'Average response time', metrics?.averageResponseMs != null ? `${(metrics.averageResponseMs / 1000).toFixed(1)} s` : null],
        ['longestResponse', 'Longest response delay', metrics?.longestResponseMs != null ? `${(metrics.longestResponseMs / 1000).toFixed(1)} s` : null],
        ['completion', 'Completion', metrics ? `${metrics.completionPercentage}%` : null],
        ['outcome', 'Call outcome', call.terminationReason || call.disposition], ['duration', 'Call duration', call.endedAt ? `${call.durationSeconds} s` : null],
      ] as const).map(([key, label, value]) => <div key={key} className="rounded-lg border border-border p-3"><dt className="text-muted-foreground">{text(key, label)}</dt><dd className="mt-1 break-words font-medium">{value ?? '—'}</dd></div>)}
    </dl>
    {!!language?.switches.length && <ul className="space-y-2 text-xs">{language.switches.map((e, i) => <li key={`${e.at}-${i}`}><time>{elapsed(e.at)}</time> · {e.from} → {e.to} · {text(e.mode, e.mode)}</li>)}</ul>}
    <h4 className="text-xs font-semibold">{text('eventTimeline', 'Event timeline')}</h4>
    {!events.length ? <p className="text-xs text-muted-foreground">{text('noEvents', 'No behavior events recorded for this call.')}</p> : <ol className="max-h-96 space-y-3 overflow-auto border-s border-border ps-4 text-xs">{events.map(e => <li key={e.id} className="space-y-1"><div className="flex flex-wrap gap-2"><time className="text-muted-foreground">{elapsed(e.at)}</time><span className="font-medium">{text(e.type, e.type.replaceAll('_', ' '))}</span>{e.fieldKey && <span>{e.fieldKey}</span>}{e.language && <span>{e.language}</span>}{e.reason && <span>{text(e.reason, e.reason.replaceAll('_', ' '))}</span>}</div>{e.classification && <p className="text-muted-foreground">{text(e.classification, e.classification.replaceAll('_', ' '))}</p>}{e.evidence && <p dir="auto" className="break-words text-muted-foreground">{e.evidence}</p>}</li>)}</ol>}
  </section>;
}
