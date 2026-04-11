import DunningTemplate from './dunningTemplate.model.js';

class DunningTemplateRepository {
  async findAll() {
    return DunningTemplate.find().sort({ level: 1 }).lean();
  }

  async findByLevel(level) {
    return DunningTemplate.findOne({ level }).lean();
  }

  async updateByLevel(level, data) {
    return DunningTemplate.findOneAndUpdate(
      { level },
      { $set: data },
      { new: true, upsert: true, runValidators: true },
    ).lean();
  }
}

const dunningTemplateRepository = new DunningTemplateRepository();
export default dunningTemplateRepository;
