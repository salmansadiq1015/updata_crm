/**
 * The seven handoffs, exercised as one job's life.
 *
 * Nothing here talks to the assistant, and that is the point. Every step is an
 * ERP call the office makes anyway — quote, accept, open, order, schedule,
 * file a paper, book a supplier invoice, report it finished — and what is
 * checked is that an agent woke up on its own at each step and left something
 * a person can act on.
 *
 * The scenario suite next door covers what the agents do when asked. This
 * covers what they do when nobody asks, which is where the specification's ten
 * handoffs live and where nothing on screen would ever tell you they failed.
 *
 * Usage:
 *   node tests/e2e/agent-handoffs.mjs
 *
 * Needs a running server, Mongo and Redis. Costs no AI calls: the handoffs are
 * plain business logic. Writes real records, every one prefixed ZZTEST and
 * removed at the end. Never point it at production.
 */
const API = `${process.env.API || 'http://localhost:9097/api/v1'}`;
const ROOT = new URL('../..', import.meta.url).pathname;
const { default: mongoose } = await import(`${ROOT}/node_modules/mongoose/index.js`);

let token = null;
async function api(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: raw ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text).data : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mongoose.connect('mongodb://localhost:27017/mb_boiler');
const db = mongoose.connection.db;
const login = await api('/auth/login', {
  method: 'POST',
  body: {
    email: process.env.AI_TEST_EMAIL || 'admin@appnity.ch',
    password: process.env.AI_TEST_PASSWORD || 'admin121',
  },
});
token = login.accessToken;
const me = String(login.user?._id || login.user?.id);

// A run that stopped halfway leaves records behind; clear them first.
for (const collection of ['tasks', 'projects', 'quotations', 'orders', 'customers', 'apinvoices']) {
  await db.collection(collection).deleteMany({ $or: [{ name: /ZZTEST/i }, { title: /ZZTEST/i }, { supplierName: /ZZTEST/i }] });
}

const started = new Date();
const results = [];
const trash = { projects: [], quotations: [], orders: [], customers: [], apInvoices: [] };

