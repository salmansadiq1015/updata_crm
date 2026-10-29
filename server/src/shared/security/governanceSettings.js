/**
 * Platform-governance settings, read from the environment at call time.
 *
 * The values are validated (and defaulted) at startup by config/schema.js; they
 * are re-read here on each call so an operator flip + restart is the only way to
 * change them in production, while tests can toggle them per case. Every default
 * preserves the behaviour that existed before governance was introduced:
 *   LEAD_ACCESS_MODE=company      → every lead:read user sees every lead
 *   PII_MASKING_ENABLED=false     → phone/e-mail are returned unmasked
 *   SIM_SMS_COST_PER_MESSAGE=''   → SIM SMS cost is "not recorded"
 */
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

function bool(raw, fallback) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return fallback;
}

function num(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function getGovernanceSettings(env = process.env) {
  const mode = String(env.LEAD_ACCESS_MODE ?? '').trim().toLowerCase() === 'team' ? 'team' : 'company';
  const grantMinutes = Math.min(Math.max(Math.trunc(num(env.LEAD_ACCESS_GRANT_MINUTES) ?? 30), 1), 480);
  return {
    leadAccessMode: mode,
    teamMode: mode === 'team',
    accessReasonRequired: bool(env.LEAD_ACCESS_REASON_REQUIRED, true),
    accessGrantMinutes: grantMinutes,
    piiMaskingEnabled: bool(env.PII_MASKING_ENABLED, false),
    simSmsCostPerMessage: num(env.SIM_SMS_COST_PER_MESSAGE),
    simSmsCostCurrency: (String(env.SIM_SMS_COST_CURRENCY || 'CHF').trim().toUpperCase() || 'CHF').slice(0, 3),
  };
}

export default getGovernanceSettings;
