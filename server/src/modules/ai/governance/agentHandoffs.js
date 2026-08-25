/**
 * Inter-agent handoffs.
 *
 * The specification formalises ten of them: a fact established by one agent
 * puts the next one to work, without anybody asking. This module subscribes
 * the agents to the business events the ERP already publishes.
 *
 * Two rules hold for every handoff:
 *  - the receiving agent must be enabled in the registry, and the fleet-wide
 *    emergency stop must be clear;
 *  - the agent prepares, it never commits. Everything it produces is a draft
 *    or a task for a person to act on.
 */
import eventBus from '../../../shared/events/EventBus.js';
import EVENT_TYPES from '../../../shared/events/eventTypes.js';
import agentGovernance from './agentGovernance.service.js';
import logger from '../../../shared/logger/index.js';

/** An agent only acts on its own initiative when it is switched on. */
async function agentIsRunnable(agentKey) {
  if (await agentGovernance.isEmergencyStopped()) return false;
  const { byKey } = await agentGovernance._registry();
  const agent = byKey.get(agentKey);
  return Boolean(agent?.isEnabled);
}

/**
 * Quotation accepted → Projekt AI.
 *
 * The specification's own wording: "Offerte angenommen → Projekt AI →
 * Behörden/Money/Material AI". This first leg opens the project and its
 * checklist; the onward legs follow as those agents gain behaviour.
 */
async function onQuotationAccepted(event) {
  const payload = event?.payload || event || {};
  const { quotationId, acceptedBy } = payload;
  if (!quotationId) return;

  if (!(await agentIsRunnable('PROJEKT'))) return;

  try {
    const Quotation = (await import('../../qop/quotation.model.js')).default;
    const quotation = await Quotation.findById(quotationId)
      .select('quotationNumber customerId customerName siteId projectId title aiDraft convertedOrderId')
      .lean();
    if (!quotation) return;

    // Nothing to open when the job already has a project.
    if (quotation.projectId) return;

    const projektService = (await import('../agents/projekt/projekt.service.js')).default;
    const template = await projektService.selectTemplate({
      recognizedWork: quotation.aiDraft?.recognizedWork || [],
      title: quotation.title || '',
    });

    const taskService = (await import('../../tasks/task.service.js')).default;
    const blocking = (template?.tasks || []).filter((task) => task.blocksStart).map((task) => task.title);

    // Projekt AI proposes; a person opens the project from the order screen.
    await taskService.create({
      title: `Projekt eröffnen: ${quotation.title || quotation.quotationNumber}`,
      description: [
        `Die Offerte ${quotation.quotationNumber} wurde angenommen.`,
        template ? `Vorgeschlagene Checkliste: „${template.name}" mit ${template.tasks.length} Aufgaben.` : null,
        blocking.length ? `Vor dem Baustart zu erledigen: ${blocking.join(', ')}.` : null,
        'Projekt über den Auftrag eröffnen, damit die Checkliste automatisch angelegt wird.',
      ].filter(Boolean).join('\n'),
      priority: 'HIGH',
      customerId: quotation.customerId || null,
    }, acceptedBy || null, { source: 'ai-agent' });

    logger.info('Handoff: quotation accepted → Projekt AI', {
      module: 'ai-handoff',
      action: 'quotationAccepted',
      quotationId: String(quotationId),
      template: template?.key || null,
    });
  } catch (err) {
    logger.warn('Handoff quotation → Projekt AI failed', {
      module: 'ai-handoff',
      action: 'quotationAccepted',
      quotationId: String(quotationId),
      error: err.message,
    });
  }
}

/**
 * Project reported finished → Quality AI.
 *
 * The specification's trigger for Quality AI is "Projekt abgeschlossen
 * gemeldet". It runs the closing checklist and, when something is missing,
 * leaves a Mängelliste behind as a task. It does not touch the status: the
 * project was closed by a person, and only a person reopens it.
 */
