import QuotationTemplate from './quotationTemplate.model.js';

class QuotationTemplateRepository {
  async create(data) {
    return QuotationTemplate.create(data);
  }

  async findById(id) {
    return QuotationTemplate.findById(id).lean();
  }

  async list({ search, category, isActive, limit = 100 } = {}) {
    const query = {};
    if (isActive !== undefined) query.isActive = isActive;
    if (category) query.category = new RegExp(category, 'i');
    if (search) query.$text = { $search: search };
    return QuotationTemplate.find(query)
      .sort({ usageCount: -1, name: 1 })
      .limit(limit)
      .lean();
  }

  async listCategories() {
    return QuotationTemplate.distinct('category', { isDeleted: false, category: { $ne: '' } });
  }

  async update(id, data) {
    return QuotationTemplate.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
  }

  async softDelete(id, userId) {
    return QuotationTemplate.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: userId } },
      { new: true },
    ).lean();
  }

  async incrementUsage(id) {
    return QuotationTemplate.findByIdAndUpdate(id, { $inc: { usageCount: 1 } }).lean();
  }
}

export default new QuotationTemplateRepository();
