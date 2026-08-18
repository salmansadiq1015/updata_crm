const PERMISSION_ALIASES = Object.freeze({
  'crm:read': ['crm:admin'],
  'crm:write': ['crm:admin'],
  'crm:delete': ['crm:admin'],
  'project:create': ['projects:create', 'projects:write', 'projects:admin'],
  'project:edit': ['projects:write', 'projects:admin'],
  'project:delete': ['projects:delete', 'projects:admin'],
  'projects:read': ['project:read', 'projects:admin'],
  'quotations:write': ['qop:write'],
  'quotations:read': ['qop:read'],
  'quotations:delete': ['qop:delete', 'qop:write'],
  'invoicing:write': ['qop:write', 'accounting:write'],
  'tasks:write': ['tasks:create', 'tasks:update'],
  'tasks:read': ['tasks:write', 'tasks:create', 'tasks:update'],
  'scheduling:write': ['deploy:write', 'field-service:write'],
  'scheduling:delete': ['deploy:delete', 'deploy:write', 'field-service:admin'],
  'documents:read': ['project:documents:read', 'projects:read'],
  'reports:read': ['mobile:read', 'field-service:read'],
  'reports:write': ['mobile:write', 'field-service:write'],
});

const ACTIONS = Object.freeze({
  CREATE_PROJECT: 'CREATE_PROJECT',
  UPDATE_CUSTOMER: 'UPDATE_CUSTOMER',
  UPDATE_TASK: 'UPDATE_TASK',
  UPDATE_ORDER: 'UPDATE_ORDER',
  UPDATE_REPORT: 'UPDATE_REPORT',
  RESCHEDULE_ASSIGNMENT: 'RESCHEDULE_ASSIGNMENT',
  CREATE_QUOTATION: 'CREATE_QUOTATION',
  CREATE_INVOICE: 'CREATE_INVOICE',
  CREATE_TASK_REMINDER: 'CREATE_TASK_REMINDER',
  DELETE_CUSTOMER: 'DELETE_CUSTOMER',
  DELETE_TASK: 'DELETE_TASK',
  DELETE_PROJECT: 'DELETE_PROJECT',
  DELETE_ORDER: 'DELETE_ORDER',
  DELETE_REPORT: 'DELETE_REPORT',
  DELETE_ASSIGNMENT: 'DELETE_ASSIGNMENT',
  SEARCH_CUSTOMER: 'SEARCH_CUSTOMER',
  SEARCH_CUSTOMERS: 'SEARCH_CUSTOMERS',
  SEARCH_TASKS: 'SEARCH_TASKS',
  SEARCH_PROJECTS: 'SEARCH_PROJECTS',
  SEARCH_ORDERS: 'SEARCH_ORDERS',
  SEARCH_REPORTS: 'SEARCH_REPORTS',
  SEARCH_DOCUMENTS: 'SEARCH_DOCUMENTS',
});

