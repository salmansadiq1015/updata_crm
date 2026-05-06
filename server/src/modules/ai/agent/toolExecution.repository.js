import ToolExecution from './toolExecution.model.js';

class ToolExecutionRepository {
  async create(data) {
    const exec = new ToolExecution(data);
    return exec.save();
  }

  async updateById(id, data) {
    return ToolExecution.findByIdAndUpdate(id, { $set: data }, { returnDocument: 'after', runValidators: true }).lean();
  }

  async findByAgentRunId(agentRunId) {
    return ToolExecution.find({ agentRunId }).sort({ createdAt: 1 }).lean();
  }

  async findFailedByAgentRunId(agentRunId) {
    return ToolExecution.find({ agentRunId, status: 'FAILED' }).sort({ createdAt: 1 }).lean();
  }
}

export default new ToolExecutionRepository();
