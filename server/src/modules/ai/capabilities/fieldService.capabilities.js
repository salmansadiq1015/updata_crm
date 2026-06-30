const PERMISSION_ALIASES = Object.freeze({
  'project:create': ['projects:create', 'projects:write', 'projects:admin'],
  'project:edit': ['projects:write', 'projects:admin'],
  'projects:read': ['project:read', 'projects:admin'],
  'quotations:write': ['qop:write'],
  'quotations:read': ['qop:read'],
  'invoicing:write': ['qop:write', 'accounting:write'],
  'tasks:write': ['tasks:create', 'tasks:update'],
  'scheduling:write': ['deploy:write', 'field-service:write'],
  'documents:read': ['project:documents:read', 'projects:read'],
});

const ACTIONS = Object.freeze({
  CREATE_PROJECT: 'CREATE_PROJECT',
  UPDATE_TASK: 'UPDATE_TASK',
  UPDATE_ORDER: 'UPDATE_ORDER',
  RESCHEDULE_ASSIGNMENT: 'RESCHEDULE_ASSIGNMENT',
  CREATE_QUOTATION: 'CREATE_QUOTATION',
  CREATE_INVOICE: 'CREATE_INVOICE',
  CREATE_TASK_REMINDER: 'CREATE_TASK_REMINDER',
  SEARCH_PROJECTS: 'SEARCH_PROJECTS',
  SEARCH_ORDERS: 'SEARCH_ORDERS',
  SEARCH_DOCUMENTS: 'SEARCH_DOCUMENTS',
});

const CAPABILITIES = Object.freeze({
  [ACTIONS.CREATE_PROJECT]: {
    requiredPermission: 'project:create',
    fields: ['customer', 'project name'],
    execute: createProject,
  },
  [ACTIONS.UPDATE_TASK]: {
    requiredPermission: 'tasks:write',
    fields: ['task', 'new status or assignment'],
    execute: updateTask,
  },
  [ACTIONS.UPDATE_ORDER]: {
    requiredPermission: 'quotations:write',
    fields: ['order', 'new status or details'],
    execute: updateOrder,
  },
  [ACTIONS.RESCHEDULE_ASSIGNMENT]: {
    requiredPermission: 'scheduling:write',
    fields: ['assignment', 'new date and time'],
    execute: rescheduleAssignment,
  },
  [ACTIONS.CREATE_QUOTATION]: {
    requiredPermission: 'quotations:write',
    fields: ['customer', 'line items or service description'],
    execute: createQuotation,
  },
  [ACTIONS.CREATE_INVOICE]: {
    requiredPermission: 'invoicing:write',
    fields: ['order or customer', 'line items or source order'],
    execute: createInvoice,
  },
  [ACTIONS.CREATE_TASK_REMINDER]: {
    requiredPermission: 'tasks:write',
    fields: ['task', 'reminder date and time'],
    execute: createTaskReminder,
  },
  [ACTIONS.SEARCH_PROJECTS]: {
    requiredPermission: 'projects:read',
    fields: ['project search term'],
    execute: searchProjects,
  },
  [ACTIONS.SEARCH_ORDERS]: {
    requiredPermission: 'quotations:read',
    fields: ['job/order search term'],
    execute: searchOrders,
  },
  [ACTIONS.SEARCH_DOCUMENTS]: {
    requiredPermission: 'documents:read',
    fields: ['document search term'],
    execute: searchDocuments,
  },
});

export function getFieldServiceCapabilityFields(action) {
  return CAPABILITIES[action]?.fields || ['details'];
}

export function isFieldServiceCapabilityAction(action) {
  return Boolean(CAPABILITIES[action]);
}

export async function executeFieldServiceCapability({
  action,
  input,
  context,
  userId,
  state = {},
  helpers,
}) {
  const capability = CAPABILITIES[action];
  if (!capability) {
    return helpers.needsFollowUp(action, ['action'], context);
  }

  if (!hasPermission(state.permissions || [], capability.requiredPermission)) {
    return {
      action,
      status: 'failed',
      error: {
        code: 'RBAC_DENIED',
        message: `Missing permission '${capability.requiredPermission}'`,
      },
      message: 'You do not have permission to run this AI action.',
      missingFields: ['permission'],
      requiredPermission: capability.requiredPermission,
      resolvedContext: helpers.summarizeContext(context),
    };
  }

  return capability.execute({ input, context, userId, state, helpers });
}

