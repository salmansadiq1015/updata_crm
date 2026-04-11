import AccuracyMetric from './accuracyMetric.model.js';

class AccuracyMetricRepository {
  async upsert(period, feature, language, data) {
    return AccuracyMetric.findOneAndUpdate(
      { period, feature, language },
      { $set: data },
      { new: true, upsert: true, runValidators: true },
    ).lean();
  }

  async findByPeriodAndFeature(period, feature, language) {
    return AccuracyMetric.findOne({ period, feature, language }).lean();
  }

  async findByPeriod(period) {
    return AccuracyMetric.find({ period })
      .sort({ feature: 1, language: 1 })
      .lean();
  }

  async findByDateRange(startPeriod, endPeriod) {
    return AccuracyMetric.find({
      period: { $gte: startPeriod, $lte: endPeriod },
    })
      .sort({ period: 1, feature: 1, language: 1 })
      .lean();
  }

  async getTopCorrections(language, limit = 20) {
    return AccuracyMetric.aggregate([
      { $match: { language } },
      { $unwind: '$topCorrections' },
      {
        $group: {
          _id: {
            original: '$topCorrections.original',
            correctedTo: '$topCorrections.correctedTo',
          },
          totalCount: { $sum: '$topCorrections.count' },
        },
      },
      { $sort: { totalCount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          original: '$_id.original',
          correctedTo: '$_id.correctedTo',
          count: '$totalCount',
        },
      },
    ]);
  }
}

const accuracyMetricRepository = new AccuracyMetricRepository();
export default accuracyMetricRepository;
