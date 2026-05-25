import WorkReport from './workReport.model.js';

const POPULATE_FIELDS = [
  { path: 'technicianId', select: 'firstName lastName email' },
  { path: 'orderId', select: 'assignmentNumber title' },
];

class WorkReportRepository {
  async create(data) {
    const report = new WorkReport(data);
    return report.save();
  }

  async findById(id) {
    return WorkReport.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByOrderId(orderId) {
    return WorkReport.find({ orderId })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByTechnicianAndDateRange(technicianId, startDate, endDate) {
    return WorkReport.find({
      technicianId,
      reportDate: { $gte: startDate, $lte: endDate },
    })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByIds(ids) {
    return WorkReport.find({ _id: { $in: ids } })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findIncomplete(technicianId) {
    return WorkReport.find({
      technicianId,
      status: 'DRAFT',
    })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async countIncompleteByTechnician(technicianId) {
    return WorkReport.countDocuments({
      technicianId,
      status: 'DRAFT',
    });
  }

  async countPendingSyncByTechnician(technicianId) {
    return WorkReport.countDocuments({
      technicianId,
      status: { $in: ['DRAFT', 'SUBMITTED', 'REJECTED'] },
    });
  }

  async list(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.orderId) query.orderId = filters.orderId;
    if (filters.technicianId) query.technicianId = filters.technicianId;
    if (!filters.includeArchived) query.isArchived = false;
    return WorkReport.find(query)
      .populate(POPULATE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  }

  async updateById(id, data) {
    return WorkReport.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return WorkReport.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async bulkSoftDelete(ids) {
    return WorkReport.updateMany(
      { _id: { $in: ids } },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );
  }

  async bulkUpdateById(ids, data) {
    return WorkReport.updateMany(
      { _id: { $in: ids } },
      { $set: data, $inc: { version: 1 } },
    );
  }
}

const workReportRepository = new WorkReportRepository();
export default workReportRepository;
