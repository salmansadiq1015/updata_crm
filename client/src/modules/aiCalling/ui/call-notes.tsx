import type { CallRecord } from '../types/ai-calling-types';

export function CallNotes({ call }: { call: CallRecord }) {
  const notes = call.callNotes;
  if (!notes) return <p className="mt-3 text-xs text-muted-foreground">{call.endedAt ? 'No call notes were recorded for this call.' : 'Call notes will be added automatically when the call ends.'}</p>;
  return (
    <div className="mt-3 space-y-3 border-t border-border/60 pt-3 text-xs">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{notes.source === 'ai_agent' ? 'AI agent notes' : 'Automatic call recap'}</p>
      <dl className="space-y-3">
        <div><dt className="font-semibold">Description</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{notes.description}</dd></div>
        <div><dt className="font-semibold">Call summary</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{notes.summary}</dd></div>
        <div><dt className="font-semibold">Blockers</dt><dd className="mt-1 text-muted-foreground">{notes.blockers.length ? <ul className="list-disc space-y-1 ps-4">{notes.blockers.map((blocker, index) => <li key={index} className="whitespace-pre-wrap break-words">{blocker}</li>)}</ul> : 'No blockers recorded.'}</dd></div>
      </dl>
    </div>
  );
}