const CAPABILITIES = Object.freeze({
  [ACTIONS.CREATE_PROJECT]: {
    requiredPermission: 'project:create',
    fields: ['customer', 'project name'],
    execute: createProject,
  },
  [ACTIONS.UPDATE_CUSTOMER]: {
    requiredPermission: 'crm:write',
    fields: ['customer', 'field to update'],
    execute: updateCustomer,
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
  [ACTIONS.UPDATE_REPORT]: {
    requiredPermission: 'reports:write',
    fields: ['service report', 'new report content or status'],
    execute: updateReport,
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
  [ACTIONS.DELETE_CUSTOMER]: {
    requiredPermission: 'crm:delete',
    fields: ['customer', 'confirmation'],
    execute: deleteCustomer,
  },
  [ACTIONS.DELETE_TASK]: {
    requiredPermission: 'tasks:write',
    fields: ['task', 'confirmation'],
    execute: deleteTask,
  },
  [ACTIONS.DELETE_PROJECT]: {
    requiredPermission: 'project:delete',
    fields: ['project', 'confirmation'],
    execute: deleteProject,
  },
  [ACTIONS.DELETE_ORDER]: {
    requiredPermission: 'quotations:delete',
    fields: ['order', 'confirmation'],
    execute: deleteOrder,
  },
  [ACTIONS.DELETE_REPORT]: {
    requiredPermission: 'reports:write',
    fields: ['service report', 'confirmation'],
    execute: deleteReport,
  },
  [ACTIONS.DELETE_ASSIGNMENT]: {
    requiredPermission: 'scheduling:delete',
    fields: ['assignment', 'confirmation'],
    execute: deleteAssignment,
  },
  [ACTIONS.SEARCH_CUSTOMERS]: {
    requiredPermission: 'crm:read',
    fields: ['customer search term'],
    execute: searchCustomers,
  },
  [ACTIONS.SEARCH_CUSTOMER]: {
    requiredPermission: 'crm:read',
    fields: ['customer search term'],
    execute: searchCustomers,
  },
  [ACTIONS.SEARCH_TASKS]: {
    requiredPermission: 'tasks:read',
    fields: ['task search term'],
    execute: searchTasks,
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
  [ACTIONS.SEARCH_REPORTS]: {
    requiredPermission: 'reports:read',
    fields: ['service report search term'],
    execute: searchReports,
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

async function updateCustomer({ input, context, userId, helpers }) {
  if (context.customerCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_CUSTOMER, ['customer'], context);
  }
  if (!context.customer) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_CUSTOMER, ['customer'], context);
  }

  const updates = extractCustomerUpdates(input);
  if (Object.keys(updates).length === 0) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_CUSTOMER, ['name, phone, email, address, owner, UID, or status'], context);
  }

  const customerService = (await import('../../crm/customer.service.js')).default;
  const customer = await customerService.update(context.customer._id, updates, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.UPDATE_CUSTOMER,
    status: 'completed',
    message: `Customer ${customer.customerNumber || ''} ${customer.name || ''}`.trim() + ' updated.',
    recordType: 'customer',
    recordId: customer._id,
    record: {
      id: customer._id,
      customerNumber: customer.customerNumber,
      name: customer.name,
      ownerName: customer.ownerName,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      status: customer.status,
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

async function updateReport({ input, context, userId, helpers }) {
  if (context.reportCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_REPORT, ['service report'], context);
  }

  const report = context.report || await latestDraftReportForAssignment(context.assignment?._id);
  if (!report) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_REPORT, ['service report'], context);
  }

  const updates = extractReportUpdates(input);
  if (Object.keys(updates).length === 0) {
    return helpers.needsFollowUp(ACTIONS.UPDATE_REPORT, ['new report content, findings, next steps, or status'], context);
  }

  const reportService = (await import('../../mobile/report.service.js')).default;
  const updated = await reportService.update(report._id, updates, userId, { source: 'ai-agent' });

  return {
    action: ACTIONS.UPDATE_REPORT,
    status: 'completed',
    message: `Service report ${updated.reportNumber} updated.`,
    recordType: 'workReport',
    recordId: updated._id,
    record: {
      id: updated._id,
      reportNumber: updated.reportNumber,
      status: updated.status,
      orderId: updated.orderId?._id || updated.orderId,
    },
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

async function deleteCustomer({ context, userId, state, helpers }) {
  if (context.customerCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.DELETE_CUSTOMER, ['customer'], context);
  }
  if (!context.customer) {
    return helpers.needsFollowUp(ACTIONS.DELETE_CUSTOMER, ['customer'], context);
  }
  if (!state.confirmed) {
    return confirmationRequired(ACTIONS.DELETE_CUSTOMER, context, {
      recordType: 'customer',
      recordId: context.customer._id,
      label: context.customer.name || context.customer.customerNumber,
      effect: 'The customer will be deactivated, not hard-deleted.',
    });
  }

  const customerService = (await import('../../crm/customer.service.js')).default;
  await customerService.deactivate(context.customer._id, userId, { source: 'ai-agent' });
  return deletionResult(ACTIONS.DELETE_CUSTOMER, 'customer', context.customer._id, `Customer ${context.customer.name || context.customer.customerNumber} archived.`);
}

async function deleteTask({ context, userId, state, helpers }) {
  if (context.taskCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.DELETE_TASK, ['task'], context);
  }
  if (!context.task) {
    return helpers.needsFollowUp(ACTIONS.DELETE_TASK, ['task'], context);
  }
  if (!state.confirmed) {
    return confirmationRequired(ACTIONS.DELETE_TASK, context, {
      recordType: 'task',
      recordId: context.task._id,
      label: context.task.title,
      effect: 'The task and its subtasks will be soft-deleted.',
    });
  }

  const taskService = (await import('../../tasks/task.service.js')).default;
  await taskService.remove(context.task._id, userId, { source: 'ai-agent' });
  return deletionResult(ACTIONS.DELETE_TASK, 'task', context.task._id, `Task deleted: ${context.task.title}.`);
}

async function deleteProject({ context, userId, state, helpers }) {
  if (context.projectCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.DELETE_PROJECT, ['project'], context);
  }
  if (!context.project) {
    return helpers.needsFollowUp(ACTIONS.DELETE_PROJECT, ['project'], context);
  }
  if (!state.confirmed) {
    return confirmationRequired(ACTIONS.DELETE_PROJECT, context, {
      recordType: 'project',
      recordId: context.project._id,
      label: context.project.name || context.project.projectNumber,
      effect: 'Only DRAFT projects can be deleted; non-draft projects must be archived.',
    });
  }

  const projectService = (await import('../../pm/project.service.js')).default;
  await projectService.delete(context.project._id, userId, { source: 'ai-agent' });
  return deletionResult(ACTIONS.DELETE_PROJECT, 'project', context.project._id, `Project ${context.project.name || context.project.projectNumber} deleted.`);
}

