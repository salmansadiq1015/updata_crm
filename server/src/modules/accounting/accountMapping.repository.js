import AccountMapping from './accountMapping.model.js';

class AccountMappingRepository {
  async upsert(data, options = {}) {
    const { createdBy, ...updateData } = data;
    return AccountMapping.findOneAndUpdate(
      {
        mappingType: data.mappingType,
        scopeType: data.scopeType || 'GLOBAL',
        scopeValue: data.scopeType === 'GLOBAL' ? '' : (data.scopeValue || ''),
      },
      {
        $set: {
          ...updateData,
          scopeType: updateData.scopeType || 'GLOBAL',
          scopeValue: updateData.scopeType === 'GLOBAL' ? '' : (updateData.scopeValue || ''),
          updatedBy: updateData.updatedBy || null,
        },
        $setOnInsert: { createdBy },
      },
      {
        returnDocument: 'after',
        upsert: true,
        runValidators: true,
        session: options.session,
      },
    ).lean();
  }

  async findActive(mappingType, { scopeType = 'GLOBAL', scopeValue = '', session } = {}) {
    return AccountMapping.findOne({
      mappingType,
      scopeType,
      scopeValue: scopeType === 'GLOBAL' ? '' : (scopeValue || ''),
      isActive: true,
    })
      .session(session || null)
      .lean();
  }

  async findBest(mappingType, { scopeType = 'GLOBAL', scopeValue = '', session } = {}) {
    if (scopeType && scopeType !== 'GLOBAL' && scopeValue) {
      const scoped = await this.findActive(mappingType, { scopeType, scopeValue, session });
      if (scoped) return scoped;
    }

    return this.findActive(mappingType, { scopeType: 'GLOBAL', scopeValue: '', session });
  }

  async findWithFilters(filters = {}) {
    const query = {};
    if (filters.mappingType) query.mappingType = filters.mappingType;
    if (filters.scopeType) query.scopeType = filters.scopeType;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;

    return AccountMapping.find(query)
      .sort({ mappingType: 1, scopeType: 1, scopeValue: 1 })
      .populate({ path: 'accountId', select: 'accountNumber name type isActive isGroup' })
      .lean();
  }
}

const accountMappingRepository = new AccountMappingRepository();
export default accountMappingRepository;
