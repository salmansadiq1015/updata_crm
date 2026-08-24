/**
 * Action-capable workflow for field-service voice/text commands.
 *
 * This workflow intentionally combines deterministic parsing with existing
 * domain services. It executes low-risk commands when enough data is present
 * and returns structured follow-up prompts when required business fields are
 * missing.
 */
import { StateGraph, END } from '@langchain/langgraph';
import mongoose from 'mongoose';

import { MAX_STEPS, MIN_AGENT_INPUT_LENGTH } from '../agent/agent.guardrails.js';
import agentRunRepository from '../agent/agentRun.repository.js';
import { fetchWorkforcePlanningContextTool } from '../tools/workforce.tools.js';
import { analyzeFieldTicketTool } from '../tools/fieldTicket.tools.js';
import {
  executeFieldServiceCapability,
  getFieldServiceCapabilityFields,
  isFieldServiceCapabilityAction,
} from '../capabilities/fieldService.capabilities.js';
import { WorkflowState } from './workflow.state.js';
import agentGovernance from '../governance/agentGovernance.service.js';
import { RISK_LEVEL_LABELS } from '../governance/agent.risk.js';
import logger from '../../../shared/logger/index.js';
import swissPlzService from '../../../shared/ai/swissPlz.service.js';

const ACTIONS = Object.freeze({
  CREATE_CUSTOMER: 'CREATE_CUSTOMER',
  UPDATE_CUSTOMER: 'UPDATE_CUSTOMER',
  CREATE_TASK: 'CREATE_TASK',
  UPDATE_TASK: 'UPDATE_TASK',
  CREATE_PROJECT: 'CREATE_PROJECT',
  CREATE_ORDER: 'CREATE_ORDER',
  UPDATE_ORDER: 'UPDATE_ORDER',
  CREATE_ASSIGNMENT: 'CREATE_ASSIGNMENT',
  RESCHEDULE_ASSIGNMENT: 'RESCHEDULE_ASSIGNMENT',
  CREATE_REPORT: 'CREATE_REPORT',
  UPDATE_REPORT: 'UPDATE_REPORT',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  CREATE_NOTE: 'CREATE_NOTE',
  SEND_CHAT: 'SEND_CHAT',
  SUMMARIZE_CHAT: 'SUMMARIZE_CHAT',
  RECORD_TIME: 'RECORD_TIME',
  ANALYZE_WORKFORCE: 'ANALYZE_WORKFORCE',
  SALES_FOLLOWUPS: 'SALES_FOLLOWUPS',
  QUALITY_CHECK: 'QUALITY_CHECK',
  SERVICE_DUE: 'SERVICE_DUE',
  SERVICE_BRIEFING: 'SERVICE_BRIEFING',
  ANALYZE_FIELD_TICKET: 'ANALYZE_FIELD_TICKET',
  DELETE_CUSTOMER: 'DELETE_CUSTOMER',
  DELETE_TASK: 'DELETE_TASK',
  DELETE_PROJECT: 'DELETE_PROJECT',
  DELETE_ORDER: 'DELETE_ORDER',
  DELETE_REPORT: 'DELETE_REPORT',
  DELETE_ASSIGNMENT: 'DELETE_ASSIGNMENT',
  SEARCH_CUSTOMER: 'SEARCH_CUSTOMER',
  SEARCH_TASKS: 'SEARCH_TASKS',
  SEARCH_PROJECTS: 'SEARCH_PROJECTS',
  SEARCH_ORDERS: 'SEARCH_ORDERS',
  SEARCH_REPORTS: 'SEARCH_REPORTS',
  SEARCH_DOCUMENTS: 'SEARCH_DOCUMENTS',
  CREATE_QUOTATION: 'CREATE_QUOTATION',
  CREATE_INVOICE: 'CREATE_INVOICE',
  CREATE_TASK_REMINDER: 'CREATE_TASK_REMINDER',
  GENERAL: 'GENERAL',
});

const ACTION_LABELS = {
  [ACTIONS.CREATE_CUSTOMER]: 'einen Kunden erfassen',
  [ACTIONS.UPDATE_CUSTOMER]: 'einen Kunden aktualisieren',
  [ACTIONS.CREATE_TASK]: 'eine Aufgabe erstellen',
  [ACTIONS.UPDATE_TASK]: 'eine Aufgabe aktualisieren',
  [ACTIONS.CREATE_PROJECT]: 'ein Projekt eröffnen',
  [ACTIONS.CREATE_ORDER]: 'einen Auftrag erstellen',
  [ACTIONS.UPDATE_ORDER]: 'einen Auftrag aktualisieren',
  [ACTIONS.CREATE_ASSIGNMENT]: 'einen Einsatz planen',
  [ACTIONS.RESCHEDULE_ASSIGNMENT]: 'einen Einsatz verschieben',
  [ACTIONS.CREATE_REPORT]: 'einen Rapport erstellen',
  [ACTIONS.UPDATE_REPORT]: 'einen Rapport aktualisieren',
  [ACTIONS.UPDATE_PROJECT]: 'ein Projekt aktualisieren',
  [ACTIONS.CREATE_NOTE]: 'eine Notiz erfassen',
  [ACTIONS.SEND_CHAT]: 'eine Chat-Nachricht senden',
  [ACTIONS.SUMMARIZE_CHAT]: 'einen Chat zusammenfassen',
  [ACTIONS.RECORD_TIME]: 'Arbeitszeit erfassen',
  [ACTIONS.ANALYZE_WORKFORCE]: 'die Personalplanung auswerten',
  [ACTIONS.SALES_FOLLOWUPS]: 'die offenen Offerten prüfen',
  [ACTIONS.QUALITY_CHECK]: 'den Projektabschluss prüfen',
  [ACTIONS.SERVICE_DUE]: 'die fälligen Wartungen prüfen',
  [ACTIONS.SERVICE_BRIEFING]: 'ein Monteur-Briefing vorbereiten',
  [ACTIONS.ANALYZE_FIELD_TICKET]: 'eine Störungsmeldung analysieren',
  [ACTIONS.DELETE_CUSTOMER]: 'einen Kunden archivieren',
  [ACTIONS.DELETE_TASK]: 'eine Aufgabe löschen',
  [ACTIONS.DELETE_PROJECT]: 'ein Projekt löschen',
  [ACTIONS.DELETE_ORDER]: 'einen Auftrag löschen',
  [ACTIONS.DELETE_REPORT]: 'einen Rapport löschen',
  [ACTIONS.DELETE_ASSIGNMENT]: 'einen Einsatz löschen',
  [ACTIONS.SEARCH_CUSTOMER]: 'Kundendaten suchen',
  [ACTIONS.SEARCH_TASKS]: 'Aufgaben suchen',
  [ACTIONS.SEARCH_PROJECTS]: 'Projekte suchen',
  [ACTIONS.SEARCH_ORDERS]: 'Aufträge suchen',
  [ACTIONS.SEARCH_REPORTS]: 'Rapporte suchen',
  [ACTIONS.SEARCH_DOCUMENTS]: 'Dokumente suchen',
  [ACTIONS.CREATE_QUOTATION]: 'eine Offerte erstellen',
  [ACTIONS.CREATE_INVOICE]: 'eine Rechnung erstellen',
  [ACTIONS.CREATE_TASK_REMINDER]: 'eine Erinnerung erstellen',
  [ACTIONS.GENERAL]: 'beim System helfen',
};

const PROJECT_STATUS_BY_PHRASE = [
  ['waiting for material', 'WAITING_FOR_MATERIAL'],
  ['material', 'WAITING_FOR_MATERIAL'],
  ['in progress', 'IN_PROGRESS'],
  ['bearbeitung', 'IN_PROGRESS'],
  ['scheduled', 'SCHEDULED'],
  ['geplant', 'SCHEDULED'],
  ['customer approval', 'AWAITING_CUSTOMER_APPROVAL'],
  ['quotation approval', 'AWAITING_QUOTATION_APPROVAL'],
  ['on hold', 'ON_HOLD'],
  ['pause', 'ON_HOLD'],
  ['completed', 'COMPLETED'],
  ['fertig', 'COMPLETED'],
  ['invoiced', 'INVOICED'],
  ['planning', 'PLANNING'],
  ['planung', 'PLANNING'],
  ['draft', 'DRAFT'],
];

const ASSIGNMENT_CONTEXT_TYPES = new Set([
  'assignment',
  'field_order',
  'field-order',
  'mobile_order',
  'mobile-order',
  'work_order',
  'work-order',
  'workorder',
]);

const QOP_ORDER_CONTEXT_TYPES = new Set([
  'qop_order',
  'qop-order',
  'commercial_order',
  'commercial-order',
]);

async function executeAction(state) {
  const stepCount = state.stepCount + 1;
  if (stepCount >= MAX_STEPS) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'MAX_STEPS_EXCEEDED', message: `Max agent steps (${MAX_STEPS}) exceeded`, node: 'execute_action' },
    };
  }

  const input = String(state.input || '').trim();
  if (input.length < MIN_AGENT_INPUT_LENGTH) {
    return {
      stepCount,
      status: 'failed',
      error: { code: 'INVALID_INPUT', message: 'Tell me what you want me to do.', node: 'execute_action' },
    };
  }

  const previousFollowUp = state.entities?.previousFollowUp || null;
  const requestContext = state.entities?.requestContext || {};
  const llmPlan = state.entities?.llmPlan || null;
  const action = previousFollowUp?.action
    || (llmPlan?.action && ACTIONS[llmPlan.action] ? ACTIONS[llmPlan.action] : classifyAction(input));
  const effectiveInput = previousFollowUp?.originalInput
    ? `${previousFollowUp.originalInput}\nFollow-up answer: ${input}`
    : input;
  const context = action === ACTIONS.CREATE_CUSTOMER ? {} : await resolveContext(effectiveInput, previousFollowUp, requestContext, action, llmPlan?.params || null);
  // Clean parameters extracted by the LLM planner; handlers prefer these over
  // keyword stripping. Dates crossed the queue as ISO strings.
  context.llmDraft = llmPlan?.params || null;
  context.requestContext = requestContext;
  let output;

  try {
    output = await performAction(action, effectiveInput, context, state.userId, state);
  } catch (err) {
    logger.warn('Field service agent action failed', {
      module: 'ai-workflows',
      action: 'field_service.execute',
      agentRunId: state.agentRunId,
      requestedAction: action,
      error: err.message,
    });
    return {
      stepCount,
      status: 'completed',
      output: {
        action,
        status: 'needs_follow_up',
        message: `Ich konnte ${ACTION_LABELS[action] || 'das noch nicht erledigen'} noch nicht abschliessen.`,
        followUpQuestions: [err.message],
        missingFields: [],
        originalInput: previousFollowUp?.originalInput || input,
      },
    };
  }

  if (output?.status === 'needs_follow_up' || output?.status === 'awaiting_confirmation') {
    output.originalInput = previousFollowUp?.originalInput || input;
  }

  try {
    await agentRunRepository.pushStep(state.agentRunId, {
      stepIndex: stepCount,
      node: 'execute_action',
      type: output.status === 'completed' ? 'TOOL_CALL' : 'REASONING',
      toolName: action.toLowerCase(),
      toolInput: { input: effectiveInput, resolvedContext: summarizeContext(context) },
      toolOutput: output,
      timestamp: new Date(),
    });
  } catch (dbErr) {
    logger.warn('AgentRun.pushStep failed for field service workflow', {
      module: 'ai-workflows',
      action: 'field_service.pushStep',
      agentRunId: state.agentRunId,
      error: dbErr.message,
    });
  }

  return {
    stepCount,
    status: output?.status === 'awaiting_confirmation' ? 'awaiting_confirmation' : 'completed',
    output,
    toolResults: [output],
  };
}

