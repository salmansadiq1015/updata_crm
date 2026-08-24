/**
 * Shared risk vocabulary for every AI agent.
 *
 * Implements the transverse requirements of the 09.05.2026 specification:
 * four risk levels, twelve standard blocking reasons, and the doctrine that
 * a binding action is never carried out without human approval
 * ("kontrollierter Prozessagent").
 *
 * Risk AI itself may only block, warn, escalate and document — it never
 * approves. Approval always comes from a person.
 */

/** Four risk levels, in ascending order of consequence. */
export const RISK_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

export const RISK_LEVEL_ORDER = Object.freeze([
  RISK_LEVELS.LOW,
  RISK_LEVELS.MEDIUM,
  RISK_LEVELS.HIGH,
  RISK_LEVELS.CRITICAL,
]);

/** German labels, shown to the office staff in the confirmation prompt. */
export const RISK_LEVEL_LABELS = Object.freeze({
  [RISK_LEVELS.LOW]: 'Intern — wird direkt ausgeführt',
  [RISK_LEVELS.MEDIUM]: 'Kundenkontakt oder Termin — Freigabe erforderlich',
  [RISK_LEVELS.HIGH]: 'Offerte, Rechnung oder Behördendokument — Freigabe erforderlich',
  [RISK_LEVELS.CRITICAL]: 'Zahlung, Bankdaten, Einreichung oder Löschung — Freigabe erforderlich',
});

/**
 * The twelve standard blocking reasons. An agent sets one of these instead of
 * acting when it cannot proceed responsibly.
 */
export const BLOCK_REASONS = Object.freeze({
  MISSING_REQUIRED_DATA: 'MISSING_REQUIRED_DATA',
  MISSING_DOCUMENT: 'MISSING_DOCUMENT',
  UNCLEAR_RESPONSIBILITY: 'UNCLEAR_RESPONSIBILITY',
  UNCLEAR_CUSTOMER: 'UNCLEAR_CUSTOMER',
  UNCLEAR_PROJECT: 'UNCLEAR_PROJECT',
  MISSING_PRICE: 'MISSING_PRICE',
  MISSING_PERMIT: 'MISSING_PERMIT',
  MISSING_APPROVAL: 'MISSING_APPROVAL',
  CONTRADICTORY_DATA: 'CONTRADICTORY_DATA',
  LEGAL_PROCESS: 'LEGAL_PROCESS',
  PAYMENT_OR_BANK_DATA: 'PAYMENT_OR_BANK_DATA',
  INSUFFICIENT_RIGHTS: 'INSUFFICIENT_RIGHTS',
});

export const BLOCK_REASON_LABELS = Object.freeze({
  [BLOCK_REASONS.MISSING_REQUIRED_DATA]: 'Pflichtdaten fehlen',
  [BLOCK_REASONS.MISSING_DOCUMENT]: 'Dokument fehlt',
  [BLOCK_REASONS.UNCLEAR_RESPONSIBILITY]: 'Zuständigkeit unklar',
  [BLOCK_REASONS.UNCLEAR_CUSTOMER]: 'Kunde unklar',
  [BLOCK_REASONS.UNCLEAR_PROJECT]: 'Projekt unklar',
  [BLOCK_REASONS.MISSING_PRICE]: 'Preis fehlt',
  [BLOCK_REASONS.MISSING_PERMIT]: 'Bewilligung fehlt',
  [BLOCK_REASONS.MISSING_APPROVAL]: 'Freigabe fehlt',
  [BLOCK_REASONS.CONTRADICTORY_DATA]: 'Datengrundlage widersprüchlich',
  [BLOCK_REASONS.LEGAL_PROCESS]: 'Rechtlich relevanter Prozess betroffen',
  [BLOCK_REASONS.PAYMENT_OR_BANK_DATA]: 'Zahlung oder Bankdaten betroffen',
  [BLOCK_REASONS.INSUFFICIENT_RIGHTS]: 'Benutzerrechte nicht ausreichend',
});

/**
 * Risk level per agent action. Anything absent from this map is treated as
 * CRITICAL: an unclassified action is never executed silently.
 */
