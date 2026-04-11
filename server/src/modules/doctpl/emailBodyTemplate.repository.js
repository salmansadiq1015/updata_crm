import EmailBodyTemplate from './emailBodyTemplate.model.js';

class EmailBodyTemplateRepository {
  async create(data) {
    const template = new EmailBodyTemplate(data);
    return template.save();
  }

  async findById(id) {
    return EmailBodyTemplate.findById(id).lean();
  }

  async findAll() {
    return EmailBodyTemplate.find().sort({ templateType: 1, language: 1 }).lean();
  }

  async findByTypeAndLanguage(templateType, language) {
    return EmailBodyTemplate.findOne({ templateType, language }).lean();
  }

  async updateById(id, data) {
    return EmailBodyTemplate.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }
}

const emailBodyTemplateRepository = new EmailBodyTemplateRepository();
export default emailBodyTemplateRepository;