function hasPermission(permissions, requiredPermission) {
  if (!requiredPermission) return true;
  if (permissions.includes('*') || permissions.includes(requiredPermission)) return true;
  const aliases = PERMISSION_ALIASES[requiredPermission] || [];
  return aliases.some((permission) => permissions.includes(permission));
}

async function createProject({ input, context, userId, helpers }) {
  if (context.customerCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.CREATE_PROJECT, ['customer'], context);
  }
  if (context.assigneeCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.CREATE_PROJECT, ['project manager'], context);
  }
  if (!context.customer) {
    return helpers.needsFollowUp(ACTIONS.CREATE_PROJECT, ['customer'], context);
  }

  const projectService = (await import('../../pm/project.service.js')).default;
  const name = helpers.cleanTitle(input, [
    'create project',
    'new project',
    'add project',
    'erstelle projekt',
    'neues projekt',
  ]);
  const project = await projectService.create({
    name,
    description: input,
    projectType: extractProjectType(input),
    customerId: helpers.objectIdValue(context.customer),
    projectManagerId: helpers.objectIdValue(context.assignee) || userId,
    plannedStartDate: helpers.extractDate(input) || undefined,
    currency: 'CHF',
    notes: 'Created by AI assistant.',
  }, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.CREATE_PROJECT,
    status: 'completed',
    message: `Project ${project.projectNumber} created: ${project.name}.`,
    recordType: 'project',
    recordId: project._id,
    record: {
      id: project._id,
      projectNumber: project.projectNumber,
      name: project.name,
      status: project.status,
      customerName: project.customerName,
    },
  };
}

async function updateTask({ input, context, userId, helpers }) {
  if (context.taskCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_TASK, ['task'], context);
  }
  if (context.assigneeCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_TASK, ['employee/technician'], context);
  }
  if (!context.task) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_TASK, ['task'], context);
  }

  const status = extractTaskStatus(input);
  const dueDate = helpers.extractDate(input);
  const priority = extractMaybePriority(input, helpers);
  const updates = {
    ...(status ? { status } : {}),
    ...(context.assignee ? { assigneeId: helpers.objectIdValue(context.assignee) } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(priority ? { priority } : {}),
  };

  if (Object.keys(updates).length === 0) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_TASK, ['new status, assignee, due date, or priority'], context);
  }

  const taskService = (await import('../../tasks/task.service.js')).default;
  const task = await taskService.update(context.task._id, updates, userId, { source: 'ai-agent' });
  return {
    action: ACTIONS.UPDATE_TASK,
    status: 'completed',
    message: `Task updated: ${task.title}.`,
    recordType: 'task',
    recordId: task._id,
    record: {
      id: task._id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeId: task.assigneeId,
    },
  };
}

async function updateOrder({ input, context, userId, helpers }) {
  if (context.orderCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_ORDER, ['order'], context);
  }
  if (!context.order) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_ORDER, ['order'], context);
  }

  const targetStatus = extractOrderStatus(input);
  if (targetStatus) {
    const orderService = (await import('../../qop/order.service.js')).default;
    const order = await orderService.transitionStatus(
      context.order._id,
      targetStatus,
      { reason: 'Updated by AI assistant' },
      userId,
      { source: 'ai-agent' },
    );
    return {
      action: ACTIONS.UPDATE_ORDER,
      status: 'completed',
      message: `Order ${order.orderNumber} updated to ${order.status}.`,
      recordType: 'order',
      recordId: order._id,
      record: { id: order._id, orderNumber: order.orderNumber, status: order.status },
    };
  }

  const title = extractTitleUpdate(input);
  if (!title) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_ORDER, ['new status or title/details'], context);
  }

  const orderService = (await import('../../qop/order.service.js')).default;
  const order = await orderService.update(context.order._id, {
    title,
    notes: input,
  }, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.UPDATE_ORDER,
    status: 'completed',
    message: `Order ${order.orderNumber} updated.`,
    recordType: 'order',
    recordId: order._id,
    record: { id: order._id, orderNumber: order.orderNumber, status: order.status, title: order.title },
  };
}

