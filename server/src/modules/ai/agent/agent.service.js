import agentRunRepository from './agentRun.repository.js';
import agentMemory from './agent.memory.js';
import llmPlanner from './llmPlanner.service.js';
import { checkRateLimit, sanitizeUserInput } from './agent.guardrails.js';
import queueManager from '../../../shared/queue/QueueManager.js';
import { AppError } from '../../../shared/errors/AppError.js';
import ERROR_CODES from '../../../shared/errors/errorCodes.js';
import auditService from '../../auth/audit.service.js';
import eventBus from '../../../shared/events/EventBus.js';
import EVENT_TYPES from '../../../shared/events/eventTypes.js';
import config from '../../../config/index.js';
import logger from '../../../shared/logger/index.js';
import { randomUUID } from 'crypto';

const INTENT_TO_WORKFLOW = {
  create_customer: 'FIELD_SERVICE_AGENT',
  update_customer: 'FIELD_SERVICE_AGENT',
  delete_customer: 'FIELD_SERVICE_AGENT',
  create_task: 'FIELD_SERVICE_AGENT',
  update_task: 'FIELD_SERVICE_AGENT',
  delete_task: 'FIELD_SERVICE_AGENT',
  create_project: 'FIELD_SERVICE_AGENT',
  delete_project: 'FIELD_SERVICE_AGENT',
  send_notification: 'NOTIFICATION',
  create_order: 'FIELD_SERVICE_AGENT',
  update_order: 'FIELD_SERVICE_AGENT',
  delete_order: 'FIELD_SERVICE_AGENT',
  create_assignment: 'FIELD_SERVICE_AGENT',
  reschedule_assignment: 'FIELD_SERVICE_AGENT',
  delete_assignment: 'FIELD_SERVICE_AGENT',
  create_report: 'FIELD_SERVICE_AGENT',
  update_report: 'FIELD_SERVICE_AGENT',
  delete_report: 'FIELD_SERVICE_AGENT',
  update_project: 'FIELD_SERVICE_AGENT',
  create_note: 'FIELD_SERVICE_AGENT',
  send_chat_message: 'FIELD_SERVICE_AGENT',
  record_time: 'FIELD_SERVICE_AGENT',
  analyze_workforce: 'FIELD_SERVICE_AGENT',
  sales_followups: 'FIELD_SERVICE_AGENT',
  quality_check: 'FIELD_SERVICE_AGENT',
  service_due: 'FIELD_SERVICE_AGENT',
  service_briefing: 'FIELD_SERVICE_AGENT',
  permit_check: 'FIELD_SERVICE_AGENT',
  dispatch_check: 'FIELD_SERVICE_AGENT',
  dispatch_suggest: 'FIELD_SERVICE_AGENT',
  material_check: 'FIELD_SERVICE_AGENT',
  search_customer: 'FIELD_SERVICE_AGENT',
  search_tasks: 'FIELD_SERVICE_AGENT',
  search_projects: 'FIELD_SERVICE_AGENT',
  search_orders: 'FIELD_SERVICE_AGENT',
  search_reports: 'FIELD_SERVICE_AGENT',
  search_documents: 'FIELD_SERVICE_AGENT',
  create_quotation: 'FIELD_SERVICE_AGENT',
  create_invoice: 'FIELD_SERVICE_AGENT',
  create_task_reminder: 'FIELD_SERVICE_AGENT',
};

class AgentService {
  /**
   * LLM planning first (understands questions and extracts clean parameters);
   * deterministic keyword heuristics only as fallback so the agent still
   * responds without an API key. Returns { intent, llmPlan }.
   */
  async _classifyIntent(input) {
    const plan = await llmPlanner.plan(input);
    if (plan) {
      const intent = plan.action === 'SEND_CHAT' ? 'send_chat_message' : plan.action.toLowerCase();
      return { intent, llmPlan: plan };
    }
    const deterministic = this._classifyIntentHeuristic(input);
    return { intent: deterministic || 'general', llmPlan: null };
  }