function classifyAction(input) {
  const text = input.toLowerCase();
  const isDelete = hasAny(text, ['delete', 'remove', 'archive', 'deactivate', 'loeschen', 'löschen', 'archiv']);
  const isUpdate = hasAny(text, ['update', 'edit', 'change', 'set', 'mark', 'status', 'aktualisier', 'aendere', 'ändere']);
  const isView = hasSearchIntent(text) || hasAny(text, ['list', 'view', 'display', 'all', 'overview', 'recent', 'latest', 'alle', 'liste', 'uebersicht', 'übersicht']);

  if (isDelete && hasAny(text, ['customer', 'kunde', 'client', 'company', 'firma'])) return ACTIONS.DELETE_CUSTOMER;
  if (isDelete && hasAny(text, ['service report', 'work report', 'report', 'rapport', 'bericht'])) return ACTIONS.DELETE_REPORT;
  if (isDelete && hasAny(text, ['assignment', 'appointment', 'termin', 'einsatz'])) return ACTIONS.DELETE_ASSIGNMENT;
  if (isDelete && hasAny(text, ['project', 'projekt'])) return ACTIONS.DELETE_PROJECT;
  if (isDelete && hasAny(text, ['order', 'orders', 'job', 'jobs', 'auftrag', 'auftraege'])) return ACTIONS.DELETE_ORDER;
  if (isDelete && hasAny(text, ['task', 'todo', 'aufgabe'])) return ACTIONS.DELETE_TASK;

  if (isView && hasAny(text, ['service report', 'work report', 'reports', 'report', 'rapport', 'bericht'])) return ACTIONS.SEARCH_REPORTS;
  if (isView && hasAny(text, ['task', 'tasks', 'todo', 'todos', 'aufgabe', 'aufgaben'])) return ACTIONS.SEARCH_TASKS;
  if (isView && hasAny(text, ['document', 'documents', 'file', 'files', 'pdf', 'dokument', 'datei'])) return ACTIONS.SEARCH_DOCUMENTS;
  if (isView && hasAny(text, ['project', 'projects', 'projekt', 'projekte'])) return ACTIONS.SEARCH_PROJECTS;
  if (isView && hasAny(text, ['order', 'orders', 'job', 'jobs', 'auftrag', 'auftraege'])) return ACTIONS.SEARCH_ORDERS;
  if (isView && hasAny(text, ['customer', 'customers', 'kunde', 'kunden', 'client', 'company', 'firma'])) return ACTIONS.SEARCH_CUSTOMER;

  if (isUpdate && hasAny(text, ['customer', 'kunde', 'client', 'company', 'firma'])) return ACTIONS.UPDATE_CUSTOMER;
  if (isUpdate && hasAny(text, ['service report', 'work report', 'report', 'rapport', 'bericht'])) return ACTIONS.UPDATE_REPORT;

  if (hasAny(text, ['ticket', 'incident', 'technician report', 'technician ticket', 'stoerung', 'meldung'])
    && hasAny(text, ['analyze', 'categorize', 'prioritize', 'recommend', 'analyse', 'kategorisier', 'priorisier'])) return ACTIONS.ANALYZE_FIELD_TICKET;
  if (hasAny(text, ['create customer', 'new customer', 'add customer', 'create company', 'new company', 'add company', 'kunde anlegen', 'kunden anlegen', 'neuer kunde', 'neuen kunden', 'firma erstellen', 'firma anlegen', 'neue firma'])) return ACTIONS.CREATE_CUSTOMER;
  if (hasAny(text, ['quotation', 'quote', 'offerte', 'angebot'])) return ACTIONS.CREATE_QUOTATION;
  if (hasAny(text, ['invoice', 'rechnung'])) return ACTIONS.CREATE_INVOICE;
  if (hasAny(text, ['reminder', 'remind me', 'notify me', 'erinnerung', 'erinnere'])) return ACTIONS.CREATE_TASK_REMINDER;
  if (hasAny(text, ['service report', 'work report', 'rapport', 'bericht'])) return ACTIONS.CREATE_REPORT;
  if (hasAny(text, ['chat', 'message', 'nachricht', 'send to', 'schreib'])) return ACTIONS.SEND_CHAT;
  if (hasAny(text, ['workforce', 'absence', 'absences', 'leave', 'vacation', 'availability', 'overtime', 'deficit', 'kapazitaet', 'kapazitaet', 'abwesenheit', 'ferien', 'ueberzeit', 'ueberzeit'])) return ACTIONS.ANALYZE_WORKFORCE;
  if (hasAny(text, ['working hour', 'hours', 'time entry', 'zeit', 'stunden'])) return ACTIONS.RECORD_TIME;
  if (hasAny(text, ['reschedule', 'move appointment', 'verschieb'])) return ACTIONS.RESCHEDULE_ASSIGNMENT;
  if (hasAny(text, ['schedule', 'appointment', 'assign', 'plan', 'termin', 'zuweisen'])) return ACTIONS.CREATE_ASSIGNMENT;
  if (hasAny(text, ['project', 'projekt']) && hasAny(text, ['create', 'new', 'add', 'erstelle', 'neues', 'neuen', 'anlegen'])) return ACTIONS.CREATE_PROJECT;
  if (hasAny(text, ['project', 'projekt']) && hasAny(text, ['status', 'update', 'set', 'change', 'aktualisier'])) return ACTIONS.UPDATE_PROJECT;
  if (hasAny(text, ['order', 'job', 'auftrag'])) {
    if (hasAny(text, ['update', 'status', 'change', 'set'])) return ACTIONS.UPDATE_ORDER;
    return ACTIONS.CREATE_ORDER;
  }
  if (hasAny(text, ['note', 'notiz', 'document', 'documentation', 'dokumentation'])) return ACTIONS.CREATE_NOTE;
  if (hasAny(text, ['customer', 'kunde', 'client', 'show me', 'find', 'search', 'suche'])) return ACTIONS.SEARCH_CUSTOMER;
  if (hasAny(text, ['task', 'aufgabe', 'todo'])) {
    if (hasAny(text, ['complete', 'done', 'erledigt', 'in progress', 'bearbeitung'])) return ACTIONS.UPDATE_TASK;
    return ACTIONS.CREATE_TASK;
  }
  return classifyActionLegacy(input);
}

function classifyActionLegacy(input) {
  const text = input.toLowerCase();
  if (hasAny(text, ['ticket', 'incident', 'technician report', 'technician ticket', 'stoerung', 'meldung'])
    && hasAny(text, ['analyze', 'categorize', 'prioritize', 'recommend', 'analyse', 'kategorisier', 'priorisier'])) return ACTIONS.ANALYZE_FIELD_TICKET;
  if (hasAny(text, ['create customer', 'new customer', 'add customer', 'create company', 'new company', 'add company', 'kunde anlegen', 'kunden anlegen', 'neuer kunde', 'neuen kunden', 'firma erstellen', 'firma anlegen', 'neue firma'])) return ACTIONS.CREATE_CUSTOMER;
  if (hasAny(text, ['quotation', 'quote', 'offerte', 'angebot'])) return ACTIONS.CREATE_QUOTATION;
  if (hasAny(text, ['invoice', 'rechnung'])) return ACTIONS.CREATE_INVOICE;
  if (hasAny(text, ['service report', 'work report', 'rapport', 'bericht'])) return ACTIONS.CREATE_REPORT;
  if (hasAny(text, ['chat', 'message', 'nachricht', 'send to', 'schreib'])) return ACTIONS.SEND_CHAT;
  if (hasAny(text, ['workforce', 'absence', 'absences', 'leave', 'vacation', 'availability', 'overtime', 'deficit', 'kapazitaet', 'kapazität', 'abwesenheit', 'ferien', 'ueberzeit', 'überzeit'])) return ACTIONS.ANALYZE_WORKFORCE;
  if (hasAny(text, ['working hour', 'hours', 'time entry', 'zeit', 'stunden'])) return ACTIONS.RECORD_TIME;
  if (hasAny(text, ['schedule', 'appointment', 'assign', 'plan', 'termin', 'zuweisen'])) return ACTIONS.CREATE_ASSIGNMENT;
  if (hasAny(text, ['reschedule', 'move appointment', 'verschieb'])) return ACTIONS.RESCHEDULE_ASSIGNMENT;
  if (hasAny(text, ['project', 'projekt']) && hasAny(text, ['status', 'update', 'set', 'change', 'aktualisier'])) return ACTIONS.UPDATE_PROJECT;
  if (hasAny(text, ['order', 'job', 'auftrag'])) {
    if (hasAny(text, ['update', 'status', 'change', 'set'])) return ACTIONS.UPDATE_ORDER;
    return ACTIONS.CREATE_ORDER;
  }
  if (hasAny(text, ['note', 'notiz', 'document', 'documentation', 'dokumentation'])) return ACTIONS.CREATE_NOTE;
  if (hasAny(text, ['customer', 'kunde', 'client', 'show me', 'find', 'search', 'suche'])) return ACTIONS.SEARCH_CUSTOMER;
  if (hasAny(text, ['task', 'aufgabe', 'todo'])) {
    if (hasAny(text, ['complete', 'done', 'erledigt', 'in progress', 'bearbeitung'])) return ACTIONS.UPDATE_TASK;
    return ACTIONS.CREATE_TASK;
  }
  return ACTIONS.GENERAL;
}