async function onProjectCompleted(event) {
  const payload = event?.payload || event || {};
  const { projectId, toStatus, changedBy } = payload;
  if (!projectId || toStatus !== 'COMPLETED') return;

  if (!(await agentIsRunnable('QUALITY'))) return;

  try {
    const qualityService = (await import('../agents/quality/quality.service.js')).default;
    const result = await qualityService.checkBeforeClose({ _id: projectId });
    if (!result.verified || result.ok) return;

    const taskService = (await import('../../tasks/task.service.js')).default;
    await taskService.create({
      title: `Abschluss unvollständig: ${result.project.name || result.project.projectNumber}`,
      description: qualityService.compose(result),
      priority: 'HIGH',
      projectId,
      customerId: result.project.customerId || null,
    }, changedBy || null, { source: 'ai-agent' });

    logger.info('Handoff: project completed → Quality AI', {
      module: 'ai-handoff',
      action: 'projectCompleted',
      projectId: String(projectId),
      blockers: result.blockers.length,
    });
  } catch (err) {
    logger.warn('Handoff project → Quality AI failed', {
      module: 'ai-handoff',
      action: 'projectCompleted',
      projectId: String(projectId),
      error: err.message,
    });
  }
}

/**
 * Maintenance gone overdue → Service AI.
 *
 * The nightly job says how many intervals turned overdue, not which ones, so
 * the agent reads the current list itself and leaves one task naming them.
 * One task, not one per plant: the office wants a worklist, not an inbox.
 */
const OVERDUE_TASK_PREFIX = 'Serviceaufträge vorbereiten';

async function onMaintenanceOverdue(event) {
  const payload = event?.payload || event || {};
  if (!payload.count) return;

  if (!(await agentIsRunnable('SERVICE'))) return;

  try {
    const serviceService = (await import('../agents/service/service.service.js')).default;
    const due = await serviceService.findDueMaintenance();
    const overdue = due.filter((item) => (item.daysOverdue ?? 0) > 0);
    if (!overdue.length) return;

    // The job runs daily; without this the same worklist piles up every night.
    const taskService = (await import('../../tasks/task.service.js')).default;
    const Task = (await import('../../tasks/task.model.js')).default;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const already = await Task.findOne({
      title: new RegExp(`^${OVERDUE_TASK_PREFIX}`),
      status: { $in: ['OPEN', 'IN_PROGRESS'] },
      createdAt: { $gte: midnight },
    }).select('_id').lean();
    if (already) return;

    await taskService.create({
      title: `${OVERDUE_TASK_PREFIX}: ${overdue.length} überfällige Wartung(en)`,
      description: serviceService.composeDueList(overdue),
      priority: 'HIGH',
    }, payload.assignedTo || null, { source: 'ai-agent' });

    logger.info('Handoff: maintenance overdue → Service AI', {
      module: 'ai-handoff',
      action: 'maintenanceOverdue',
      overdue: overdue.length,
    });
  } catch (err) {
    logger.warn('Handoff maintenance → Service AI failed', {
      module: 'ai-handoff',
      action: 'maintenanceOverdue',
      error: err.message,
    });
  }
}

/**
 * Project opened → Behörden AI.
 *
 * Projekt AI already puts "Bohrbewilligung einholen" on the checklist, so this
 * leg does not repeat it. What it adds is the thing nobody notices until the
 * form is half filled in: the data the procedures need is not in the system.
 * One task, naming exactly what is missing.
 */