  _classifyIntentHeuristic(input) {
    const text = String(input || '').toLowerCase();
    const has = (...terms) => terms.some((term) => text.includes(term));
    const isSearch = has('show', 'find', 'search', 'lookup', 'look up', 'list', 'view', 'display', 'all', 'recent', 'latest', 'suche', 'zeige', 'liste');
    const isDelete = has('delete', 'remove', 'archive', 'deactivate', 'loeschen', 'löschen', 'archiv');
    const isUpdate = has('update', 'edit', 'change', 'set', 'mark', 'status', 'aktualisier', 'aendere', 'ändere');

    if (isDelete && has('customer', 'kunde', 'client', 'company', 'firma')) return 'delete_customer';
    if (isDelete && has('service report', 'work report', 'report', 'rapport', 'bericht')) return 'delete_report';
    if (isDelete && has('assignment', 'appointment', 'termin', 'einsatz')) return 'delete_assignment';
    if (isDelete && has('project', 'projekt')) return 'delete_project';
    if (isDelete && has('order', 'orders', 'job', 'jobs', 'auftrag', 'auftraege')) return 'delete_order';
    if (isDelete && has('task', 'todo', 'aufgabe')) return 'delete_task';

    if (isSearch && has('service report', 'work report', 'report', 'reports', 'rapport', 'bericht')) return 'search_reports';
    if (isSearch && has('task', 'tasks', 'todo', 'todos', 'aufgabe', 'aufgaben')) return 'search_tasks';
    if (isSearch && has('document', 'documents', 'file', 'files', 'pdf', 'dokument', 'datei')) return 'search_documents';
    if (isSearch && has('project', 'projects', 'projekt', 'projekte')) return 'search_projects';
    if (isSearch && has('order', 'orders', 'job', 'jobs', 'auftrag', 'auftraege')) return 'search_orders';
    if (isSearch && has('customer', 'customers', 'kunde', 'kunden', 'client', 'company', 'firma')) return 'search_customer';

    if (isUpdate && has('customer', 'kunde', 'client', 'company', 'firma')) return 'update_customer';
    if (isUpdate && has('service report', 'work report', 'report', 'rapport', 'bericht')) return 'update_report';

    if (has('quotation', 'quote', 'offerte', 'angebot')) return 'create_quotation';
    if (has('invoice', 'rechnung')) return 'create_invoice';
    if (has('reminder', 'remind me', 'notify me', 'erinnerung', 'erinnere')) return 'create_task_reminder';
    if (has('service report', 'work report', 'rapport', 'bericht')) return 'create_report';
    if (has('chat', 'message', 'nachricht', 'send to', 'schreib')) return 'send_chat_message';
    if (has('workforce', 'absence', 'absences', 'leave', 'vacation', 'availability', 'overtime', 'deficit', 'kapazität', 'kapazitaet', 'abwesenheit', 'ferien', 'überzeit', 'ueberzeit')) return 'analyze_workforce';
    if (has('working hour', 'hours', 'time entry', 'zeit', 'stunden')) return 'record_time';
    if (has('reschedule', 'move appointment', 'verschieb')) return 'reschedule_assignment';
    if (has('schedule', 'appointment', 'assign', 'plan', 'termin', 'zuweisen')) return 'create_assignment';
    if (has('project', 'projekt') && has('create', 'new', 'add', 'erstelle', 'neues', 'neuen', 'anlegen')) return 'create_project';
    if (has('project', 'projekt') && has('status', 'update', 'set', 'change', 'aktualisier')) return 'update_project';
    if (has('order', 'job', 'auftrag')) return has('update', 'status', 'change', 'set') ? 'update_order' : 'create_order';
    if (has('note', 'notiz', 'documentation', 'dokumentation')) return 'create_note';
    if (has('create', 'new', 'add', 'erstelle', 'neue', 'neuen', 'firma anlegen', 'kunde anlegen') && has('customer', 'kunde', 'client', 'company', 'firma')) return 'create_customer';
    if (has('customer', 'kunde', 'client', 'show me', 'find', 'search', 'suche')) return 'search_customer';
    if (has('task', 'aufgabe', 'todo')) return has('complete', 'done', 'erledigt', 'in progress', 'bearbeitung') ? 'update_task' : 'create_task';
    return null;
  }