async function performAction(action, input, context, userId, state = {}) {
  // Single gate in front of every action: emergency stop, per-agent kill
  // switch (proactive runs only) and the risk-based approval rule.
  const decision = await agentGovernance.evaluate(action, {
    confirmed: Boolean(state.confirmed),
    agentKey: state.agentKey || null,
  });
  if (!decision.allowed) {
    await agentGovernance.record(decision, { action, userId, agentRunId: state.agentRunId, input });
    return decision.block;
  }
  if (decision.requiresApproval) {
    await agentGovernance.record(decision, { action, userId, agentRunId: state.agentRunId, input });
    const target = confirmationTarget(action, context);
    return {
      action,
      status: 'awaiting_confirmation',
      riskLevel: decision.riskLevel,
      message: `${ACTION_LABELS[action] ? `Ich soll ${ACTION_LABELS[action]}. ` : ''}${RISK_LEVEL_LABELS[decision.riskLevel]}. Soll ich fortfahren?`,
      confirmation: {
        action,
        riskLevel: decision.riskLevel,
        label: ACTION_LABELS[action] || action,
        effect: RISK_LEVEL_LABELS[decision.riskLevel],
        ...target,
      },
      ...target,
      resolvedContext: summarizeContext(context),
    };
  }

  if (isFieldServiceCapabilityAction(action)) {
    return executeFieldServiceCapability({
      action,
      input,
      context,
      userId,
      state,
      helpers: fieldServiceCapabilityHelpers,
    });
  }

  switch (action) {
    case ACTIONS.CREATE_CUSTOMER:
      return createCustomer(input, context, userId);
    case ACTIONS.CREATE_TASK:
      return createTask(input, context, userId);
    case ACTIONS.UPDATE_PROJECT:
      return updateProject(input, context, userId);
    case ACTIONS.CREATE_REPORT:
      return createReport(input, context, userId);
    case ACTIONS.CREATE_ASSIGNMENT:
      return createAssignment(input, context, userId);
    case ACTIONS.RECORD_TIME:
      return recordTime(input, context, userId);
    case ACTIONS.ANALYZE_WORKFORCE:
      return analyzeWorkforce(input, state);
    case ACTIONS.SALES_FOLLOWUPS:
      return salesFollowUps(state);
    case ACTIONS.QUALITY_CHECK:
      return qualityCheck(context, state);
    case ACTIONS.SERVICE_DUE:
      return serviceDue(state);
    case ACTIONS.SERVICE_BRIEFING:
      return serviceBriefing(context, state);
    case ACTIONS.ANALYZE_FIELD_TICKET:
      return analyzeFieldTicket(input, state);
    case ACTIONS.CREATE_NOTE:
      return createNote(input, context, userId);
    case ACTIONS.SEND_CHAT:
      return sendChat(input, context, userId);
    case ACTIONS.SUMMARIZE_CHAT:
      return summarizeChat(input, context, userId, state);
    case ACTIONS.SEARCH_CUSTOMER:
      return searchCustomer(input, context);
    case ACTIONS.CREATE_ORDER:
      return createOrder(input, context, userId);
    case ACTIONS.UPDATE_TASK:
    case ACTIONS.UPDATE_ORDER:
    case ACTIONS.RESCHEDULE_ASSIGNMENT:
    case ACTIONS.CREATE_QUOTATION:
    case ACTIONS.CREATE_INVOICE:
      return needsFollowUp(action, fieldsForAction(action), context);
    default:
      return {
        action,
        status: 'needs_follow_up',
        message: 'I can create customers, create tasks, schedule work, create reports, record hours, send chat messages, create notes, update project status, and look up customer data.',
        followUpQuestions: ['What would you like me to do?'],
        missingFields: ['action'],
      };
  }
}

async function createCustomer(input, context, userId) {
  const draft = extractCustomerDraft(input);
  const missingFields = [];

  if (!draft.name) missingFields.push(draft.type === 'business' ? 'company name' : 'customer name');
  if (draft.type === 'business' && !draft.ownerName) missingFields.push('owner name');
  if (draft.type === 'business' && !draft.uidNumber) missingFields.push('UID number');
  if (!draft.street || !draft.postalCode || !draft.city) missingFields.push('street address with postal code and city');

  if (missingFields.length) {
    return needsFollowUp(ACTIONS.CREATE_CUSTOMER, missingFields, context);
  }

  const customerService = (await import('../../crm/customer.service.js')).default;
  const customer = await customerService.create(draft, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.CREATE_CUSTOMER,
    status: 'completed',
    message: `Kunde ${customer.customerNumber} erfasst: ${customer.name}.`,
    recordType: 'customer',
    recordId: customer._id,
    record: compactCustomer(customer),
  };
}

async function createTask(input, context, userId) {
  if (context.assigneeCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_TASK, ['employee/technician'], context);
  }
  if (context.projectCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_TASK, ['project'], context);
  }
  const draft = context.llmDraft || {};
  const title = draft.title || cleanTitle(input, ['create task', 'task', 'aufgabe', 'erstelle']);
  const priority = draft.priority || extractPriority(input);
  const dueDate = draftDate(draft.dueDate) || extractDate(input);

  const taskService = (await import('../../tasks/task.service.js')).default;
  const task = await taskService.create({
    title,
    description: draft.description || input,
    priority,
    ...(dueDate ? { dueDate } : {}),
    ...(context.assignee ? { assigneeId: context.assignee._id } : {}),
    ...(context.order ? { orderId: context.order._id } : {}),
    ...(!context.order && context.project ? { projectId: context.project._id } : {}),
  }, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.CREATE_TASK,
    status: 'completed',
    message: `Aufgabe erstellt: ${task.title}`,
    recordType: 'task',
    recordId: task._id,
    record: compactTask(task),
  };
}

async function updateProject(input, context, userId) {
  if (context.projectCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.UPDATE_PROJECT, ['project'], context);
  }
  if (!context.project) {
    return needsFollowUp(ACTIONS.UPDATE_PROJECT, ['project'], context);
  }
  const status = extractProjectStatus(input);
  if (!status) {
    return needsFollowUp(ACTIONS.UPDATE_PROJECT, ['project status'], context);
  }
  const projectService = (await import('../../pm/project.service.js')).default;
  const project = await projectService.update(context.project._id, { status }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.UPDATE_PROJECT,
    status: 'completed',
    message: `Projekt ${project.name} auf ${status} gesetzt.`,
    recordType: 'project',
    recordId: project._id,
    record: { id: project._id, name: project.name, status: project.status },
  };
}

async function createReport(input, context, userId) {
  if (context.assignmentCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_REPORT, ['order/work order'], context);
  }
  const orderId = context.assignment?._id;
  if (!orderId) {
    return needsFollowUp(ACTIONS.CREATE_REPORT, ['order/work order'], context);
  }
  // A dictated visit carries enough for Rapport AI to structure it; a one-line
  // command keeps the plain path.
  const rapportService = (await import('../agents/rapport/rapport.service.js')).default;
  const draft = input.length >= 80 ? await rapportService.draft(input) : null;

  const reportService = (await import('../../mobile/report.service.js')).default;
  const report = await reportService.create(orderId, {
    reportDate: new Date(),
    projectId: context.project?._id || objectIdValue(context.assignment?.projectId) || null,
    workPerformed: draft?.workPerformed || extractReportWorkPerformed(input),
    findings: draft?.findings || null,
    nextSteps: draft?.nextSteps || null,
    technicianNotes: draft ? rapportService.composeNotes(draft) : input,
    // catalogSource is required; dictated material is CUSTOM until the office
    // maps it onto a catalogue article.
    materialItems: draft?.materials?.length
      ? draft.materials.map((m, index) => ({
        catalogSource: 'CUSTOM',
        description: m.description,
        quantity: m.quantity,
        unit: m.unit || 'Stk',
        sortOrder: index,
      }))
      : extractMaterials(input),
    ...(draft?.workedHours ? { billableMinutes: Math.round(draft.workedHours * 60) } : {}),
    status: 'DRAFT',
  }, userId, { source: 'ai-agent' });

  const completeness = draft
    ? rapportService.completeness(draft, { hasAssignment: true })
    : { complete: false, missing: [] };

  const parts = [`Rapport-Entwurf ${report.reportNumber} erstellt`];
  if (draft?.materials?.length) parts.push(`${draft.materials.length} Materialposition(en)`);
  if (draft?.workedHours) parts.push(`${draft.workedHours} h Arbeitszeit`);
  let message = `${parts.join(', ')}.`;
  if (draft && !completeness.complete) {
    message += ` Für die Freigabe fehlt noch: ${completeness.missing.join(', ')}.`;
  }
  if (draft?.followUpQuotation?.needed) {
    message += ` Folgearbeit erkannt — eine Offerte wäre angezeigt${draft.followUpQuotation.reason ? ` (${draft.followUpQuotation.reason})` : ''}.`;
  }

  return {
    action: ACTIONS.CREATE_REPORT,
    status: 'completed',
    message,
    recordType: 'workReport',
    recordId: report._id,
    record: {
      id: report._id,
      orderId,
      reportNumber: report.reportNumber,
      status: report.status,
      ...(draft ? {
        materials: draft.materials.length,
        workedHours: draft.workedHours,
        billable: draft.billable,
        defectFound: draft.defectFound,
        followUpQuotation: draft.followUpQuotation.needed,
        missing: completeness.missing,
      } : {}),
    },
  };
}

async function createAssignment(input, context, userId) {
  if (context.assigneeCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_ASSIGNMENT, ['employee/technician'], context);
  }
  if (context.projectCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_ASSIGNMENT, ['project'], context);
  }
  const employee = context.assignee;
  if (!employee) return needsFollowUp(ACTIONS.CREATE_ASSIGNMENT, ['employee/technician'], context);
  const draft = context.llmDraft || {};
  const start = draftDate(draft.dateTime) || extractDateTime(input);
  if (!start) return needsFollowUp(ACTIONS.CREATE_ASSIGNMENT, ['scheduled date and time'], context);
  const durationHours = draft.durationHours || extractDurationHours(input) || 1;
  const assignmentService = (await import('../../deploy/assignment.service.js')).default;
  const result = await assignmentService.create({
    employeeIds: [employee._id],
    assignmentType: hasAny(input.toLowerCase(), ['maintenance', 'wartung']) ? 'MAINTENANCE' : 'PROJECT_WORK',
    title: draft.title || cleanTitle(input, ['schedule', 'assign', 'plan', 'termin']),
    startDatetime: start,
    endDatetime: new Date(start.getTime() + durationHours * 60 * 60 * 1000),
    projectId: context.project?._id || null,
    customerId: context.customer?._id || null,
    priority: ['URGENT', 'HIGH'].includes(draft.priority || extractPriority(input)) ? (draft.priority || extractPriority(input)) : 'NORMAL',
    instructions: input,
  }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.CREATE_ASSIGNMENT,
    status: 'completed',
    message: `Einsatz für ${displayUser(employee)} geplant.`,
    recordType: 'assignment',
    recordId: result?.[0]?.id,
    record: result?.[0] || null,
  };
}

