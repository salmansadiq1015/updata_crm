const canonical = value => /^(gemini|google|generativelanguage\.googleapis\.com)$/i.test(value || '') ? 'gemini'
  : /^(openai|api\.openai\.com)$/i.test(value || '') ? 'openai' : null;
const ratio = (a, b) => b ? a / b : null;

/** Compare observed cohorts; no assumed accuracy, invoice reconciliation or savings. */
export function providerComparison(calls) {
  const groups = new Map(); const days = new Map(); const months = new Map();
  for (const call of calls.filter(c => !c.isTest)) {
    const identities = new Set((call.cost.models || []).map(m => canonical(m.provider)).filter(Boolean));
    const provider = identities.size > 1 ? 'mixed' : canonical(call.aiVoice?.provider) || canonical(call.cost.models?.[0]?.provider) || 'unknown';
    const row = groups.get(provider) || {
      provider, models: new Set(), calls: 0, seconds: 0, connectedSeconds: 0, turns: 0,
      calculatedCostUsd: 0, reportedCostUsd: 0, calculatedCalls: 0, reportedCalls: 0, unpricedCalls: 0, fallbacks: 0, errors: 0,
      inputAudio: 0, outputAudio: 0, inputText: 0, outputText: 0, cachedInput: 0,
      audioInputCostUsd: 0, audioOutputCostUsd: 0, textInputCostUsd: 0, textOutputCostUsd: 0,
      latencySum: 0, latencySamples: 0, validAnswers: 0, attemptedAnswers: 0,
      qualifiedLeads: new Set(),
    };
    row.calls += 1; row.seconds += call.durationSeconds;
    if (call.answeredAt) row.connectedSeconds += call.durationSeconds;
    row.turns += call.behavior?.participation?.leadTurns || 0;
    row.fallbacks += call.aiVoice?.fallback ? 1 : 0;
    row.errors += (call.aiVoice?.attempts || []).filter(a => a.provider === provider && a.status !== 'established').length;
    const t = call.cost.tokens;
    for (const k of ['inputAudio', 'outputAudio', 'inputText', 'outputText']) row[k] += t?.[k] || 0;
    row.cachedInput += (t?.inputCachedAudio || 0) + (t?.inputCachedText || 0);
    for (const m of call.cost.models || []) if (m.model) row.models.add(m.model);
    if (call.aiVoice?.model) row.models.add(call.aiVoice.model);
    const complete = !call.cost.unpriced && call.cost.currency === 'USD' && call.cost.source !== 'none';
    if (!complete) row.unpricedCalls += 1;
    // Reported totals may have no model-only split; keep them separate.
    if (complete && call.cost.source === 'provider_reported') { row.reportedCostUsd += call.cost.amount; row.reportedCalls += 1; }
    else if (complete) {
      row.calculatedCalls += 1;
      row.calculatedCostUsd += call.cost.components?.model || 0;
      const d = call.cost.components?.modelDetail || {};
      row.audioInputCostUsd += d.audioIn || 0; row.audioOutputCostUsd += d.audioOut || 0;
      row.textInputCostUsd += d.textIn || 0; row.textOutputCostUsd += d.textOut || 0;
    }
    const samples = call.quality?.latency?.samplesMs || [];
    for (const ms of samples) if (Number.isFinite(ms) && ms >= 0) { row.latencySum += ms; row.latencySamples += 1; }
    row.validAnswers += call.behavior?.answers?.valid || 0;
    row.attemptedAnswers += call.behavior?.answers?.total || 0;
    if (call.qualification === 'qualified') row.qualifiedLeads.add(call.leadId);
    const date = new Date(call.at).toISOString();
    for (const [map, period] of [[days, date.slice(0, 10)], [months, date.slice(0, 7)]]) {
      const key = `${period}:${provider}`;
      const bucket = map.get(key) || { period, provider, calls: 0, calculatedCostUsd: 0, reportedCostUsd: 0, unpricedCalls: 0 };
      bucket.calls += 1;
      if (!complete) bucket.unpricedCalls += 1;
      else if (call.cost.source === 'provider_reported') bucket.reportedCostUsd += call.cost.amount;
      else bucket.calculatedCostUsd += call.cost.components?.model || 0;
      map.set(key, bucket);
    }
    groups.set(provider, row);
  }
  const total = [...groups.values()].reduce((s, r) => s + r.calls, 0);
  return {
    providers: [...groups.values()].map(({ latencySum, latencySamples, qualifiedLeads, models, ...row }) => ({
      ...row, models: [...models], qualifiedLeads: qualifiedLeads.size,
      distribution: ratio(row.calls, total), averageLatencyMs: ratio(latencySum, latencySamples), latencySamples,
      qualificationCompletionRate: ratio(row.validAnswers, row.attemptedAnswers),
      qualificationAccuracy: null, // Requires independent human-labelled outcomes.
      calculatedCostPerMinute: row.unpricedCalls || row.reportedCalls ? null : ratio(row.calculatedCostUsd, row.seconds / 60),
      calculatedCostPerConnectedMinute: row.unpricedCalls || row.reportedCalls ? null : ratio(row.calculatedCostUsd, row.connectedSeconds / 60),
      calculatedCostPerQualifiedLead: row.unpricedCalls || row.reportedCalls ? null : ratio(row.calculatedCostUsd, qualifiedLeads.size),
    })),
    daily: [...days.values()].sort((a, b) => a.period.localeCompare(b.period)),
    monthly: [...months.values()].sort((a, b) => a.period.localeCompare(b.period)),
    errors: ['gemini', 'openai'].map(provider => ({ provider, count: calls.filter(c => !c.isTest).reduce((sum, c) => sum + (c.aiVoice?.attempts || []).filter(a => a.provider === provider && a.status !== 'established').length, 0) })),
    estimatedSavings: null, savingsStatus: 'requires_equivalent_measured_baseline', invoiceVerified: false,
  };
}
