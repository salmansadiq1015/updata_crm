import NotificationTemplate from './notificationTemplate.model.js';

class NotificationTemplateRepository {
  async create(data) {
    const template = new NotificationTemplate(data);
    return template.save();
  }

  async findById(id) {
    return NotificationTemplate.findById(id).lean();
  }

  async findActive(type, channel, language) {
    let template = await NotificationTemplate.findOne({
      type,
      channel,
      language,
      isActive: true,
    }).lean();

    // Fallback to German if requested language not found
    if (!template && language !== 'de') {
      template = await NotificationTemplate.findOne({
        type,
        channel,
        language: 'de',
        isActive: true,
      }).lean();
    }

    return template;
  }

  async findAll({ type, channel, language } = {}) {
    const filter = {};
    if (type) filter.type = type;
    if (channel) filter.channel = channel;
    if (language) filter.language = language;

    return NotificationTemplate.find(filter)
      .sort({ type: 1, channel: 1, language: 1 })
      .lean();
  }

  async findMaxVersion(type, channel, language) {
    const doc = await NotificationTemplate.findOne({ type, channel, language })
      .sort({ version: -1 })
      .select('version')
      .setOptions({ includeDeleted: true })
      .lean();

    return doc?.version || 0;
  }

  async updateById(id, data) {
    return NotificationTemplate.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async deactivateOthers(type, channel, language, activeId) {
    const result = await NotificationTemplate.updateMany(
      { type, channel, language, _id: { $ne: activeId }, isActive: true },
      { $set: { isActive: false } },
    );
    return result.modifiedCount;
  }

  async softDelete(id) {
    return NotificationTemplate.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), isActive: false },
      { new: true },
    );
  }
}

const notificationTemplateRepository = new NotificationTemplateRepository();
export default notificationTemplateRepository;
