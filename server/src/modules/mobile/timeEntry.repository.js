import TimeEntry from './timeEntry.model.js';

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
      .lean();
  }

  async findByTechnicianAndDateRange(technicianId, startDate, endDate) {
    return TimeEntry.find({
      technicianId,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1, startTime: 1 })
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
