import { BaseWorker } from '../shared/queue/BaseWorker.js';
import agentRunRepository from '../modules/ai/agent/agentRun.repository.js';
import agentMemory from '../modules/ai/agent/agent.memory.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function cancelTimedOutAgentRuns() {
  const cutoff = new Date(Date.now() - CONFIRMATION_TIMEOUT_MS);
  const timedOut = await agentRunRepository.findAwaitingConfirmationOlderThan(cutoff);

  for (const run of timedOut) {
    const agentRunId = run._id.toString();
    const userId = run.userId.toString();

    await agentRunRepository.updateById(agentRunId, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      error: {
        code: 'CONFIRMATION_TIMEOUT',
        message: 'Agent run cancelled: user did not confirm within 5 minutes',
      },
    });

    try {
      await agentMemory.clearWorkflowState(agentRunId);
      await agentMemory.clearShortTerm(agentRunId);
    } catch (err) {
      logger.warn('Failed to clear agent memory during timeout sweep', {
        module: 'ai-agent',
        action: 'timeout.sweep',
        agentRunId,
        error: err.message,
      });
    }

    eventBus.publish(
      EVENT_TYPES.AI_AGENT_RUN_CANCELLED,
      { agentRunId, userId, reason: 'CONFIRMATION_TIMEOUT' },
      { source: 'ai:agent' },
    );

    logger.info('Agent run cancelled due to confirmation timeout', {
      module: 'ai-agent',
      action: 'timeout.sweep',
      agentRunId,
    });
  }

  return { cancelled: timedOut.length };
}

class AiAgentTimeoutWorker extends BaseWorker {
  constructor() {
    super('ai-agent-timeout');
  }

  async process() {
    return cancelTimedOutAgentRuns();
  }
}

export function registerAiAgentTimeoutJob(queueManager) {
  const worker = new AiAgentTimeoutWorker();
  queueManager.registerQueue('ai-agent-timeout', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  });

  queueManager.addScheduledJob('ai-agent-timeout', 'periodic-agent-timeout-sweep', {}, '*/2 * * * *').catch((err) => {
    logger.warn('Failed to schedule agent confirmation timeout sweep', {
      module: 'jobs',
      error: { message: err.message },
    });
  });
}
