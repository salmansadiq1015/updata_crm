import TaxCode from './taxCode.model.js';
import TaxExemption from './taxExemption.model.js';
import TaxGroup from './taxGroup.model.js';
import TaxTransaction from './taxTransaction.model.js';

class TaxRepository {
  async createCode(data, options = {}) {
    const code = new TaxCode(data);
    return code.save({ session: options.session });
  }

  async updateCode(id, data, options = {}) {
    return TaxCode.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }

  async findCodeById(id, options = {}) {
    return TaxCode.findById(id).session(options.session || null).lean();
  }

  async findCodeByCode(code, options = {}) {
    return TaxCode.findOne({ code: String(code || '').toUpperCase(), isActive: true })
      .session(options.session || null)
      .lean();
  }

  async findCodes(filters = {}) {
    const query = {};
    if (filters.type) query.type = filters.type;
    if (filters.direction) query.direction = { $in: [filters.direction, 'BOTH'] };
    if (filters.country) query.country = filters.country;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;

    return TaxCode.find(query)
      .sort({ country: 1, type: 1, code: 1 })
      .lean();
  }

  async createGroup(data, options = {}) {
    const group = new TaxGroup(data);
    return group.save({ session: options.session });
  }

  async findGroups(filters = {}) {
    const query = {};
    if (filters.country) query.country = filters.country;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    return TaxGroup.find(query)
      .populate({ path: 'taxCodes.taxCodeId', select: 'code name rate type direction scope' })
      .sort({ country: 1, code: 1 })
      .lean();
  }

  async createExemption(data, options = {}) {
    const exemption = new TaxExemption(data);
    return exemption.save({ session: options.session });
  }

  async findExemptions(filters = {}) {
    const query = {};
    if (filters.partyId) query.partyId = filters.partyId;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    return TaxExemption.find(query).sort({ code: 1 }).lean();
  }

  async findExemptionByCode(code, options = {}) {
    return TaxExemption.findOne({ code: String(code || '').toUpperCase(), isActive: true })
      .session(options.session || null)
      .lean();
  }

  async replaceTransactionsForSource(sourceType, sourceId, transactions, options = {}) {
    await TaxTransaction.deleteMany({ sourceType, sourceId }).session(options.session || null);
    if (!transactions.length) return [];
    return TaxTransaction.insertMany(transactions, { session: options.session || null, ordered: true });
  }

  async findTransactions(filters = {}) {
    const query = {};
    if (filters.sourceType) query.sourceType = filters.sourceType;
    if (filters.sourceId) query.sourceId = filters.sourceId;
    if (filters.direction) query.direction = filters.direction;
    if (filters.taxCode) query.taxCode = filters.taxCode;
    if (filters.currency) query.currency = filters.currency;
    if (filters.startDate || filters.endDate) {
      query.transactionDate = {};
      if (filters.startDate) query.transactionDate.$gte = new Date(filters.startDate);
      if (filters.endDate) query.transactionDate.$lte = new Date(filters.endDate);
    }

    return TaxTransaction.find(query)
      .sort({ transactionDate: -1, sourceNumber: 1, sourceLineKey: 1 })
      .limit(filters.limit || 500)
      .lean();
  }

  async summarizeTransactions(filters = {}) {
    const match = { status: 'POSTED' };
    if (filters.currency) match.currency = filters.currency;
    if (filters.startDate || filters.endDate) {
      match.transactionDate = {};
      if (filters.startDate) match.transactionDate.$gte = new Date(filters.startDate);
      if (filters.endDate) match.transactionDate.$lte = new Date(filters.endDate);
    }

    return TaxTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            direction: '$direction',
            taxCode: '$taxCode',
            taxRate: '$taxRate',
            currency: '$currency',
          },
          taxableAmount: { $sum: '$taxableAmount' },
          taxAmount: { $sum: '$taxAmount' },
          recoverableAmount: { $sum: '$recoverableAmount' },
          nonRecoverableAmount: { $sum: '$nonRecoverableAmount' },
          grossAmount: { $sum: '$grossAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.direction': 1, '_id.taxCode': 1 } },
    ]);
  }
}

const taxRepository = new TaxRepository();
export default taxRepository;
