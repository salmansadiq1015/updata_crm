import IghConfig from './ighConfig.model.js';

class IghConfigRepository {
  async getConfig() {
    return IghConfig.findOne().lean();
  }

  async upsertConfig(data) {
    return IghConfig.findOneAndUpdate(
      {},
      data,
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async setLastSyncAt(date) {
    return IghConfig.findOneAndUpdate(
      {},
      { lastSyncAt: date },
      { returnDocument: 'after' },
    ).lean();
  }
}

const ighConfigRepository = new IghConfigRepository();
export default ighConfigRepository;
