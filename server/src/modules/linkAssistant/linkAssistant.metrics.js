import client from 'prom-client';

/**
 * SMS link assistant Prometheus metrics (default registry → /metrics). Labels are
 * low-cardinality enums only — never tokens, lead ids or message text.
 */
const existing = (name) => client.register.getSingleMetric(name);

export const linkEventsTotal = existing('updata_link_assistant_events_total') || new client.Counter({
  name: 'updata_link_assistant_events_total',
  help: 'SMS link assistant events (link issued/opened, chat started/completed/opted out, model failures, spend cap)',
  labelNames: ['event'],
});

export const linkTurnSeconds = existing('updata_link_assistant_turn_seconds') || new client.Histogram({
  name: 'updata_link_assistant_turn_seconds',
  help: 'Time to the first reply event of a customer turn, by reply source (model / template)',
  labelNames: ['source'],
  buckets: [0.05, 0.1, 0.25, 0.5, 0.8, 1.5, 3, 6],
});

export const linkCostTotal = existing('updata_link_assistant_model_cost_total') || new client.Counter({
  name: 'updata_link_assistant_model_cost_total',
  help: 'Estimated language-model cost of the SMS link assistant (USD)',
});

/** Best-effort: metrics must never break a customer turn. */
export function linkEvent(event) {
  try { linkEventsTotal.inc({ event }); } catch { /* ignore */ }
}
export function observeFirstReply(ms, source) {
  try { linkTurnSeconds.observe({ source }, ms / 1000); } catch { /* ignore */ }
}
export function addCost(amount) {
  try { if (amount > 0) linkCostTotal.inc(amount); } catch { /* ignore */ }
}