async function deleteOrder({ context, userId, state, helpers }) {
  if (context.orderCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.DELETE_ORDER, ['order'], context);
  }
  if (!context.order) {
    return helpers.needsFollowUp(ACTIONS.DELETE_ORDER, ['order'], context);
  }
  if (!state.confirmed) {
    return confirmationRequired(ACTIONS.DELETE_ORDER, context, {
      recordType: 'order',
      recordId: context.order._id,
      label: context.order.orderNumber || context.order.title,
      effect: 'Only confirmed orders without started work or invoices can be soft-deleted.',
    });
  }

  const orderService = (await import('../../qop/order.service.js')).default;
  await orderService.softDelete(context.order._id, userId, { source: 'ai-agent' });
  return deletionResult(ACTIONS.DELETE_ORDER, 'order', context.order._id, `Order ${context.order.orderNumber || context.order.title} deleted.`);
}

async function deleteReport({ context, userId, state, helpers }) {
  if (context.reportCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.DELETE_REPORT, ['service report'], context);
  }
  const report = context.report || await latestDraftReportForAssignment(context.assignment?._id);
  if (!report) {
    return helpers.needsFollowUp(ACTIONS.DELETE_REPORT, ['service report'], context);
  }
  if (!state.confirmed) {
    return confirmationRequired(ACTIONS.DELETE_REPORT, context, {
      recordType: 'workReport',
      recordId: report._id,
      label: report.reportNumber,
      effect: 'Only editable work reports can be soft-deleted.',
    });
  }

  const reportService = (await import('../../mobile/report.service.js')).default;
  await reportService.delete(report._id, userId, { source: 'ai-agent' });
  return deletionResult(ACTIONS.DELETE_REPORT, 'workReport', report._id, `Service report ${report.reportNumber} deleted.`);
}

async function deleteAssignment({ context, userId, state, helpers }) {
  if (context.assignmentCandidates?.length > 1) {
    return helpers.needsFollowUp(ACTIONS.DELETE_ASSIGNMENT, ['assignment'], context);
  }
  if (!context.assignment) {
    return helpers.needsFollowUp(ACTIONS.DELETE_ASSIGNMENT, ['assignment'], context);
  }
  if (!state.confirmed) {
    return confirmationRequired(ACTIONS.DELETE_ASSIGNMENT, context, {
      recordType: 'assignment',
      recordId: context.assignment._id,
      label: context.assignment.assignmentNumber || context.assignment.title,
      effect: 'The assignment will be soft-deleted if no service constraints block it.',
    });
  }

  const assignmentService = (await import('../../deploy/assignment.service.js')).default;
  await assignmentService.delete(context.assignment._id, userId, { source: 'ai-agent' });
  return deletionResult(ACTIONS.DELETE_ASSIGNMENT, 'assignment', context.assignment._id, `Assignment ${context.assignment.assignmentNumber || context.assignment.title} deleted.`);
}

async function searchCustomers({ input, context, helpers }) {
  const customerService = (await import('../../crm/customer.service.js')).default;
  const { term, listAll } = searchInputs(input, context, helpers);
  if (!listAll && (!term || term.length < 2)) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_CUSTOMERS, ['customer search term'], context);
  }
  const customers = listAll
    ? (await customerService.list({ limit: 10, sortBy: 'createdAt', sortOrder: 'desc' })).data
    : await customerService.search(term, 10);

  return {
    action: ACTIONS.SEARCH_CUSTOMERS,
    status: 'completed',
    message: customers.length ? `Found ${customers.length} customers.` : 'No customers found.',
    records: customers.map((customer) => ({
      id: customer._id,
      customerNumber: customer.customerNumber,
      name: customer.name,
      ownerName: customer.ownerName,
      email: customer.email,
      phone: customer.phone || customer.mobile,
      city: customer.city,
      status: customer.status,
    })),
  };
}

