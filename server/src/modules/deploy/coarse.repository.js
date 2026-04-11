import CoarseAllocation from './coarseAllocation.model.js';

const POPULATE_FIELDS = [
  { path: 'employeeId', select: 'firstName lastName email' },
  { path: 'projectId', select: 'name projectNumber' },
];

class CoarseRepository {
  async create(data) {
    const allocation = new CoarseAllocation(data);
    return allocation.save();
  }

  async findById(id) {
    return CoarseAllocation.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByEmployeeAndWeekRange(employeeId, year, weekFrom, weekTo) {
    return CoarseAllocation.find({
      employeeId,
      calendarYear: year,
      calendarWeek: { $gte: weekFrom, $lte: weekTo },
    })
      .sort({ calendarWeek: 1 })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByProjectAndWeekRange(projectId, year, weekFrom, weekTo) {
    return CoarseAllocation.find({
      projectId,
      calendarYear: year,
      calendarWeek: { $gte: weekFrom, $lte: weekTo },
    })
      .sort({ calendarWeek: 1 })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByWeekRange(year, weekFrom, weekTo, { employeeIds, projectId } = {}) {
    const filter = {
      calendarYear: year,
      calendarWeek: { $gte: weekFrom, $lte: weekTo },
    };

    if (employeeIds?.length) filter.employeeId = { $in: employeeIds };
    if (projectId) filter.projectId = projectId;

    return CoarseAllocation.find(filter)
      .sort({ calendarWeek: 1 })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async sumAllocationsForEmployeeWeek(employeeId, year, week, excludeId) {
    const match = {
      employeeId: typeof employeeId === 'string'
        ? new (await import('mongoose')).default.Types.ObjectId(employeeId)
        : employeeId,
      calendarYear: year,
      calendarWeek: week,
    };

    if (excludeId) {
      match._id = {
        $ne: typeof excludeId === 'string'
          ? new (await import('mongoose')).default.Types.ObjectId(excludeId)
          : excludeId,
      };
    }

    const result = await CoarseAllocation.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$allocationPercent' } } },
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  async updateById(id, data) {
    return CoarseAllocation.findByIdAndUpdate(
      id,
      data,
      { new: true, runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async deleteById(id) {
    return CoarseAllocation.findByIdAndDelete(id);
  }

  async bulkUpsert(records) {
    const operations = records.map((record) => ({
      updateOne: {
        filter: {
          employeeId: record.employeeId,
          projectId: record.projectId,
          calendarYear: record.calendarYear,
          calendarWeek: record.calendarWeek,
        },
        update: { $set: record },
        upsert: true,
      },
    }));
    return CoarseAllocation.bulkWrite(operations);
  }
}

const coarseRepository = new CoarseRepository();
export default coarseRepository;
