import type { AnalyzedCall } from './types/ai-calling-types';

/** Match recorded scenarios; normalize duration, never infer monthly traffic. */
export function compareCallCosts(before?: AnalyzedCall, after?: AnalyzedCall, monthlyMinutes?: number) {
  if (!before || !after || before.id === after.id) return null;
  const a = before.costDiagnostics?.configuration; const b = after.costDiagnostics?.configuration;
  if (!a?.questionnaireFingerprint || a.questionnaireFingerprint !== b?.questionnaireFingerprint
    || before.leadId !== after.leadId || before.provider !== after.provider || before.isTest !== after.isTest
    || before.cost.model !== after.cost.model || before.cost.currency !== after.cost.currency
    || !before.cost.rates || !after.cost.rates
    || [...new Set([...Object.keys(before.cost.rates), ...Object.keys(after.cost.rates)])].some(k => before.cost.rates?.[k] !== after.cost.rates?.[k])
    || before.disposition !== 'answered_completed' || after.disposition !== 'answered_completed'
    || before.behavior.answers.valid !== after.behavior.answers.valid
    || before.behavior.answers.total !== after.behavior.answers.total
    || ['voice', 'language', 'allowBargeIn', 'maxResponseOutputTokens'].some(k => a[k] !== b?.[k])
    || JSON.stringify(a.turnDetection) !== JSON.stringify(b?.turnDetection)
    || before.cost.unpriced || after.cost.unpriced || before.cost.source !== 'token_usage' || after.cost.source !== 'token_usage'
    || before.durationSeconds <= 0 || after.durationSeconds <= 0) return null;
  const previous = before.cost.amount * 60 / before.durationSeconds;
  const current = after.cost.amount * 60 / after.durationSeconds;
  return { previous, current, reduction: previous - current,
    percent: previous > 0 ? (previous - current) * 100 / previous : null,
    monthly: Number.isFinite(monthlyMinutes) && monthlyMinutes! > 0 ? (previous - current) * monthlyMinutes! : null };
}
