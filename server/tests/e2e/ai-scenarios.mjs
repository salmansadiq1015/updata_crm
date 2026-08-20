/**
 * End-to-end scenarios for the AI agent, run against a live server.
 *
 * The unit suites mock the LLM, the database and the governance layer, so they
 * cannot see the failures that actually reached the client: a question that
 * created a record, a mangled title, a customer the agent failed to resolve, a
 * half-English prompt. Those only show up when the whole chain runs for real.
 *
 * Usage:
 *   node tests/e2e/ai-scenarios.mjs                 # all scenarios
 *   node tests/e2e/ai-scenarios.mjs --only=question # substring filter on names
 *   API=http://localhost:9097/api/v1 node tests/e2e/ai-scenarios.mjs
 *
 * Costs real OpenAI calls and writes real records — every record it creates is
 * prefixed ZZTEST and deleted at the end. Never point it at production.
 */
import process from 'node:process';

const API = process.env.API || 'http://localhost:9097/api/v1';
const EMAIL = process.env.AI_TEST_EMAIL || 'admin@appnity.ch';
const PASSWORD = process.env.AI_TEST_PASSWORD || 'admin121';
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);

// Words that must never appear in what the office reads. The agent speaks German.
const ENGLISH_LEAKS = [
  'Task created', 'Found ', 'created for', 'I can ', 'I need more information',
  'Draft quotation', 'Project ', 'Please confirm', 'but I need',
];

let token = null;
const createdRuns = [];
const createdRecords = [];
const results = [];

/** Scenarios register what they created so the runner can delete it. */
function track(type, id) {
  if (id) createdRecords.push({ type, id });
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, body: json };
}

async function login() {
  const res = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`Login failed (${res.status}). Is the server running on ${API}?`);
  token = res.body.data.accessToken;
}

/** Dispatches one message and waits for the run to settle. */
async function run(input, { confirm = false } = {}) {
  const dispatched = await api('/ai/agent/run', { method: 'POST', body: { input } });
  if (dispatched.status !== 202) throw new Error(`dispatch failed: ${dispatched.status}`);
  const runId = dispatched.body.data.agentRunId;
  createdRuns.push(runId);

  let state = await settle(runId);

  if (confirm && state.status === 'AWAITING_CONFIRMATION') {
    await api(`/ai/agent/${runId}/confirm`, { method: 'POST', body: { decision: true } });
    state = await settle(runId, 'AWAITING_CONFIRMATION');
  }
  return state;
}

async function settle(runId, notStatus = null) {
  const deadline = Date.now() + 60_000;
  let last = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await api(`/ai/agent/${runId}`);
    last = res.body?.data;
    const status = last?.status;
    if (!status) continue;
    if (status === notStatus) continue;
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_CONFIRMATION'].includes(status)) return last;
  }
  throw new Error(`run ${runId} did not settle in time (last status ${last?.status})`);
}

// ─── Assertions ───────────────────────────────────────────────

function check(label, condition, detail = '') {
  return { label, ok: Boolean(condition), detail: condition ? '' : detail };
}

function action(state) {
  return state?.output?.action || null;
}

function message(state) {
  return String(state?.output?.message || '');
}

function noEnglish(state) {
  const text = message(state);
  const hit = ENGLISH_LEAKS.find((word) => text.includes(word));
  return check('Antwort auf Deutsch', !hit, hit ? `enthält « ${hit} » : ${text.slice(0, 90)}` : '');
}

