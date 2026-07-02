import { BaseWorker } from '../shared/queue/BaseWorker.js';
import agentRunRepository from '../modules/ai/agent/agentRun.repository.js';
import agentExecutor from '../modules/ai/agent/agent.executor.js';
import agentMemory from '../modules/ai/agent/agent.memory.js';
import { getWorkflow } from '../modules/ai/workflows/index.js';
import logger from '../shared/logger/index.js';

class AiAgentWorker extends BaseWorker {
  constructor() {
    super('ai-agent');
  }

  async isAlreadyDone(job) {
    if (!['execute', 'resume'].includes(job.name)) return false;
    const run = await agentRunRepository.findById(job.data.agentRunId);
    return run?.status === 'COMPLETED' || run?.status === 'CANCELLED';
  }

  async process(job) {
    const { agentRunId, userId, permissions, workflowType, entities, input } = job.data;

    if (job.name === 'resume') {
      return this._resume(agentRunId, userId, permissions);
    }

    await agentRunRepository.updateById(agentRunId, { status: 'RUNNING' });

    return agentExecutor.execute(agentRunId, userId, permissions, workflowType, entities, input);
  }

  async _resume(agentRunId, userId, permissions) {
    const savedState = await agentMemory.loadWorkflowState(agentRunId);
    if (!savedState) {
      logger.error('No workflow state to resume', { module: 'ai-agent', agentRunId });
      await agentRunRepository.updateById(agentRunId, {
        status: 'FAILED',
        failedAt: new Date(),
        error: { code: 'NO_STATE', message: 'No workflow state found to resume from' },
      });
      return;
    }

    const workflow = getWorkflow(savedState.workflowType);
    if (!workflow) {
      await agentRunRepository.updateById(agentRunId, {
        status: 'FAILED',
        failedAt: new Date(),
        error: { code: 'NO_WORKFLOW', message: `No workflow for type: ${savedState.workflowType}` },
      });
      return;
    }

    const confirmation = await agentMemory.getConfirmation(agentRunId);
    const resumeState = { ...savedState.state, confirmed: confirmation?.decision ?? false };
    const resumePermissions = permissions || resumeState.permissions || [];

    await agentRunRepository.updateById(agentRunId, { status: 'RUNNING' });

    return agentExecutor.execute(
      agentRunId,
      userId,
      resumePermissions,
      savedState.workflowType,
      resumeState.entities || {},
      resumeState.input || '',
      {
        confirmed: resumeState.confirmed,
        stepCount: resumeState.stepCount || 0,
      },
    );
  }
}

export function registerAiAgentJob(queueManager) {
  const worker = new AiAgentWorker();
  queueManager.registerQueue('ai-agent', worker.getHandler(), {
    concurrency: 5,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  });
}
