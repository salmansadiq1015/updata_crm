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

  async findIncomplete(technicianId) {
    return WorkReport.find({
      technicianId,
      $or: [
        { status: 'DRAFT' },
      ],
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

  async updateById(id, data) {
    return WorkReport.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { new: true, runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return WorkReport.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }
}

const workReportRepository = new WorkReportRepository();
export default workReportRepository;