async function recordTime(input, context, userId) {
  if (context.assignmentCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.RECORD_TIME, ['order/work order'], context);
  }
  const orderId = context.assignment?._id || firstObjectId(input);
  if (!orderId) return needsFollowUp(ACTIONS.RECORD_TIME, ['order/work order'], context);
  const hours = extractDurationHours(input);
  if (!hours) return needsFollowUp(ACTIONS.RECORD_TIME, ['hours or start/end time'], context);

  const start = extractDateTime(input) || new Date(Date.now() - hours * 60 * 60 * 1000);
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  const timeEntryService = (await import('../../mobile/timeEntry.service.js')).default;
  const entry = await timeEntryService.create(orderId, {
    startTime: start,
    endTime: end,
    breakDurationMin: 0,
    description: cleanTitle(input, ['record time', 'hours', 'stunden', 'zeit']),
  }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.RECORD_TIME,
    status: 'completed',
    message: `${hours} Stunde(n) erfasst.`,
    recordType: 'timeEntry',
    recordId: entry._id,
    record: { id: entry._id, orderId, netDurationMin: entry.netDurationMin },
  };
}

async function analyzeFieldTicket(input, state) {
  const ticketId = firstObjectId(input);
  if (!ticketId) return needsFollowUp(ACTIONS.ANALYZE_FIELD_TICKET, ['ticket id'], {});

  const toolConfig = {
    configurable: {
      userId: state.userId,
      permissions: state.permissions || [],
      agentRunId: state.agentRunId,
    },
  };

  const rawResult = await analyzeFieldTicketTool.invoke({ ticketId }, toolConfig);
  let result;
  try {
    result = JSON.parse(rawResult);
  } catch {
    result = { raw: rawResult };
  }

  return {
    action: ACTIONS.ANALYZE_FIELD_TICKET,
    status: 'completed',
    message: `Meldung ${result.ticketNumber || ticketId} analysiert.`,
    recordType: 'fieldTicket',
    recordId: ticketId,
    record: result,
  };
}

async function salesFollowUps(state = {}) {
  const permissions = state.permissions || [];
  if (!permissions.includes('*') && !permissions.includes('quotations:read')) {
    return {
      action: ACTIONS.SALES_FOLLOWUPS,
      status: 'failed',
      message: 'Für diese Aktion fehlt Ihnen die Berechtigung.',
    };
  }
  const salesService = (await import('../agents/sales/sales.service.js')).default;
  const followUps = await salesService.findFollowUps();
  return {
    action: ACTIONS.SALES_FOLLOWUPS,
    status: 'completed',
    message: salesService.compose(followUps),
    records: followUps,
  };
}

/**
 * Quality AI's closing check.
 *
 * The check itself always succeeds — the question "can I close this?" gets an
 * answer either way. Whether the project may be closed sits in `canClose`, so
 * a blocked closing reads as a finding, not as a failed run.
 */
async function qualityCheck(context, state = {}) {
  const permissions = state.permissions || [];
  if (!permissions.includes('*') && !permissions.includes('projects:read')) {
    return {
      action: ACTIONS.QUALITY_CHECK,
      status: 'failed',
      message: 'Für diese Aktion fehlt Ihnen die Berechtigung.',
    };
  }
  if (context.projectCandidates?.length > 1 || !context.project) {
    return needsFollowUp(ACTIONS.QUALITY_CHECK, ['project'], context);
  }

  const qualityService = (await import('../agents/quality/quality.service.js')).default;
  const result = await qualityService.checkBeforeClose(context.project);

  return {
    action: ACTIONS.QUALITY_CHECK,
    status: 'completed',
    message: qualityService.compose(result),
    recordType: 'project',
    recordId: context.project._id,
    record: {
      id: context.project._id,
      name: result.project?.name || context.project.name,
      projectNumber: result.project?.projectNumber || null,
      status: result.project?.status || null,
      canClose: result.ok,
      template: result.template?.key || null,
      blockers: result.blockers.map((blocker) => blocker.detail),
      warnings: result.warnings,
      missingDocuments: result.missing.map((requirement) => requirement.label),
      presentDocuments: result.present.map((item) => item.label),
    },
  };
}

/**
 * Service AI: what maintenance is due. A reading, so it always answers —
 * an empty list is an answer too.
 */
async function serviceDue(state = {}) {
  const permissions = state.permissions || [];
  if (!permissions.includes('*') && !permissions.includes('crm:read')) {
    return {
      action: ACTIONS.SERVICE_DUE,
      status: 'failed',
      message: 'Für diese Aktion fehlt Ihnen die Berechtigung.',
    };
  }
  const serviceService = (await import('../agents/service/service.service.js')).default;
  const due = await serviceService.findDueMaintenance();
  return {
    action: ACTIONS.SERVICE_DUE,
    status: 'completed',
    message: serviceService.composeDueList(due),
    records: due,
  };
}

/** Service AI: the briefing for one plant, before a technician drives out. */
async function serviceBriefing(context, state = {}) {
  const permissions = state.permissions || [];
  if (!permissions.includes('*') && !permissions.includes('crm:read')) {
    return {
      action: ACTIONS.SERVICE_BRIEFING,
      status: 'failed',
      message: 'Für diese Aktion fehlt Ihnen die Berechtigung.',
    };
  }
  if (context.installationCandidates?.length > 1 || !context.installation) {
    return needsFollowUp(ACTIONS.SERVICE_BRIEFING, ['installation'], context);
  }

  const serviceService = (await import('../agents/service/service.service.js')).default;
  const data = await serviceService.briefing(context.installation);
  if (!data) {
    return needsFollowUp(ACTIONS.SERVICE_BRIEFING, ['installation'], context);
  }

  return {
    action: ACTIONS.SERVICE_BRIEFING,
    status: 'completed',
    message: serviceService.composeBriefing(data),
    recordType: 'installation',
    recordId: data.installation._id,
    record: {
      id: data.installation._id,
      installationNumber: data.installation.installationNumber || null,
      manufacturer: data.installation.manufacturer || null,
      model: data.installation.model || null,
      fuelType: data.installation.fuelType || null,
      ageYears: data.age,
      customer: data.customer?.name || null,
      openTickets: data.tickets.length,
      maintenanceIntervals: data.intervals.length,
    },
  };
}

async function analyzeWorkforce(input, state) {
  const toolInput = {
    ...extractDateRange(input),
    ...(firstObjectId(input) ? { employeeId: firstObjectId(input) } : {}),
  };
  const toolConfig = {
    configurable: {
      userId: state.userId,
      permissions: state.permissions || [],
      agentRunId: state.agentRunId,
    },
  };

  const rawResult = await fetchWorkforcePlanningContextTool.invoke(toolInput, toolConfig);
  let result;
  try {
    result = JSON.parse(rawResult);
  } catch {
    result = { raw: rawResult };
  }

  return {
    action: ACTIONS.ANALYZE_WORKFORCE,
    status: 'completed',
    message: 'Personalplanung ausgewertet.',
    recordType: 'workforcePlanningContext',
    record: result,
  };
}

async function createNote(input, context, userId) {
  if (context.customerCandidates?.length > 1 || context.installationCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_NOTE, ['customer/site/asset'], context);
  }
  const entityType = context.customer ? 'customer' : context.installation ? 'installation' : context.site ? 'site' : null;
  const entity = context.customer || context.installation || context.site;
  if (!entityType || !entity) return needsFollowUp(ACTIONS.CREATE_NOTE, ['customer/site/asset'], context);
  const entityNoteService = (await import('../../crm/entityNote.service.js')).default;
  const note = await entityNoteService.create(entityType, entity._id, {
    text: cleanTitle(input, ['create note', 'note', 'notiz']),
    category: hasAny(input.toLowerCase(), ['warning', 'warnung']) ? 'warning' : 'general',
    isWarning: hasAny(input.toLowerCase(), ['warning', 'warnung']),
  }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.CREATE_NOTE,
    status: 'completed',
    message: 'Notiz erfasst.',
    recordType: 'note',
    recordId: note._id,
  };
}

async function sendChat(input, context, userId) {
  const roomId = context.roomId || extractAfter(input, ['room ', 'chat room ']);
  if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
    return needsFollowUp(ACTIONS.SEND_CHAT, ['chat room'], context);
  }
  const content = context.llmDraft?.messageContent || extractAfter(input, ['message ', 'nachricht ', 'say ', 'send ']) || input;
  const User = (await import('../../auth/user.model.js')).default;
  const sender = await User.findById(userId).select('firstName lastName email').lean();
  const chatMessageService = (await import('../../chat/chatMessage.service.js')).default;
  const message = await chatMessageService.sendMessage(roomId, { content, messageType: 'TEXT' }, sender);
  return {
    action: ACTIONS.SEND_CHAT,
    status: 'completed',
    message: 'Chat-Nachricht gesendet.',
    recordType: 'chatMessage',
    recordId: message._id,
  };
}

