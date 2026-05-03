import { getWorkflow } from '../workflows/index.js';
import agentRunRepository from './agentRun.repository.js';
import agentMemory from './agent.memory.js';
import eventBus from '../../../shared/events/EventBus.js';
import EVENT_TYPES from '../../../shared/events/eventTypes.js';
import { AppError } from '../../../shared/errors/AppError.js';
import ERROR_CODES from '../../../shared/errors/errorCodes.js';
import logger from '../../../shared/logger/index.js';

class AgentExecutor {
  async execute(agentRunId, userId, permissions, workflowType, entities, input) {
    const workflow = getWorkflow(workflowType);
    if (!workflow) {
      await agentRunRepository.updateById(agentRunId, {
        status: 'FAILED',
        failedAt: new Date(),
        error: { code: 'WORKFLOW_NOT_FOUND', message: `No workflow for type: ${workflowType}` },
      });
      throw new AppError(`No workflow for type: ${workflowType}`, 500, ERROR_CODES.AI_AGENT_WORKFLOW_NOT_FOUND);
    }

    const initialState = { agentRunId, userId, permissions, entities, input, stepCount: 0, retryCount: 0 };
    let finalState;

    try {
      finalState = await workflow.invoke(initialState);
    } catch (err) {
      logger.error('Workflow threw unhandled error', {
        module: 'ai-agent',
        action: 'executor.execute',
        agentRunId,
        error: err.message,
      });
      await agentRunRepository.updateById(agentRunId, {
        status: 'FAILED',
        failedAt: new Date(),
        error: { message: err.message, code: err.code || 'UNHANDLED_ERROR' },
      });
      eventBus.publish(EVENT_TYPES.AI_AGENT_RUN_FAILED, { agentRunId, userId, error: err.message }, { source: 'ai:agent' });
      this._emitWs(userId, 'ai:agent:failed', { agentRunId, error: { message: err.message } });
      await this._cleanup(agentRunId);
      throw err;
    }

    if (finalState.status === 'completed') {
      await agentRunRepository.updateById(agentRunId, {
        status: 'COMPLETED',
        output: finalState.output,
        completedAt: new Date(),
      });
      eventBus.publish(EVENT_TYPES.AI_AGENT_RUN_COMPLETED, { agentRunId, userId, output: finalState.output }, { source: 'ai:agent' });
      this._emitWs(userId, 'ai:agent:completed', { agentRunId, output: finalState.output });
      logger.info('Agent run completed', { module: 'ai-agent', action: 'executor.execute', agentRunId, workflowType });
    } else {
      await agentRunRepository.updateById(agentRunId, {
        status: 'FAILED',
        failedAt: new Date(),
        error: finalState.error || { code: 'UNKNOWN', message: 'Workflow ended in failed state' },
      });
      eventBus.publish(EVENT_TYPES.AI_AGENT_RUN_FAILED, { agentRunId, userId, error: finalState.error }, { source: 'ai:agent' });
      this._emitWs(userId, 'ai:agent:failed', { agentRunId, error: finalState.error });
      logger.warn('Agent run failed', { module: 'ai-agent', action: 'executor.execute', agentRunId, error: finalState.error });
    }

    await this._cleanup(agentRunId);
    return finalState;
  }

  _emitWs(userId, event, data) {
    if (global.io) {
      global.io.to(`user:${userId}`).emit(event, data);
    }
  }

  async _cleanup(agentRunId) {
    try {
      await agentMemory.clearWorkflowState(agentRunId);
      await agentMemory.clearShortTerm(agentRunId);
    } catch (err) {
      logger.warn('Failed to clean up agent memory', { module: 'ai-agent', agentRunId, error: err.message });
    }
  }
}

export default new AgentExecutor();
