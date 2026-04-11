import ScheduleEntry from './scheduleEntry.model.js';
import PartnerConfirmation from './partnerConfirmation.model.js';

class ScheduleRepository {
  // --- Schedule Entries ---

  async create(data) {
    const entry = new ScheduleEntry(data);
    return entry.save();
  }

  async findById(id) {
    return ScheduleEntry.findById(id).lean();
  }

  async findByProjectId(projectId) {
    return ScheduleEntry.find({ projectId })
      .sort({ sortOrder: 1 })
      .lean();
  }

  async updateById(id, data) {
    return ScheduleEntry.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return ScheduleEntry.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async countMilestonesIncomplete(projectId) {
    return ScheduleEntry.countDocuments({
      projectId,
      entryType: 'MILESTONE',
      status: { $nin: ['COMPLETED', 'WAIVED', 'CANCELLED'] },
      isDeleted: false,
    });
  }

  async findUpcomingMilestones(days = 7, limit = 50) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 86400000);

    return ScheduleEntry.find({
      entryType: 'MILESTONE',
      milestoneDate: { $gte: now, $lte: future },
      status: 'PLANNED',
      isDeleted: false,
    })
      .populate({ path: 'projectId', select: 'name projectNumber' })
      .sort({ milestoneDate: 1 })
      .limit(limit)
      .lean();
  }

  // --- Partner Confirmations ---

  async createConfirmation(data) {
    const confirmation = new PartnerConfirmation(data);
    return confirmation.save();
  }

  async findConfirmationById(id) {
    return PartnerConfirmation.findById(id).lean();
  }

  async findConfirmationsByEntry(scheduleEntryId) {
    return PartnerConfirmation.find({ scheduleEntryId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async updateConfirmationById(id, data) {
    return PartnerConfirmation.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }
}

const scheduleRepository = new ScheduleRepository();
export default scheduleRepository;