async function summarizeChat(input, context, userId, state = {}) {
  const permissions = state.permissions || [];
  if (!permissions.includes('*') && !permissions.includes('chat:read')) {
    return {
      action: ACTIONS.SUMMARIZE_CHAT,
      status: 'failed',
      message: "Missing permission 'chat:read'",
    };
  }
  const requestRoomId = context.requestContext?.chatRoomId || context.roomId || extractAfter(input, ['room ', 'chat room ']);
  if (!requestRoomId || !mongoose.Types.ObjectId.isValid(requestRoomId)) {
    return needsFollowUp(ACTIONS.SUMMARIZE_CHAT, ['chat room'], context);
  }

  const User = (await import('../../auth/user.model.js')).default;
  const user = await User.findById(userId).select('firstName lastName email role').lean();
  const chatRoomService = (await import('../../chat/chatRoom.service.js')).default;
  await chatRoomService.assertMembership(requestRoomId, user);

  const ChatMessage = (await import('../../mobile/chatMessage.model.js')).default;
  const messages = await ChatMessage.find({ roomId: requestRoomId, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('senderId', 'firstName lastName')
    .lean();
  if (!messages.length) {
    return { action: ACTIONS.SUMMARIZE_CHAT, status: 'completed', message: 'Dieser Chat enthält noch keine Nachrichten.' };
  }

  const transcript = messages
    .reverse()
    .map((m) => {
      const who = m.senderId ? `${m.senderId.firstName || ''} ${m.senderId.lastName || ''}`.trim() : 'Unbekannt';
      const text = m.transcript || m.content || (m.messageType !== 'TEXT' ? `[${m.messageType}]` : '');
      return `${who}: ${text}`;
    })
    .join('\n');

  const { createChatModel } = await import('../../../shared/ai/llmFactory.js');
  const llm = await createChatModel({ temperature: 0.3 });
  const response = await llm.invoke([
    {
      role: 'system',
      content: 'Fasse den folgenden Team-Chat eines Schweizer Heizungsbau-Betriebs kurz zusammen: die wichtigsten Themen, getroffene Entscheidungen und offene Punkte als knappe Aufzählung. Antworte in der Sprache, in der der Chat hauptsächlich geführt wird.',
    },
    { role: 'user', content: transcript.slice(0, 12000) },
  ]);

  return {
    action: ACTIONS.SUMMARIZE_CHAT,
    status: 'completed',
    message: String(response.content),
    recordType: 'chatRoom',
    recordId: requestRoomId,
  };
}

async function searchCustomer(input, context) {
  const customers = context.customer ? [context.customer] : context.customerCandidates?.length ? context.customerCandidates : await findCustomers(extractSearchTerm(input), 5);
  if (!customers.length) return needsFollowUp(ACTIONS.SEARCH_CUSTOMER, ['customer name'], context);
  return {
    action: ACTIONS.SEARCH_CUSTOMER,
    status: 'completed',
    message: customers.length === 1 ? `${customers[0].name} gefunden.` : `${customers.length} Kunden gefunden.`,
    records: customers.map((customer) => ({
      id: customer._id,
      name: customer.name,
      ownerName: customer.ownerName,
      customerNumber: customer.customerNumber,
      email: customer.email,
      phone: customer.phone || customer.mobile,
      city: customer.city,
      uidNumber: customer.uidNumber || customer.vatNumber,
    })),
  };
}

async function createOrder(input, context, userId) {
  if (context.customerCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_ORDER, ['customer'], context);
  }
  if (!context.customer) return needsFollowUp(ACTIONS.CREATE_ORDER, ['customer'], context);
  const orderService = (await import('../../qop/order.service.js')).default;
  const order = await orderService.create({
    customerId: context.customer._id,
    customerName: context.customer.name,
    projectId: context.project?._id || null,
    title: context.llmDraft?.title || cleanTitle(input, ['create order', 'create job', 'auftrag', 'order']),
    notes: context.llmDraft?.description || input,
    lineItems: [],
    language: 'de',
  }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.CREATE_ORDER,
    status: 'completed',
    message: `Auftrag ${order.orderNumber} für ${order.customerName} erstellt.`,
    recordType: 'order',
    recordId: order._id,
    record: { id: order._id, orderNumber: order.orderNumber, customerName: order.customerName, status: order.status },
  };
}

/**
 * Names the record an action is about, so the confirmation prompt can show
 * what exactly is at stake rather than just the action label.
 */
const CONFIRMATION_TARGETS = {
  [ACTIONS.DELETE_TASK]: ['task', 'task'],
  [ACTIONS.DELETE_ORDER]: ['order', 'order'],
  [ACTIONS.DELETE_PROJECT]: ['project', 'project'],
  [ACTIONS.DELETE_CUSTOMER]: ['customer', 'customer'],
  [ACTIONS.DELETE_REPORT]: ['workReport', 'report'],
  [ACTIONS.DELETE_ASSIGNMENT]: ['assignment', 'assignment'],
  [ACTIONS.RESCHEDULE_ASSIGNMENT]: ['assignment', 'assignment'],
};

function confirmationTarget(action, context = {}) {
  const mapping = CONFIRMATION_TARGETS[action];
  if (!mapping) return {};
  const [recordType, contextKey] = mapping;
  const record = context[contextKey];
  if (!record?._id) return {};
  return { recordType, recordId: String(record._id) };
}

/** German names for the fields an action can be missing. */
const FIELD_LABELS = {
  customer: 'den Kunden',
  'customer name': 'den Kundennamen',
  'company name': 'den Firmennamen',
  'owner name': 'den Inhabernamen',
  'UID number': 'die UID-Nummer',
  'street address with postal code and city': 'die Adresse mit PLZ und Ort',
  project: 'das Projekt',
  'project name': 'den Projektnamen',
  'project status': 'den Projektstatus',
  'project manager': 'die Projektleitung',
  'employee/technician': 'den Monteur',
  'order/work order': 'den Auftrag',
  order: 'den Auftrag',
  task: 'die Aufgabe',
  'service report': 'den Rapport',
  assignment: 'den Einsatz',
  'chat room': 'den Chat-Raum',
  'scheduled date and time': 'Datum und Uhrzeit',
  'new date and time': 'das neue Datum mit Uhrzeit',
  'hours or start/end time': 'die Stundenzahl oder Start- und Endzeit',
  'customer/site/asset': 'den Kunden, das Objekt oder die Anlage',
  installation: 'die Anlage',
  'line items or service description': 'die Positionen oder die Leistungsbeschreibung',
  'new status or assignment': 'den neuen Status oder die Zuweisung',
  'new status or details': 'den neuen Status oder die Angaben',
  'new report content or status': 'den Rapportinhalt oder den Status',
  action: 'die gewünschte Aktion',
  permission: 'die nötige Berechtigung',
  confirmation: 'Ihre Bestätigung',
};

/** Which candidate list belongs to which missing field. */
const FIELD_CANDIDATE_KEY = {
  customer: 'customers',
  'customer name': 'customers',
  project: 'projects',
  'project name': 'projects',
  'employee/technician': 'assignees',
  'project manager': 'assignees',
  'order/work order': 'assignments',
  order: 'orders',
  task: 'tasks',
  'service report': 'reports',
  assignment: 'assignments',
  'customer/site/asset': 'installations',
  installation: 'installations',
};

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

/**
 * Says plainly what is missing and, when the system already found possible
 * matches, lists them numbered so the answer can be "1" or the name. The
 * candidates were always in the payload — they just never reached the reader.
 */
function needsFollowUp(action, missingFields = [], context = {}) {
  const candidates = summarizeCandidates(context);
  const lines = [`Ich kann ${ACTION_LABELS[action] || 'das erledigen'}, dafür fehlt mir noch etwas.`];

  const questions = [];
  for (const field of missingFields) {
    const options = candidates[FIELD_CANDIDATE_KEY[field]] || [];
    if (options.length) {
      lines.push('');
      lines.push(`Welchen Treffer meinen Sie für ${fieldLabel(field)}?`);
      options.forEach((option) => {
        lines.push(`  ${option.index}. ${option.label}${option.subtitle ? ` — ${option.subtitle}` : ''}`);
      });
      questions.push(`Welchen Treffer meinen Sie für ${fieldLabel(field)}? Antworten Sie mit der Nummer oder dem Namen.`);
    } else {
      lines.push(`- Bitte ${fieldLabel(field)} angeben.`);
      questions.push(`Bitte ${fieldLabel(field)} angeben.`);
    }
  }

  return {
    action,
    status: 'needs_follow_up',
    message: lines.join('\n'),
    missingFields,
    followUpQuestions: questions,
    resolvedContext: summarizeContext(context),
    candidates,
  };
}

async function resolveContext(input, previousFollowUp = null, requestContext = {}, action = null, draft = null) {
  const objectId = firstObjectId(input);
  const requestResolved = await loadRequestResolvedContext(requestContext);
  const [userResult, customerResult, projectResult, orderResult, assignmentResult, installationResult, taskResult, reportResult] = await Promise.all([
    findUser(input, previousFollowUp, draft),
    findCustomer(input, objectId, previousFollowUp, draft),
    findProject(input, objectId, previousFollowUp, draft),
    findOrder(input, objectId, previousFollowUp),
    requestResolved.assignment ? { selected: null, candidates: [] } : findAssignment(input, objectId, previousFollowUp),
    findInstallation(input, objectId, draft),
    shouldResolveTask(input, previousFollowUp, action) ? findTask(input, objectId, previousFollowUp) : { selected: null, candidates: [] },
    shouldResolveReport(input, previousFollowUp, action) ? findReport(input, objectId, previousFollowUp, requestResolved.assignment) : { selected: null, candidates: [] },
  ]);
  const previousResolved = await loadPreviousResolvedContext(previousFollowUp?.resolvedContext);
  return {
    assignee: userResult.selected || previousResolved.assignee,
    assigneeCandidates: userResult.selected ? [] : userResult.candidates,
    customer: customerResult.selected || requestResolved.customer || previousResolved.customer,
    customerCandidates: customerResult.selected || requestResolved.customer ? [] : customerResult.candidates,
    project: projectResult.selected || requestResolved.project || previousResolved.project,
    projectCandidates: projectResult.selected || requestResolved.project ? [] : projectResult.candidates,
    order: orderResult.selected || previousResolved.order,
    orderCandidates: orderResult.selected ? [] : orderResult.candidates,
    assignment: assignmentResult.selected || requestResolved.assignment || previousResolved.assignment,
    assignmentCandidates: assignmentResult.selected || requestResolved.assignment ? [] : assignmentResult.candidates,
    installation: installationResult.selected || requestResolved.installation || previousResolved.installation,
    installationCandidates: installationResult.selected || requestResolved.installation ? [] : installationResult.candidates,
    task: taskResult.selected || previousResolved.task,
    taskCandidates: taskResult.selected ? [] : taskResult.candidates,
    report: reportResult.selected || requestResolved.report || previousResolved.report,
    reportCandidates: reportResult.selected || requestResolved.report ? [] : reportResult.candidates,
    site: null,
    roomId: extractRoomId(input),
  };
}

async function loadPreviousResolvedContext(resolvedContext = {}) {
  const [assignee, customer, project, order, assignment, installation, task, report] = await Promise.all([
    loadPreviousUser(resolvedContext.assignee?.id),
    loadPreviousCustomer(resolvedContext.customer?.id),
    loadPreviousProject(resolvedContext.project?.id),
    loadPreviousOrder(resolvedContext.order?.id),
    loadPreviousAssignment(resolvedContext.assignment?.id || resolvedContext.workOrder?.id),
    loadPreviousInstallation(resolvedContext.installation?.id),
    loadPreviousTask(resolvedContext.task?.id),
    loadPreviousReport(resolvedContext.report?.id || resolvedContext.workReport?.id),
  ]);
  return { assignee, customer, project, order, assignment, installation, task, report };
}

async function loadRequestResolvedContext(requestContext = {}) {
  const recordId = requestContext.recordId || requestContext.contextRecordId || requestContext.id;
  const recordType = normalizeContextRecordType(requestContext.recordType || requestContext.contextRecordType);
  const assignmentId = requestContext.assignmentId
    || requestContext.orderId
    || (ASSIGNMENT_CONTEXT_TYPES.has(recordType) || recordType === 'order' ? recordId : null);
  const qopOrderId = requestContext.qopOrderId
    || (QOP_ORDER_CONTEXT_TYPES.has(recordType) ? recordId : null);
  const projectId = requestContext.projectId || (recordType === 'project' ? recordId : null);
  const customerId = requestContext.customerId || (recordType === 'customer' ? recordId : null);
  const installationId = requestContext.installationId || (recordType === 'installation' ? recordId : null);
  const reportId = requestContext.reportId
    || requestContext.workReportId
    || (['report', 'workreport', 'work_report', 'work-report'].includes(recordType) ? recordId : null);

  const [assignment, order, project, customer, installation, report] = await Promise.all([
    loadPreviousAssignment(assignmentId),
    loadPreviousOrder(qopOrderId),
    loadPreviousProject(projectId),
    loadPreviousCustomer(customerId),
    loadPreviousInstallation(installationId),
    loadPreviousReport(reportId),
  ]);

  return {
    assignment: assignment || (report?.orderId && typeof report.orderId === 'object' ? report.orderId : null),
    order,
    project: project
      || (assignment?.projectId && typeof assignment.projectId === 'object' ? assignment.projectId : null)
      || (report?.projectId && typeof report.projectId === 'object' ? report.projectId : null),
    customer: customer || (assignment?.customerId && typeof assignment.customerId === 'object' ? assignment.customerId : null),
    installation,
    report,
  };
}

function normalizeContextRecordType(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '_');
}

