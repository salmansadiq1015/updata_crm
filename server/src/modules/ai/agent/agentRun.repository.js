import mongoose from 'mongoose';
import AgentRun from './agentRun.model.js';

class AgentRunRepository {
  async create(data) {
    const run = new AgentRun(data);
    return run.save();
  }

  async findById(id) {
    return AgentRun.findById(id).lean();
  }

  async findByCorrelationId(correlationId) {
    return AgentRun.findOne({ correlationId }).lean();
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

  async findDistinctThreads(userId, { limit = 20, skip = 0, archived = false } = {}) {
    const pipeline = [
      { $match: { userId: new mongoose.Types.ObjectId(userId), archived } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $ifNull: ['$threadId', { $toString: '$_id' }] },
          doc: { $first: '$$ROOT' },
          runCount: { $sum: 1 },
        },
      },
      { $sort: { 'doc.createdAt': -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $replaceRoot: {
          newRoot: { $mergeObjects: ['$doc', { threadId: '$_id', runCount: '$runCount' }] },
        },
      },
    ];
    return AgentRun.aggregate(pipeline);
  }

  async findByUserId(userId, { limit = 20, skip = 0, archived = false } = {}) {
    return AgentRun.find({ userId, archived })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async findByThreadId(userId, threadId) {
    return AgentRun.find({ userId, threadId }).sort({ createdAt: 1 }).lean();
  }

  async archiveByThreadId(userId, threadId) {
    return AgentRun.updateMany({ userId, threadId }, { $set: { archived: true } });
  }

  async deleteByThreadId(userId, threadId) {
    return AgentRun.deleteMany({ userId, threadId });
  }

  async archiveById(id, userId) {
    return AgentRun.findOneAndUpdate(
      { _id: id, userId },
      { $set: { archived: true } },
      { new: true }
    ).lean();
  }

  async unarchiveById(id, userId) {
    return AgentRun.findOneAndUpdate(
      { _id: id, userId },
      { $set: { archived: false } },
      { new: true }
    ).lean();
  }

  async deleteById(id, userId) {
    return AgentRun.findOneAndDelete({ _id: id, userId });
  }

  async findAwaitingConfirmationOlderThan(cutoff) {
    return AgentRun.find({
      status: 'AWAITING_CONFIRMATION',
      updatedAt: { $lt: cutoff },
    }).lean();
  }
}

export default new AgentRunRepository();
