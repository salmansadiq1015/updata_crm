import client from 'prom-client';

/**
 * AI calling Prometheus metrics (default registry → served by /metrics).
 * Labels are low-cardinality enums only — never phone numbers, lead or call ids.
 */
export const aiCallEventsTotal = new client.Counter({
  name: 'updata_ai_call_events_total',
  help: 'AI calling lifecycle events (dispatch outcomes, terminal dispositions, reconciliation actions)',
  labelNames: ['event', 'outcome'],
});

export const aiCallDurationSeconds = new client.Histogram({
  name: 'updata_ai_call_duration_seconds',
  help: 'Duration of answered AI calls in seconds',
  buckets: [15, 30, 60, 120, 180, 300, 600, 1200],
});

export const aiCallDispatchLatencySeconds = new client.Histogram({
  name: 'updata_ai_call_dispatch_latency_seconds',
  help: 'Time for the telephony provider to accept/reject an outbound call request',
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 15],
});

/** Best-effort: metrics must never break a call path. */
export function recordCallMetric(event, outcome = 'none') {
  try { aiCallEventsTotal.inc({ event, outcome: String(outcome || 'none') }); } catch { /* ignore */ }
}

export function observeDuration(seconds) {
  try { if (seconds > 0) aiCallDurationSeconds.observe(seconds); } catch { /* ignore */ }
}

export function observeDispatchLatency(ms) {
  try { aiCallDispatchLatencySeconds.observe(ms / 1000); } catch { /* ignore */ }
}