async function rescheduleAssignment({ input, context, userId, helpers }) {
  if (context.assignmentCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.RESCHEDULE_ASSIGNMENT, ['assignment'], context);
  }
  if (context.assigneeCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.RESCHEDULE_ASSIGNMENT, ['employee/technician'], context);
  }
  if (!context.assignment) {
    return helpers.needsFollowUp(ACTIONS.RESCHEDULE_ASSIGNMENT, ['assignment'], context);
  }

  const newStartDatetime = helpers.extractDateTime(input) || helpers.extractDate(input);
  if (!newStartDatetime) {
    return helpers.needsFollowUp(ACTIONS.RESCHEDULE_ASSIGNMENT, ['new date and time'], context);
  }

  const durationHours = helpers.extractDurationHours(input) || existingDurationHours(context.assignment) || 1;
  const assignmentService = (await import('../../deploy/assignment.service.js')).default;
  const assignment = await assignmentService.move(context.assignment._id, {
    newEmployeeId: helpers.objectIdValue(context.assignee) || helpers.objectIdValue(context.assignment.employeeId),
    newStartDatetime,
    newEndDatetime: new Date(newStartDatetime.getTime() + durationHours * 60 * 60 * 1000),
    overrideConflicts: false,
  }, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.RESCHEDULE_ASSIGNMENT,
    status: 'completed',
    message: `Assignment ${assignment.assignmentNumber} rescheduled.`,
    recordType: 'assignment',
    recordId: assignment._id,
    record: {
      id: assignment._id,
      assignmentNumber: assignment.assignmentNumber,
      startDatetime: assignment.startDatetime,
      endDatetime: assignment.endDatetime,
      status: assignment.status,
    },
  };
}

async function createQuotation({ input, context, userId, helpers }) {
  if (context.customerCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.CREATE_QUOTATION, ['customer'], context);
  }
  if (!context.customer) {
    return helpers.needsFollowUp(ACTIONS.CREATE_QUOTATION, ['customer'], context);
  }

  const quotationService = (await import('../../qop/quotation.service.js')).default;
  const lineItems = extractCommercialLineItems(input, {
    defaultDescription: helpers.cleanTitle(input, ['create quotation', 'create quote', 'quotation', 'quote', 'offerte', 'angebot']),
    quotationMode: true,
  });
  const quotation = await quotationService.create({
    customerId: helpers.objectIdValue(context.customer),
    customerName: context.customer.name,
    projectId: helpers.objectIdValue(context.project) || null,
    language: 'de',
    title: helpers.cleanTitle(input, ['create quotation', 'create quote', 'quotation', 'quote', 'offerte', 'angebot']),
    introduction: 'Draft created by AI assistant. Please review before sending.',
    validUntil: addDays(new Date(), 30),
    currency: 'CHF',
    lineItems,
    globalDiscountPercent: 0,
    paymentTerms: '',
    notes: input,
    termsAndConditions: '',
    assignedUserId: helpers.objectIdValue(context.assignee) || userId,
  }, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.CREATE_QUOTATION,
    status: 'completed',
    message: `Draft quotation ${quotation.quotationNumber} created for ${quotation.customerName}.`,
    recordType: 'quotation',
    recordId: quotation._id,
    record: {
      id: quotation._id,
      quotationNumber: quotation.quotationNumber,
      customerName: quotation.customerName,
      status: quotation.status,
      total: quotation.grandTotalRounded,
    },
  };
}

async function createInvoice({ input, context, userId, helpers }) {
  const dueDate = helpers.extractDate(input) || addDays(new Date(), 30);
  const invoiceService = (await import('../../qop/invoice.service.js')).default;

  if (context.orderCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.CREATE_INVOICE, ['order'], context);
  }

  if (context.order) {
    const invoice = await invoiceService.createFromOrder({
      sourceOrderId: helpers.objectIdValue(context.order),
      title: helpers.cleanTitle(input, ['create invoice', 'invoice', 'rechnung']),
      dueDate,
      paymentTermsDays: 30,
      paymentTermsText: '',
    }, userId, { source: 'ai-agent' });

    return invoiceResult(invoice, `Draft invoice ${invoice.invoiceNumber} created from order ${context.order.orderNumber}.`);
  }

  if (context.customerCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.CREATE_INVOICE, ['customer'], context);
  }
  if (!context.customer) {
    return helpers.needsFollowUp(ACTIONS.CREATE_INVOICE, ['customer or source order'], context);
  }

  const lineItems = extractCommercialLineItems(input, {
    defaultDescription: helpers.cleanTitle(input, ['create invoice', 'invoice', 'rechnung']),
    quotationMode: false,
  });
  if (!hasPricedLineItem(lineItems)) {
    return helpers.needsFollowUp(ACTIONS.CREATE_INVOICE, ['pricing details or source order'], context);
  }

  const invoice = await invoiceService.create({
    invoiceType: 'STANDARD',
    customerId: helpers.objectIdValue(context.customer),
    customerName: context.customer.name,
    projectId: helpers.objectIdValue(context.project) || null,
    language: 'de',
    title: helpers.cleanTitle(input, ['create invoice', 'invoice', 'rechnung']),
    lineItems,
    currency: 'CHF',
    globalDiscountPercent: 0,
    dueDate,
    paymentTermsDays: 30,
    paymentTermsText: '',
  }, userId, { source: 'ai-agent' });

  return invoiceResult(invoice, `Draft invoice ${invoice.invoiceNumber} created for ${invoice.customerName}.`);
}