async function searchTasks({ input, context, userId, state, helpers }) {
  const taskService = (await import('../../tasks/task.service.js')).default;
  const { term, listAll } = searchInputs(input, context, helpers);
  if (!listAll && (!term || term.length < 2)) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_TASKS, ['task search term'], context);
  }

  const result = await taskService.list({
    limit: 10,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(listAll ? {} : { q: term }),
  }, userId, { isAdmin: Boolean(state.permissions?.includes('*')) });
  const tasks = result.data || [];

  return {
    action: ACTIONS.SEARCH_TASKS,
    status: 'completed',
    message: tasks.length ? `Found ${tasks.length} tasks.` : 'No tasks found.',
    records: tasks.map((task) => ({
      id: task._id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeId: task.assigneeId?._id || task.assigneeId,
    })),
  };
}

async function searchProjects({ input, context, helpers }) {
  const { term, listAll } = searchInputs(input, context, helpers);
  if (!listAll && (!term || term.length < 2)) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_PROJECTS, ['project search term'], context);
  }

  const projectService = (await import('../../pm/project.service.js')).default;
  const projects = listAll
    ? (await projectService.list({ limit: 10, sortBy: 'createdAt', sortOrder: 'desc' })).data
    : await projectService.search(term, 10);
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
  const { term, listAll } = searchInputs(input, context, helpers);
  if (!listAll && (!term || term.length < 2)) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_ORDERS, ['job/order search term'], context);
  }

  const orderService = (await import('../../qop/order.service.js')).default;
  const result = await orderService.list({
    limit: 10,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(listAll ? {} : { search: term }),
  });
  const orders = result.data || [];

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

async function searchReports({ input, context, helpers }) {
  const { term, listAll } = searchInputs(input, context, helpers);
  if (!listAll && !context.assignment && (!term || term.length < 2)) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_REPORTS, ['service report search term'], context);
  }

  const reportService = (await import('../../mobile/report.service.js')).default;
  const result = context.assignment
    ? { items: await reportService.listByOrder(context.assignment._id) }
    : await reportService.list({
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...(listAll ? {} : { search: term }),
    });
  const reports = result.items || [];

  return {
    action: ACTIONS.SEARCH_REPORTS,
    status: 'completed',
    message: reports.length ? `Found ${reports.length} service reports.` : 'No service reports found.',
    records: reports.map((report) => ({
      id: report._id,
      reportNumber: report.reportNumber,
      status: report.status,
      reportDate: report.reportDate,
      orderId: report.orderId?._id || report.orderId,
      workPerformed: String(report.workPerformed || '').slice(0, 180),
    })),
  };
}

