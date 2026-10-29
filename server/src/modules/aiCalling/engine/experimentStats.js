import crypto from 'node:crypto';

/**
 * Script experiments — pure statistics and assignment.
 *
 * Assignment is deterministic per (lead, experiment): the same lead always lands
 * in the same arm for the lifetime of the experiment, across retries and campaigns.
 * Comparisons use a two-proportion z-test with a 95% Wald interval on the
 * difference; results are labelled underpowered instead of being over-read.
 */

/** Stable bucket in [0, 100) for a lead within an experiment. */
export function assignmentBucket(leadId, experimentId) {
  const digest = crypto.createHash('sha256').update(`${leadId}:${experimentId}`).digest();
  return (digest.readUInt32BE(0) / 0x1_0000_0000) * 100;
}

/** Pick the arm whose cumulative weight covers the lead's bucket. Weights are percentages summing to 100. */
export function assignArm(arms, leadId, experimentId) {
  const bucket = assignmentBucket(leadId, experimentId);
  let edge = 0;
  for (const arm of arms) {
    edge += Number(arm.weight) || 0;
    if (bucket < edge) return arm;
  }
  return arms[arms.length - 1] || null;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

const round = (v, d = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

/**
 * Compare variant (x2/n2) with control (x1/n1).
 * underpowered: either arm below `minSamples`, or an expected success/failure count < 5
 * (the normal approximation does not hold).
 */
export function twoProportionTest({ x1, n1, x2, n2 }, { minSamples = 30, alpha = 0.05 } = {}) {
  if (!n1 || !n2) {
    return { control: n1 ? round(x1 / n1) : null, variant: n2 ? round(x2 / n2) : null, diff: null, ciLow: null, ciHigh: null, z: null, pValue: null, underpowered: true, significant: false, n1, n2 };
  }
  const p1 = x1 / n1; const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  const se = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
  const diff = p2 - p1;
  const z = sePooled > 0 ? diff / sePooled : 0;
  const pValue = sePooled > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : 1;
  const expectedTooSmall = [n1 * pooled, n1 * (1 - pooled), n2 * pooled, n2 * (1 - pooled)].some(v => v < 5);
  const underpowered = n1 < minSamples || n2 < minSamples || expectedTooSmall;
  return {
    control: round(p1), variant: round(p2), diff: round(diff),
    ciLow: round(diff - 1.96 * se), ciHigh: round(diff + 1.96 * se),
    z: round(z, 3), pValue: round(pValue), underpowered, significant: !underpowered && pValue < alpha, n1, n2,
  };
}

/** Canonical JSON (sorted keys) → sha256, for "is this the same script?" checks. */
export function contentHash(value) {
  const canonical = (v) => {
    if (v instanceof Date) return v.toISOString();
    if (v && typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => [k, canonical(v[k])]));
    return v;
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value ?? null))).digest('hex');
}

/**
 * Guardrail check of one variant against control. Returns the breaches; empty when
 * there is not enough data in either arm (never pauses on noise from a handful of calls).
 */
export function guardrailBreaches(control, variant, guardrails) {
  const min = guardrails.minCallsPerArm ?? 30;
  if ((control?.calls || 0) < min || (variant?.calls || 0) < min) return [];
  const checks = [
    ['failureRate', guardrails.maxFailureRateIncrease],
    ['optOutRate', guardrails.maxOptOutRateIncrease],
    ['missingTranscriptRate', guardrails.maxMissingTranscriptRateIncrease],
    ['audioFailureRate', guardrails.maxAudioFailureRateIncrease],
  ];
  const breaches = [];
  for (const [metric, limit] of checks) {
    if (limit == null) continue;
    const c = control[metric]; const v = variant[metric];
    if (c == null || v == null) continue; // not recorded in one arm: no verdict
    if (v - c > limit) breaches.push({ metric, controlValue: c, variantValue: v, threshold: limit });
  }
  const latencyLimit = guardrails.maxP95LatencyIncreaseMs;
  if (latencyLimit != null && control.p95LatencyMs != null && variant.p95LatencyMs != null
    && variant.p95LatencyMs - control.p95LatencyMs > latencyLimit) {
    breaches.push({ metric: 'p95LatencyMs', controlValue: control.p95LatencyMs, variantValue: variant.p95LatencyMs, threshold: latencyLimit });
  }
  return breaches;
}
