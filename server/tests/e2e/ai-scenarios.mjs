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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The gateway allows 100 requests a minute; polling many runs blows through
 * that long before anything is wrong with the agent. A global 429 is a test
 * artefact, so wait for the window and retry. The agent's own limit carries
 * AI_AGENT_RATE_LIMITED and is reported as a real failure.
 */
async function api(path, { method = 'GET', body, retries = 3 } = {}) {
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

  if (res.status === 429 && json?.error?.code !== 'AI_AGENT_RATE_LIMITED' && retries > 0) {
    process.stdout.write('⏳');
    await sleep(20_000);
    return api(path, { method, body, retries: retries - 1 });
  }
  return { status: res.status, body: json };
}

async function login() {
  const res = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`Login failed (${res.status}). Is the server running on ${API}?`);
  token = res.body.data.accessToken;
}

/**
 * Dispatches one message and waits for the run to settle.
 * Pass the threadId back in to continue a conversation — that is how the
 * office answers a follow-up question.
 */
async function run(input, { confirm = false, overrides = null, threadId } = {}) {
  const dispatched = await api('/ai/agent/run', {
    method: 'POST',
    body: { input, ...(threadId ? { threadId } : {}) },
  });
  if (dispatched.status === 429) throw new Error('agent rate limit — restart with AI_AGENT_RATE_LIMIT=200');
  if (dispatched.status !== 202) throw new Error(`dispatch failed: ${dispatched.status}`);
  const runId = dispatched.body.data.agentRunId;
  const thread = dispatched.body.data.threadId;
  createdRuns.push(runId);

  let state = await settle(runId);

  if (confirm && state.status === 'AWAITING_CONFIRMATION') {
    // What the agent proposed, kept before it is replaced by the settled run —
    // a scenario checking the preview has nowhere else to read it afterwards.
    const proposed = state.output;
    await api(`/ai/agent/${runId}/confirm`, {
      method: 'POST',
      body: { decision: true, ...(overrides ? { overrides } : {}) },
    });
    state = await settle(runId, 'AWAITING_CONFIRMATION');
    state.pending = proposed;
  }
  state.threadId = state.threadId || thread;
  return state;
}

async function settle(runId, notStatus = null) {
  const deadline = Date.now() + 90_000;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(2500);
    const res = await api(`/ai/agent/${runId}`);
    last = res.body?.data;
    const status = last?.status;
    if (!status) continue;
    if (status === notStatus) continue;
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_CONFIRMATION'].includes(status)) return last;
  }
  throw new Error(`run ${runId} did not settle in time (last status ${last?.status})`);
}

/**
 * Dictates, and if the assistant asks which record it means, answers with the
 * number — the way the office would. Exercises the whole chain rather than
 * stopping at the follow-up.
 */
async function runAnswering(input, answer = '1') {
  const first = await run(input, { confirm: true });
  if (first.output?.status !== 'needs_follow_up') return first;
  const second = await run(answer, { confirm: true, threadId: first.threadId });
  second.askedFirst = true;
  return second;
}

/**
 * Creates a project to ask questions about. Quality AI is a reader, so its
 * scenarios need a subject that already exists — built through the API, the
 * same way the office builds one.
 */
