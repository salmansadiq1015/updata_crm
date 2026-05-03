import workflowStateRepository from './workflowState.repository.js';
import { getRedisClient } from '../../../config/redis.js';

const CTX_TTL = 3600; // 1 hour
const CONFIRM_TTL = 600; // 10 minutes

class AgentMemory {
  async saveShortTerm(agentRunId, contextData) {
    const redis = getRedisClient();
    await redis.set(
      `ai:agent:ctx:${agentRunId}`,
      JSON.stringify(contextData),
      'EX', CTX_TTL
    );
  }

  async getShortTerm(agentRunId) {
    const redis = getRedisClient();
    const raw = await redis.get(`ai:agent:ctx:${agentRunId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async clearShortTerm(agentRunId) {
    const redis = getRedisClient();
    await redis.del(`ai:agent:ctx:${agentRunId}`);
  }

  async saveWorkflowState(agentRunId, workflowType, currentNode, state, stepCount) {
    return workflowStateRepository.upsert(agentRunId, workflowType, currentNode, state, stepCount);
  }

  async loadWorkflowState(agentRunId) {
    return workflowStateRepository.findByAgentRunId(agentRunId);
  }

  async clearWorkflowState(agentRunId) {
    return workflowStateRepository.deleteByAgentRunId(agentRunId);
  }

  async storeConfirmation(agentRunId, decision) {
    const redis = getRedisClient();
    await redis.set(
      `ai:agent:confirm:${agentRunId}`,
      JSON.stringify({ decision, at: new Date().toISOString() }),
      'EX', CONFIRM_TTL
    );
  }

  async getConfirmation(agentRunId) {
    const redis = getRedisClient();
    const raw = await redis.get(`ai:agent:confirm:${agentRunId}`);
    return raw ? JSON.parse(raw) : null;
  }
}

export default new AgentMemory();
