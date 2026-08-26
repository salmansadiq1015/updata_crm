/**
 * Declares the sixteen agents of the 09.05.2026 specification.
 *
 * Order follows the client's own ranking ("Reihenfolge entspricht der
 * Wichtigkeit"), with one deliberate exception: Risk AI is listed last by the
 * client but carries the shared governance, so it is registered first.
 *
 * `triggers` says when the agent starts by itself, and lists only what is
 * actually wired to a business event. The specification names more of them —
 * an e-mail attachment, a scan folder, an expiring deadline, an incoming fault
 * report — and those are not built. An agent that says it watches a deadline
 * and does not is worse than one that says nothing: the office stops watching
 * it too. "Nur auf Anfrage im Assistenten" means exactly that — switched on,
 * it answers; it never acts unasked.
 *
 * `allowedActions` is the register's contract, and requirement C4 asks it to
 * be true: every action an agent serves is listed here, reads included. The
 * governance layer builds its action → agent index from these lists, so an
 * action missing here has no owner, and the audit trail cannot say which
 * agent produced it.
 *
 * Every agent starts ON. They were seeded off while their capabilities were
 * being written, so the registry would never promise behaviour the code could
 * not deliver; all sixteen now have theirs. An agent switched off by hand
 * stays off — `isEnabled` is only ever set when the declaration is created.
 */
import AgentRegistry from '../modules/ai/governance/agentRegistry.model.js';
import { RISK_LEVELS, BLOCK_REASONS } from '../modules/ai/governance/agent.risk.js';
import logger from '../shared/logger/index.js';

const B = BLOCK_REASONS;

