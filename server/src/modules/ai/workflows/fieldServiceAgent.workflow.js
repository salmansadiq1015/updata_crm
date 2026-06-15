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
import { WorkflowState } from './workflow.state.js';
import logger from '../../../shared/logger/index.js';
import swissPlzService from '../../../shared/ai/swissPlz.service.js';

const ACTIONS = Object.freeze({
  CREATE_CUSTOMER: 'CREATE_CUSTOMER',
  CREATE_TASK: 'CREATE_TASK',
  UPDATE_TASK: 'UPDATE_TASK',
  CREATE_ORDER: 'CREATE_ORDER',
  UPDATE_ORDER: 'UPDATE_ORDER',
  CREATE_ASSIGNMENT: 'CREATE_ASSIGNMENT',
  RESCHEDULE_ASSIGNMENT: 'RESCHEDULE_ASSIGNMENT',
  CREATE_REPORT: 'CREATE_REPORT',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  CREATE_NOTE: 'CREATE_NOTE',
  SEND_CHAT: 'SEND_CHAT',
  RECORD_TIME: 'RECORD_TIME',
  SEARCH_CUSTOMER: 'SEARCH_CUSTOMER',
  CREATE_QUOTATION: 'CREATE_QUOTATION',
  CREATE_INVOICE: 'CREATE_INVOICE',
  GENERAL: 'GENERAL',
});

const ACTION_LABELS = {
  [ACTIONS.CREATE_CUSTOMER]: 'create a customer',
  [ACTIONS.CREATE_TASK]: 'create a task',
  [ACTIONS.UPDATE_TASK]: 'update a task',
  [ACTIONS.CREATE_ORDER]: 'create an order',
  [ACTIONS.UPDATE_ORDER]: 'update an order',
  [ACTIONS.CREATE_ASSIGNMENT]: 'schedule an assignment',
  [ACTIONS.RESCHEDULE_ASSIGNMENT]: 'reschedule an assignment',
  [ACTIONS.CREATE_REPORT]: 'create a service report',
  [ACTIONS.UPDATE_PROJECT]: 'update a project',
  [ACTIONS.CREATE_NOTE]: 'create a note',
  [ACTIONS.SEND_CHAT]: 'send a chat message',
  [ACTIONS.RECORD_TIME]: 'record working hours',
  [ACTIONS.SEARCH_CUSTOMER]: 'find customer information',
  [ACTIONS.CREATE_QUOTATION]: 'create a quotation',
  [ACTIONS.CREATE_INVOICE]: 'create an invoice',
  [ACTIONS.GENERAL]: 'help with the system',
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
  const action = previousFollowUp?.action || classifyAction(input);
  const effectiveInput = previousFollowUp?.originalInput
    ? `${previousFollowUp.originalInput}\nFollow-up answer: ${input}`
    : input;
  const context = action === ACTIONS.CREATE_CUSTOMER ? {} : await resolveContext(effectiveInput, previousFollowUp);
  let output;

  try {
    output = await performAction(action, effectiveInput, context, state.userId);
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
        message: `I could not ${ACTION_LABELS[action] || 'complete that action'} yet.`,
        followUpQuestions: [err.message],
        missingFields: [],
        originalInput: previousFollowUp?.originalInput || input,
      },
    };
  }

  if (output?.status === 'needs_follow_up') {
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
    status: 'completed',
    output,
    toolResults: [output],
  };
}

