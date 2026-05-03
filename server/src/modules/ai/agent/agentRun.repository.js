import AgentRun from './agentRun.model.js';

class AgentRunRepository {
  create(data) {
    return AgentRun.create(data);
  }

  findById(id) {
    return AgentRun.findById(id).lean();
  }

  updateById(id, data) {
    return AgentRun.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
  }

  pushStep(id, step) {
    return AgentRun.findByIdAndUpdate(
      id,
      { $push: { steps: step } },
      { new: true }
    ).lean();
  }

  findByUserId(userId, { limit = 20, skip = 0 } = {}) {
    return AgentRun.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  findAwaitingConfirmationOlderThan(cutoff) {
    return AgentRun.find({
      status: 'AWAITING_CONFIRMATION',
      updatedAt: { $lt: cutoff },
    }).lean();
  }
}

export default new AgentRunRepository();