async function searchDocuments({ input, context, userId, state, helpers }) {
  const { term, listAll } = searchInputs(input, context, helpers);
  if (!listAll && (!term || term.length < 2)) {
    return helpers.needsFollowUp(ACTIONS.SEARCH_DOCUMENTS, ['document search term'], context);
  }

  const User = (await import('../../auth/user.model.js')).default;
  const user = await User.findById(userId).select('_id role').lean();
  const documentIndexService = (await import('../../documents/documentIndex.service.js')).default;
  const result = await documentIndexService.list({
    search: listAll ? undefined : term,
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

function confirmationRequired(action, context, { recordType, recordId, label, effect }) {
  return {
    action,
    status: 'awaiting_confirmation',
    message: `Please confirm before I continue: ${effect}`,
    confirmation: {
      action,
      recordType,
      recordId,
      label,
      effect,
    },
    recordType,
    recordId,
    resolvedContext: context,
  };
}

function deletionResult(action, recordType, recordId, message) {
  return {
    action,
    status: 'completed',
    message,
    recordType,
    recordId,
    deleted: true,
  };
}

async function latestDraftReportForAssignment(assignmentId) {
  if (!assignmentId) return null;
  const reportService = (await import('../../mobile/report.service.js')).default;
  const reports = await reportService.listByOrder(assignmentId);
  return [...reports]
    .filter((report) => report.status === 'DRAFT')
    .sort((a, b) => new Date(b.createdAt || b.reportDate || 0) - new Date(a.createdAt || a.reportDate || 0))[0] || null;
}

function extractCustomerUpdates(input) {
  const updates = {};
  const text = String(input || '');
  const fieldPatterns = [
    ['name', /\b(?:name|customer name|company name)\s*(?:to|as|:)\s+(.+?)(?=\s+(?:phone|mobile|email|address|owner|uid|status)\b|[,;.]|$)/i],
    ['phone', /\b(?:phone|telephone|tel)\s*(?:to|as|:)\s+([+0-9 ()/-]{5,30})/i],
    ['mobile', /\bmobile\s*(?:to|as|:)\s+([+0-9 ()/-]{5,30})/i],
    ['email', /\bemail\s*(?:to|as|:)\s+([^\s,;]+@[^\s,;]+)/i],
    ['ownerName', /\b(?:owner|owner name)\s*(?:to|as|:)\s+(.+?)(?=\s+(?:phone|mobile|email|address|uid|status)\b|[,;.]|$)/i],
    ['uidNumber', /\b(?:uid|vat|mwst)\s*(?:to|as|:)?\s*([A-Z]{2,3}[-\s.]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}|[A-Z0-9][A-Z0-9 .-]{4,40})/i],
    ['status', /\bstatus\s*(?:to|as|:)\s+([a-z_ -]+)/i],
  ];

  for (const [field, pattern] of fieldPatterns) {
    const value = text.match(pattern)?.[1]?.trim();
    if (value) updates[field] = value;
  }

  const address = text.match(/\b(?:address|adresse)\s*(?:to|as|:)\s+(.+)$/i)?.[1]?.trim();
  if (address) {
    const postal = address.match(/\b([1-9]\d{3})\s+([\p{L} .'-]{2,80})$/u);
    if (postal) {
      updates.street = address.slice(0, postal.index).trim().replace(/,$/, '');
      updates.postalCode = postal[1];
      updates.city = postal[2].trim();
      updates.country = 'CH';
    }
  }

  return updates;
}

function extractReportUpdates(input) {
  const text = String(input || '').trim();
  const updates = {};
  const status = extractReportStatus(text);
  if (status) updates.status = status;

  const findings = extractNamedSection(text, ['findings', 'finding', 'befund']);
  if (findings) updates.findings = findings;
  const nextSteps = extractNamedSection(text, ['next steps', 'recommendation', 'empfehlung']);
  if (nextSteps) updates.nextSteps = nextSteps;

  const workPerformed = extractNamedSection(text, ['work performed', 'service report', 'report content', 'content', 'text']);
  if (workPerformed) updates.workPerformed = workPerformed;
  if (!workPerformed && !status && text.length > 20) {
    updates.workPerformed = text
      .replace(/\b(update|edit|change|set|service report|work report|report)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  }

  return Object.fromEntries(Object.entries(updates).filter(([, value]) => value));
}

function extractNamedSection(input, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = input.match(new RegExp(`\\b${escaped}\\s*(?:to|as|:)?\\s+(.+)$`, 'i'));
    if (match?.[1]?.trim()) return match[1].trim().slice(0, 5000);
  }
  return null;
}

function extractReportStatus(input) {
  const text = String(input || '').toLowerCase();
  if (hasAny(text, ['submit', 'submitted', 'einreichen'])) return 'SUBMITTED';
  if (hasAny(text, ['approve', 'approved', 'genehmigen'])) return 'APPROVED';
  if (hasAny(text, ['reject', 'rejected', 'ablehnen'])) return 'REJECTED';
  if (hasAny(text, ['invoice', 'invoiced', 'verrechnet'])) return 'INVOICED';
  if (hasAny(text, ['draft', 'entwurf'])) return 'DRAFT';
  return null;
}

function isListAllIntent(input) {
  return /\b(show|list|view|get|display|zeige|liste|alle|all|recent|latest|newest)\b/i.test(input)
    && /\b(all|recent|latest|newest|list|alle|overview|uebersicht|übersicht)\b/i.test(input);
}

// The LLM planner's clean parameters win over keyword extraction when present.
function searchInputs(input, context, helpers) {
  const draft = context?.llmDraft || {};
  return {
    term: draft.searchTerm || helpers.extractSearchTerm(input),
    listAll: draft.listAll === true || isListAllIntent(input),
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