/** Waits for the task an agent leaves behind. */
async function expectTask(label, pattern, seconds = 25) {
  let task = null;
  for (let i = 0; i < seconds * 2 && !task; i += 1) {
    task = await db.collection('tasks').findOne({ title: pattern, isDeleted: { $ne: true }, createdAt: { $gte: started } });
    if (!task) await sleep(500);
  }
  results.push({ label, ok: Boolean(task), detail: task ? task.title : 'keine Aufgabe' });
  console.log(`  ${task ? '✓' : '✗'} ${label}${task ? ` — „${task.title}"` : ''}`);
  if (task) console.log(`      ${task.description.split('\n').filter(Boolean)[0].slice(0, 110)}`);
  return task;
}

// An object with no plant recorded: Behörden AI only speaks when data is
// missing, so a fully recorded one would (rightly) produce silence.
const sitesWithoutPlant = await db.collection('sites').aggregate([
  { $match: { isDeleted: { $ne: true }, postalCode: { $ne: null }, customerId: { $ne: null } } },
  { $lookup: { from: 'installations', localField: '_id', foreignField: 'siteId', as: 'plants' } },
  { $match: { plants: { $size: 0 } } },
  { $limit: 1 },
]).toArray();
const site = sitesWithoutPlant[0];
if (!site) throw new Error('no object without a recorded plant — Behörden AI would have nothing to report');
const customerId = String(site.customerId);
const customer = await db.collection('customers').findOne({ _id: site.customerId }, { projection: { name: 1 } });
const department = await db.collection('departments').findOne({ scopeQop: true });

// ─── 1. Offerte angenommen → Projekt AI ──────────────────────────
console.log('\n▸ 1. Offerte stellen und annehmen');
const quotation = await api('/qop/quotations', {
  method: 'POST',
  body: {
    title: 'ZZTEST Erdsonden-Wärmepumpe Pilot',
    customerId,
    customerName: customer.name,
    departmentId: String(department._id),
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
    lineItems: [{
      position: 1,
      type: 'material',
      description: 'Erdsonden-Wärmepumpe inkl. Bohrung',
      quantity: 1,
      unitPrice: 42000,
      unit: 'STK',
      vatRate: 8.1,
    }],
  },
});
trash.quotations.push(quotation._id);
await api(`/qop/quotations/${quotation._id}/status`, { method: 'PATCH', body: { targetStatus: 'SENT' } });
await api(`/qop/quotations/${quotation._id}/status`, { method: 'PATCH', body: { targetStatus: 'ACCEPTED' } });
await expectTask('Projekt AI auf „Offerte angenommen"', /^Projekt eröffnen: ZZTEST/);

// ─── 2. Projekt eröffnet → Behörden AI ───────────────────────────
console.log('\n▸ 2. Projekt eröffnen');
const project = await api('/pm/projects', {
  method: 'POST',
  body: {
    name: 'ZZTEST Erdsonde Pilot',
    description: 'Erdsonden-Wärmepumpe mit Bohrung, Ersatz Ölheizung.',
    projectType: 'NEW_INSTALLATION',
    customerId,
    siteId: String(site._id),
    projectManagerId: me,
    plannedStartDate: new Date(Date.now() + 14 * 86400000).toISOString(),
  },
});
trash.projects.push(project._id);
await expectTask('Behörden AI auf „Projekt eröffnet"', /^Behördenangaben vervollständigen: ZZTEST/);

// ─── 3. Baustart geplant → Material AI ───────────────────────────
console.log('\n▸ 3. Auftrag mit Material, dann Baustart planen');
const article = await db.collection('articles').findOne({ type: 'MATERIAL' });
const order = await api('/qop/orders', {
  method: 'POST',
  body: {
    title: 'ZZTEST Pilot Auftrag',
    customerId,
    customerName: customer.name,
    departmentId: String(department._id),
    projectId: String(project._id),
    lineItems: [{
      position: 1,
      type: 'material',
      description: article.name,
      articleNumber: article.articleNumber,
      catalogSnapshot: { articleNumber: article.articleNumber, articleName: article.name, unitOfMeasure: article.unitOfMeasure || 'STK' },
      quantity: 1,
      unitPrice: 4200,
      unit: article.unitOfMeasure || 'STK',
      vatRate: 8.1,
    }],
  },
});
trash.orders.push(order._id);
await api(`/pm/projects/${project._id}/status`, { method: 'POST', body: { targetStatus: 'SCHEDULED' } });
await expectTask('Material AI auf „Baustart geplant"', /^Material vor Baustart klären: ZZTEST/);

// ─── 4. Dokument abgelegt → Document AI ──────────────────────────
console.log('\n▸ 4. Dokument ablegen, dessen Name nichts sagt');
const boundary = '----zztestpilot';
const filePart = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="file"; filename="scan0042.pdf"',
  'Content-Type: application/pdf',
  '',
  '%PDF-1.3 ZZTEST',
  `--${boundary}`,
  'Content-Disposition: form-data; name="category"',
  '',
  'OTHER',
  `--${boundary}--`,
  '',
].join('\r\n');
await fetch(`${API}/pm/projects/${project._id}/documents`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body: filePart,
}).then(async (r) => { if (!r.ok) console.log(`      (Upload: ${r.status} ${(await r.text()).slice(0, 160)})`); });
await expectTask('Document AI auf „Neues Dokument"', /^Dokument (unklar|einordnen): scan0042/);

// ─── 5. Eingangsrechnung erfasst → Finanz AI ─────────────────────
console.log('\n▸ 5. Lieferantenrechnung ohne IBAN erfassen');
const supplier = await api('/crm/customers', {
  method: 'POST',
  body: { name: 'ZZTEST Tobler Haustechnik', type: 'supplier', street: 'Steinackerstrasse 10', postalCode: '8302', city: 'Kloten', canton: 'ZH' },
});
trash.customers.push(supplier._id);
const apInvoice = await api('/accounting/ap/invoices', {
  method: 'POST',
  body: {
    supplierId: String(supplier._id),
    supplierName: 'ZZTEST Tobler Haustechnik',
    supplierInvoiceNumber: 'ZZTEST-RG-4711',
    invoiceDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    lineItems: [{ description: 'Erdsonden-Wärmepumpe', quantity: 1, unitPrice: 21000, taxRate: 8.1 }],
  },
});
trash.apInvoices.push(apInvoice._id);
await expectTask('Finanz AI auf „Eingangsrechnung erfasst"', /^Zahlungsdaten prüfen: ZZTEST/);