  async run(input, userId, permissions, meta = {}) {
    if (!config.ai.apiKey) {
      throw new AppError(
        'Der KI-Assistent ist nicht konfiguriert (OPENAI_API_KEY fehlt). Bitte den Administrator kontaktieren.',
        503,
        'AI_NOT_CONFIGURED'
      );
    }
    await checkRateLimit(userId);
    const sanitized = sanitizeUserInput(input);

    // Idempotency: reuse existing run if correlationId matches a non-failed run
    if (meta.correlationId) {
      const existing = await agentRunRepository.findByCorrelationId(meta.correlationId);
      if (existing) {
        if (existing.status === 'COMPLETED') {
          return { agentRunId: existing._id.toString(), status: 'completed', workflowType: existing.workflowType, threadId: existing.threadId };
        }
        if (['RUNNING', 'PENDING'].includes(existing.status)) {
          return { agentRunId: existing._id.toString(), status: 'pending', workflowType: existing.workflowType, threadId: existing.threadId };
        }
        // FAILED or CANCELLED — fall through and create a new run
      }
    }

    const previousFollowUp = await this._loadPreviousFollowUp(userId, meta.threadId);
    const classification = previousFollowUp
      ? { intent: previousFollowUp.action, llmPlan: null }
      : await this._classifyIntent(sanitized);
    const { intent, llmPlan } = classification;
    const workflowType = previousFollowUp
      ? 'FIELD_SERVICE_AGENT'
      : INTENT_TO_WORKFLOW[intent] || (intent === 'general' ? 'GENERAL' : 'FIELD_SERVICE_AGENT');
    const threadId = meta.threadId || randomUUID();

    const agentRun = await agentRunRepository.create({
      userId,
      threadId,
      workflowType,
      status: 'PENDING',
      input: sanitized,
      idempotencyKey: `${userId}-${randomUUID()}`,
      correlationId: meta.correlationId || randomUUID(),
      metadata: { ipAddress: meta.ipAddress, userAgent: meta.userAgent },
    });

    try {
      await queueManager.addJob('ai-agent', 'execute', {
        agentRunId: agentRun._id.toString(),
        userId: userId.toString(),
        permissions,
        workflowType,
        entities: {
          requestContext: meta.context || {},
          previousFollowUp,
          llmPlan,
        },
        input: sanitized,
      });
    } catch (queueErr) {
      await agentRunRepository.updateById(agentRun._id, {
        status: 'FAILED',
        failedAt: new Date(),
        error: { code: 'QUEUE_UNAVAILABLE', message: 'Failed to enqueue agent job — Redis may be unavailable' },
      });
      logger.error('Failed to enqueue agent job', { module: 'ai-agent', action: 'service.run', agentRunId: agentRun._id.toString(), error: queueErr.message });
      throw new AppError('Service temporarily unavailable. Please try again.', 503, 'QUEUE_UNAVAILABLE');
    }

    eventBus.publish(
      EVENT_TYPES.AI_AGENT_RUN_STARTED,
      { agentRunId: agentRun._id.toString(), userId: userId.toString(), workflowType },
      { source: 'ai:agent' }
    );

    auditService.logEvent({
      eventType: 'ai.agent.run.started',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { agentRunId: agentRun._id.toString(), workflowType },
      module: 'ai',
    });

    logger.info('Agent run dispatched', {
      module: 'ai-agent',
      action: 'service.run',
      agentRunId: agentRun._id.toString(),
      workflowType,
    });

    return { agentRunId: agentRun._id.toString(), status: 'pending', workflowType, threadId };
  }

  async _loadPreviousFollowUp(userId, threadId) {
    if (!threadId) return null;
    const latest = await agentRunRepository.findLatestByThreadId(userId, threadId);
    if (!latest?.output || latest.output.status !== 'needs_follow_up') return null;
    return {
      action: latest.output.action,
      originalInput: latest.output.originalInput || latest.input,
      missingFields: latest.output.missingFields || [],
      resolvedContext: latest.output.resolvedContext || {},
      candidates: latest.output.candidates || {},
    };
  }

  async runFromSession(voiceSessionId, userId, permissions, entities, intentName, meta = {}) {
    const workflowType = INTENT_TO_WORKFLOW[intentName] || null;
    if (!workflowType) {
      logger.info('No agent workflow for intent', { module: 'ai-agent', intentName, voiceSessionId });
      return null;
    }

    // Idempotency: don't create duplicate runs for the same session
    let agentRun;
    try {
      agentRun = await agentRunRepository.create({
        userId,
        workflowType,
        status: 'PENDING',
        input: `Voice session: ${voiceSessionId}`,
        voiceSessionId,
        idempotencyKey: `voice-${voiceSessionId}`,
        correlationId: meta.correlationId || randomUUID(),
        metadata: { ipAddress: meta.ipAddress, userAgent: meta.userAgent },
      });
    } catch (err) {
      if (err.code === 11000) {
        logger.info('Agent run already exists for voice session', { module: 'ai-agent', voiceSessionId });
        return null;
      }
      throw err;
    }

    try {
      await queueManager.addJob('ai-agent', 'execute', {
        agentRunId: agentRun._id.toString(),
        userId: userId.toString(),
        permissions,
        workflowType,
        entities,
        input: `Voice session: ${voiceSessionId}`,
      });
    } catch (queueErr) {
      await agentRunRepository.updateById(agentRun._id, {
        status: 'FAILED',
        failedAt: new Date(),
        error: { code: 'QUEUE_UNAVAILABLE', message: 'Failed to enqueue agent job — Redis may be unavailable' },
      });
      logger.error('Failed to enqueue agent job from session', { module: 'ai-agent', action: 'service.runFromSession', agentRunId: agentRun._id.toString(), error: queueErr.message });
      throw new AppError('Service temporarily unavailable. Please try again.', 503, 'QUEUE_UNAVAILABLE');
    }

    logger.info('Agent run dispatched from voice session', {
      module: 'ai-agent',
      action: 'service.runFromSession',
      agentRunId: agentRun._id.toString(),
      voiceSessionId,
    });

    return { agentRunId: agentRun._id.toString(), status: 'pending', workflowType };
  }