async function createTaskReminder({ input, context, userId, helpers }) {
  if (context.taskCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.CREATE_TASK_REMINDER, ['task'], context);
  }
  if (!context.task) {
    return helpers.needsFollowUp(ACTIONS.CREATE_TASK_REMINDER, ['task'], context);
  }

  const fireAt = helpers.extractDateTime(input) || helpers.extractDate(input);
  if (!fireAt) {
    return helpers.needsFollowUp(ACTIONS.CREATE_TASK_REMINDER, ['reminder date and time'], context);
  }

  const taskReminderService = (await import('../../tasks/taskReminder.service.js')).default;
  const reminder = await taskReminderService.create(context.task._id, {
    type: 'ABSOLUTE',
    fireAt,
    channels: ['IN_APP'],
  }, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.CREATE_TASK_REMINDER,
    status: 'completed',
    message: `Reminder created for task ${context.task.title}.`,
    recordType: 'taskReminder',
    recordId: reminder._id,
    record: {
      id: reminder._id,
      taskId: reminder.taskId,
      fireAt: reminder.fireAt,
      channels: reminder.channels,
      status: reminder.status,
    },
  };
}

async function searchProjects({ input, context, helpers }) {
  const term = helpers.extractSearchTerm(input);
  if (!term || term.length < 2) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_PROJECTS, ['project search term'], context);
  }

  const projectService = (await import('../../pm/project.service.js')).default;
  const projects = await projectService.search(term, 10);
  return {
    action: ACTIONS.SEARCH_PROJECTS,
    status: 'completed',
    message: projects.length ? `Found ${projects.length} projects.` : 'No projects found.',
    records: projects.map((project) => ({
      id: project._id,
      projectNumber: project.projectNumber,
      name: project.name,
      status: project.status,
      customerName: project.customerName,
    })),
  };
}

async function searchOrders({ input, context, helpers }) {
  const term = helpers.extractSearchTerm(input);
  if (!term || term.length < 2) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_ORDERS, ['job/order search term'], context);
  }

  const Order = (await import('../../qop/order.model.js')).default;
  const orders = await Order.find({ $text: { $search: term } })
    .select('orderNumber title status customerName projectId grandTotalRounded createdAt')
    .limit(10)
    .lean();

  return {
    action: ACTIONS.SEARCH_ORDERS,
    status: 'completed',
    message: orders.length ? `Found ${orders.length} jobs/orders.` : 'No jobs or orders found.',
    records: orders.map((order) => ({
      id: order._id,
      orderNumber: order.orderNumber,
      title: order.title,
      status: order.status,
      customerName: order.customerName,
      projectId: order.projectId,
      total: order.grandTotalRounded,
    })),
  };
}

async function searchDocuments({ input, context, userId, state, helpers }) {
  const term = helpers.extractSearchTerm(input);
  if (!term || term.length < 2) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_DOCUMENTS, ['document search term'], context);
  }

  const User = (await import('../../auth/user.model.js')).default;
  const user = await User.findById(userId).select('_id role').lean();
  const documentIndexService = (await import('../../documents/documentIndex.service.js')).default;
  const result = await documentIndexService.list({
    search: term,
    limit: 10,
    source: 'all',
    origin: 'all',
    ...(context.customer ? { customerId: helpers.objectIdValue(context.customer) } : {}),
    ...(context.project ? { projectId: helpers.objectIdValue(context.project) } : {}),
    ...(context.order ? { jobId: helpers.objectIdValue(context.order) } : {}),
  }, user || { _id: userId, role: state.permissions?.includes('*') ? { name: 'Admin' } : null });

  return {
    action: ACTIONS.SEARCH_DOCUMENTS,
    status: 'completed',
    message: result.data.length ? `Found ${result.data.length} documents.` : 'No documents found.',
    records: result.data.map((document) => ({
      id: document.id || document._id || document.recordId,
      title: document.title,
      fileName: document.fileName,
      source: document.source,
      documentType: document.documentType,
      category: document.category,
      updatedAt: document.updatedAt || document.createdAt,
    })),
  };
}

