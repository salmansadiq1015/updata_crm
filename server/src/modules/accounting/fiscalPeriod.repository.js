import FiscalPeriod from './fiscalPeriod.model.js';

class FiscalPeriodRepository {
  async create(data, options = {}) {
    const period = new FiscalPeriod(data);
    return period.save({ session: options.session });
  }

  async findById(id, options = {}) {
    return FiscalPeriod.findById(id)
      .session(options.session || null)
      .lean();
  }

  async findAll(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.startDate || filters.endDate) {
      query.$and = [];
      if (filters.startDate) query.$and.push({ endDate: { $gte: new Date(filters.startDate) } });
      if (filters.endDate) query.$and.push({ startDate: { $lte: new Date(filters.endDate) } });
      if (!query.$and.length) delete query.$and;
    }

    return FiscalPeriod.find(query)
      .sort({ startDate: -1, _id: -1 })
      .lean();
  }

  async findCoveringDate(date, options = {}) {
    const postingDate = new Date(date);
    return FiscalPeriod.findOne({
      startDate: { $lte: postingDate },
      endDate: { $gte: postingDate },
    })
      .session(options.session || null)
      .lean();
  }

  async findOverlapping(startDate, endDate, excludeId = null, options = {}) {
    const query = {
      startDate: { $lte: new Date(endDate) },
      endDate: { $gte: new Date(startDate) },
    };
    if (excludeId) query._id = { $ne: excludeId };

    return FiscalPeriod.findOne(query)
      .session(options.session || null)
      .lean();
  }

  async updateById(id, data, options = {}) {
    return FiscalPeriod.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }
}

const fiscalPeriodRepository = new FiscalPeriodRepository();
export default fiscalPeriodRepository;
