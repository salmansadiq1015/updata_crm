import AccountingDocumentAutoAllocationRule from './accountingDocumentAutoAllocationRule.model.js';

function normalizeProjectReference(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

class AccountingDocumentAutoAllocationRuleRepository {
  async create(data) {
    const rule = new AccountingDocumentAutoAllocationRule({
      ...data,
      projectReference: normalizeProjectReference(data.projectReference),
    });
    return rule.save();
  }

  async findById(id) {
    return AccountingDocumentAutoAllocationRule.findById(id).lean();
  }

  async list({ includeInactive = false } = {}) {
    const filter = includeInactive ? {} : { isActive: true };
    return AccountingDocumentAutoAllocationRule.find(filter)
      .sort({ priority: 1, createdAt: 1, _id: 1 })
      .lean();
  }

  async updateById(id, data) {
    return AccountingDocumentAutoAllocationRule.findByIdAndUpdate(
      id,
      {
        ...data,
        ...(Object.prototype.hasOwnProperty.call(data, 'projectReference')
          ? { projectReference: normalizeProjectReference(data.projectReference) }
          : {}),
      },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async findMatchingRule({ documentType, uploaderId, projectReference }) {
    const normalizedProjectReference = normalizeProjectReference(projectReference);
    const clauses = [
      { documentType: documentType || null },
      { documentType: null },
      { uploaderId: uploaderId || null },
      { uploaderId: null },
      { projectReference: normalizedProjectReference },
      { projectReference: null },
    ];

    return AccountingDocumentAutoAllocationRule.findOne({
      isActive: true,
      $and: [
        { $or: clauses.slice(0, 2) },
        { $or: clauses.slice(2, 4) },
        { $or: clauses.slice(4, 6) },
      ],
    })
      .sort({ priority: 1, createdAt: 1, _id: 1 })
      .lean();
  }
}

const accountingDocumentAutoAllocationRuleRepository = new AccountingDocumentAutoAllocationRuleRepository();
export default accountingDocumentAutoAllocationRuleRepository;