const AGENTS = [
  {
    key: 'RISK',
    name: 'Risk AI',
    priority: 0,
    purpose:
      'Überwacht alle Agenten: sperrt, warnt, eskaliert und dokumentiert. Gibt selbst nie eine kritische Aktion frei.',
    dataSources: ['agentRun', 'toolExecution', 'auditLog'],
    allowedActions: [],
    forbiddenActions: ['CREATE_INVOICE', 'CREATE_QUOTATION', 'SEND_CHAT', 'SEND_NOTIFICATION'],
    triggers: ['Jede Agentenaktion'],
    requiredData: [],
    blockReasons: Object.values(B),
    approvalRule: RISK_LEVELS.LOW,
    outputTypes: ['Sperrstatus', 'Warnung', 'Eskalation', 'Audit-Eintrag'],
    handoffTo: [],
    verboseAudit: true,
  },
  {
    key: 'DOCUMENT',
    name: 'Document AI',
    priority: 1,
    purpose:
      'Erkennt, klassifiziert, benennt und verknüpft eingehende Dokumente. Grundlage für Behörden, Finanz, Quality und Money AI.',
    dataSources: ['documents', 'email', 'scanOrdner', 'crm', 'projects'],
    allowedActions: ['SEARCH_DOCUMENTS', 'DOCUMENT_CLASSIFY'],
    forbiddenActions: ['DELETE_CUSTOMER', 'DELETE_PROJECT', 'DELETE_ORDER'],
    triggers: ['Neues Dokument im Projekt'],
    requiredData: ['Dokumenttyp', 'Kunde oder Projekt'],
    blockReasons: [B.UNCLEAR_CUSTOMER, B.UNCLEAR_PROJECT, B.MISSING_DOCUMENT, B.CONTRADICTORY_DATA],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Klassierungsvorschlag', 'Aufgabe zur Prüfung'],
    handoffTo: ['BEHOERDEN', 'FINANZ', 'QUALITY', 'MONEY'],
  },
  {
    key: 'OFFERTE',
    name: 'Offerte AI',
    priority: 2,
    purpose:
      'Erstellt aus Diktaten, Notizen und Fotos einen Offertenentwurf auf Basis fixer Vorlagen und Textbausteine.',
    dataSources: ['voiceSessions', 'catalog', 'textBlocks', 'crm', 'projects'],
    allowedActions: ['CREATE_QUOTATION'],
    forbiddenActions: ['SEND_CHAT'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: ['Kunde', 'Objekt', 'Leistungsumfang'],
    blockReasons: [B.MISSING_PRICE, B.UNCLEAR_CUSTOMER, B.MISSING_REQUIRED_DATA],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Offertenentwurf', 'Liste offener Punkte'],
    handoffTo: ['SALES', 'PROJEKT'],
  },
  {
    key: 'FINANZ',
    name: 'Finanz AI',
    priority: 3,
    purpose:
      'Kreditoren: erkennt Lieferantenrechnungen, prüft IBAN und QR-Referenz, bereitet Zahlungen zur Freigabe vor.',
    dataSources: ['documents', 'accounting', 'email'],
    allowedActions: ['PAYMENT_CHECK'],
    forbiddenActions: ['CREATE_INVOICE'],
    triggers: ['Eingangsrechnung erfasst'],
    requiredData: ['Lieferant', 'Betrag', 'IBAN', 'Fälligkeit'],
    blockReasons: [B.PAYMENT_OR_BANK_DATA, B.MISSING_APPROVAL, B.CONTRADICTORY_DATA, B.UNCLEAR_PROJECT],
    approvalRule: RISK_LEVELS.LOW,
    outputTypes: ['Buchungsvorschlag', 'Zahlungsentwurf', 'Sperrstatus'],
    handoffTo: ['RISK', 'CONTROLLING'],
    verboseAudit: true,
  },
  {
    key: 'PROJEKT',
    name: 'Projekt AI',
    priority: 4,
    purpose:
      'Eröffnet nach Auftragserteilung das Projekt, erstellt Checkliste, Aufgaben und Terminplanentwurf.',
    dataSources: ['projects', 'qop', 'crm', 'tasks', 'scheduling'],
    allowedActions: ['CREATE_PROJECT', 'UPDATE_PROJECT', 'CREATE_TASK'],
    forbiddenActions: ['SEND_CHAT', 'CREATE_INVOICE'],
    triggers: ['Offerte angenommen'],
    requiredData: ['Kunde', 'Objekt', 'Projekttyp'],
    blockReasons: [B.MISSING_PERMIT, B.MISSING_APPROVAL, B.UNCLEAR_RESPONSIBILITY],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Projekt', 'Aufgabenliste', 'Terminplanentwurf'],
    handoffTo: ['BEHOERDEN', 'MONEY', 'MATERIAL', 'DISPO'],
  },
  {
    key: 'BEHOERDEN',
    name: 'Behörden AI',
    priority: 5,
    purpose:
      'Bereitet Baumeldungen, Baugesuche, Bohrbewilligungen, Fördergesuche und WPSM-Unterlagen vor. Reicht nie selbständig ein.',
    dataSources: ['projects', 'documents', 'crm'],
    allowedActions: ['PERMIT_CHECK'],
    forbiddenActions: ['CREATE_INVOICE', 'SEND_CHAT'],
    triggers: ['Projekt eröffnet'],
    requiredData: ['Kanton', 'Gemeinde', 'Anlagetyp', 'Leistung kW'],
    blockReasons: [B.MISSING_PERMIT, B.MISSING_DOCUMENT, B.LEGAL_PROCESS, B.MISSING_APPROVAL],
    approvalRule: RISK_LEVELS.LOW,
    outputTypes: ['Formularentwurf', 'Prüfansicht', 'Fristenüberwachung', 'Sperrstatus'],
    handoffTo: ['QUALITY', 'MONEY', 'DOCUMENT'],
    verboseAudit: true,
  },
  {
    key: 'SERVICE',
    name: 'Service AI',
    priority: 6,
    purpose:
      'Erkennt fällige Wartungen, strukturiert Störungsmeldungen, bereitet Serviceaufträge und Monteur-Briefings vor.',
    dataSources: ['installations', 'fieldTickets', 'mobile', 'crm'],
    allowedActions: [
      'CREATE_ORDER', 'ANALYZE_FIELD_TICKET', 'CREATE_TASK',
      'SERVICE_DUE', 'SERVICE_BRIEFING',
    ],
    forbiddenActions: ['CREATE_INVOICE'],
    triggers: ['Wartung überfällig (täglicher Lauf um 06:00)'],
    requiredData: ['Anlage', 'Kunde'],
    blockReasons: [B.UNCLEAR_CUSTOMER, B.MISSING_REQUIRED_DATA],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Serviceauftrag', 'Briefing', 'Folgeofferte-Aufgabe'],
    handoffTo: ['DISPO', 'OFFERTE', 'MONEY'],
  },
  {
    key: 'RAPPORT',
    name: 'Rapport AI',
    priority: 7,
    purpose:
      'Strukturiert gesprochene Arbeitsrapporte, prüft die Vollständigkeit und erkennt Folgearbeiten.',
    dataSources: ['voiceSessions', 'mobile', 'catalog'],
    allowedActions: ['CREATE_REPORT', 'UPDATE_REPORT', 'RECORD_TIME'],
    forbiddenActions: ['CREATE_INVOICE'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: ['Auftrag', 'Arbeitszeit', 'Ausgeführte Arbeiten'],
    blockReasons: [B.MISSING_REQUIRED_DATA, B.MISSING_DOCUMENT],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Rapportentwurf', 'Mängelliste', 'Folgearbeit-Aufgabe'],
    handoffTo: ['MONEY', 'OFFERTE', 'QUALITY'],
  },
  {
    key: 'MONEY',
    name: 'Money AI',
    priority: 8,
    purpose:
      'Erkennt Akonto- und Schlussrechnungszeitpunkte, bereitet QR-Rechnungen vor und sperrt bei offenen Rapporten.',
    dataSources: ['qop', 'projects', 'scheduling', 'mobile'],
    allowedActions: ['CREATE_INVOICE'],
    forbiddenActions: ['SEND_CHAT'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: ['Kunde', 'Projekt', 'Leistungsstand'],
    blockReasons: [B.MISSING_PRICE, B.MISSING_APPROVAL, B.MISSING_REQUIRED_DATA, B.CONTRADICTORY_DATA],
    approvalRule: RISK_LEVELS.LOW,
    outputTypes: ['Rechnungsentwurf', 'E-Mail-Entwurf', 'Sperrstatus'],
    handoffTo: ['BEHOERDEN', 'CONTROLLING'],
    verboseAudit: true,
  },
  {
    key: 'SALES',
    name: 'Sales AI',
    priority: 9,
    purpose:
      'Überwacht offene Offerten, priorisiert Nachfassaktionen nach Auftragswert und pflegt den CRM-Status.',
    dataSources: ['qop', 'crm', 'tasks'],
    allowedActions: ['CREATE_TASK', 'SEARCH_ORDERS', 'SALES_FOLLOWUPS'],
    forbiddenActions: ['CREATE_INVOICE', 'CREATE_QUOTATION'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: ['Offerte', 'Kunde'],
    blockReasons: [B.UNCLEAR_CUSTOMER, B.MISSING_REQUIRED_DATA],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Nachfassaufgabe', 'E-Mail-Entwurf', 'Telefonleitfaden'],
    handoffTo: ['PROJEKT', 'CUSTOMER'],
  },
  {
    key: 'KNOWLEDGE',
    name: 'Knowledge AI',
    priority: 10,
    purpose:
      'Beantwortet interne Fragen zu Prozessen, Vorlagen und Checklisten. Weist auf Unsicherheit hin statt zu raten.',
    dataSources: ['documents', 'textBlocks', 'checklists'],
    // Not GENERAL: an ordinary conversational answer is the assistant's own,
    // and claiming it would mean switching Knowledge AI off left the office
    // unable to ask the assistant anything at all.
    allowedActions: ['SEARCH_DOCUMENTS', 'KNOWLEDGE_ASK'],
    forbiddenActions: ['CREATE_INVOICE', 'CREATE_QUOTATION', 'DELETE_CUSTOMER'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: [],
    blockReasons: [B.CONTRADICTORY_DATA, B.MISSING_DOCUMENT],
    approvalRule: RISK_LEVELS.HIGH,
    outputTypes: ['Antwort mit Quellenangabe', 'Verweis auf zuständige Person'],
    handoffTo: [],
  },
  {
    key: 'CONTROLLING',
    name: 'Controlling AI',
    priority: 11,
    purpose:
      'Liefert Kennzahlen, Umsatz- und Liquiditätsprognosen sowie Wochen- und Monatsberichte. Markiert unvollständige Datengrundlagen.',
    dataSources: ['qop', 'accounting', 'projects', 'timeTracking'],
    allowedActions: ['PROJECT_FIGURES'],
    forbiddenActions: ['CREATE_INVOICE', 'SEND_CHAT'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: [],
    blockReasons: [B.CONTRADICTORY_DATA, B.MISSING_REQUIRED_DATA],
    approvalRule: RISK_LEVELS.HIGH,
    outputTypes: ['Kennzahlenbericht', 'Prognose', 'Hinweis auf Datenlücken'],
    handoffTo: [],
  },
  {
    key: 'DISPO',
    name: 'Dispo AI',
    priority: 12,
    purpose:
      'Schlägt Einsätze vor anhand von Qualifikation, Zeit, Ort, Material- und Bewilligungsstatus. Prüft zehn Punkte vor jedem Einsatz.',
    dataSources: ['scheduling', 'employees', 'projects', 'material'],
    allowedActions: [
      'CREATE_ASSIGNMENT', 'RESCHEDULE_ASSIGNMENT',
      'DISPATCH_CHECK', 'DISPATCH_SUGGEST',
    ],
    forbiddenActions: ['CREATE_INVOICE'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: ['Monteur', 'Termin', 'Objekt'],
    blockReasons: [B.MISSING_PERMIT, B.MISSING_REQUIRED_DATA, B.UNCLEAR_RESPONSIBILITY],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Einsatzvorschlag', 'Verschiebungsvorschlag', 'Planungsprüfung'],
    handoffTo: ['CUSTOMER', 'MONEY'],
  },
  {
    key: 'MATERIAL',
    name: 'Material AI',
    priority: 13,
    purpose:
      'Ermittelt den Materialbedarf je Projekt, überwacht Bestellungen und warnt vor fehlendem Material vor Baustart.',
    dataSources: ['catalog', 'qop', 'projects'],
    allowedActions: ['CREATE_TASK', 'MATERIAL_CHECK'],
    forbiddenActions: ['CREATE_INVOICE'],
    triggers: ['Baustart geplant'],
    requiredData: ['Projekt', 'Materialliste'],
    blockReasons: [B.MISSING_REQUIRED_DATA, B.CONTRADICTORY_DATA],
    approvalRule: RISK_LEVELS.MEDIUM,
    outputTypes: ['Bestellvorschlag', 'Materialstatus', 'Warnung'],
    handoffTo: ['PROJEKT', 'DISPO'],
  },
  {
    key: 'QUALITY',
    name: 'Quality AI',
    priority: 14,
    purpose:
      'Prüft die Abschluss-Checkliste je Projekttyp und sperrt den Projektabschluss bei fehlenden Unterlagen.',
    dataSources: ['documents', 'projects', 'mobile'],
    allowedActions: ['CREATE_TASK', 'QUALITY_CHECK'],
    forbiddenActions: ['CREATE_INVOICE', 'DELETE_PROJECT'],
    triggers: ['Projekt abgeschlossen gemeldet'],
    requiredData: ['Projekt', 'Projekttyp'],
    blockReasons: [B.MISSING_DOCUMENT, B.MISSING_APPROVAL, B.MISSING_REQUIRED_DATA],
    approvalRule: RISK_LEVELS.LOW,
    outputTypes: ['Abschlussprüfung', 'Mängelliste', 'Sperrstatus'],
    handoffTo: ['BEHOERDEN', 'MONEY', 'CUSTOMER', 'DOCUMENT'],
  },
  {
    key: 'CUSTOMER',
    name: 'Customer AI',
    priority: 15,
    purpose:
      'Erstellt Entwürfe für Kundenkommunikation per E-Mail, WhatsApp oder SMS. Versendet nie ohne Freigabe.',
    dataSources: ['crm', 'projects', 'scheduling', 'textBlocks'],
    // Drafting is all of it. SEND_NOTIFICATION reaches colleagues in the
    // system and SEND_CHAT posts in an internal room — neither reaches a
    // customer, and no action in this system does. Claiming them made the
    // register promise a capability the code has not got.
    allowedActions: ['DRAFT_CUSTOMER_MESSAGE'],
    forbiddenActions: ['CREATE_INVOICE', 'CREATE_QUOTATION'],
    triggers: ['Nur auf Anfrage im Assistenten'],
    requiredData: ['Kunde', 'Anlass'],
    blockReasons: [B.UNCLEAR_CUSTOMER, B.MISSING_APPROVAL, B.MISSING_REQUIRED_DATA],
    approvalRule: RISK_LEVELS.LOW,
    outputTypes: ['E-Mail-Entwurf', 'WhatsApp-Entwurf', 'SMS-Entwurf'],
    handoffTo: ['SALES'],
  },
];

/**
 * Upserts the declarations. Existing documents keep their isEnabled state so a
 * restart never silently re-enables an agent the office switched off.
 */
export async function seedAgentRegistry() {
  let created = 0;
  for (const agent of AGENTS) {
    const result = await AgentRegistry.updateOne(
      { key: agent.key },
      {
        $set: {
          name: agent.name,
          purpose: agent.purpose,
          priority: agent.priority,
          dataSources: agent.dataSources,
          allowedActions: agent.allowedActions,
          forbiddenActions: agent.forbiddenActions,
          triggers: agent.triggers,
          requiredData: agent.requiredData,
          blockReasons: agent.blockReasons,
          approvalRule: agent.approvalRule,
          outputTypes: agent.outputTypes,
          handoffTo: agent.handoffTo,
          verboseAudit: Boolean(agent.verboseAudit),
        },
        $setOnInsert: { isEnabled: true, isDeleted: false },
      },
      { upsert: true },
    );
    if (result?.upsertedCount) created += 1;
  }

  if (created) {
    logger.info('Agent registry seeded', {
      module: 'seed',
      action: 'agentRegistry',
      created,
      total: AGENTS.length,
    });
  }
  return { created, total: AGENTS.length };
}

export default seedAgentRegistry;