function classifyAction(input) {
  const text = input.toLowerCase();
  if (hasAny(text, ['create customer', 'new customer', 'add customer', 'create company', 'new company', 'add company', 'kunde anlegen', 'kunden anlegen', 'neuer kunde', 'neuen kunden', 'firma erstellen', 'firma anlegen', 'neue firma'])) return ACTIONS.CREATE_CUSTOMER;
  if (hasAny(text, ['quotation', 'quote', 'offerte', 'angebot'])) return ACTIONS.CREATE_QUOTATION;
  if (hasAny(text, ['invoice', 'rechnung'])) return ACTIONS.CREATE_INVOICE;
  if (hasAny(text, ['service report', 'work report', 'rapport', 'bericht'])) return ACTIONS.CREATE_REPORT;
  if (hasAny(text, ['chat', 'message', 'nachricht', 'send to', 'schreib'])) return ACTIONS.SEND_CHAT;
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

async function performAction(action, input, context, userId) {
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
    case ACTIONS.CREATE_NOTE:
      return createNote(input, context, userId);
    case ACTIONS.SEND_CHAT:
      return sendChat(input, context, userId);
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
    message: `Customer ${customer.customerNumber} created: ${customer.name}.`,
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
  const title = cleanTitle(input, ['create task', 'task', 'aufgabe', 'erstelle']);
  const priority = extractPriority(input);
  const dueDate = extractDate(input);

  const taskService = (await import('../../tasks/task.service.js')).default;
  const task = await taskService.create({
    title,
    description: input,
    priority,
    ...(dueDate ? { dueDate } : {}),
    ...(context.assignee ? { assigneeId: context.assignee._id } : {}),
    ...(context.project ? { projectId: context.project._id } : {}),
  }, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.CREATE_TASK,
    status: 'completed',
    message: `Task created: ${task.title}`,
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
    message: `Project ${project.name} updated to ${status}.`,
    recordType: 'project',
    recordId: project._id,
    record: { id: project._id, name: project.name, status: project.status },
  };
}

async function createReport(input, context, userId) {
  if (context.orderCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.CREATE_REPORT, ['order/work order'], context);
  }
  const orderId = context.order?._id || firstObjectId(input);
  if (!orderId) {
    return needsFollowUp(ACTIONS.CREATE_REPORT, ['order/work order'], context);
  }
  const workPerformed = cleanTitle(input, ['create service report', 'create work report', 'rapport', 'bericht']);
  const reportService = (await import('../../mobile/report.service.js')).default;
  const report = await reportService.create(orderId, {
    reportDate: new Date(),
    projectId: context.project?._id || context.order?.projectId || null,
    workPerformed,
    technicianNotes: input,
    materialItems: extractMaterials(input),
    status: 'DRAFT',
  }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.CREATE_REPORT,
    status: 'completed',
    message: `Draft service report ${report.reportNumber} created.`,
    recordType: 'workReport',
    recordId: report._id,
    record: { id: report._id, orderId, reportNumber: report.reportNumber, status: report.status },
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
  const start = extractDateTime(input);
  if (!start) return needsFollowUp(ACTIONS.CREATE_ASSIGNMENT, ['scheduled date and time'], context);
  const durationHours = extractDurationHours(input) || 1;
  const assignmentService = (await import('../../deploy/assignment.service.js')).default;
  const result = await assignmentService.create({
    employeeIds: [employee._id],
    assignmentType: hasAny(input.toLowerCase(), ['maintenance', 'wartung']) ? 'MAINTENANCE' : 'PROJECT_WORK',
    title: cleanTitle(input, ['schedule', 'assign', 'plan', 'termin']),
    startDatetime: start,
    endDatetime: new Date(start.getTime() + durationHours * 60 * 60 * 1000),
    projectId: context.project?._id || null,
    customerId: context.customer?._id || null,
    priority: extractPriority(input) === 'URGENT' ? 'URGENT' : extractPriority(input) === 'HIGH' ? 'HIGH' : 'NORMAL',
    instructions: input,
  }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.CREATE_ASSIGNMENT,
    status: 'completed',
    message: `Assignment scheduled for ${displayUser(employee)}.`,
    recordType: 'assignment',
    recordId: result?.[0]?.id,
    record: result?.[0] || null,
  };
}

async function recordTime(input, context, userId) {
  if (context.orderCandidates?.length > 1) {
    return needsFollowUp(ACTIONS.RECORD_TIME, ['order/work order'], context);
  }
  const orderId = context.order?._id || firstObjectId(input);
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
    message: `${hours} hour(s) recorded.`,
    recordType: 'timeEntry',
    recordId: entry._id,
    record: { id: entry._id, orderId, netDurationMin: entry.netDurationMin },
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
    message: `Note added to ${entityType}.`,
    recordType: 'note',
    recordId: note._id,
  };
}

async function sendChat(input, context, userId) {
  const roomId = context.roomId || extractAfter(input, ['room ', 'chat room ']);
  if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
    return needsFollowUp(ACTIONS.SEND_CHAT, ['chat room'], context);
  }
  const content = extractAfter(input, ['message ', 'nachricht ', 'say ', 'send ']) || input;
  const User = (await import('../../auth/user.model.js')).default;
  const sender = await User.findById(userId).select('firstName lastName email').lean();
  const chatMessageService = (await import('../../chat/chatMessage.service.js')).default;
  const message = await chatMessageService.sendMessage(roomId, { content, messageType: 'TEXT' }, sender);
  return {
    action: ACTIONS.SEND_CHAT,
    status: 'completed',
    message: 'Chat message sent.',
    recordType: 'chatMessage',
    recordId: message._id,
  };
}

async function searchCustomer(input, context) {
  const customers = context.customer ? [context.customer] : context.customerCandidates?.length ? context.customerCandidates : await findCustomers(extractSearchTerm(input), 5);
  if (!customers.length) return needsFollowUp(ACTIONS.SEARCH_CUSTOMER, ['customer name'], context);
  return {
    action: ACTIONS.SEARCH_CUSTOMER,
    status: 'completed',
    message: customers.length === 1 ? `Found ${customers[0].name}.` : `Found ${customers.length} customers.`,
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
    title: cleanTitle(input, ['create order', 'create job', 'auftrag', 'order']),
    notes: input,
    lineItems: [],
    language: 'de',
  }, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.CREATE_ORDER,
    status: 'completed',
    message: `Order ${order.orderNumber} created for ${order.customerName}.`,
    recordType: 'order',
    recordId: order._id,
    record: { id: order._id, orderNumber: order.orderNumber, customerName: order.customerName, status: order.status },
  };
}

function needsFollowUp(action, missingFields, context = {}) {
  return {
    action,
    status: 'needs_follow_up',
    message: `I can ${ACTION_LABELS[action] || 'do that'}, but I need more information first.`,
    missingFields,
    followUpQuestions: missingFields.map((field) => `Which ${field} should I use?`),
    resolvedContext: summarizeContext(context),
    candidates: summarizeCandidates(context),
  };
}

