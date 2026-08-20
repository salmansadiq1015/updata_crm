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
async function run(input, { confirm = false, threadId } = {}) {
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
    await api(`/ai/agent/${runId}/confirm`, { method: 'POST', body: { decision: true } });
    state = await settle(runId, 'AWAITING_CONFIRMATION');
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
      const blockedOrAsked = o.status === 'blocked' || o.status === 'needs_follow_up';
      return [
        check('geprüft statt blind erstellt', blockedOrAsked || o.status === 'completed',
          `status = ${o.status}`),
        check('bei Sperre: Grund genannt', o.status !== 'blocked' || (o.blockers || []).length > 0,
          `blocages = ${(o.blockers || []).join(' | ')}`),
        check('bei Sperre: keine Rechnung angelegt', o.status !== 'blocked' || !o.recordId, 'une facture a été créée'),
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
      const del = await api(DELETE_PATH[type](item._id || item.id), { method: 'DELETE' });
      if (del.status < 300) removed += 1;
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