async function loadPreviousUser(id) {
  if (!id) return null;
  const User = (await import('../../auth/user.model.js')).default;
  return User.findById(id).select('firstName lastName email status role').lean().catch(() => null);
}

async function loadPreviousCustomer(id) {
  if (!id) return null;
  const Customer = (await import('../../crm/customer.model.js')).default;
  return Customer.findById(id).select('name ownerName customerNumber email phone mobile city uidNumber vatNumber').lean().catch(() => null);
}

async function loadPreviousProject(id) {
  if (!id) return null;
  const Project = (await import('../../pm/project.model.js')).default;
  return Project.findById(id).select('name projectNumber status customerId customerName').lean().catch(() => null);
}

async function loadPreviousOrder(id) {
  if (!id) return null;
  const Order = (await import('../../qop/order.model.js')).default;
  return Order.findById(id).select('orderNumber title status customerId customerName projectId').lean().catch(() => null);
}

async function loadPreviousAssignment(id) {
  if (!id) return null;
  const Assignment = (await import('../../deploy/assignment.model.js')).default;
  return Assignment.findById(id)
    .select('assignmentNumber title status projectId customerId orderId assignmentType priority startDatetime endDatetime')
    .lean()
    .catch(() => null);
}

async function loadPreviousInstallation(id) {
  if (!id) return null;
  const Installation = (await import('../../crm/installation.model.js')).default;
  return Installation.findById(id).select('name model serialNumber status siteId customerId').lean().catch(() => null);
}

async function loadPreviousTask(id) {
  if (!id) return null;
  const Task = (await import('../../tasks/task.model.js')).default;
  return Task.findById(id)
    .select('title status priority assigneeId dueDate projectId orderId')
    .lean()
    .catch(() => null);
}

async function loadPreviousReport(id) {
  if (!id) return null;
  const WorkReport = (await import('../../mobile/workReport.model.js')).default;
  return WorkReport.findById(id)
    .select('reportNumber status orderId projectId reportDate workPerformed createdAt')
    .lean()
    .catch(() => null);
}

async function findUser(input, previousFollowUp, draft = null) {
  const User = (await import('../../auth/user.model.js')).default;
  const term = draft?.assigneeName || extractPersonName(input);
  const previousCandidates = previousFollowUp?.candidates?.assignees || [];
  const selectedPrevious = selectCandidateFromAnswer(input, previousCandidates);
  if (selectedPrevious?._id) {
    const selected = await User.findById(selectedPrevious._id).select('firstName lastName email status role').lean();
    if (selected) return { selected, candidates: [] };
  }
  if (!term) return { selected: null, candidates: [] };
  const candidates = await User.find({ $text: { $search: term }, status: { $ne: 'deactivated' } })
    .select('firstName lastName email status role')
    .limit(5)
    .lean();
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
}

async function findCustomer(input, objectId, previousFollowUp, draft = null) {
  const Customer = (await import('../../crm/customer.model.js')).default;
  const previousCandidates = previousFollowUp?.candidates?.customers || [];
  const selectedPrevious = selectCandidateFromAnswer(input, previousCandidates);
  if (selectedPrevious?._id) {
    const selected = await Customer.findById(selectedPrevious._id).select('name ownerName customerNumber email phone mobile city uidNumber vatNumber').lean();
    if (selected) return { selected, candidates: [] };
  }
  if (objectId) {
    const found = await Customer.findById(objectId).select('name ownerName customerNumber email phone mobile city uidNumber vatNumber').lean().catch(() => null);
    if (found) return { selected: found, candidates: [] };
  }
  const candidates = await findCustomers(draft?.customerName || extractSearchTerm(input), 5);
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
}

async function findCustomers(term, limit = 5) {
  if (!term || term.length < 2) return [];
  const customerRepository = (await import('../../crm/customer.repository.js')).default;

  // The CRM search is accent-safe and matches partial words, unlike a bare
  // $text query; it requires every word to match, so a term still carrying
  // filler ("Kundendaten von Immobilien Verwaltung") finds nothing. Drop the
  // filler and try again rather than telling the user there is no such client.
  let results = await customerRepository.textSearch(term, limit).catch(() => []);
  if (results.length) return results;

  const stripped = stripSearchNoise(term);
  if (stripped && stripped !== term) {
    results = await customerRepository.textSearch(stripped, limit).catch(() => []);
    if (results.length) return results;
  }

  // Last resort: the longest word, which is almost always the actual name.
  const longest = (stripped || term).split(/\s+/).sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length >= 4 && longest !== stripped) {
    return customerRepository.textSearch(longest, limit).catch(() => []);
  }
  return [];
}

async function findProject(input, objectId, previousFollowUp, draft = null) {
  const Project = (await import('../../pm/project.model.js')).default;
  const previousCandidates = previousFollowUp?.candidates?.projects || [];
  const selectedPrevious = selectCandidateFromAnswer(input, previousCandidates);
  if (selectedPrevious?._id) {
    const selected = await Project.findById(selectedPrevious._id).select('name projectNumber status customerId customerName').lean();
    if (selected) return { selected, candidates: [] };
  }
  if (objectId) {
    const found = await Project.findById(objectId).select('name projectNumber status customerId customerName').lean().catch(() => null);
    if (found) return { selected: found, candidates: [] };
  }
  const term = draft?.projectName || extractSearchTerm(input);
  if (!term || term.length < 2) return { selected: null, candidates: [] };
  const candidates = await Project.find({ $text: { $search: term } }).select('name projectNumber status customerId customerName').limit(5).lean();
  if (candidates.length === 1) return { selected: candidates[0], candidates: [] };

  // A full-text search ranks by shared words, so several projects match as soon
  // as they have a word in common. When one of them is named exactly what was
  // said, that is the one — asking again would only annoy the reader.
  const spoken = String(term).trim().toLowerCase();
  const exact = candidates.filter((project) => String(project.name || '').trim().toLowerCase() === spoken);
  if (exact.length === 1) return { selected: exact[0], candidates: [] };

  return { selected: null, candidates };
}

async function findOrder(input, objectId, previousFollowUp) {
  const Order = (await import('../../qop/order.model.js')).default;
  const previousCandidates = previousFollowUp?.candidates?.orders || [];
  const selectedPrevious = selectCandidateFromAnswer(input, previousCandidates);
  if (selectedPrevious?._id) {
    const selected = await Order.findById(selectedPrevious._id).select('orderNumber title status customerId customerName projectId').lean();
    if (selected) return { selected, candidates: [] };
  }
  if (objectId) {
    const found = await Order.findById(objectId).select('orderNumber title status customerId customerName projectId').lean().catch(() => null);
    if (found) return { selected: found, candidates: [] };
  }
  const term = extractSearchTerm(input);
  if (!term || term.length < 2) return { selected: null, candidates: [] };
  const candidates = await Order.find({ $text: { $search: term } }).select('orderNumber title status customerId customerName projectId').limit(5).lean();
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
}

async function findAssignment(input, objectId, previousFollowUp) {
  const Assignment = (await import('../../deploy/assignment.model.js')).default;
  const previousCandidates = [
    ...(previousFollowUp?.candidates?.assignments || []),
    ...(previousFollowUp?.candidates?.orders || []),
  ];
  const selectedPrevious = selectCandidateFromAnswer(input, previousCandidates);
  if (selectedPrevious?._id) {
    const selected = await Assignment.findById(selectedPrevious._id)
      .select('assignmentNumber title status projectId customerId orderId assignmentType priority startDatetime endDatetime')
      .lean();
    if (selected) return { selected, candidates: [] };
  }
  if (objectId) {
    const found = await Assignment.findById(objectId)
      .select('assignmentNumber title status projectId customerId orderId assignmentType priority startDatetime endDatetime')
      .lean()
      .catch(() => null);
    if (found) return { selected: found, candidates: [] };
  }
  if (/\bcurrent\s+(work\s+)?order\b/i.test(input)) {
    return { selected: null, candidates: [] };
  }
  // A dictated report usually names the assignment: "zum Einsatz ASN-2026-00003".
  const documentNumber = documentNumberIn(input);
  if (documentNumber) {
    const byNumber = await Assignment.findOne({ assignmentNumber: new RegExp(`^${escapeRegex(documentNumber)}$`, 'i') })
      .select('assignmentNumber title status projectId customerId orderId assignmentType priority startDatetime endDatetime')
      .lean()
      .catch(() => null);
    if (byNumber) return { selected: byNumber, candidates: [] };
  }

  const term = extractSearchTerm(input);
  if (!term || term.length < 2) {
    return { selected: null, candidates: [] };
  }
  const regex = new RegExp(escapeRegex(term), 'i');
  const candidates = await Assignment.find({
    $or: [
      { assignmentNumber: regex },
      { title: regex },
    ],
  })
    .select('assignmentNumber title status projectId customerId orderId assignmentType priority startDatetime endDatetime')
    .limit(5)
    .lean();
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
}

const INSTALLATION_FIELDS = 'installationNumber type manufacturer model serialNumber fuelType status siteId';

/**
 * Finds the plant the office is talking about.
 *
 * Nobody says "installation 6a54a691…". They say its number (A-00001), its
 * serial, its make, or simply whose plant it is — so all four are tried, and
 * the customer route goes through the sites that belong to them.
 */
