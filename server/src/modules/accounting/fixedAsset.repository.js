import FixedAsset from './fixedAsset.model.js';
import FixedAssetDepreciationEntry from './fixedAssetDepreciationEntry.model.js';
import FixedAssetDepreciationRun from './fixedAssetDepreciationRun.model.js';

class FixedAssetRepository {
  async createAsset(data, options = {}) {
    const asset = new FixedAsset(data);
    return asset.save({ session: options.session });
  }

  async updateAsset(id, data, options = {}) {
    return FixedAsset.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }

  async findById(id, options = {}) {
    return FixedAsset.findById(id)
      .session(options.session || null)
      .lean();
  }

  async findWithFilters(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.currency) query.currency = filters.currency;
    if (filters.search) {
      const pattern = new RegExp(String(filters.search).trim(), 'i');
      query.$or = [
        { assetNumber: pattern },
        { name: pattern },
        { category: pattern },
      ];
    }

    const limit = filters.limit || 100;
    return FixedAsset.find(query)
      .sort({ acquisitionDate: -1, assetNumber: 1 })
      .limit(limit)
      .lean();
  }

  async findDepreciationEntry(assetId, periodDate, options = {}) {
    return FixedAssetDepreciationEntry.findOne({ assetId, periodDate })
      .session(options.session || null)
      .lean();
  }

  async createDepreciationEntry(data, options = {}) {
    const entry = new FixedAssetDepreciationEntry(data);
    return entry.save({ session: options.session });
  }

  async createDepreciationRun(data, options = {}) {
    const run = new FixedAssetDepreciationRun(data);
    return run.save({ session: options.session });
  }

  async summarize(filters = {}) {
    const match = {};
    if (filters.currency) match.currency = filters.currency;
    if (filters.status) match.status = filters.status;

    const [summary = {
      acquisitionCost: 0,
      accumulatedDepreciation: 0,
      bookValue: 0,
      count: 0,
      activeCount: 0,
      disposedCount: 0,
    }] = await FixedAsset.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          acquisitionCost: { $sum: '$acquisitionCost' },
          accumulatedDepreciation: { $sum: '$accumulatedDepreciation' },
          bookValue: { $sum: '$bookValue' },
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $in: ['$status', ['ACTIVE', 'FULLY_DEPRECIATED']] }, 1, 0] },
          },
          disposedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'DISPOSED'] }, 1, 0] },
          },
        },
      },
    ]);

    return summary;
  }

  async summarizeDepreciation(filters = {}) {
    const match = {};
    if (filters.currency) match.currency = filters.currency;
    if (filters.startDate || filters.endDate) {
      match.periodDate = {};
      if (filters.startDate) match.periodDate.$gte = new Date(filters.startDate);
      if (filters.endDate) match.periodDate.$lte = new Date(filters.endDate);
    }

    const [summary = { totalAmount: 0, count: 0 }] = await FixedAssetDepreciationEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    return summary;
  }
}

const fixedAssetRepository = new FixedAssetRepository();
export default fixedAssetRepository;
