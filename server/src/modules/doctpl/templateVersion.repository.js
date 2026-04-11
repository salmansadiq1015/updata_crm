import TemplateVersion from './templateVersion.model.js';

class TemplateVersionRepository {
  async create(data) {
    const version = new TemplateVersion(data);
    return version.save();
  }

  async findByTemplateId(templateId, { limit = 25, offset = 0 } = {}) {
    return TemplateVersion.find({ templateId })
      .sort({ version: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
  }

  async findByTemplateIdAndVersion(templateId, version) {
    return TemplateVersion.findOne({ templateId, version }).lean();
  }

  async countByTemplateId(templateId) {
    return TemplateVersion.countDocuments({ templateId });
  }
}

const templateVersionRepository = new TemplateVersionRepository();
export default templateVersionRepository;