// ─── Scenarios ────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: 'question-tasks-does-not-create',
    why: 'Eine Frage darf niemals Daten anlegen.',
    async exec() {
      const state = await run('Wie viele offene Aufgaben gibt es aktuell?');
      return [
        check('liest statt anzulegen', String(action(state)).startsWith('SEARCH'), `action = ${action(state)}`),
        check('kein Datensatz erzeugt', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'question-projects-does-not-create',
    why: 'Gleiche Regel für Projekte.',
    async exec() {
      const state = await run('Welche Projekte laufen gerade?');
      return [
        check('liest statt anzulegen', String(action(state)).startsWith('SEARCH'), `action = ${action(state)}`),
        check('kein Datensatz erzeugt', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
      ];
    },
  },
  {
    name: 'task-attributes-extracted',
    why: 'Titel, Priorität und Fälligkeit müssen sauber übernommen werden.',
    async exec() {
      const state = await run('Erstelle eine Aufgabe ZZTEST Boiler entkalken für morgen mit hoher Priorität', { confirm: true });
      const record = state.output?.record || {};
      track('task', record.id);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      return [
        check('Aufgabe angelegt', action(state) === 'CREATE_TASK', `action = ${action(state)}`),
        check('Titel sauber', record.title === 'ZZTEST Boiler entkalken', `titre = « ${record.title} »`),
        check('Priorität HIGH', record.priority === 'HIGH', `priorité = ${record.priority}`),
        check('Fälligkeit morgen', String(record.dueDate || '').slice(0, 10) === tomorrow, `échéance = ${record.dueDate}`),
      ];
    },
  },
  {
    name: 'project-requires-approval',
    why: 'Ein Projekt zieht eine ganze Checkliste nach sich — erst Freigabe.',
    async exec() {
      const state = await run('Erstelle ein Projekt ZZTEST Freigabe für Kunde Immobilien Verwaltung');
      return [
        check('Freigabe verlangt', state.status === 'AWAITING_CONFIRMATION', `status = ${state.status}`),
        check('Risikostufe gesetzt', Boolean(state.output?.riskLevel), `risiko = ${state.output?.riskLevel}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'customer-resolved-from-name',
    why: 'Der genannte Kunde muss gefunden werden, ohne Rückfrage.',
    async exec() {
      const state = await run('Erstelle ein Projekt für Kunde Immobilien Verwaltung, Name: ZZTEST Kundenerkennung', { confirm: true });
      const record = state.output?.record || {};
      track('project', record.id);
      return [
        check('Projekt angelegt', action(state) === 'CREATE_PROJECT', `action = ${action(state)}`),
        check('Kunde erkannt', /Immobilien Verwaltung/i.test(record.customerName || ''), `client = ${record.customerName}`),
        check('Projektname übernommen', /ZZTEST Kundenerkennung/i.test(record.name || ''), `nom = ${record.name}`),
        check('Checkliste angelegt', (record.tasks || []).length > 0, 'aucune tâche de checklist'),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'missing-field-named-in-german',
    why: 'Fehlt etwas, muss der Assistent sagen WAS — auf Deutsch.',
    async exec() {
      const state = await run('Erstelle ein Projekt ZZTEST Ohne Kunde', { confirm: true });
      const text = message(state);
      return [
        check('Rückfrage statt Fehler', state.output?.status === 'needs_follow_up', `status = ${state.output?.status}`),
        check('nennt das fehlende Feld', /Kunde/i.test(text), `message = ${text.slice(0, 90)}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'notification-requires-approval',
    why: 'Nichts erreicht Menschen ohne Freigabe.',
    async exec() {
      const state = await run('Sende eine Benachrichtigung an das Team über die Wartung am Montag');
      return [
        check('Freigabe verlangt', state.status === 'AWAITING_CONFIRMATION', `status = ${state.status}`),
        check('nichts versendet', !state.output?.sent, `sent = ${state.output?.sent}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'general-question-answered',
    why: 'Allgemeine Fragen werden beantwortet, nicht ausgeführt.',
    async exec() {
      const state = await run('Was kannst du alles für mich tun?');
      return [
        check('konversationell beantwortet', state.workflowType === 'GENERAL', `workflow = ${state.workflowType}`),
        check('Antwort nicht leer', message(state).length > 30, `longueur = ${message(state).length}`),
        check('Antwort auf Deutsch', /[äöüß]|\b(und|der|die|das|Sie|Ihnen|kann|können|bitte|Bitte)\b/.test(message(state)), message(state).slice(0, 80)),
        check('Sie-Form statt du', !/\b(du|dir|dich|deine?|teile mir)\b/i.test(message(state)), message(state).slice(0, 80)),
      ];
    },
  },
  {
    name: 'offerte-nine-blocks',
    why: 'Offerte AI muss die neun Blöcke füllen und Preise offen lassen.',
    async exec() {
      const dictation = 'Erstelle eine Offerte für Kunde Immobilien Verwaltung. '
        + 'Bei der Besichtigung: die alte Ölheizung ist 22 Jahre alt und soll durch eine '
        + 'Luft-Wasser-Wärmepumpe ersetzt werden. Der Kunde will weg vom Öl. Der Öltank muss '
        + 'demontiert und entsorgt werden. Eine Kernbohrung für die Leitungen ist nötig. '
        + 'Ein neuer Hygienespeicher wäre sinnvoll, das als Option. Elektroarbeiten bauseits. '
        + 'Schallschutz muss noch geprüft werden. Preise für die Wärmepumpe fehlen mir noch.';
      const state = await run(dictation, { confirm: true });
      const record = state.output?.record || {};
      track('quotation', record.id);
      return [
        check('Offerte angelegt', action(state) === 'CREATE_QUOTATION', `action = ${action(state)}`),
        check('Positionen erkannt', (record.positions || 0) > 0, `positions = ${record.positions}`),
        check('offene Punkte markiert', (record.openPoints || []).length > 0, 'aucun point ouvert'),
        check('fehlende Preise markiert', (record.missingPrices || []).length > 0, 'aucun prix manquant signalé'),
        check('Fachinhalte erkannt', (record.recognizedWork || []).some((w) => /Wärmepumpe/i.test(w)), `reconnus = ${(record.recognizedWork || []).join(', ')}`),
        check('Summe bleibt 0 (keine Preise erfunden)', !record.total, `total = ${record.total}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'deletion-requires-approval',
    why: 'Löschen ist kritisch und braucht immer eine Freigabe.',
    async exec() {
      const state = await run('Lösche die Aufgabe ZZTEST Boiler entkalken');
      return [
        check('Freigabe verlangt', state.status === 'AWAITING_CONFIRMATION' || state.output?.status === 'needs_follow_up',
          `status = ${state.status} / ${state.output?.status}`),
        check('nichts gelöscht', !state.output?.deleted, 'un enregistrement a été supprimé'),
      ];
    },
  },
];

// ─── Cleanup ──────────────────────────────────────────────────

const DELETE_PATH = {
  task: (id) => `/tasks/${id}`,
  project: (id) => `/pm/projects/${id}`,
  quotation: (id) => `/qop/quotations/${id}`,
};

async function cleanup() {
  let removed = 0;
  for (const item of createdRecords) {
    if (!item?.id || !DELETE_PATH[item.type]) continue;
    const res = await api(DELETE_PATH[item.type](item.id), { method: 'DELETE' });
    if (res.status < 300) removed += 1;
  }
  for (const runId of createdRuns) {
    await api(`/ai/agent/${runId}`, { method: 'DELETE' });
  }
  return removed;
}

// ─── Runner ───────────────────────────────────────────────────

async function main() {
  console.log(`AI end-to-end scenarios — ${API}\n`);
  await login();

  const selected = SCENARIOS.filter((s) => !only || s.name.includes(only));

  for (const scenario of selected) {
    process.stdout.write(`▸ ${scenario.name} … `);
    try {
      const started = Date.now();
      const checks = await scenario.exec().catch((err) => [check('Ausführung', false, err.message)]);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const failed = checks.filter((c) => !c.ok);
      console.log(failed.length ? `ÉCHEC (${seconds}s)` : `ok (${seconds}s)`);
      for (const c of checks) {
        console.log(`    ${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
      }
      if (failed.length) console.log(`    ↳ ${scenario.why}`);
      results.push({ name: scenario.name, ok: !failed.length, failed: failed.length });
    } catch (err) {
      console.log('ERREUR');
      console.log(`    ✗ ${err.message}`);
      results.push({ name: scenario.name, ok: false, failed: 1 });
    }
  }

  const removed = await cleanup();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} scénarios passés · ${removed} enregistrement(s) de test supprimé(s)`);
  if (passed !== results.length) {
    console.log('Échecs :', results.filter((r) => !r.ok).map((r) => r.name).join(', '));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nHarness failed:', err.message);
  process.exitCode = 1;
});
