import VoiceSessionEntity from './voiceSessionEntity.model.js';

class VoiceSessionEntityRepository {
  async create(data) {
    const entity = new VoiceSessionEntity(data);
    return entity.save();
  }

  async createMany(dataArray) {
    return VoiceSessionEntity.insertMany(dataArray, { ordered: false });
  }

  async findBySessionId(sessionId) {
    return VoiceSessionEntity.find({ sessionId })
      .sort({ startOffset: 1 })
      .lean();
  }

  async findById(id) {
    return VoiceSessionEntity.findById(id).lean();
  }

  async updateById(id, data) {
    return VoiceSessionEntity.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async updateCorrectedValue(id, correctedValue) {
    return VoiceSessionEntity.findByIdAndUpdate(
      id,
      { correctedValue },
      { new: true, runValidators: true },
    ).lean();
  }

  async deleteBySessionId(sessionId) {
    return VoiceSessionEntity.deleteMany({ sessionId });
  }

  async findCorrectedByDateRange(dateFrom, dateTo) {
    const filter = { correctedValue: { $ne: null } };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    return VoiceSessionEntity.find(filter)
      .sort({ createdAt: -1 })
      .lean();
  }
}

const voiceSessionEntityRepository = new VoiceSessionEntityRepository();
export default voiceSessionEntityRepository;