async function onProjectCreated(event) {
  const payload = event?.payload || event || {};
  const { projectId, createdBy } = payload;
  if (!projectId) return;

  if (!(await agentIsRunnable('BEHOERDEN'))) return;

  try {
    const behoerdenService = (await import('../agents/behoerden/behoerden.service.js')).default;
    const result = await behoerdenService.assess({ _id: projectId });
    if (!result.verified || !result.procedures.length) return;

    // Only the data gaps: the permits themselves are already on the checklist.
    const gaps = [...new Set(result.procedures.flatMap((procedure) => procedure.missingData))];
    if (!gaps.length) return;

    const taskService = (await import('../../tasks/task.service.js')).default;
    await taskService.create({
      title: `Behördenangaben vervollständigen: ${result.project.name}`,
      description: [
        `Für die Verfahren dieses Projekts fehlen im System: ${gaps.join(', ')}.`,
        '',
        behoerdenService.compose(result),
      ].join('\n'),
      priority: 'HIGH',
      projectId,
      customerId: result.project.customerId || null,
    }, createdBy || null, { source: 'ai-agent' });

    logger.info('Handoff: project created → Behörden AI', {
      module: 'ai-handoff',
      action: 'projectCreated',
      projectId: String(projectId),
      gaps: gaps.length,
    });
  } catch (err) {
    logger.warn('Handoff project → Behörden AI failed', {
      module: 'ai-handoff',
      action: 'projectCreated',
      projectId: String(projectId),
      error: err.message,
    });
  }
}

/**
 * Site start planned → Material AI.
 *
 * The specification's own trigger: "Baustart geplant". Projekt AI already has
 * "Material bestellen" on the checklist, so this leg does not repeat it — it
 * fires when the start is actually scheduled and says what will not be there
 * by then, which is the moment the office can still do something about it.
 */
async function onProjectScheduled(event) {
  const payload = event?.payload || event || {};
  const { projectId, toStatus, changedBy } = payload;
  if (!projectId || toStatus !== 'SCHEDULED') return;

  if (!(await agentIsRunnable('MATERIAL'))) return;

  try {
    const materialService = (await import('../agents/material/material.service.js')).default;
    const result = await materialService.check({ _id: projectId });
    if (!result.verified || result.ok || !result.articles.length) return;

    const taskService = (await import('../../tasks/task.service.js')).default;
    await taskService.create({
      title: `Material vor Baustart klären: ${result.project.name}`,
      description: materialService.compose(result),
      priority: 'URGENT',
      projectId,
      customerId: result.project.customerId || null,
    }, changedBy || null, { source: 'ai-agent' });

    logger.info('Handoff: project scheduled → Material AI', {
      module: 'ai-handoff',
      action: 'projectScheduled',
      projectId: String(projectId),
      blockers: result.blockers.length,
    });
  } catch (err) {
    logger.warn('Handoff project → Material AI failed', {
      module: 'ai-handoff',
      action: 'projectScheduled',
      projectId: String(projectId),
      error: err.message,
    });
  }
}

/**
 * Document filed → Document AI.
 *
 * The register's own trigger, "Neues Dokument". A document that lands under
 * OTHER is invisible to Behörden, Quality and Money AI, which then report the
 * paperwork missing — so the moment to look at it is the moment it arrives.
 * A task only when there is something to say: a document already filed where
 * it belongs needs nobody's attention.
 */
async function onDocumentUploaded(event) {
  const payload = event?.payload || event || {};
  const { documentId, projectId, fileName, category, uploadedBy } = payload;
  if (!documentId || !projectId || !fileName) return;

  if (!(await agentIsRunnable('DOCUMENT'))) return;

  try {
    const documentService = (await import('../agents/document/document.service.js')).default;
    const result = await documentService.classify({ fileName, projectId });

    // Nothing to propose when the office already filed it correctly.
    if (result.type && result.category === category) return;

    const taskService = (await import('../../tasks/task.service.js')).default;
    await taskService.create({
      title: result.type
        ? `Dokument einordnen: ${fileName}`
        : `Dokument unklar: ${fileName}`,
      description: documentService.compose(result),
      priority: result.type ? 'MEDIUM' : 'HIGH',
      projectId,
      customerId: result.project?.customerId || null,
    }, uploadedBy || null, { source: 'ai-agent' });

    logger.info('Handoff: document uploaded → Document AI', {
      module: 'ai-handoff',
      action: 'documentUploaded',
      documentId: String(documentId),
      type: result.type?.key || null,
    });
  } catch (err) {
    logger.warn('Handoff document → Document AI failed', {
      module: 'ai-handoff',
      action: 'documentUploaded',
      documentId: String(documentId),
      error: err.message,
    });
  }
}