// ─── 6. Wartung überfällig → Service AI ──────────────────────────
console.log('\n▸ 6. Den täglichen Wartungslauf auslösen');
// The job publishes only when an interval CROSSES into overdue — that is what
// makes a nightly run idempotent. So one plant is put back a day, the way the
// calendar would do it overnight.
const interval = await db.collection('maintenanceintervals').findOne({ maintenanceStatus: 'overdue' });
const restore = interval ? { maintenanceStatus: interval.maintenanceStatus, escalated: interval.escalated } : null;
if (interval) {
  await db.collection('maintenanceintervals').updateOne(
    { _id: interval._id },
    { $set: { maintenanceStatus: 'due', escalated: false } },
  );
}
const { createRequire } = await import('node:module');
const requireFromServer = createRequire(`${ROOT}/package.json`);
const { Queue } = requireFromServer('bullmq');
const queue = new Queue('maintenance-check', { connection: { host: '127.0.0.1', port: 6379 }, prefix: 'bull' });
await queue.add('pilot-maintenance-scan', {});
await queue.close();
const serviceTask = await expectTask('Service AI auf „Wartung überfällig"', /^Serviceaufträge vorbereiten/, 40);
if (interval && restore) {
  await db.collection('maintenanceintervals').updateOne({ _id: interval._id }, { $set: restore });
}
if (serviceTask) trash.extraTasks = [serviceTask._id];

// ─── 7. Projekt abgeschlossen → Quality AI ───────────────────────
console.log('\n▸ 7. Projekt als abgeschlossen melden');
const openAgentTasks = await db.collection('tasks').countDocuments({
  projectId: new mongoose.Types.ObjectId(String(project._id)),
  'source.type': 'AI_AGENT',
  status: { $in: ['OPEN', 'IN_PROGRESS'] },
});
console.log(`  (${openAgentTasks} offene Agenten-Aufgabe(n) am Projekt — sie dürfen den Abschluss nicht aufhalten)`);
await api(`/pm/projects/${project._id}/status`, { method: 'POST', body: { targetStatus: 'COMPLETED', comment: 'ZZTEST Pilot' } });
await expectTask('Quality AI auf „Projekt abgeschlossen"', /^Abschluss unvollständig: ZZTEST/);

// ─── Die Spur, die das alles hinterlassen hat ────────────────────
const trail = await db.collection('auditlogs')
  .find({ module: 'ai', eventType: /^ai\.agent\.autonomous/, timestamp: { $gte: started } })
  .project({ eventType: 1, details: 1 }).toArray();
console.log(`\n▸ Audit-Spur: ${trail.length} Eintrag/Einträge`);
for (const entry of trail) {
  console.log(`  ${entry.details.agentKey.padEnd(11)} ${entry.details.trigger.padEnd(24)} → ${entry.details.produced?.title?.slice(0, 46) || entry.details.blockReason}`);
}

// ─── Aufräumen ───────────────────────────────────────────────────
console.log('\n▸ Aufräumen');
const oid = (v) => new mongoose.Types.ObjectId(String(v));
let removed = 0;
for (const id of trash.projects) {
  removed += (await db.collection('tasks').deleteMany({ projectId: oid(id) })).deletedCount;
  removed += (await db.collection('projectdocuments').deleteMany({ projectId: oid(id) })).deletedCount;
  await db.collection('projectstatushistories').deleteMany({ projectId: oid(id) });
  await db.collection('projects').deleteOne({ _id: oid(id) });
  removed += 1;
}
for (const [collection, ids] of [['quotations', trash.quotations], ['orders', trash.orders], ['customers', trash.customers], ['apinvoices', trash.apInvoices]]) {
  for (const id of ids) removed += (await db.collection(collection).deleteOne({ _id: oid(id) })).deletedCount;
}
removed += (await db.collection('tasks').deleteMany({ title: /ZZTEST/i })).deletedCount;
removed += (await db.collection('tasks').deleteMany({ title: /^Serviceaufträge vorbereiten/, createdAt: { $gte: started } })).deletedCount;
console.log(`  ${removed} Datensätze entfernt`);

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} Übergaben haben ausgelöst.`);
await mongoose.disconnect();
process.exit(passed === results.length ? 0 : 1);
