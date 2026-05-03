import AgentRun from './agentRun.model.js';

class AgentRunRepository {
  async create(data) {
    const run = new AgentRun(data);
    return run.save();
  }

  async findById(id) {
    return AgentRun.findById(id).lean();
  }

  async updateById(id, data) {
    return AgentRun.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
  }

  async pushStep(id, step) {
    return AgentRun.findByIdAndUpdate(
      id,
      { $push: { steps: step } },
      { new: true, runValidators: true }
    ).lean();
  }

  async findByUserId(userId, { limit = 20, skip = 0 } = {}) {
    return AgentRun.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async findAwaitingConfirmationOlderThan(cutoff) {
    return AgentRun.find({
      status: 'AWAITING_CONFIRMATION',
      updatedAt: { $lt: cutoff },
    }).lean();
  }
}

export default new AgentRunRepository();
