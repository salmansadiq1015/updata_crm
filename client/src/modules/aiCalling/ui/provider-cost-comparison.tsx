'use client';
import { useState } from 'react';
import type { ProviderCostComparison } from '../types/ai-calling-types';
import { panelClass } from './calling-agent-primitives';

const money = (value: number | null | undefined) => value == null ? 'Not measured' : `$${value.toFixed(6)}`;
export function ProviderCostComparisonPanel({ data }: { data?: ProviderCostComparison }) {
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  if (!data) return null;
  return <section className={`${panelClass} min-w-0 space-y-4`} aria-label="Provider cost comparison">
    <div><h3 className="text-sm font-semibold">Gemini / OpenAI comparison</h3><p className="mt-1 text-xs text-muted-foreground">Production calls in the selected period. Usage and latency are observed; calculated costs use list prices. Test calls are excluded.</p></div>
    <div className="overflow-x-auto"><table className="w-full text-start text-xs"><thead><tr><th className="p-2">Metric</th><th className="p-2">Gemini (Google)</th><th className="p-2">OpenAI</th></tr></thead><tbody>{([
      ['Models', (r: ProviderCostComparison['providers'][number]) => r.models.join(', ') || 'Not recorded'],
      ['Calls / usage share', r => `${r.calls} / ${((r.distribution || 0) * 100).toFixed(1)}%`],
      ['Audio input / output tokens', r => `${r.inputAudio.toLocaleString()} / ${r.outputAudio.toLocaleString()}`],
      ['Text input / output tokens', r => `${r.inputText.toLocaleString()} / ${r.outputText.toLocaleString()}`],
      ['Cached input tokens', r => r.cachedInput.toLocaleString()],
      ['Calculated API cost (USD)', r => r.calculatedCalls ? `${money(r.calculatedCostUsd)}${r.unpricedCalls ? ' (partial)' : ''}` : 'Not measured'],
      ['Calculated audio input / output cost', r => r.calculatedCalls ? `${money(r.audioInputCostUsd)} / ${money(r.audioOutputCostUsd)}` : 'Not measured'],
      ['Calculated text input / output cost', r => r.calculatedCalls ? `${money(r.textInputCostUsd)} / ${money(r.textOutputCostUsd)}` : 'Not measured'],
      ['Provider-reported cost (USD)', r => r.reportedCalls ? money(r.reportedCostUsd) : 'Not recorded'],
      ['Calculated cost / minute', r => money(r.calculatedCostPerMinute)],
      ['Calculated cost / connected minute', r => money(r.calculatedCostPerConnectedMinute)],
      ['Calculated cost / qualified lead', r => money(r.calculatedCostPerQualifiedLead)],
      ['Average reply latency', r => r.averageLatencyMs == null ? 'Not measured' : `${Math.round(r.averageLatencyMs)} ms`],
      ['Validated answers', r => r.qualificationCompletionRate == null ? 'Not measured' : `${(r.qualificationCompletionRate * 100).toFixed(1)}%`],
      ['Qualification accuracy', () => 'Not measured'],
      ['Fallback calls / errors', r => `${r.fallbacks} / ${r.errors}`],
    ] satisfies Array<[string, (row: ProviderCostComparison['providers'][number]) => string]>).map(([label, render]) => <tr key={label} className="border-t border-border"><th className="p-2 font-normal text-muted-foreground">{label}</th>{['gemini', 'openai'].map(provider => { const row = data.providers.find(r => r.provider === provider); return <td key={provider} className="p-2">{row ? render(row) : 'Not measured'}</td>; })}</tr>)}</tbody></table></div>
    {data.providers.some(r => r.provider === 'unknown') && <p className="text-xs text-amber-300">Some historical calls have no recorded AI provider and are excluded from these two columns.</p>}
    {data.providers.some(r => r.provider === 'mixed') && <p className="text-xs text-amber-300">Some CRM conversations contain separate voice rooms with different providers. Their combined totals are excluded from single-provider comparisons.</p>}
    {data.errors?.some(row => row.count > 0) && <p className="text-xs text-amber-300">Provider errors, including failed setup attempts: {data.errors.map(row => `${row.provider}: ${row.count}`).join(' · ')}</p>}
    <div><label className="text-xs">Cost periods <select aria-label="Provider comparison period" value={period} onChange={e => setPeriod(e.target.value as 'daily' | 'monthly')} className="ms-2 rounded border border-border bg-slate-900 p-1"><option value="daily">Daily (UTC)</option><option value="monthly">Monthly (UTC)</option></select></label>
      <div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-start text-xs"><thead><tr>{['Period', 'Provider', 'Calls', 'Calculated USD', 'Reported USD'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{data[period].map(row => <tr key={`${row.period}:${row.provider}`} className="border-t border-border"><td className="p-2">{row.period}</td><td className="p-2">{row.provider}</td><td className="p-2">{row.calls}</td><td className="p-2">{money(row.calculatedCostUsd)}{row.unpricedCalls ? ' (partial)' : ''}</td><td className="p-2">{money(row.reportedCostUsd)}</td></tr>)}</tbody></table></div>
    </div>
    <p className="text-xs text-muted-foreground">Before/after savings and qualification accuracy require equivalent live benchmarks and reviewed outcomes. No measured savings or invoice reconciliation is available yet.</p>
  </section>;
}
