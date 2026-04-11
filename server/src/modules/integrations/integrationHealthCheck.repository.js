import IntegrationHealthCheck from './integrationHealthCheck.model.js';

class IntegrationHealthCheckRepository {
  async create(data) {
    const check = new IntegrationHealthCheck(data);
    return check.save();
  }

  async findLatest(integrationKey) {
    return IntegrationHealthCheck.findOne({ integrationKey })
      .sort({ checkedAt: -1 })
      .lean();
  }

  async findHistory(integrationKey, { limit = 100, period } = {}) {
    const filter = { integrationKey };
    if (period) {
      filter.checkedAt = { $gte: new Date(Date.now() - period) };
    }
    return IntegrationHealthCheck.find(filter)
      .sort({ checkedAt: -1 })
      .limit(limit)
      .lean();
  }

  async getErrorRate(integrationKey, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [result] = await IntegrationHealthCheck.aggregate([
      { $match: { integrationKey, checkedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          errors: { $sum: { $cond: [{ $eq: ['$status', 'down'] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          errors: 1,
          errorRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $divide: ['$errors', '$total'] }] },
        },
      },
    ]);
    return result || { total: 0, errors: 0, errorRate: 0 };
  }

  async getAverageResponseTime(integrationKey, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [result] = await IntegrationHealthCheck.aggregate([
      { $match: { integrationKey, checkedAt: { $gte: since }, responseTimeMs: { $ne: null } } },
      {
        $group: {
          _id: null,
          avgResponseTimeMs: { $avg: '$responseTimeMs' },
          minResponseTimeMs: { $min: '$responseTimeMs' },
          maxResponseTimeMs: { $max: '$responseTimeMs' },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0 } },
    ]);
    return result || { avgResponseTimeMs: 0, minResponseTimeMs: 0, maxResponseTimeMs: 0, count: 0 };
  }
}

const integrationHealthCheckRepository = new IntegrationHealthCheckRepository();
export default integrationHealthCheckRepository;