function extractProjectType(input) {
  const text = String(input || '').toLowerCase();
  if (hasAny(text, ['maintenance', 'wartung'])) return 'MAINTENANCE';
  if (hasAny(text, ['renovation', 'renovierung', 'umbau'])) return 'RENOVATION';
  if (hasAny(text, ['installation', 'install', 'new boiler', 'neuanlage'])) return 'NEW_INSTALLATION';
  if (hasAny(text, ['contract', 'service contract', 'wartungsvertrag'])) return 'SERVICE_CONTRACT';
  return 'OTHER';
}

function extractTaskStatus(input) {
  const text = String(input || '').toLowerCase();
  if (hasAny(text, ['completed', 'complete', 'done', 'erledigt', 'finished'])) return 'COMPLETED';
  if (hasAny(text, ['in progress', 'started', 'bearbeitung', 'begonnen'])) return 'IN_PROGRESS';
  if (hasAny(text, ['on hold', 'blocked', 'pause', 'wartet'])) return 'ON_HOLD';
  if (hasAny(text, ['cancelled', 'canceled', 'storniert', 'abgebrochen'])) return 'CANCELLED';
  if (hasAny(text, ['open', 'reopen', 'offen'])) return 'OPEN';
  return null;
}

function extractOrderStatus(input) {
  const text = String(input || '').toLowerCase();
  if (hasAny(text, ['completed', 'complete', 'done', 'erledigt', 'abgeschlossen'])) return 'COMPLETED';
  if (hasAny(text, ['in progress', 'started', 'running', 'bearbeitung', 'begonnen'])) return 'IN_PROGRESS';
  if (hasAny(text, ['cancelled', 'canceled', 'storniert', 'abgebrochen'])) return 'CANCELLED';
  if (hasAny(text, ['confirmed', 'confirm', 'bestaetigt'])) return 'CONFIRMED';
  return null;
}

function extractMaybePriority(input, helpers) {
  return /\b(priority|urgent|high|medium|low|dringend|hoch|niedrig)\b/i.test(input)
    ? helpers.extractPriority(input)
    : null;
}

function extractTitleUpdate(input) {
  const match = String(input || '').match(/\b(?:title|details?|notes?)\s*(?:to|as|:)\s+(.+)$/i);
  return match?.[1]?.trim()?.slice(0, 500) || null;
}

function extractCommercialLineItems(input, { defaultDescription, quotationMode }) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  const priced = [...text.matchAll(/(?:(\d+(?:[.,]\d+)?)\s*(?:x|pcs|stk|hours?|stunden?)\s+)?([A-Za-z0-9][A-Za-z0-9 .,/\\-]{3,120}?)\s+(?:for|at|a|zu|fuer)\s+(?:CHF|EUR)?\s*(\d+(?:[.,]\d{1,2})?)/gi)]
    .map((match, index) => buildLineItem({
      index,
      description: cleanLineDescription(match[2]),
      quantity: Number(String(match[1] || '1').replace(',', '.')),
      unitPrice: Number(String(match[3]).replace(',', '.')),
      quotationMode,
    }));

  if (priced.length) return priced.slice(0, 20);

  return [
    buildLineItem({
      index: 0,
      description: defaultDescription || 'AI generated draft line item',
      quantity: 1,
      unitPrice: 0,
      quotationMode,
    }),
  ];
}

function buildLineItem({ index, description, quantity, unitPrice, quotationMode }) {
  const base = {
    position: index + 1,
    description: String(description || 'AI generated draft line item').slice(0, quotationMode ? 2000 : 1000),
    unit: 'pcs',
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
    discountPercent: 0,
    vatRate: 8.1,
  };
  return quotationMode ? { ...base, type: 'service', catalogItemId: null, catalogSnapshot: null } : base;
}

function cleanLineDescription(value) {
  return String(value || '')
    .replace(/\b(create|draft|quotation|quote|invoice|rechnung|angebot|offerte|for|customer|kunde)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPricedLineItem(lineItems) {
  return lineItems.some((item) => Number(item.unitPrice || 0) > 0 && Number(item.quantity || 0) > 0);
}

function invoiceResult(invoice, message) {
  return {
    action: ACTIONS.CREATE_INVOICE,
    status: 'completed',
    message,
    recordType: 'invoice',
    recordId: invoice._id,
    record: {
      id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      status: invoice.status,
      amountDue: invoice.amountDue,
      dueDate: invoice.dueDate,
    },
  };
}

function existingDurationHours(assignment) {
  if (!assignment?.startDatetime || !assignment?.endDatetime) return null;
  const start = new Date(assignment.startDatetime);
  const end = new Date(assignment.endDatetime);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return diffMs / (60 * 60 * 1000);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}