async function findInstallation(input, objectId, draft = null) {
  const Installation = (await import('../../crm/installation.model.js')).default;
  if (objectId) {
    const selected = await Installation.findById(objectId).select(INSTALLATION_FIELDS).lean().catch(() => null);
    return { selected, candidates: selected ? [selected] : [] };
  }

  const text = String(input || '');

  // 1. The plant number, as printed on the record and on the label.
  const number = text.match(/\b[A-Z]-\d{3,6}\b/i)?.[0];
  if (number) {
    const byNumber = await Installation.findOne({ installationNumber: new RegExp(`^${escapeRegex(number)}$`, 'i') })
      .select(INSTALLATION_FIELDS).lean();
    if (byNumber) return { selected: byNumber, candidates: [] };
  }

  const term = draft?.installationName || null;

  // 2. Serial, make or model.
  if (term && term.length >= 3) {
    const regex = new RegExp(escapeRegex(term), 'i');
    const byPlant = await Installation.find({
      $or: [{ serialNumber: regex }, { manufacturer: regex }, { model: regex }],
    }).select(INSTALLATION_FIELDS).limit(5).lean();
    if (byPlant.length === 1) return { selected: byPlant[0], candidates: [] };
    if (byPlant.length > 1) return { selected: null, candidates: byPlant };
  }

  // 3. Whose plant it is — customer, then their sites, then what stands there.
  const customerName = draft?.customerName || term;
  if (customerName && customerName.length >= 3) {
    const [Customer, Site] = await Promise.all([
      import('../../crm/customer.model.js').then((m) => m.default),
      import('../../crm/site.model.js').then((m) => m.default),
    ]);
    const customers = await Customer.find({ name: new RegExp(escapeRegex(customerName), 'i') })
      .select('_id').limit(5).lean();
    if (customers.length) {
      const sites = await Site.find({ customerId: { $in: customers.map((c) => c._id) } })
        .select('_id').limit(20).lean();
      if (sites.length) {
        const candidates = await Installation.find({ siteId: { $in: sites.map((s) => s._id) } })
          .select(INSTALLATION_FIELDS).limit(5).lean();
        if (candidates.length === 1) return { selected: candidates[0], candidates: [] };
        if (candidates.length > 1) return { selected: null, candidates };
      }
    }
  }

  return { selected: null, candidates: [] };
}

async function findTask(input, objectId, previousFollowUp) {
  const Task = (await import('../../tasks/task.model.js')).default;
  const previousCandidates = previousFollowUp?.candidates?.tasks || [];
  const selectedPrevious = selectCandidateFromAnswer(input, previousCandidates);
  if (selectedPrevious?._id) {
    const selected = await Task.findById(selectedPrevious._id)
      .select('title status priority assigneeId dueDate projectId orderId')
      .lean();
    if (selected) return { selected, candidates: [] };
  }
  if (objectId) {
    const found = await Task.findById(objectId)
      .select('title status priority assigneeId dueDate projectId orderId')
      .lean()
      .catch(() => null);
    if (found) return { selected: found, candidates: [] };
  }
  const term = extractSearchTerm(input);
  if (!term || term.length < 2) return { selected: null, candidates: [] };
  const candidates = await Task.find({ $text: { $search: term } })
    .select('title status priority assigneeId dueDate projectId orderId')
    .limit(5)
    .lean();
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
}

async function findReport(input, objectId, previousFollowUp, requestAssignment = null) {
  const WorkReport = (await import('../../mobile/workReport.model.js')).default;
  const previousCandidates = previousFollowUp?.candidates?.reports || [];
  const selectedPrevious = selectCandidateFromAnswer(input, previousCandidates);
  if (selectedPrevious?._id) {
    const selected = await WorkReport.findById(selectedPrevious._id)
      .select('reportNumber status orderId projectId reportDate workPerformed createdAt')
      .lean();
    if (selected) return { selected, candidates: [] };
  }
  if (objectId) {
    const found = await WorkReport.findById(objectId)
      .select('reportNumber status orderId projectId reportDate workPerformed createdAt')
      .lean()
      .catch(() => null);
    if (found) return { selected: found, candidates: [] };
  }
  if (requestAssignment?._id) {
    const reports = await WorkReport.find({ orderId: requestAssignment._id, isDeleted: false })
      .select('reportNumber status orderId projectId reportDate workPerformed createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    return { selected: reports.length === 1 ? reports[0] : null, candidates: reports };
  }

  const term = extractSearchTerm(input);
  if (!term || term.length < 2) return { selected: null, candidates: [] };
  const regex = new RegExp(escapeRegex(term), 'i');
  const candidates = await WorkReport.find({
    isDeleted: false,
    $or: [
      { reportNumber: regex },
      { workPerformed: regex },
      { findings: regex },
      { nextSteps: regex },
      { technicianNotes: regex },
    ],
  })
    .select('reportNumber status orderId projectId reportDate workPerformed createdAt')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
}

function shouldResolveTask(input, previousFollowUp, action = null) {
  if ([ACTIONS.UPDATE_TASK, ACTIONS.CREATE_TASK_REMINDER, ACTIONS.DELETE_TASK, ACTIONS.SEARCH_TASKS].includes(previousFollowUp?.action || action)) return true;
  const text = String(input || '').toLowerCase();
  return hasAny(text, ['task', 'todo', 'aufgabe', 'reminder', 'remind me', 'erinnerung']);
}

function shouldResolveReport(input, previousFollowUp, action = null) {
  if ([ACTIONS.UPDATE_REPORT, ACTIONS.DELETE_REPORT, ACTIONS.SEARCH_REPORTS].includes(previousFollowUp?.action || action)) return true;
  return false;
}

function fieldsForAction(action) {
  const map = {
    [ACTIONS.UPDATE_CUSTOMER]: ['customer', 'field to update'],
    [ACTIONS.UPDATE_TASK]: ['task', 'new status or assignment'],
    [ACTIONS.UPDATE_ORDER]: ['order', 'new status or details'],
    [ACTIONS.UPDATE_REPORT]: ['service report', 'new report content or status'],
    [ACTIONS.RESCHEDULE_ASSIGNMENT]: ['assignment', 'new date and time'],
    [ACTIONS.CREATE_QUOTATION]: ['customer', 'template or line items', 'pricing details'],
    [ACTIONS.CREATE_INVOICE]: ['customer or order', 'line items or source order'],
    [ACTIONS.DELETE_CUSTOMER]: ['customer', 'confirmation'],
    [ACTIONS.DELETE_TASK]: ['task', 'confirmation'],
    [ACTIONS.DELETE_PROJECT]: ['project', 'confirmation'],
    [ACTIONS.DELETE_ORDER]: ['order', 'confirmation'],
    [ACTIONS.DELETE_REPORT]: ['service report', 'confirmation'],
    [ACTIONS.DELETE_ASSIGNMENT]: ['assignment', 'confirmation'],
    [ACTIONS.SEARCH_TASKS]: ['task search term'],
    [ACTIONS.SEARCH_REPORTS]: ['service report search term'],
  };
  return map[action] || getFieldServiceCapabilityFields(action) || ['details'];
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function hasSearchIntent(text) {
  return hasAny(text, ['show', 'find', 'search', 'lookup', 'look up', 'suche', 'zeige']);
}

const fieldServiceCapabilityHelpers = {
  needsFollowUp,
  summarizeContext,
  cleanTitle,
  extractPriority,
  extractDate,
  extractDateTime,
  extractDurationHours,
  objectIdValue,
  extractSearchTerm,
  stripSearchNoise,
};

const SEARCH_NOISE = new Set([
  'kunde', 'kunden', 'kundendaten', 'kundin', 'firma', 'herr', 'frau', 'familie',
  'von', 'vom', 'der', 'die', 'das', 'den', 'dem', 'des', 'für', 'fuer', 'mit',
  'bei', 'zum', 'zur', 'einen', 'eine', 'einem', 'einer', 'ein', 'alle', 'mir',
  'zeig', 'zeige', 'suche', 'such', 'finde', 'zeigen', 'daten', 'infos',
  'projekt', 'auftrag', 'offerte', 'rechnung', 'aufgabe', 'rapport',
]);

/** Removes command and filler words so what is left is the actual name. */
function stripSearchNoise(term) {
  return String(term || '')
    .split(/\s+/)
    .filter((word) => word && !SEARCH_NOISE.has(word.toLowerCase().replace(/[.,:;!?]/g, '')))
    .join(' ')
    .trim();
}

const DOCUMENT_NUMBER = /\b[A-Z]{2,4}-\d{4}-\d{3,6}\b/i;

/** Picks a document number out of dictated text, where the search term misses it. */
function documentNumberIn(input) {
  const match = String(input || '').match(DOCUMENT_NUMBER);
  return match ? match[0] : null;
}

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstObjectId(input) {
  return input.match(/\b[0-9a-f]{24}\b/i)?.[0] || null;
}

function objectIdValue(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return value._id;
  return value;
}

function extractRoomId(input) {
  const match = input.match(/\broom\s+([0-9a-f]{24})\b/i) || input.match(/\bchat\s+([0-9a-f]{24})\b/i);
  return match?.[1] || null;
}

function extractPriority(input) {
  const text = input.toLowerCase();
  if (hasAny(text, ['urgent', 'dringend', 'sofort'])) return 'URGENT';
  if (hasAny(text, ['high', 'hoch', 'important'])) return 'HIGH';
  if (hasAny(text, ['low', 'niedrig'])) return 'LOW';
  return 'MEDIUM';
}

function extractProjectStatus(input) {
  const text = input.toLowerCase();
  return PROJECT_STATUS_BY_PHRASE.find(([phrase]) => text.includes(phrase))?.[1] || null;
}

function extractDurationHours(input) {
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|stunden?|h)\b/i);
  return match ? Number(match[1].replace(',', '.')) : null;
}

// LLM-draft dates arrive as ISO strings after queue serialization.
function draftDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractDate(input) {
  const dt = extractDateTime(input);
  if (dt) return dt;
  if (/\btomorrow\b|morgen/i.test(input)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return null;
}

function extractDateRange(input) {
  const isoDates = [...String(input || '').matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  if (isoDates.length >= 2) return { dateFrom: isoDates[0], dateTo: isoDates[1] };
  if (isoDates.length === 1) return { dateFrom: isoDates[0], dateTo: isoDates[0] };

  const text = String(input || '').toLowerCase();
  const today = new Date();
  if (hasAny(text, ['today', 'heute'])) {
    const day = today.toISOString().slice(0, 10);
    return { dateFrom: day, dateTo: day };
  }
  if (hasAny(text, ['week', 'woche'])) {
    const start = new Date(today);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
  }
  if (hasAny(text, ['month', 'monat'])) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10), year: today.getFullYear() };
  }
  return {};
}

