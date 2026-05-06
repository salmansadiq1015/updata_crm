import WorkflowState from './workflowState.model.js';

class WorkflowStateRepository {
  async upsert(agentRunId, workflowType, currentNode, state, stepCount) {
    return WorkflowState.findOneAndUpdate(
      { agentRunId },
      { agentRunId, workflowType, currentNode, state, stepCount },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean();
  }

  async findByAgentRunId(agentRunId) {
    return WorkflowState.findOne({ agentRunId }).lean();
  }

  async deleteByAgentRunId(agentRunId) {
    return WorkflowState.deleteOne({ agentRunId });
  }
}

export default new WorkflowStateRepository();
