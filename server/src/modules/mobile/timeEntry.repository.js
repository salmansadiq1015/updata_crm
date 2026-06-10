import TimeEntry from './timeEntry.model.js';

const POPULATE_FIELDS = [
  { path: 'technicianId', select: 'firstName lastName email' },
  {
    path: 'orderId',
    select: 'assignmentNumber title projectId customerId siteId status priority startDatetime endDatetime',
    populate: { path: 'projectId', select: 'name projectNumber customerName' },
  },
];

class TimeEntryRepository {
  async create(data) {
    const entry = new TimeEntry(data);
    return entry.save();
  }

  async findById(id) {
    return TimeEntry.findById(id).lean();
  }

  async findByOrderId(orderId) {
    return TimeEntry.find({ orderId })
      .sort({ date: 1, startTime: 1 })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByTechnicianAndDateRange(technicianId, startDate, endDate) {
    return TimeEntry.find({
      technicianId,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1, startTime: 1 })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async list(filters = {}) {
    const query = {};
    if (filters.technicianId) query.technicianId = filters.technicianId;
    if (filters.orderId) query.orderId = filters.orderId;
    if (filters.releaseStatus) query.releaseStatus = filters.releaseStatus;
    if (filters.activityType) query.activityType = filters.activityType;
    if (filters.dateFrom || filters.dateTo) {
      query.date = {};
      if (filters.dateFrom) query.date.$gte = filters.dateFrom;
      if (filters.dateTo) query.date.$lte = filters.dateTo;
    }

    return TimeEntry.find(query)
      .sort({ date: -1, startTime: -1 })
      .limit(filters.limit || 200)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findPendingByOrderId(orderId) {
    return TimeEntry.find({ orderId, releaseStatus: 'PENDING' }).lean();
  }

  async updateById(id, data) {
    return TimeEntry.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return TimeEntry.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async releaseByOrderId(orderId) {
    const result = await TimeEntry.updateMany(
      { orderId, releaseStatus: 'PENDING', isDeleted: false },
      { $set: { releaseStatus: 'RELEASED' } },
    );
    return result.modifiedCount;
  }
}

const timeEntryRepository = new TimeEntryRepository();
export default timeEntryRepository;