async function resolveContext(input, previousFollowUp = null) {
  const objectId = firstObjectId(input);
  const [userResult, customerResult, projectResult, orderResult, installationResult] = await Promise.all([
    findUser(input, previousFollowUp),
    findCustomer(input, objectId, previousFollowUp),
    findProject(input, objectId, previousFollowUp),
    findOrder(input, objectId, previousFollowUp),
    findInstallation(input, objectId),
  ]);
  const previousResolved = await loadPreviousResolvedContext(previousFollowUp?.resolvedContext);
  return {
    assignee: userResult.selected || previousResolved.assignee,
    assigneeCandidates: userResult.selected ? [] : userResult.candidates,
    customer: customerResult.selected || previousResolved.customer,
    customerCandidates: customerResult.selected ? [] : customerResult.candidates,
    project: projectResult.selected || previousResolved.project,
    projectCandidates: projectResult.selected ? [] : projectResult.candidates,
    order: orderResult.selected || previousResolved.order,
    orderCandidates: orderResult.selected ? [] : orderResult.candidates,
    installation: installationResult.selected || previousResolved.installation,
    installationCandidates: installationResult.selected ? [] : installationResult.candidates,
    site: null,
    roomId: extractRoomId(input),
  };
}

async function loadPreviousResolvedContext(resolvedContext = {}) {
  const [assignee, customer, project, order, installation] = await Promise.all([
    loadPreviousUser(resolvedContext.assignee?.id),
    loadPreviousCustomer(resolvedContext.customer?.id),
    loadPreviousProject(resolvedContext.project?.id),
    loadPreviousOrder(resolvedContext.order?.id),
    loadPreviousInstallation(resolvedContext.installation?.id),
  ]);
  return { assignee, customer, project, order, installation };
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

async function loadPreviousInstallation(id) {
  if (!id) return null;
  const Installation = (await import('../../crm/installation.model.js')).default;
  return Installation.findById(id).select('name model serialNumber status siteId customerId').lean().catch(() => null);
}

async function findUser(input, previousFollowUp) {
  const User = (await import('../../auth/user.model.js')).default;
  const term = extractPersonName(input);
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

async function findCustomer(input, objectId, previousFollowUp) {
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
  const candidates = await findCustomers(extractSearchTerm(input), 5);
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
}

async function findCustomers(term, limit = 5) {
  const Customer = (await import('../../crm/customer.model.js')).default;
  if (!term || term.length < 2) return [];
  return Customer.find({ $text: { $search: term } })
    .select('name ownerName customerNumber email phone mobile city uidNumber vatNumber')
    .limit(limit)
    .lean();
}

async function findProject(input, objectId, previousFollowUp) {
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
  const term = extractSearchTerm(input);
  if (!term || term.length < 2) return { selected: null, candidates: [] };
  const candidates = await Project.find({ $text: { $search: term } }).select('name projectNumber status customerId customerName').limit(5).lean();
  return { selected: candidates.length === 1 ? candidates[0] : null, candidates };
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

async function findInstallation(input, objectId) {
  const Installation = (await import('../../crm/installation.model.js')).default;
  if (objectId) {
    const selected = await Installation.findById(objectId).select('name model serialNumber status siteId customerId').lean().catch(() => null);
    return { selected, candidates: selected ? [selected] : [] };
  }
  return { selected: null, candidates: [] };
}

function fieldsForAction(action) {
  const map = {
    [ACTIONS.UPDATE_TASK]: ['task', 'new status or assignment'],
    [ACTIONS.UPDATE_ORDER]: ['order', 'new status or details'],
    [ACTIONS.RESCHEDULE_ASSIGNMENT]: ['assignment', 'new date and time'],
    [ACTIONS.CREATE_QUOTATION]: ['customer', 'template or line items', 'pricing details'],
    [ACTIONS.CREATE_INVOICE]: ['customer or order', 'line items or source order'],
  };
  return map[action] || ['details'];
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function firstObjectId(input) {
  return input.match(/\b[0-9a-f]{24}\b/i)?.[0] || null;
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
    installation: context.installation ? { id: context.installation._id, name: context.installation.name || context.installation.model } : null,
  };
}

function summarizeCandidates(context) {
  return {
    assignees: summarizeCandidateList(context.assigneeCandidates, candidateUserLabel),
    customers: summarizeCandidateList(context.customerCandidates, (customer) => customer.name || customer.customerNumber),
    projects: summarizeCandidateList(context.projectCandidates, (project) => project.name || project.projectNumber),
    orders: summarizeCandidateList(context.orderCandidates, (order) => order.orderNumber || order.title),
    installations: summarizeCandidateList(context.installationCandidates, (installation) => installation.name || installation.model || installation.serialNumber),
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

const graph = new StateGraph(WorkflowState);
graph.addNode('execute_action', executeAction);
graph.addEdge('__start__', 'execute_action');
graph.addEdge('execute_action', END);

export const fieldServiceAgentWorkflow = graph.compile();
