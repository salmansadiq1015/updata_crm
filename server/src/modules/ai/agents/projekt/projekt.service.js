/**
 * Projekt AI — opens the project once a job is awarded.
 *
 * Per the specification it creates the project, its checklist and tasks, and a
 * draft schedule, and it marks the tasks that must be done before work can
 * start ("Baustart nicht freigeben, wenn Bewilligungen fehlen"). It proposes;
 * it never releases a site start by itself.
 */
import mongoose from 'mongoose';
import logger from '../../../../shared/logger/index.js';

/** Working-day offset, skipping weekends so a draft schedule looks sane. */
function addWorkingDays(from, days) {
  const date = new Date(from);
  let remaining = Math.max(0, Number(days) || 0);
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  date.setHours(9, 0, 0, 0);
  return date;
}

class ProjektService {
  /**
   * Picks the checklist that fits the job, from the trade content Offerte AI
   * recognised plus the title. Falls back to the generic template.
   */
  async selectTemplate({ recognizedWork = [], title = '', description = '' } = {}) {
    // Without a reachable database the project still opens — just without its
    // checklist. Never stall the project behind the template lookup.
    if (mongoose.connection?.readyState !== 1) return null;

    let templates;
    try {
      const ProjectTaskTemplate = (await import('../../../pm/projectTaskTemplate.model.js')).default;
      templates = await ProjectTaskTemplate.find({ isActive: true }).sort({ priority: 1 }).lean();
    } catch (err) {
      logger.warn('Projekt AI could not load the task templates', {
        module: 'ai-projekt', action: 'selectTemplate', error: err.message,
      });
      return null;
    }
    if (!templates.length) return null;

    const haystack = [...recognizedWork, title, description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const match = templates.find((template) => !template.isFallback
      && (template.matchTerms || []).some((term) => term && haystack.includes(term)));

    return match || templates.find((template) => template.isFallback) || templates[0];
  }

  /**
   * Creates the checklist tasks for a project. Returns what was created plus
   * the tasks that block the site start, so the caller can say so plainly.
   */
  async createChecklist(project, template, userId, { startDate } = {}) {
    if (!template?.tasks?.length) return { created: [], blocking: [] };

    const taskService = (await import('../../../tasks/task.service.js')).default;
    const from = startDate ? new Date(startDate) : new Date();
    const created = [];

    for (const item of template.tasks) {
      try {
        const task = await taskService.create({
          title: item.title,
          description: [item.description, item.blocksStart ? 'Baustart erst nach Erledigung dieser Aufgabe.' : null]
            .filter(Boolean)
            .join('\n'),
          priority: item.priority || 'MEDIUM',
          dueDate: addWorkingDays(from, item.offsetDays),
          projectId: project._id,
        }, userId, { source: 'ai-agent' });
        created.push({
          id: task._id,
          title: task.title,
          dueDate: task.dueDate,
          blocksStart: Boolean(item.blocksStart),
          handoffTo: item.handoffTo || null,
        });
      } catch (err) {
        logger.warn('Projekt AI could not create a checklist task', {
          module: 'ai-projekt',
          action: 'createChecklist',
          projectId: String(project._id),
          task: item.title,
          error: err.message,
        });
      }
    }

    return { created, blocking: created.filter((task) => task.blocksStart) };
  }

  /**
   * Opens the project behind an order and fills its checklist.
   * The order service refuses if a project already exists, which keeps this
   * safe to call twice.
   */
  async openFromOrder(orderId, userId, meta = {}) {
    const orderService = (await import('../../../qop/order.service.js')).default;
    const orderRepository = (await import('../../../qop/order.repository.js')).default;
    const order = await orderRepository.findById(orderId);
    if (!order) return null;

    // Trade content recognised when the quotation was drafted, if any.
    let recognizedWork = [];
    if (order.sourceQuotationId) {
      try {
        const Quotation = (await import('../../../qop/quotation.model.js')).default;
        const quotation = await Quotation.findById(order.sourceQuotationId).select('aiDraft').lean();
        recognizedWork = quotation?.aiDraft?.recognizedWork || [];
      } catch { /* the checklist just falls back to the generic template */ }
    }

    const template = await this.selectTemplate({
      recognizedWork,
      title: order.title || '',
      description: order.notes || '',
    });

    const project = await orderService.createProject(orderId, {
      name: order.title || `Projekt ${order.orderNumber}`,
      projectType: template?.projectType || 'NEW_INSTALLATION',
      description: template ? `Checkliste: ${template.name}` : null,
    }, userId, meta);

    const checklist = await this.createChecklist(project, template, userId);

    logger.info('Projekt AI opened a project from an order', {
      module: 'ai-projekt',
      action: 'openFromOrder',
      orderId: String(orderId),
      projectId: String(project._id),
      template: template?.key || null,
      tasks: checklist.created.length,
    });

    return { project, template, checklist, recognizedWork };
  }
}

export default new ProjektService();