let fixtureRefs = null;
async function projectFixture(name, projectType = 'NEW_INSTALLATION') {
  if (!fixtureRefs) {
    const [me, customers] = await Promise.all([api('/users/me'), api('/crm/customers?limit=1')]);
    const list = customers.body?.data;
    const customer = (Array.isArray(list) ? list : list?.data || list?.items || [])[0];
    if (!customer) throw new Error('no customer to attach the fixture project to');
    fixtureRefs = { managerId: me.body?.data?._id || me.body?.data?.id, customerId: customer._id || customer.id };
  }
  const res = await api('/pm/projects', {
    method: 'POST',
    body: {
      name,
      projectType,
      customerId: fixtureRefs.customerId,
      projectManagerId: fixtureRefs.managerId,
    },
  });
  if (res.status >= 300) throw new Error(`fixture project failed: ${res.status} ${JSON.stringify(res.body?.error || {})}`);
  const project = res.body.data;
  track('project', project._id || project.id);
  return project;
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
    name: 'referenz-im-titel-bleibt-stehen',
    why: 'Auftragsnummern und Referenzen gehören zum Titel — das Büro sucht danach.',
    async exec() {
      const state = await run('Erstelle eine Aufgabe ZZTEST AUF-2026-0052 Nachkontrolle beim Kunden', { confirm: true });
      const record = state.output?.record || {};
      track('task', record.id);
      return [
        check('Aufgabe angelegt', action(state) === 'CREATE_TASK', `action = ${action(state)}`),
        check('Auftragsnummer erhalten', /AUF-2026-0052/.test(record.title || ''), `titre = « ${record.title} »`),
        check('Befehlswörter entfernt', !/Erstelle|Aufgabe erstellen/i.test(record.title || ''), `titre = « ${record.title} »`),
        check('Text nicht umformuliert', /Nachkontrolle beim Kunden/.test(record.title || ''), `titre = « ${record.title} »`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'lauf-traegt-seine-herkunft',
    why: 'Monate später zählt nicht, welcher Agent lief, sondern was die Antwort erzeugt hat.',
    async exec() {
      const state = await run('Wie viele offene Aufgaben gibt es?');
      const p = state.provenance || {};
      return [
        check('Version festgehalten', Boolean(p.agentVersion), `version = ${p.agentVersion}`),
        check('Modell festgehalten', Boolean(p.model), `modell = ${p.model}`),
        check('Anbieter festgehalten', Boolean(p.provider), `anbieter = ${p.provider}`),
        check('Planungsweg festgehalten', ['llm', 'heuristic', 'follow-up'].includes(p.plannedBy), `weg = ${p.plannedBy}`),
      ];
    },
  },
  {
    name: 'freigabe-mit-handkorrektur',
    why: 'Ein Vorschlag mit einem falschen Wort muss korrigierbar sein, nicht neu zu diktieren.',
    async exec() {
      const state = await run(
        'Erstelle ein Projekt ZZTEST Korrektur Original für Kunde Immobilien Verwaltung',
        { confirm: true, overrides: { title: 'ZZTEST Korrektur Freigegeben' } },
      );
      const record = state.output?.record || {};
      track('project', record.id);
      const preview = state.pending?.confirmation?.proposal || [];
      return [
        check('Vorschau vor der Freigabe', preview.some((f) => f.field === 'title'),
          preview.map((f) => f.field).join(', ')),
        check('Korrektur wurde angelegt', /Korrektur Freigegeben/.test(record.name || ''), `angelegt als « ${record.name} »`),
        check('Vorschlag bleibt daneben stehen', /Korrektur Original/.test(state.override?.before?.title || ''),
          JSON.stringify(state.override?.before)),
        check('Urheber der Korrektur festgehalten', Boolean(state.override?.by && state.override?.at),
          JSON.stringify(state.override)),
        noEnglish(state),
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

  // ─── Vocabulaire métier : chauffage / sanitaire suisse ──────

  {
    name: 'wartung-ueberfaellig',
    why: 'Der Assistent muss Wartungssprache verstehen, ohne dass man ihm Feldnamen diktiert.',
    async exec() {
      const state = await run('Die Jahreswartung bei Familie Meier ist überfällig, erstelle mir eine Aufgabe ZZTEST Jahreswartung nachholen', { confirm: true });
      const record = state.output?.record || {};
      track('task', record.id);
      return [
        check('Aufgabe angelegt', action(state) === 'CREATE_TASK', `action = ${action(state)}`),
        check('Titel ohne Befehlswörter', !/erstelle|mir eine Aufgabe/i.test(record.title || ''), `titre = « ${record.title} »`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'notfall-wird-dringend',
    why: 'Ein Heizungsausfall im Winter ist dringend — das muss in der Priorität ankommen.',
    async exec() {
      const state = await run('Notfall bei Familie Meier: die Heizung ist komplett ausgefallen, kein Warmwasser mehr. Erstelle eine Aufgabe ZZTEST Heizungsausfall Meier', { confirm: true });
      const record = state.output?.record || {};
      track('task', record.id);
      return [
        check('Aufgabe angelegt', action(state) === 'CREATE_TASK', `action = ${action(state)}`),
        check('Priorität hoch oder dringend', ['HIGH', 'URGENT'].includes(record.priority), `priorité = ${record.priority}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'schweizer-datumsangabe',
    why: '« nächsten Dienstag » muss ein echtes Datum werden, nicht Text.',
    async exec() {
      const state = await run('Erstelle eine Aufgabe ZZTEST Boiler entkalken für nächsten Dienstag', { confirm: true });
      const record = state.output?.record || {};
      track('task', record.id);
      const due = record.dueDate ? new Date(record.dueDate) : null;
      const inFuture = due && due.getTime() > Date.now();
      const isTuesday = due && due.getDay() === 2;
      return [
        check('Fälligkeit gesetzt', Boolean(due), 'aucune échéance'),
        check('Datum in der Zukunft', inFuture, `échéance = ${record.dueDate}`),
        check('fällt auf einen Dienstag', isTuesday, `jour = ${due ? due.getDay() : '—'} (2 = mardi)`),
      ];
    },
  },
  {
    name: 'entkalkung-fachbegriff',
    why: 'Fachbegriffe wie Entkalkung oder Hygienespeicher dürfen den Assistenten nicht aus dem Tritt bringen.',
    async exec() {
      const state = await run('Erstelle eine Aufgabe ZZTEST Hygienespeicher entkalken und Anode prüfen', { confirm: true });
      const record = state.output?.record || {};
      track('task', record.id);
      return [
        check('Aufgabe angelegt', action(state) === 'CREATE_TASK', `action = ${action(state)}`),
        check('Fachbegriff im Titel erhalten', /Hygienespeicher/i.test(record.title || ''), `titre = « ${record.title} »`),
      ];
    },
  },
  {
    name: 'kundensuche-mit-fachfrage',
    why: 'Eine Suchfrage darf nie zu einer Änderung führen.',
    async exec() {
      const state = await run('Zeig mir die Kundendaten von Immobilien Verwaltung');
      return [
        check('Suche ausgeführt', String(action(state)).startsWith('SEARCH'), `action = ${action(state)}`),
        check('Treffer geliefert', (state.output?.records || []).length > 0, 'aucun résultat'),
        check('nichts verändert', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'erdsonde-erkennt-bewilligungspflicht',
    why: 'Bei einer Erdsonde hängt die Bohrbewilligung dran — Offerte AI muss den Anlagetyp erkennen.',
    async exec() {
      const dictation = 'Erstelle eine Offerte für Kunde Immobilien Verwaltung. Besichtigung: '
        + 'Ersatz der Ölheizung durch eine Sole-Wasser-Wärmepumpe mit Erdsonde. Bohrung im Garten, '
        + 'Zufahrt für das Bohrgerät ist eng, das muss noch geprüft werden. Fördergelder Basel-Landschaft '
        + 'sind möglich. Preise für die Bohrung habe ich noch nicht.';
      const state = await run(dictation, { confirm: true });
      const record = state.output?.record || {};
      track('quotation', record.id);
      const recognized = (record.recognizedWork || []).join(' ');
      return [
        check('Offerte angelegt', action(state) === 'CREATE_QUOTATION', `action = ${action(state)}`),
        check('Erdsonde erkannt', /erdsonde|sole-wasser|bohr/i.test(recognized), `reconnus = ${recognized}`),
        check('Fördergelder erkannt', /förder/i.test(recognized) || /förder/i.test(JSON.stringify(record)), 'subventions non repérées'),
        check('offener Punkt Zufahrt', (record.openPoints || []).some((x) => /zufahrt|bohrgerät|eng/i.test(x)), `points = ${(record.openPoints || []).join(' | ')}`),
        check('keine Preise erfunden', !record.total, `total = ${record.total}`),
      ];
    },
  },
  {
    name: 'mehrdeutiger-kunde-mit-auswahl',
    why: 'Bei mehreren Treffern muss der Assistent eine nummerierte Auswahl anbieten.',
    async exec() {
      const state = await run('Erstelle ein Projekt ZZTEST Auswahl für Kunde Verwaltung', { confirm: true });
      const text = message(state);
      const asked = state.output?.status === 'needs_follow_up';
      const created = action(state) === 'CREATE_PROJECT' && state.output?.record?.id;
      if (created) track('project', state.output.record.id);
      return [
        check('entweder eindeutig gelöst oder Auswahl angeboten', asked || Boolean(created),
          `status = ${state.output?.status}`),
        check('bei Rückfrage nummerierte Liste', !asked || /\n\s*1\./.test(text), `message = ${text.slice(0, 120)}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'mehrtuerige-antwort-auf-rueckfrage',
    why: 'Auf eine Rückfrage muss eine kurze Antwort im selben Gespräch genügen.',
    async exec() {
      const first = await run('Erstelle ein Projekt ZZTEST Mehrturn', { confirm: true });
      if (first.output?.status !== 'needs_follow_up') {
        if (first.output?.record?.id) track('project', first.output.record.id);
        return [check('Rückfrage erwartet', false, `status = ${first.output?.status} (le contexte a suffi)`)];
      }
      const second = await run('Immobilien Verwaltung', { confirm: true, threadId: first.threadId });
      const record = second.output?.record || {};
      if (record.id) track('project', record.id);
      return [
        check('erste Antwort ist eine Rückfrage', true),
        check('zweite Antwort löst sie auf', action(second) === 'CREATE_PROJECT', `action 2 = ${action(second)} / ${second.output?.status}`),
        check('Kunde übernommen', /Immobilien/i.test(record.customerName || ''), `client = ${record.customerName}`),
        noEnglish(second),
      ];
    },
  },
  {
    name: 'einsatz-verschieben-braucht-freigabe',
    why: 'Ein Termin beim Kunden wird nie ohne Freigabe verschoben.',
    async exec() {
      const state = await run('Verschiebe den Einsatz bei Familie Meier auf nächste Woche Donnerstag');
      return [
        check('Freigabe oder Rückfrage', state.status === 'AWAITING_CONFIRMATION' || state.output?.status === 'needs_follow_up',
          `status = ${state.status} / ${state.output?.status}`),
        check('nichts verschoben', !state.output?.record?.rescheduled, 'un déplacement a eu lieu'),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'ausserhalb-des-themas',
    why: 'Eine Frage ohne ERP-Bezug darf nichts anlegen.',
    async exec() {
      const state = await run('Wie wird das Wetter morgen in Basel?');
      return [
        check('nichts angelegt', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        check('konversationell beantwortet', state.workflowType === 'GENERAL' || String(action(state)).startsWith('SEARCH'),
          `workflow = ${state.workflowType}, action = ${action(state)}`),
      ];
    },
  },
  {
    name: 'rapport-diktat-uebernimmt-arbeiten',
    why: 'Ein diktierter Rapport muss die ausgeführten Arbeiten übernehmen, nicht den Befehl.',
    async exec() {
      const state = await run(
        'Erstelle einen Rapport-Entwurf: Brenner gereinigt, Zündelektrode ersetzt, Kesseldruck geprüft, '
        + 'Anlage läuft wieder einwandfrei. Zwei Stunden vor Ort bei Familie Meier.',
        { confirm: true },
      );
      const text = message(state);
      return [
        check('Rapport oder Rückfrage', ['CREATE_REPORT', 'RECORD_TIME'].includes(action(state)) || state.output?.status === 'needs_follow_up',
          `action = ${action(state)} / ${state.output?.status}`),
        check('kein englischer Text', !ENGLISH_LEAKS.some((w) => text.includes(w)), text.slice(0, 90)),
      ];
    },
  },

  // ─── Rapport AI ────────────────────────────────────────────

  {
    name: 'rapport-strukturiert-arbeiten-und-material',
    why: 'Ein diktierter Einsatz muss Arbeiten, Material und Zeit sauber trennen.',
    async exec() {
      const dictation = 'Erstelle einen Rapport zum Einsatz ASN-2026-00003: Brenner ausgebaut und gereinigt, '
        + 'Zündelektrode ersetzt, Düse 0.6 gewechselt, Kesseldruck kontrolliert und auf 1.8 bar '
        + 'nachgefüllt. Anlage läuft wieder einwandfrei. Zwei Komma fünf Stunden vor Ort, '
        + 'eine halbe Stunde Anfahrt. Der Kunde war zufrieden.';
      const state = await runAnswering(dictation);
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Rapport erstellt', action(state) === 'CREATE_REPORT' && Boolean(record.reportNumber),
          `action = ${action(state)} / ${state.output?.status}`),
        check('Material erkannt', (record.materials || 0) > 0, `matériel = ${record.materials}`),
        check('Arbeitszeit erkannt', record.workedHours === 2.5, `heures = ${record.workedHours}`),
        check('kein englischer Text', !ENGLISH_LEAKS.some((w) => text.includes(w)), text.slice(0, 90)),
      ];
    },
  },
  {
    name: 'rapport-erkennt-folgearbeit',
    why: 'Das Beispiel aus dem Pflichtenheft: Ausdehnungsgefäss schlecht, sollte offeriert werden.',
    async exec() {
      const dictation = 'Rapport zum Einsatz ASN-2026-00003: Umwälzpumpe ersetzt, Anlage entlüftet, läuft wieder. '
        + 'Drei Stunden gearbeitet. Das Ausdehnungsgefäss sieht schlecht aus und sollte ersetzt '
        + 'werden, das müsste man dem Kunden offerieren.';
      const state = await runAnswering(dictation);
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Rapport erstellt', action(state) === 'CREATE_REPORT' && Boolean(record.reportNumber),
          `action = ${action(state)} / ${state.output?.status}`),
        check('Folgearbeit erkannt', record.followUpQuotation === true || /Offerte|Folgearbeit/i.test(text),
          `suivi = ${record.followUpQuotation}`),
        check('kein englischer Text', !ENGLISH_LEAKS.some((w) => text.includes(w)), text.slice(0, 90)),
      ];
    },
  },
  {
    name: 'rapport-meldet-fehlende-angaben',
    why: 'Ohne Arbeitszeit darf ein Rapport nicht als vollständig gelten.',
    async exec() {
      const dictation = 'Rapport zum Einsatz ASN-2026-00003: Beim Kunden kurz vorbei, Anlage angeschaut, '
        + 'sieht soweit in Ordnung aus. Nichts weiter unternommen.';
      const state = await runAnswering(dictation);
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Rapport erstellt', action(state) === 'CREATE_REPORT' && Boolean(record.reportNumber),
          `action = ${action(state)} / ${state.output?.status}`),
        check('Unvollständigkeit gemeldet', (record.missing || []).length > 0 || /fehlt/i.test(text),
          `manquants = ${(record.missing || []).join(', ')}`),
        check('kein englischer Text', !ENGLISH_LEAKS.some((w) => text.includes(w)), text.slice(0, 90)),
      ];
    },
  },

  // ─── Money AI ──────────────────────────────────────────────

  {
    name: 'rechnung-braucht-freigabe',
    why: 'Eine Rechnung ist verbindlich und wird nie ohne Freigabe erstellt.',
    async exec() {
      const state = await run('Erstelle eine Rechnung aus dem Auftrag AUF-2026-0051');
      return [
        check('Freigabe verlangt', state.status === 'AWAITING_CONFIRMATION', `status = ${state.status}`),
        check('Risikostufe HIGH', state.output?.riskLevel === 'HIGH', `risque = ${state.output?.riskLevel}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'rechnung-sperrt-bei-fehlendem-preis',
    why: 'Ohne Preis darf keine Rechnung entstehen — die Regel aus dem Pflichtenheft.',
    async exec() {
      const state = await runAnswering('Erstelle eine Rechnung aus dem Auftrag AUF-2026-0051');
      const o = state.output || {};
      const text = message(state);
      return [
        check('gesperrt statt blind erstellt', o.status === 'blocked', `status = ${o.status}`),
        check('Grund genannt', (o.blockers || []).length > 0, `blocages = ${(o.blockers || []).join(' | ')}`),
        check('keine Rechnung angelegt', !o.recordId, 'une facture a été créée'),
        check('Sperrgrund normiert', Boolean(o.blockReason), `motif = ${o.blockReason}`),
        check('kein englischer Text', !ENGLISH_LEAKS.some((w) => text.includes(w)), text.slice(0, 90)),
      ];
    },
  },
  {
    name: 'rechnung-nennt-offene-rapporte',
    why: 'Offene Rapporte müssen die Rechnung aufhalten und benannt werden.',
    async exec() {
      const state = await runAnswering('Stelle die Schlussrechnung für den Auftrag AUF-2026-0052');
      const o = state.output || {};
      const text = message(state);
      const mentionsControl = /Rapport|Preis|Position|Auftragsstatus|Rechnung/i.test(text);
      return [
        check('Antwort bezieht sich auf die Prüfung', mentionsControl, text.slice(0, 110)),
        check('nichts versendet', !o.sent, 'un envoi a eu lieu'),
        check('kein englischer Text', !ENGLISH_LEAKS.some((w) => text.includes(w)), text.slice(0, 90)),
      ];
    },
  },

  // ─── Sales AI ──────────────────────────────────────────────

  {
    name: 'nachfassliste-nach-wert-sortiert',
    why: 'Offene Offerten müssen nach Auftragswert priorisiert werden — die Regel des Kunden.',
    async exec() {
      const state = await run('Welche Offerten muss ich nachfassen?');
      const records = state.output?.records || [];
      const sorted = records.every((r, i) => i === 0 || records[i - 1].value >= r.value);
      const text = message(state);
      return [
        check('Nachfassliste geliefert', action(state) === 'SALES_FOLLOWUPS', `action = ${action(state)}`),
        check('nichts verändert', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        check('nach Wert sortiert', sorted, records.map((r) => r.value).join(' > ')),
        check('Gesprächshinweis ohne Preisdruck', !/Rabatt|Preisnachlass/i.test(text), text.slice(0, 80)),
        noEnglish(state),
      ];
    },
  },

  // ─── Quality AI ────────────────────────────────────────────

  {
    name: 'abschluss-erdsonde-blockiert',
    why: 'Eine Erdsonde darf ohne Bohrbewilligung und IBN-Protokoll nicht abgeschlossen werden.',
    async exec() {
      const project = await projectFixture('ZZTEST Erdsonden-Wärmepumpe Abschluss');
      const state = await run(`Kann ich das Projekt ${project.name} abschliessen?`);
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Abschlussprüfung ausgeführt', action(state) === 'QUALITY_CHECK', `action = ${action(state)}`),
        check('Checkliste Erdsonde erkannt', record.template === 'ERDSONDEN_WP', `vorlage = ${record.template}`),
        check('Abschluss gesperrt', record.canClose === false, `canClose = ${record.canClose}`),
        check('Bohrbewilligung verlangt', /Bohrbewilligung/i.test(text), text.slice(0, 140)),
        check('IBN-Protokoll verlangt', /IBN/i.test(text), text.slice(0, 140)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'abschluss-boiler-ohne-bewilligung',
    why: 'Die Checkliste hängt am Anlagetyp — ein Boilerersatz braucht keine Bewilligung.',
    async exec() {
      const project = await projectFixture('ZZTEST Boilerersatz Hygienespeicher', 'RENOVATION');
      const state = await run(`Was fehlt noch beim Projekt ${project.name}?`);
      const record = state.output?.record || {};
      const missing = (record.missingDocuments || []).join(', ');
      return [
        check('Abschlussprüfung ausgeführt', action(state) === 'QUALITY_CHECK', `action = ${action(state)}`),
        check('Checkliste Boiler erkannt', record.template === 'BOILER_SPEICHER', `vorlage = ${record.template}`),
        check('keine Bewilligung verlangt', !/Bewilligung|Baumeldung/i.test(missing), missing),
        check('Garantieunterlagen verlangt', /Garantie/i.test(missing), missing),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'abschlussfrage-legt-nichts-an',
    why: 'Die Frage nach dem Abschluss ist eine Frage — sie darf nichts anlegen und nichts schliessen.',
    async exec() {
      const project = await projectFixture('ZZTEST Abschluss Leseprobe');
      const state = await run(`Ist die Dokumentation vom Projekt ${project.name} vollständig?`);
      const after = await api(`/pm/projects/${project._id || project.id}`);
      const status = after.body?.data?.status;
      return [
        check('Abschlussprüfung ausgeführt', action(state) === 'QUALITY_CHECK', `action = ${action(state)}`),
        check('keine Freigabe nötig', state.status === 'COMPLETED', `status = ${state.status}`),
        check('Projektstatus unverändert', status === project.status, `${project.status} → ${status}`),
        noEnglish(state),
      ];
    },
  },

  // ─── Service AI ────────────────────────────────────────────

  // ─── Knowledge AI ──────────────────────────────────────────

  {
    name: 'wissen-antwortet-mit-quelle',
    why: 'Eine Antwort ohne Quelle ist nicht prüfbar — das CDC verlangt „Antwort mit Quellenangabe".',
    async exec() {
      const state = await run('Wie hoch sind die Fördergelder in Basel-Stadt?');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('im Wissen nachgeschlagen', action(state) === 'KNOWLEDGE_ASK', `action = ${action(state)}`),
        check('Antwort gefunden', record.answered === true, `found = ${record.found}`),
        check('Quelle genannt', (record.sources || []).length > 0, (record.sources || []).join(' | ')),
        check('Fundstelle im Text', /Quelle:/.test(text), text.slice(0, 200)),
        check('sagt, woher die Antwort stammt', /nicht aus dem Sprachmodell/i.test(text), text.slice(-160)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'wissen-raet-nicht',
    why: '„Weist auf Unsicherheit hin statt zu raten" — das ist der eigentliche Auftrag dieses Agenten.',
    async exec() {
      const state = await run('Welche Versicherung deckt bei uns einen Wasserschaden im Untergeschoss?');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('im Wissen nachgeschlagen', action(state) === 'KNOWLEDGE_ASK', `action = ${action(state)}`),
        check('gibt zu, nichts zu haben', record.answered === false, `found = ${record.found}`),
        check('sagt es ausdrücklich', /nichts hinterlegt/i.test(text), text.slice(0, 160)),
        check('verweist auf einen Menschen', /Projektleitung fragen/i.test(text), text.slice(-200)),
        check('keine erfundene Antwort', (record.sources || []).length === 0, (record.sources || []).join(' | ')),
        noEnglish(state),
      ];
    },
  },

  // ─── Customer AI ───────────────────────────────────────────

  {
    name: 'kundennachricht-bleibt-ein-entwurf',
    why: 'Versendet nie ohne Freigabe — ein Kundentext ist bindend, sobald er draussen ist.',
    async exec() {
      const state = await run('Schreib dem Kunden Immobilien Verwaltung wegen der Verzögerung: das Material kommt eine Woche später');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Entwurf erstellt', action(state) === 'DRAFT_CUSTOMER_MESSAGE', `action = ${action(state)}`),
        check('nichts versendet', record.sent === false && !/versendet wurde|gesendet/i.test(text), `sent = ${record.sent}`),
        check('Anlass erkannt', record.occasion === 'VERZOEGERUNG', `anlass = ${record.occasion}`),
        check('Grund übernommen', /Material kommt eine Woche später/i.test(record.body || ''), (record.body || '').slice(0, 120)),
        check('höfliche Anrede, keine Du-Form', /^(Sehr geehrte|Guten Tag)/.test(record.body || '')
          && !/\b(du|dir|dich|deine?)\b/i.test(record.body || ''), (record.body || '').slice(0, 90)),
        check('Grund sauber abgeschlossen', !/später [A-ZÄÖÜ]/.test(record.body || ''), (record.body || '').slice(0, 160)),
        check('kein Eszett', !/ß/.test(text), text.match(/\S*ß\S*/g)?.join(', ') || ''),
        check('Freigabe vorbehalten', /nach Ihrer Freigabe/i.test(text), text.slice(-120)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'ohne-termin-kein-termin-im-entwurf',
    why: 'Ein Datum im Kundentext, das nirgends steht, ist eine Zusage, die niemand gemacht hat.',
    async exec() {
      const state = await run('Terminbestätigung an den Kunden Immobilien Verwaltung schreiben');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Entwurf angefragt', action(state) === 'DRAFT_CUSTOMER_MESSAGE', `action = ${action(state)}`),
        check('kein Entwurf erzeugt', record.drafted === false, `drafted = ${record.drafted}`),
        check('kein Text mit Datum', !record.body, (record.body || '').slice(0, 120)),
        check('sagt, dass nichts erfunden wird', /nicht erfunden/i.test(text), text.slice(0, 200)),
        noEnglish(state),
      ];
    },
  },

  // ─── Controlling AI ────────────────────────────────────────

  {
    name: 'kennzahlen-nennen-ihre-luecken',
    why: 'Eine Marge aus einem geratenen Stundensatz wäre schlimmer als gar keine Zahl.',
    async exec() {
      const state = await run('Wie steht das Projekt Kesselersatz Bäckerei Weber finanziell?');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Kennzahlen geliefert', action(state) === 'PROJECT_FIGURES', `action = ${action(state)}`),
        check('Auftragswert gerechnet', typeof record.ordered === 'number', `ordered = ${record.ordered}`),
        check('keine Marge behauptet', record.margin === null && !/Marge (beträgt|:)/i.test(text), text.slice(0, 200)),
        check('fehlender Kostensatz benannt', (record.gaps || []).some((g) => /Kostensatz/.test(g)),
          (record.gaps || []).join(' | ')),
        check('als Bestandszahlen gekennzeichnet', /keine Buchhaltungsauswertung/i.test(text), text.slice(-160)),
        noEnglish(state),
      ];
    },
  },

  // ─── Finanz AI ─────────────────────────────────────────────

  {
    name: 'kreditoren-werden-vor-der-zahlung-geprueft',
    why: 'Kreditoren sind eingehende Rechnungen — nie mit dem Fakturieren eines Kunden verwechseln.',
    async exec() {
      const state = await run('Welche Kreditorenrechnungen sind offen?');
      const text = message(state);
      return [
        check('Zahlungsprüfung ausgeführt', action(state) === 'PAYMENT_CHECK', `action = ${action(state)}`),
        check('keine Kundenrechnung erstellt', !/CREATE_INVOICE/.test(String(action(state))), `action = ${action(state)}`),
        check('nichts angelegt', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        check('nichts bezahlt', !/gebucht|überwiesen/i.test(text) || /nichts automatisch/i.test(text), text.slice(-140)),
        noEnglish(state),
      ];
    },
  },

  // ─── Document AI ───────────────────────────────────────────

  {
    name: 'dokumente-werden-eingeordnet',
    why: 'Ein Dokument unter OTHER ist für Behörden, Quality und Money AI unsichtbar.',
    async exec() {
      const state = await run('Sind die Dokumente vom Projekt Wärmepumpen-Umstellung Liegenschaft Basel richtig abgelegt?');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Ablage geprüft', action(state) === 'DOCUMENT_CLASSIFY', `action = ${action(state)}`),
        check('Dokumente gelesen', (record.total || 0) > 0, `${record.total} Dokumente`),
        check('nichts verschoben', /nichts automatisch/i.test(text), text.slice(-140)),
        check('sagt, dass der Inhalt nicht gelesen wird', /Inhalt wird nicht gelesen/i.test(text), text.slice(-220)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'dokument-ohne-signal-wird-nicht-geraten',
    why: 'Eine Rechnung als Bohrbewilligung abzulegen ist schlimmer, als sie unklassiert zu lassen.',
    async exec() {
      const state = await run('Klassiere die Dokumente vom Projekt Wärmepumpen-Umstellung Liegenschaft Basel');
      const records = state.output?.records || [];
      const unnamed = records.filter((r) => !r.proposedType);
      return [
        check('Ablage geprüft', action(state) === 'DOCUMENT_CLASSIFY', `action = ${action(state)}`),
        check('nichtssagende Namen gefunden', unnamed.length > 0, records.map((r) => r.fileName).join(', ')),
        check('und offen gelassen', unnamed.every((r) => !r.suggestedName),
          unnamed.map((r) => `${r.fileName}→${r.suggestedName}`).join(', ')),
        check('erkannte behalten ihren Vorschlag',
          records.filter((r) => r.proposedType).every((r) => Boolean(r.suggestedName)),
          records.filter((r) => r.proposedType).map((r) => `${r.fileName}→${r.suggestedName}`).join(', ')),
        noEnglish(state),
      ];
    },
  },

  // ─── Material AI ───────────────────────────────────────────

  {
    name: 'material-nennt-was-nicht-bestellt-ist',
    why: 'Vor dem Baustart muss stehen, welches Material fehlt — und nur Material.',
    async exec() {
      const state = await run('Ist das Material für das Projekt Kesselersatz Bäckerei Weber da?');
      const record = state.output?.record || {};
      const articles = record.articles || [];
      const text = message(state);
      return [
        check('Materialstatus geliefert', action(state) === 'MATERIAL_CHECK', `action = ${action(state)}`),
        check('Katalogartikel erkannt', articles.length > 0, `${articles.length} Positionen`),
        check('keine Arbeitsleistung in der Liste', !articles.some((a) => /Montage|Inbetriebnahme/i.test(a.name || '')),
          articles.map((a) => a.name).join(', ')),
        check('offene Bestellungen benannt', record.unordered > 0 || articles.every((a) => a.status !== 'not_ordered'),
          `unordered = ${record.unordered}`),
        check('nichts bestellt', /nach Freigabe/i.test(text), text.slice(-120)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'material-sagt-dass-der-projektbezug-fehlt',
    why: 'Bestellungen tragen keinen Projektbezug — die Zuordnung ist eine Annahme und muss so heissen.',
    async exec() {
      const state = await run('Materialstatus für das Projekt Kesselersatz Bäckerei Weber');
      const text = message(state);
      return [
        check('Materialstatus geliefert', action(state) === 'MATERIAL_CHECK', `action = ${action(state)}`),
        check('nennt die Grenze des Systems', /keinen Projektbezug/i.test(text), text.slice(-260)),
        check('nichts angelegt', !/erstellt|angelegt/i.test(text.split('Zu beachten')[0] || ''), text.slice(0, 100)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'material-ohne-auftrag-keine-liste',
    why: 'Ohne Auftrag gibt es keine Materialliste — das darf nicht erfunden werden.',
    async exec() {
      const project = await projectFixture('ZZTEST Materialprüfung ohne Auftrag');
      const state = await run(`Was fehlt noch an Material beim Projekt ${project.name}?`);
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Materialstatus geliefert', action(state) === 'MATERIAL_CHECK', `action = ${action(state)}`),
        check('keine erfundene Liste', (record.articles || []).length === 0, `${(record.articles || []).length} Positionen`),
        check('sagt, dass der Auftrag fehlt', /keinen Auftrag/i.test(text), text.slice(0, 200)),
        noEnglish(state),
      ];
    },
  },

  // ─── Dispo AI ──────────────────────────────────────────────

  {
    name: 'dispo-schlaegt-passenden-monteur-vor',
    why: 'Die Anlage bestimmt die Qualifikation — wer sie hat, steht oben.',
    async exec() {
      const state = await run('Wer kann nächsten Dienstag um 8 Uhr den Boiler bei Bäckerei Weber warten?');
      const records = state.output?.records || [];
      const text = message(state);
      return [
        check('Vorschlag geliefert', action(state) === 'DISPATCH_SUGGEST', `action = ${action(state)}`),
        check('nichts gebucht', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        check('Monteur mit Boiler-Qualifikation zuerst', (records[0]?.skills || []).includes('boiler'),
          records.map((r) => `${r.name}[${(r.skills || []).join('/')}]`).join(' > ')),
        check('Freigabe vorbehalten', /nach Freigabe/i.test(text), text.slice(-120)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'dispo-prueft-einen-monteur',
    why: 'Die Frage nach einer Person muss die zehn Punkte prüfen, nicht buchen.',
    async exec() {
      const state = await run('Kann Thomas Brunner nächsten Mittwoch um 9 Uhr einen Einsatz übernehmen?');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Vorprüfung ausgeführt', action(state) === 'DISPATCH_CHECK', `action = ${action(state)}`),
        check('Monteur erkannt', /Thomas/i.test(record.employee || ''), `monteur = ${record.employee}`),
        check('Entscheid geliefert', typeof record.canGo === 'boolean', `canGo = ${record.canGo}`),
        check('nichts gebucht', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        check('Freigabe vorbehalten', /nach Freigabe/i.test(text), text.slice(-120)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'dispo-ohne-datum-fragt-nach',
    why: 'Ohne Termin darf nichts geprüft und schon gar nichts erfunden werden.',
    async exec() {
      const state = await run('Wer kann den Boiler bei Bäckerei Weber warten?');
      const text = message(state);
      return [
        check('Rückfrage statt Raten', state.output?.status === 'needs_follow_up', `status = ${state.output?.status}`),
        check('fragt nach dem Termin', /Datum|Uhrzeit|Termin/i.test(text), text.slice(0, 140)),
        check('nichts gebucht', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        noEnglish(state),
      ];
    },
  },

  // ─── Behörden AI ───────────────────────────────────────────

  {
    name: 'behoerden-erdsonde-sperrt-baustart',
    why: 'Ohne Bohrbewilligung darf der Baustart nicht freigegeben werden.',
    async exec() {
      const project = await projectFixture('ZZTEST Erdsonden-Wärmepumpe Bewilligung');
      const state = await run(`Welche Bewilligungen braucht das Projekt ${project.name}?`);
      const record = state.output?.record || {};
      const keys = (record.procedures || []).map((p) => p.key);
      const text = message(state);
      return [
        check('Behördencheck ausgeführt', action(state) === 'PERMIT_CHECK', `action = ${action(state)}`),
        check('Bohrbewilligung verlangt', keys.includes('BOHRBEWILLIGUNG'), keys.join(', ')),
        check('Fördergesuch verlangt', keys.includes('FOERDERGESUCH'), keys.join(', ')),
        check('Baustart gesperrt', record.startBlocked === true, `startBlocked = ${record.startBlocked}`),
        check('nichts eingereicht', /nach Freigabe/i.test(text), text.slice(-140)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'behoerden-boiler-braucht-nichts',
    why: 'Ein Boilerersatz braucht kein Verfahren — das muss der Agent auch so sagen.',
    async exec() {
      const project = await projectFixture('ZZTEST Boilerersatz Hygienespeicher Bewilligung', 'RENOVATION');
      const state = await run(`Behördencheck für das Projekt ${project.name}`);
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Behördencheck ausgeführt', action(state) === 'PERMIT_CHECK', `action = ${action(state)}`),
        check('kein Verfahren', (record.procedures || []).length === 0, (record.procedures || []).map((p) => p.key).join(', ')),
        check('sagt es ausdrücklich', /kein Bewilligungsverfahren/i.test(text), text.slice(0, 160)),
        check('Baustart nicht gesperrt', record.startBlocked === false, `startBlocked = ${record.startBlocked}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'behoerden-erfindet-keine-kantonsregel',
    why: 'Welche Formulare ein Kanton verlangt, steht nicht im System — das muss gesagt werden.',
    async exec() {
      const project = await projectFixture('ZZTEST Luft-Wasser-Wärmepumpe Bewilligung');
      const state = await run(`Was muss ich beim Projekt ${project.name} bei der Gemeinde einreichen?`);
      const record = state.output?.record || {};
      const keys = (record.procedures || []).map((p) => p.key);
      const text = message(state);
      return [
        check('Behördencheck ausgeführt', action(state) === 'PERMIT_CHECK', `action = ${action(state)}`),
        check('Baumeldung verlangt', keys.includes('BAUMELDUNG'), keys.join(', ')),
        check('Schallschutz verlangt', keys.includes('SCHALLSCHUTZ'), keys.join(', ')),
        check('keine Bohrbewilligung', !keys.includes('BOHRBEWILLIGUNG'), keys.join(', ')),
        check('nennt die Grenze des Systems', /nicht hinterlegt/i.test(text), text.slice(-220)),
        noEnglish(state),
      ];
    },
  },

  {
    name: 'ausgeschalteter-agent-schweigt-auch-im-chat',
    why: 'Ein Schalter auf „aus" muss auch im Chat gelten — sonst ist er keiner.',
    async exec() {
      // Switched off and back on inside the scenario, so a failure between the
      // two cannot leave Service AI dark for every later run.
      const off = async (isEnabled) => api('/ai/governance/agents/SERVICE', {
        method: 'PATCH',
        body: { isEnabled, reason: isEnabled ? null : 'ZZTEST Kill-Switch' },
      });

      await off(false);
      let blocked;
      let after;
      try {
        blocked = await run('Welche Wartungen sind fällig?');
      } finally {
        await off(true);
      }
      after = await run('Welche Wartungen sind fällig?');

      const text = message(blocked);
      return [
        check('nicht ausgeführt', blocked.status !== 'COMPLETED' || !blocked.output?.records,
          `status = ${blocked.status}`),
        check('sagt, dass der Agent aus ist', /ausgeschaltet/i.test(text), text.slice(0, 140)),
        check('nennt den Agenten', /Service AI/i.test(text), text.slice(0, 140)),
        check('nennt den Grund', /ZZTEST Kill-Switch/.test(text), text.slice(0, 140)),
        check('sagt, wo man ihn einschaltet', /KI-Agenten/i.test(text), text.slice(-120)),
        check('nach dem Einschalten antwortet er wieder',
          action(after) === 'SERVICE_DUE' && Array.isArray(after.output?.records),
          `action = ${action(after)}`),
        noEnglish(blocked),
      ];
    },
  },
  {
    name: 'anderer-agent-bleibt-erreichbar',
    why: 'Einen Agenten abzuschalten darf nicht den ganzen Assistenten stilllegen.',
    async exec() {
      const off = async (isEnabled) => api('/ai/governance/agents/SERVICE', {
        method: 'PATCH',
        body: { isEnabled, reason: isEnabled ? null : 'ZZTEST Kill-Switch' },
      });

      await off(false);
      let state;
      try {
        // Looking a customer up belongs to no agent — the assistant's own work.
        state = await run('Suche den Kunden Immobilien Verwaltung Basel');
      } finally {
        await off(true);
      }

      return [
        // Two customer searches exist — the assistant's own and the capability
        // module's richer one. Which of them ran does not matter here.
        check('Suche ausgeführt', /^SEARCH_CUSTOMERS?$/.test(action(state)), `action = ${action(state)}`),
        check('Treffer geliefert', (state.output?.records || []).length > 0,
          `${(state.output?.records || []).length} Treffer`),
        check('kein Sperrhinweis', !/ausgeschaltet/i.test(message(state)), message(state).slice(0, 120)),
      ];
    },
  },
  {
    name: 'wartungsliste-nach-verzug',
    why: 'Die überfälligste Wartung steht oben — sonst ist die Liste keine Arbeitsliste.',
    async exec() {
      const state = await run('Welche Wartungen sind fällig?');
      const records = state.output?.records || [];
      const sorted = records.every((r, i) => i === 0 || (records[i - 1].daysOverdue ?? -9999) >= (r.daysOverdue ?? -9999));
      const text = message(state);
      return [
        check('Wartungsliste geliefert', action(state) === 'SERVICE_DUE', `action = ${action(state)}`),
        check('nichts angelegt', !state.output?.recordId, `recordId = ${state.output?.recordId}`),
        check('nach Verzug sortiert', sorted, records.map((r) => r.daysOverdue).join(' > ')),
        check('Kunde und Anlage genannt', records.every((r) => r.customer && r.plant), records.map((r) => `${r.customer}/${r.plant}`).join(' | ')),
        check('Auftrag nur mit Freigabe', /Freigabe/i.test(text), text.slice(-120)),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'briefing-anlage-nach-nummer',
    why: 'Die Anlagenummer steht auf dem Gerät — damit muss der Monteur sein Briefing bekommen.',
    async exec() {
      const state = await run('Briefing für die Anlage A-00003');
      const record = state.output?.record || {};
      const text = message(state);
      return [
        check('Briefing erstellt', action(state) === 'SERVICE_BRIEFING', `action = ${action(state)}`),
        check('richtige Anlage', record.installationNumber === 'A-00003', `anlage = ${record.installationNumber}`),
        check('Anlagedaten im Text', /Buderus/i.test(text), text.slice(0, 120)),
        check('Wartungsstand im Text', /Wartung/i.test(text) && /überfällig|fällig/i.test(text), text.slice(0, 200)),
        check('Meldungen abgehandelt', /Offene Meldungen/i.test(text), text.slice(0, 200)),
        check('Alter berechnet', typeof record.ageYears === 'number', `alter = ${record.ageYears}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'briefing-anlage-ueber-kunde',
    why: 'Im Büro sagt niemand eine Anlagenummer — man sagt, bei wem man hinfährt.',
    async exec() {
      const state = await run('Was muss ich zur Wartung bei Bäckerei Weber wissen?');
      const record = state.output?.record || {};
      return [
        check('Briefing erstellt', action(state) === 'SERVICE_BRIEFING', `action = ${action(state)}`),
        check('Anlage über den Kunden gefunden', record.installationNumber === 'A-00003', `anlage = ${record.installationNumber}`),
        check('Kunde im Briefing', /Weber/i.test(record.customer || ''), `kunde = ${record.customer}`),
        noEnglish(state),
      ];
    },
  },
  {
    name: 'briefing-mehrere-anlagen-fragt-nach',
    why: 'Hat ein Kunde mehrere Anlagen, wird gefragt statt geraten.',
    async exec() {
      const state = await run('Briefing für die Anlage bei Anna Schmid');
      const text = message(state);
      const options = state.output?.candidates?.installations || [];
      return [
        check('Rückfrage statt Raten', state.output?.status === 'needs_follow_up', `status = ${state.output?.status}`),
        check('Anlagen nummeriert angeboten', options.length > 1, `${options.length} Vorschlag/Vorschläge`),
        check('fragt nach der Anlage', /Anlage/i.test(text), text.slice(0, 120)),
        noEnglish(state),
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

/**
 * Removes one record, and does not pretend when it cannot.
 *
 * A project can only be deleted while it is still DRAFT — anything a scenario
 * moved to COMPLETED comes back 409. That failure used to pass unnoticed, so
 * leftovers piled up and made later runs ask "which project do you mean?"
 * about names the run had just created. So: walk it back to DRAFT, then
 * delete, and report anything that still refuses.
 */
async function remove(type, id) {
  let res = await api(DELETE_PATH[type](id), { method: 'DELETE' });
  if (res.status < 300) return true;
  if (type === 'project' && res.status === 409) {
    // Reopening a completed project needs an explicit override with a reason.
    for (const status of ['IN_PROGRESS', 'DRAFT']) {
      await api(`/pm/projects/${id}/status`, {
        method: 'POST',
        body: { targetStatus: status, comment: 'ZZTEST cleanup', override: true, overrideReason: 'ZZTEST-Aufräumen nach dem Testlauf' },
      });
    }
    res = await api(DELETE_PATH[type](id), { method: 'DELETE' });
    if (res.status < 300) return true;
  }
  console.log(`    ⚠ ${type} ${id} konnte nicht entfernt werden (${res.status})`);
  return false;
}

async function cleanup() {
  let removed = 0;
  for (const item of createdRecords) {
    if (!item?.id || !DELETE_PATH[item.type]) continue;
    if (await remove(item.type, item.id)) removed += 1;
  }
  for (const runId of createdRuns) {
    await api(`/ai/agent/${runId}`, { method: 'DELETE' });
  }
  return removed;
}

/**
 * Deletes anything a previous run left behind. Project names are unique per
 * customer, so a leftover makes the next run fail for the wrong reason.
 */
async function precleanup() {
  let removed = 0;
  const sweeps = [
    ['/pm/projects?limit=100', 'name', 'project'],
    ['/tasks?limit=100', 'title', 'task'],
    ['/qop/quotations?limit=100', 'title', 'quotation'],
  ];
  for (const [path, field, type] of sweeps) {
    const res = await api(path);
    const data = res.body?.data;
    const items = Array.isArray(data) ? data : (data?.data || data?.items || []);
    for (const item of items) {
      if (!/ZZTEST/i.test(item?.[field] || '')) continue;
      if (await remove(type, item._id || item.id)) removed += 1;
    }
  }
  return removed;
}

// ─── Runner ───────────────────────────────────────────────────

async function main() {
  console.log(`AI end-to-end scenarios — ${API}\n`);
  await login();

  const swept = await precleanup();
  if (swept) console.log(`(${swept} Testdatensatz/-sätze aus einem früheren Lauf entfernt)\n`);

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
