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
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return ScheduleEntry.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async findDependents(predecessorId) {
    return ScheduleEntry.find({ predecessorId, isDeleted: false }).lean();
  }

  async countMilestonesIncomplete(projectId) {
    return ScheduleEntry.countDocuments({
      projectId,
      entryType: 'MILESTONE',
      status: { $nin: ['COMPLETED', 'WAIVED', 'CANCELLED'] },
      isDeleted: false,
    });
  }

  /**
   * Internal-team schedule entries that intersect a [from, to] date range.
   *
   * Used by the Field Deployment (deploy) module to surface project work
   * (responsibleType: 'INTERNAL_TEAM', responsibleTeamId → User) on the
   * dispatcher calendar alongside deployments. READ-ONLY in deploy.
   *
   * Range semantics (half-open intersection, mirroring deploy assignments):
   *   - PHASE entries: startDate < to AND endDate > from
   *   - MILESTONE entries: milestoneDate within [from, to]
   * Only entries with a non-null responsibleTeamId are returned (a calendar
   * row is keyed by the responsible user). Partner-responsibility entries are
   * excluded. Cancelled entries are excluded.
   *
   * @param {Date} from   range start (inclusive lower bound)
   * @param {Date} to     range end (exclusive upper bound)
   * @param {string[]} [userIds] optional restriction to these responsibleTeamIds
   */
  async findInternalTeamEntriesInRange(from, to, userIds) {
    const filter = {
      isDeleted: false,
      responsibleType: 'INTERNAL_TEAM',
      responsibleTeamId: { $ne: null },
      status: { $ne: 'CANCELLED' },
      $or: [
        // PHASE: range intersects [from, to]
        { entryType: 'PHASE', startDate: { $lt: to }, endDate: { $gt: from } },
        // MILESTONE: single day within [from, to]
        { entryType: 'MILESTONE', milestoneDate: { $gte: from, $lte: to } },
      ],
    };

    if (userIds?.length) {
      filter.responsibleTeamId = { $in: userIds };
    }

    return ScheduleEntry.find(filter)
      .populate({ path: 'projectId', select: 'name projectNumber' })
      .populate({ path: 'responsibleTeamId', select: 'firstName lastName' })
      .sort({ startDate: 1, milestoneDate: 1 })
      .lean();
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

  async findConfirmationsByEntryIds(scheduleEntryIds) {
    if (!scheduleEntryIds || scheduleEntryIds.length === 0) return [];
    return PartnerConfirmation.find({ scheduleEntryId: { $in: scheduleEntryIds } })
      .sort({ createdAt: -1 })
      .lean();
  }

  async updateConfirmationById(id, data) {
    return PartnerConfirmation.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }
}

const scheduleRepository = new ScheduleRepository();
export default scheduleRepository;
