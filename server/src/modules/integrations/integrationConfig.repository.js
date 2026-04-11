import IntegrationConfig from './integrationConfig.model.js';

class IntegrationConfigRepository {
  async findByKey(integrationKey) {
    return IntegrationConfig.findOne({ integrationKey }).lean();
  }

  async findAll({ isEnabled } = {}) {
    const filter = {};
    if (isEnabled !== undefined) filter.isEnabled = isEnabled;
    return IntegrationConfig.find(filter).sort({ integrationKey: 1 }).lean();
  }

  async findEnabled() {
    return IntegrationConfig.find({ isEnabled: true }).sort({ integrationKey: 1 }).lean();
  }

  async upsert(integrationKey, data) {
    return IntegrationConfig.findOneAndUpdate(
      { integrationKey },
      { ...data, integrationKey },
      { new: true, upsert: true, runValidators: true },
    ).lean();
  }

  async updateStatus(integrationKey, status, errorMessage = null) {
    const update = { status };
    if (errorMessage) {
      update.lastErrorAt = new Date();
      update.lastErrorMessage = errorMessage;
    }
    return IntegrationConfig.findOneAndUpdate(
      { integrationKey },
      update,
      { new: true, runValidators: true },
    ).lean();
  }
}

const integrationConfigRepository = new IntegrationConfigRepository();
export default integrationConfigRepository;
