'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { voiceProviderApi, type VoiceProviderSettings, type VoiceProviderUpdate } from '../services/voice-provider-api';
import { inputClass, panelClass, primaryClass, secondaryClass, readableError } from './calling-agent-primitives';

const queryKey = ['ai-calling', 'voice-providers'];
export function VoiceProviderSettingsPanel() {
  const query = useQuery({ queryKey, queryFn: voiceProviderApi.get, retry: false });
  if (query.isError) return <p role="alert">{readableError(query.error)}</p>;
  if (!query.data) return <p className="text-sm text-muted-foreground">Loading AI providers…</p>;
  return <ProviderForm key={query.dataUpdatedAt} settings={query.data} />;
}

function ProviderForm({ settings: s }: { settings: VoiceProviderSettings }) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<VoiceProviderUpdate>({
    primaryModel: s.primaryModel, secondaryModel: s.secondaryModel, experimentalModel: s.experimentalModel,
    geminiVoice: s.geminiVoice, fallbackEnabled: s.fallbackEnabled, maxSessionSeconds: s.maxSessionSeconds,
    maxCallCostUsd: s.maxCallCostUsd, connectionTimeoutMs: s.connectionTimeoutMs,
  });
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<Record<string, boolean>>({});
  const save = useMutation({ mutationFn: voiceProviderApi.save, onSuccess: data => { setKeys({}); cache.setQueryData(queryKey, data); } });
  const test = useMutation({ mutationFn: voiceProviderApi.test, onSuccess: () => cache.invalidateQueries({ queryKey }) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const credentials: Record<string, string | null> = {};
    for (const p of ['gemini', 'openai']) {
      if (remove[p]) credentials[p] = null;
      else if (keys[p]?.trim()) credentials[p] = keys[p].trim();
    }
    save.mutate({ ...draft, credentials });
  };
  const change = (patch: VoiceProviderUpdate) => setDraft(value => ({ ...value, ...patch }));
  return <section className={panelClass} aria-label="AI Provider Configuration">
    <h2 className="text-base font-semibold">AI Provider Configuration</h2>
    <p className="mt-1 text-xs text-muted-foreground">Gemini is primary. OpenAI can take over if Gemini cannot establish a session. Changes apply to new calls.</p>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs">Gemini production model<select className={`${inputClass} mt-1 w-full`} value={draft.primaryModel} onChange={e => change({ primaryModel: e.target.value })}><option>gemini-3.8-live</option></select></label>
        <label className="text-xs">OpenAI fallback model<input className={`${inputClass} mt-1 w-full`} value={draft.secondaryModel} required pattern="gpt-.*realtime.*" onChange={e => change({ secondaryModel: e.target.value })} /></label>
        <label className="text-xs">Experimental Gemini model (test calls only)<select className={`${inputClass} mt-1 w-full`} value={draft.experimentalModel} onChange={e => change({ experimentalModel: e.target.value })}><option value="">Use production model for tests</option><option>gemini-3.1-flash-live-preview</option></select></label>
        <label className="text-xs">Gemini voice<input className={`${inputClass} mt-1 w-full`} value={draft.geminiVoice} required onChange={e => change({ geminiVoice: e.target.value })} /></label>
        <label className="text-xs">Maximum session seconds<input className={`${inputClass} mt-1 w-full`} type="number" min={30} max={3600} required value={draft.maxSessionSeconds} onChange={e => change({ maxSessionSeconds: Number(e.target.value) })} /></label>
        <label className="text-xs">Observed API cost limit per call (USD, 0 disables)<input className={`${inputClass} mt-1 w-full`} type="number" min={0} max={1000} step="0.01" required value={draft.maxCallCostUsd} onChange={e => change({ maxCallCostUsd: Number(e.target.value) })} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.fallbackEnabled} onChange={e => change({ fallbackEnabled: e.target.checked })} />Enable automatic fallback during session establishment</label>
      <p className="text-xs text-muted-foreground">The cost limit uses reported usage and list prices after each response; it may overshoot during a response. Provider account limits remain necessary. Preview models cannot be selected for production.</p>
      <div className="grid gap-4 md:grid-cols-2">{['gemini', 'openai'].map(provider => <div key={provider} className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm font-medium capitalize">{provider}</p>
        <label className="block text-xs">Replace {provider} API key<input type="password" autoComplete="new-password" className={`${inputClass} mt-1 w-full`} value={keys[provider] || ''} onChange={e => setKeys(value => ({ ...value, [provider]: e.target.value }))} /></label>
        <p className="text-xs text-muted-foreground">{s.credentials[provider]?.stored ? 'Encrypted credential saved' : 'No saved credential; worker environment key is used'}</p>
        {s.credentials[provider]?.stored && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={remove[provider] || false} onChange={e => setRemove(value => ({ ...value, [provider]: e.target.checked }))} />Remove saved credential</label>}
        <button type="button" className={secondaryClass} disabled={test.isPending || save.isPending} onClick={() => test.mutate(provider)}>Test {provider} model access</button>
        <p className="text-xs text-muted-foreground">Last health: {s.health[provider]?.status || 'Not tested'}{s.health[provider]?.scope ? ` (${s.health[provider].scope.replaceAll('_', ' ')})` : ''}</p>
      </div>)}</div>
      <p className="text-xs text-muted-foreground">Save keys before testing. This check tests API-server credential and model access. A browser Live test verifies the worker session and audio. Worker environment credentials can differ. Saved keys require the same encryption secret on API and worker.</p>
      {(save.isError || test.isError) && <p role="alert" className="text-sm text-rose-300">{readableError(save.error || test.error)}</p>}
      <button type="submit" className={primaryClass} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save provider settings'}</button>
      {save.isSuccess && <span role="status" className="ms-3 text-xs text-emerald-300">Settings saved</span>}
    </form>
    <div className="mt-5 overflow-x-auto"><table className="w-full text-start text-xs"><caption className="mb-2 text-start text-muted-foreground">USD per million tokens · published list rates / configured overrides · verified {s.pricingVerifiedAt}</caption><thead><tr>{['Model', 'Audio in', 'Audio out', 'Text in', 'Text out'].map(text => <th key={text} className="px-2 py-2">{text}</th>)}</tr></thead><tbody>{[s.primaryModel, s.secondaryModel, s.experimentalModel].filter(Boolean).map(model => <tr key={model} className="border-t border-border"><td className="px-2 py-2">{model}</td>{['audioIn', 'audioOut', 'textIn', 'textOut'].map(k => <td key={k} className="px-2 py-2">{s.pricing[model]?.[k] == null ? 'Unknown' : `$${s.pricing[model][k]}`}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
