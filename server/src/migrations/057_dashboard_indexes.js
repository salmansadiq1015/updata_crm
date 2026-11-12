import AuditLog from '../modules/auth/auditLog.model.js';
import JournalEntry from '../modules/accounting/journalEntry.model.js';
import Invoice from '../modules/qop/invoice.model.js';
import CallRecord from '../modules/aiCalling/callRecord.model.js';
import logger from '../shared/logger/index.js';

/**
 * Dashboard read paths (GET /dashboard/analytics, /dashboard/mobile-crm).
 * Purely additive and idempotent: each index is created only when no index with the same
 * key pattern exists yet. No document is modified; no existing index is dropped.
 *
 * - AuditLog window: trend + result/event/module breakdowns answered from the index alone.
 * - JournalEntry window: amount by reference type over two periods, covered.
 * - Invoice revenue window by invoiceDate (was a scan of every live invoice).
 * - CallRecord owner + endedAt: "calls completed today" without scanning the owner's history.
 */
export const name = '057_dashboard_indexes';

const INDEXES = [
  [AuditLog, { timestamp: 1, result: 1, eventType: 1, module: 1 }, { name: 'dashboard_audit_window' }],
  [JournalEntry, { entryDate: 1, referenceType: 1, amount: 1 }, { name: 'dashboard_journal_window' }],
  [Invoice, { isDeleted: 1, invoiceDate: 1 }, { name: 'dashboard_invoice_date' }],
  [CallRecord, { createdBy: 1, endedAt: 1 }, { name: 'dashboard_owner_ended' }],
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function existing(model) {
  try { return await model.collection.indexes(); } catch { return []; } // collection may not exist yet
}

export async function up() {
  for (const [model, key, options] of INDEXES) {
    if ((await existing(model)).some((i) => sameKey(i.key, key))) continue;
    await model.collection.createIndex(key, { background: true, ...options });
    logger.info('Dashboard read index created', { module: 'migration', collection: model.collection.name, key });
  }
}

export async function down() {
  for (const [model, key, options] of INDEXES) {
    // Only drop the index this migration created (matched by key AND name).
    const index = (await existing(model)).find((i) => sameKey(i.key, key) && i.name === options.name);
    if (index) await model.collection.dropIndex(index.name);
  }
}

export default { name, up, down };