function extractDateTime(input) {
  const iso = input.match(/\b\d{4}-\d{2}-\d{2}(?:[tT ]\d{2}:\d{2}(?::\d{2})?)?\b/)?.[0];
  if (iso) {
    const parsed = new Date(iso.includes('T') || iso.includes(' ') ? iso : `${iso}T09:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const dayMonth = input.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?:\s+(?:at\s*)?(\d{1,2})[:.](\d{2}))?\b/i);
  if (dayMonth) {
    const year = dayMonth[3] ? Number(dayMonth[3].length === 2 ? `20${dayMonth[3]}` : dayMonth[3]) : new Date().getFullYear();
    const parsed = new Date(year, Number(dayMonth[2]) - 1, Number(dayMonth[1]), Number(dayMonth[4] || 9), Number(dayMonth[5] || 0), 0, 0);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function extractMaterials(input) {
  const materialRegex = /(\d+(?:[.,]\d+)?)\s*(pcs|stk|pieces|meter|m|kg|l)?\s+([A-Za-z0-9\- ]{3,40})/gi;
  const materials = [];
  for (const match of input.matchAll(materialRegex)) {
    const description = match[3].trim();
    if (hasAny(description.toLowerCase(), ['hours', 'stunden', 'tage', 'days'])) continue;
    materials.push({
      catalogSource: 'CUSTOM',
      description,
      quantity: Number(match[1].replace(',', '.')),
      unit: match[2] || 'pcs',
    });
  }
  return materials.slice(0, 10);
}

function extractReportWorkPerformed(input) {
  const cleaned = cleanTitle(input, [
    'create a draft service report',
    'create draft service report',
    'create a service report',
    'create service report',
    'create a work report',
    'create work report',
    'draft service report',
    'service report',
    'work report',
    'rapport',
    'bericht',
  ])
    .replace(/\b(for|from)\s+(the\s+)?current\s+(work\s+)?order\b:?\s*/gi, ' ')
    .replace(/\bcurrent\s+(work\s+)?order\b:?\s*/gi, ' ')
    .replace(/^\s*[:.-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned || input).slice(0, 500);
}

function extractCustomerDraft(input) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const type = hasAny(lower, ['company', 'business', 'firma', 'gmbh', ' ag ', 'uid', 'vat', 'mwst']) ? 'business' : 'private';
  const address = extractCustomerAddress(text);

  return {
    type,
    name: type === 'business' ? extractCompanyName(text) : extractCustomerName(text),
    ownerName: type === 'business' ? extractOwnerName(text) : null,
    uidNumber: type === 'business' ? extractUidNumber(text) : null,
    street: address.street,
    postalCode: address.postalCode,
    city: address.city,
    canton: address.canton,
    country: 'CH',
    newsletterOptIn: false,
    newsletterChannel: 'email',
    notes: '',
  };
}

function extractCompanyName(input) {
  const quoted = input.match(/["\u201c](.+?)["\u201d]/)?.[1];
  if (quoted) return cleanExtractedCustomerValue(quoted);
  const match = input.match(/\b(?:company|firma|business|customer|kunde)(?:\s+(?:named|name|called|namens|heisst|ist))?\s+(.+?)(?=\s+(?:owner|owners|owner's|inhaber|besitzer|eigentuemer|eigent\u00fcmer|uid|vat|mwst|address|adresse|at)\b|[,;.]|$)/iu);
  return cleanExtractedCustomerValue(match?.[1]);
}

function extractCustomerName(input) {
  const quoted = input.match(/["\u201c](.+?)["\u201d]/)?.[1];
  if (quoted) return cleanExtractedCustomerValue(quoted);
  const match = input.match(/\b(?:customer|kunde|client)(?:\s+(?:named|name|called|namens|heisst|ist))?\s+(.+?)(?=\s+(?:address|adresse|at|phone|telefon|email)\b|[,;.]|$)/iu);
  return cleanExtractedCustomerValue(match?.[1] || extractAfter(input, ['create customer', 'new customer', 'add customer', 'neuer kunde', 'neuen kunden', 'kunde anlegen']));
}

function extractOwnerName(input) {
  const match = input.match(/\b(?:owner(?:'s)?(?:\s+name)?|owners name|inhaber(?:name)?|besitzer|eigentuemer|eigent\u00fcmer)\s*(?:is|ist|:)?\s+(.+?)(?=\s+(?:uid|vat|mwst|address|adresse|at)\b|[,;.]|$)/iu);
  return cleanExtractedCustomerValue(match?.[1]);
}

function extractUidNumber(input) {
  const match = input.match(/\b(?:uid(?:\s+(?:number|nr|nummer))?|vat|mwst)\s*(?:number|nr\.?|nummer|is|ist|:)?\s*([A-Z]{2,3}[-\s.]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}|[A-Z0-9][A-Z0-9 .-]{4,40})/i);
  if (!match?.[1]) return null;
  return match[1].trim().replace(/\s+/g, ' ').toUpperCase();
}

function extractCustomerAddress(input) {
  const empty = { street: null, postalCode: null, city: null, canton: null };
  const explicit = input.match(/\b(?:address|adresse|at)\s+(.+)$/i)?.[1];
  const postalIndex = input.search(/\b[1-9]\d{3}\b/);
  const source = explicit || (postalIndex >= 0 ? input.slice(Math.max(0, input.lastIndexOf(',', postalIndex) + 1)) : '');
  const candidate = source
    .replace(/\s+\b(?:owner|owners|owner's|inhaber|besitzer|eigentuemer|eigent\u00fcmer|uid|vat|mwst|email|phone|telefon)\b[\s\S]*$/iu, '')
    .trim();
  if (!candidate || !/\b[1-9]\d{3}\b/.test(candidate)) return empty;
  const parsed = swissPlzService.parseAddress(candidate);
  if (!parsed.street || !parsed.postalCode || !parsed.city) return empty;
  return {
    street: parsed.houseNumber ? `${parsed.street} ${parsed.houseNumber}` : parsed.street,
    postalCode: parsed.postalCode,
    city: parsed.city,
    canton: parsed.canton,
  };
}

function cleanExtractedCustomerValue(value) {
  if (!value) return null;
  const cleaned = String(value)
    .replace(/\bfollow-up answer\s*:/gi, ' ')
    .replace(/\b(create|new|add|erstelle|erstellen|anlegen|neue|neuen|company|firma|business|customer|kunde|client)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function extractPersonName(input) {
  const match = input.match(/\b(?:to|for|assign(?:ed)? to|für|an)\s+([A-ZÄÖÜ][\p{L}.'-]+(?:\s+[A-ZÄÖÜ][\p{L}.'-]+)?)/u);
  return match?.[1] || null;
}

function extractSearchTerm(input) {
  const quoted = input.match(/["“](.+?)["”]/)?.[1];
  if (quoted) return quoted;
  return input
    .replace(/\b(create|update|set|show|find|search|customer|kunde|project|projekt|order|auftrag|task|aufgabe|note|notiz|for|to|für|an|with|about)\b/gi, ' ')
    .replace(/\b[0-9a-f]{24}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function extractAfter(input, prefixes) {
  const lower = input.toLowerCase();
  for (const prefix of prefixes) {
    const idx = lower.indexOf(prefix);
    if (idx >= 0) return input.slice(idx + prefix.length).trim();
  }
  return '';
}

function cleanTitle(input, removeTerms = []) {
  let title = input.trim();
  for (const term of removeTerms) {
    title = title.replace(new RegExp(term, 'ig'), ' ');
  }
  title = title.replace(/\s+/g, ' ').trim();
  return (title || input).slice(0, 500);
}

function displayUser(user) {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'employee';
}

function selectCandidateFromAnswer(input, candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;

  const objectId = firstObjectId(input);
  if (objectId) {
    return candidates.find((candidate) => String(candidate._id || candidate.id) === objectId) || null;
  }

  const numberMatch = text.match(/\b(?:option|number|nr\.?|#)?\s*(\d{1,2})\b/);
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1;
    if (index >= 0 && index < candidates.length) return candidates[index];
  }

  return candidates.find((candidate) => {
    const labels = [
      candidate.name,
      candidate.customerNumber,
      candidate.projectNumber,
      candidate.orderNumber,
      candidate.assignmentNumber,
      candidate.reportNumber,
      candidate.email,
      candidate.title,
      candidate.model,
      candidate.serialNumber,
      displayUser(candidate),
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return labels.some((label) => label && (text.includes(label) || label.includes(text)));
  }) || null;
}

function compactTask(task) {
  return {
    id: task._id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
  };
}

function compactCustomer(customer) {
  return {
    id: customer._id,
    customerNumber: customer.customerNumber,
    name: customer.name,
    type: customer.type,
    ownerName: customer.ownerName,
    uidNumber: customer.uidNumber,
  };
}

function summarizeContext(context) {
  return {
    assignee: context.assignee ? { id: context.assignee._id, name: displayUser(context.assignee) } : null,
    customer: context.customer ? { id: context.customer._id, name: context.customer.name } : null,
    project: context.project ? { id: context.project._id, name: context.project.name, status: context.project.status } : null,
    order: context.order ? { id: context.order._id, orderNumber: context.order.orderNumber, status: context.order.status } : null,
    assignment: context.assignment ? { id: context.assignment._id, orderNumber: context.assignment.assignmentNumber, status: context.assignment.status } : null,
    workOrder: context.assignment ? { id: context.assignment._id, orderNumber: context.assignment.assignmentNumber, status: context.assignment.status } : null,
    installation: context.installation ? { id: context.installation._id, name: context.installation.name || context.installation.model } : null,
    task: context.task ? { id: context.task._id, title: context.task.title, status: context.task.status } : null,
    report: context.report ? { id: context.report._id, reportNumber: context.report.reportNumber, status: context.report.status } : null,
    workReport: context.report ? { id: context.report._id, reportNumber: context.report.reportNumber, status: context.report.status } : null,
  };
}

function summarizeCandidates(context) {
  const assignmentCandidates = summarizeCandidateList(context.assignmentCandidates, candidateAssignmentLabel);
  return {
    assignees: summarizeCandidateList(context.assigneeCandidates, candidateUserLabel),
    customers: summarizeCandidateList(context.customerCandidates, (customer) => customer.name || customer.customerNumber),
    projects: summarizeCandidateList(context.projectCandidates, (project) => project.name || project.projectNumber),
    assignments: assignmentCandidates,
    orders: assignmentCandidates.length ? assignmentCandidates : summarizeCandidateList(context.orderCandidates, (order) => order.orderNumber || order.title),
    installations: summarizeCandidateList(context.installationCandidates, (installation) => [installation.manufacturer, installation.model].filter(Boolean).join(' ')
      || installation.installationNumber || installation.serialNumber),
    tasks: summarizeCandidateList(context.taskCandidates, (task) => task.title),
    reports: summarizeCandidateList(context.reportCandidates, (report) => report.reportNumber || report.workPerformed),
  };
}

function summarizeCandidateList(candidates = [], labelFactory) {
  if (!Array.isArray(candidates) || candidates.length <= 1) return [];
  return candidates.slice(0, 5).map((candidate, index) => ({
    index: index + 1,
    id: candidate._id || candidate.id,
    _id: candidate._id || candidate.id,
    label: labelFactory(candidate) || String(candidate._id || candidate.id || ''),
    subtitle: candidate.email || candidate.customerName || candidate.status || candidate.city || null,
  }));
}

function candidateUserLabel(user) {
  return displayUser(user);
}

function candidateAssignmentLabel(assignment) {
  return assignment.assignmentNumber || assignment.title || String(assignment._id || assignment.id || '');
}

const graph = new StateGraph(WorkflowState);
graph.addNode('execute_action', executeAction);
graph.addEdge('__start__', 'execute_action');
graph.addEdge('execute_action', END);

export const fieldServiceAgentWorkflow = graph.compile();