  async confirmRun(agentRunId, userId, decision) {
    const run = await agentRunRepository.findById(agentRunId);
    if (!run) throw new AppError('Agent run not found', 404, ERROR_CODES.AI_AGENT_NOT_FOUND);
    if (run.userId.toString() !== userId.toString()) {
      throw new AppError('Agent run not found', 404, ERROR_CODES.AI_AGENT_NOT_FOUND);
    }
    if (run.status !== 'AWAITING_CONFIRMATION') {
      throw new AppError(`Cannot confirm: status is ${run.status}`, 409, ERROR_CODES.AI_AGENT_INVALID_STATUS);
    }

    await agentMemory.storeConfirmation(agentRunId, decision);

    if (decision) {
      try {
        await queueManager.addJob('ai-agent', 'resume', { agentRunId, userId: userId.toString() });
      } catch (queueErr) {
        await agentRunRepository.updateById(agentRunId, {
          status: 'FAILED',
          failedAt: new Date(),
          error: { code: 'QUEUE_UNAVAILABLE', message: 'Failed to resume agent job — Redis may be unavailable' },
        });
        logger.error('Failed to enqueue agent resume job', { module: 'ai-agent', action: 'service.confirmRun', agentRunId, error: queueErr.message });
        throw new AppError('Service temporarily unavailable. Please try again.', 503, 'QUEUE_UNAVAILABLE');
      }
    } else {
      await agentRunRepository.updateById(agentRunId, { status: 'CANCELLED', cancelledAt: new Date() });
      eventBus.publish(EVENT_TYPES.AI_AGENT_RUN_CANCELLED, { agentRunId, userId: userId.toString() }, { source: 'ai:agent' });
    }

    return { agentRunId, decision };
  }

  async archiveRun(agentRunId, userId) {
    const run = await agentRunRepository.archiveById(agentRunId, userId);
    if (!run) throw new AppError('Agent run not found', 404, ERROR_CODES.AI_AGENT_NOT_FOUND);
    return { agentRunId, archived: true };
  }

  async unarchiveRun(agentRunId, userId) {
    const run = await agentRunRepository.unarchiveById(agentRunId, userId);
    if (!run) throw new AppError('Agent run not found', 404, ERROR_CODES.AI_AGENT_NOT_FOUND);
    return { agentRunId, archived: false };
  }

  async deleteRun(agentRunId, userId) {
    const run = await agentRunRepository.deleteById(agentRunId, userId);
    if (!run) throw new AppError('Agent run not found', 404, ERROR_CODES.AI_AGENT_NOT_FOUND);
    return { agentRunId, deleted: true };
  }

  async getStatus(agentRunId, userId) {
    const run = await agentRunRepository.findById(agentRunId);
    if (!run || run.userId.toString() !== userId.toString()) {
      throw new AppError('Agent run not found', 404, ERROR_CODES.AI_AGENT_NOT_FOUND);
    }
    return run;
  }

  async listThreads(userId, { limit = 20, skip = 0 } = {}) {
    return agentRunRepository.findDistinctThreads(userId, { limit, skip });
  }

  async getThread(userId, threadId) {
    return agentRunRepository.findByThreadId(userId, threadId);
  }

  async archiveThread(userId, threadId) {
    await agentRunRepository.archiveByThreadId(userId, threadId);
    return { threadId, archived: true };
  }

  async deleteThread(userId, threadId) {
    await agentRunRepository.deleteByThreadId(userId, threadId);
    return { threadId, deleted: true };
  }

  async listRuns(userId, { limit = 20, skip = 0 } = {}) {
    return agentRunRepository.findByUserId(userId, { limit, skip });
  }
}

export default new AgentService();
