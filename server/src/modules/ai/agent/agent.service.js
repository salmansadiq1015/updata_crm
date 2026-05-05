import { ChatOpenAI } from '@langchain/openai';
import agentRunRepository from './agentRun.repository.js';
import agentMemory from './agent.memory.js';
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
  create_task: 'TASK_AUTOMATION',
  update_task: 'TASK_AUTOMATION',
  send_notification: 'NOTIFICATION',
};

class AgentService {
  constructor() {
    this._llm = null;
  }

  _getLlm() {
    if (!this._llm) {
      this._llm = new ChatOpenAI({
        apiKey: config.ai.apiKey,
        model: config.ai.model || 'gpt-4o',
        temperature: 0,
      });
    }
    return this._llm;
  }

  async _classifyIntent(input) {
    try {
      const llm = this._getLlm();
      const response = await llm.invoke([
        {
          role: 'system',
          content: 'You are an ERP intent classifier. Given user input, return JSON only: {"intent": "<one of: create_task, update_task, send_notification, general>", "confidence": 0.0-1.0}',
        },
        { role: 'user', content: input },
      ]);
      const parsed = JSON.parse(response.content.replace(/```json|```/g, '').trim());
      return parsed.intent || 'general';
    } catch {
      return 'general';
    }
  }

  async run(input, userId, permissions, meta = {}) {
    await checkRateLimit(userId);
    const sanitized = sanitizeUserInput(input);

    // Idempotency: reuse existing run if correlationId matches a non-failed run
    if (meta.correlationId) {
      const existing = await agentRunRepository.findByCorrelationId(meta.correlationId);
      if (existing) {
        if (existing.status === 'COMPLETED') {
          return { agentRunId: existing._id.toString(), status: 'completed', workflowType: existing.workflowType };
        }
        if (['RUNNING', 'PENDING'].includes(existing.status)) {
          return { agentRunId: existing._id.toString(), status: 'pending', workflowType: existing.workflowType };
        }
        // FAILED or CANCELLED — fall through and create a new run
      }
    }

    const intent = await this._classifyIntent(sanitized);
    const workflowType = INTENT_TO_WORKFLOW[intent] || 'GENERAL';

    const agentRun = await agentRunRepository.create({
      userId,
      threadId: meta.threadId || randomUUID(),
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
        entities: {},
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

    return { agentRunId: agentRun._id.toString(), status: 'pending', workflowType };
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