const ACTION_RISK = Object.freeze({
  // Internal, reversible bookkeeping.
  CREATE_TASK: RISK_LEVELS.LOW,
  UPDATE_TASK: RISK_LEVELS.LOW,
  CREATE_NOTE: RISK_LEVELS.LOW,
  CREATE_TASK_REMINDER: RISK_LEVELS.LOW,
  RECORD_TIME: RISK_LEVELS.LOW,
  CREATE_REPORT: RISK_LEVELS.LOW,
  UPDATE_REPORT: RISK_LEVELS.LOW,
  UPDATE_PROJECT: RISK_LEVELS.LOW,
  CREATE_CUSTOMER: RISK_LEVELS.LOW,
  UPDATE_CUSTOMER: RISK_LEVELS.LOW,
  UPDATE_ORDER: RISK_LEVELS.LOW,
  ANALYZE_WORKFORCE: RISK_LEVELS.LOW,
  ANALYZE_FIELD_TICKET: RISK_LEVELS.LOW,

  // Reads never mutate anything.
  SEARCH_CUSTOMER: RISK_LEVELS.LOW,
  SEARCH_CUSTOMERS: RISK_LEVELS.LOW,
  SEARCH_TASKS: RISK_LEVELS.LOW,
  SEARCH_PROJECTS: RISK_LEVELS.LOW,
  SEARCH_ORDERS: RISK_LEVELS.LOW,
  SEARCH_REPORTS: RISK_LEVELS.LOW,
  SEARCH_DOCUMENTS: RISK_LEVELS.LOW,
  SUMMARIZE_CHAT: RISK_LEVELS.LOW,
  SALES_FOLLOWUPS: RISK_LEVELS.LOW,
  QUALITY_CHECK: RISK_LEVELS.LOW,
  SERVICE_DUE: RISK_LEVELS.LOW,
  SERVICE_BRIEFING: RISK_LEVELS.LOW,
  PERMIT_CHECK: RISK_LEVELS.LOW,
  DISPATCH_CHECK: RISK_LEVELS.LOW,
  DISPATCH_SUGGEST: RISK_LEVELS.LOW,
  GENERAL: RISK_LEVELS.LOW,

  // These pull a whole cascade in behind them — a project opens its checklist,
  // an order starts the commercial chain — so they get one look before they
  // exist. Master data (customer, task, note) stays direct: it is cheap to fix
  // and the voice address capture depends on it.
  CREATE_PROJECT: RISK_LEVELS.MEDIUM,
  CREATE_ORDER: RISK_LEVELS.MEDIUM,

  // Reaches a customer or commits a slot in someone's calendar.
  SEND_CHAT: RISK_LEVELS.MEDIUM,
  SEND_NOTIFICATION: RISK_LEVELS.MEDIUM,
  CREATE_ASSIGNMENT: RISK_LEVELS.MEDIUM,
  RESCHEDULE_ASSIGNMENT: RISK_LEVELS.MEDIUM,

  // Commercially or legally binding once it leaves the house.
  CREATE_QUOTATION: RISK_LEVELS.HIGH,
  CREATE_INVOICE: RISK_LEVELS.HIGH,

  // Irreversible, or touching money and rights.
  DELETE_CUSTOMER: RISK_LEVELS.CRITICAL,
  DELETE_TASK: RISK_LEVELS.CRITICAL,
  DELETE_PROJECT: RISK_LEVELS.CRITICAL,
  DELETE_ORDER: RISK_LEVELS.CRITICAL,
  DELETE_REPORT: RISK_LEVELS.CRITICAL,
  DELETE_ASSIGNMENT: RISK_LEVELS.CRITICAL,
});

/** Actions at or above this level need a person to approve them. */
export const APPROVAL_THRESHOLD = RISK_LEVELS.MEDIUM;

export function riskLevelFor(action) {
  return ACTION_RISK[action] || RISK_LEVELS.CRITICAL;
}

export function requiresApproval(action) {
  const level = riskLevelFor(action);
  return RISK_LEVEL_ORDER.indexOf(level) >= RISK_LEVEL_ORDER.indexOf(APPROVAL_THRESHOLD);
}

/**
 * Standard shape returned by an agent that refuses to act. Never an error:
 * a block is a legitimate, documented outcome.
 */
export function blocked(action, reason, { message, details = {} } = {}) {
  return {
    action,
    status: 'blocked',
    blockReason: reason,
    message: message || `Blockiert: ${BLOCK_REASON_LABELS[reason] || reason}`,
    riskLevel: riskLevelFor(action),
    details,
  };
}