/**
 * Supplier invoice recorded → Finanz AI.
 *
 * The register's trigger, "Eingangsrechnung erkannt". The checks that matter
 * are arithmetic — an IBAN whose check digits do not add up is a payment that
 * never arrives — and the moment to run them is while somebody is still
 * looking at the invoice, not on the day of the payment run.
 */
async function onSupplierInvoiceRecorded(event) {
  const payload = event?.payload || event || {};
  const { apInvoiceId, invoiceId, createdBy } = payload;
  const id = apInvoiceId || invoiceId;
  if (!id) return;

  if (!(await agentIsRunnable('FINANZ'))) return;

  try {
    const finanzService = (await import('../agents/finanz/finanz.service.js')).default;
    const result = await finanzService.checkBeforePayment({ _id: id });
    if (!result.verified) return;

    // Only the bank coordinates raise a task on their own. "Not approved yet"
    // is the normal state of a fresh invoice, not something to chase.
    const bankProblems = result.blockers.filter((blocker) => blocker.reason === 'PAYMENT_OR_BANK_DATA');
    if (!bankProblems.length) return;

    const taskService = (await import('../../tasks/task.service.js')).default;
    await taskService.create({
      title: `Zahlungsdaten prüfen: ${result.invoice.supplierName || 'Kreditorenrechnung'} ${result.invoice.supplierInvoiceNumber || ''}`.trim(),
      description: finanzService.compose(result),
      priority: 'HIGH',
      projectId: result.invoice.projectId || null,
    }, createdBy || null, { source: 'ai-agent' });

    logger.info('Handoff: supplier invoice recorded → Finanz AI', {
      module: 'ai-handoff',
      action: 'supplierInvoiceRecorded',
      invoiceId: String(id),
      bankProblems: bankProblems.length,
    });
  } catch (err) {
    logger.warn('Handoff invoice → Finanz AI failed', {
      module: 'ai-handoff',
      action: 'supplierInvoiceRecorded',
      invoiceId: String(id),
      error: err.message,
    });
  }
}

export function registerAgentHandoffs() {
  eventBus.subscribe(EVENT_TYPES.QUOTATION_ACCEPTED, onQuotationAccepted);
  eventBus.subscribe(EVENT_TYPES.PROJECT_DOCUMENT_UPLOADED, onDocumentUploaded);
  eventBus.subscribe(EVENT_TYPES.ACCOUNTING_AP_INVOICE_RECORDED, onSupplierInvoiceRecorded);
  eventBus.subscribe(EVENT_TYPES.PROJECT_CREATED, onProjectCreated);
  eventBus.subscribe(EVENT_TYPES.PROJECT_STATUS_CHANGED, onProjectScheduled);
  eventBus.subscribe(EVENT_TYPES.PROJECT_STATUS_OVERRIDDEN, onProjectScheduled);
  eventBus.subscribe(EVENT_TYPES.PROJECT_STATUS_CHANGED, onProjectCompleted);
  eventBus.subscribe(EVENT_TYPES.PROJECT_STATUS_OVERRIDDEN, onProjectCompleted);
  eventBus.subscribe(EVENT_TYPES.MAINTENANCE_OVERDUE, onMaintenanceOverdue);

  logger.info('Agent handoffs registered', {
    module: 'ai-handoff',
    action: 'register',
    handoffs: [
      'quotation.accepted → PROJEKT',
      'document.uploaded → DOCUMENT',
      'ap.invoice.recorded → FINANZ',
      'project.created → BEHOERDEN',
      'project.scheduled → MATERIAL',
      'project.completed → QUALITY',
      'maintenance.overdue → SERVICE',
    ],
  });
}

export default registerAgentHandoffs;
