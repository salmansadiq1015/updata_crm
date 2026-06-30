import AccountingEntity from './accountingEntity.model.js';

class AccountingEntityRepository {
  async create(data) {
    return AccountingEntity.create(data);
  }

  async findById(id) {
    return AccountingEntity.findById(id)
      .populate({ path: 'parentId', select: 'entityCode name type status' })
      .lean();
  }

  async findByCode(entityCode) {
    return AccountingEntity.findOne({ entityCode }).lean();
  }

  async findAll(filters = {}) {
    const query = {};
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.parentId) query.parentId = filters.parentId;
    if (filters.q) {
      const term = String(filters.q).trim();
      query.$or = [
        { entityCode: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { legalName: { $regex: term, $options: 'i' } },
      ];
    }

    return AccountingEntity.find(query)
      .sort({ type: 1, entityCode: 1, name: 1 })
      .populate({ path: 'parentId', select: 'entityCode name type status' })
      .lean();
  }

  async updateById(id, data) {
    return AccountingEntity.findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate({ path: 'parentId', select: 'entityCode name type status' })
      .lean();
  }
}

const accountingEntityRepository = new AccountingEntityRepository();
export default accountingEntityRepository;
