import Project from './project.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'in',
  projectType: 'exact',
  customerId: 'objectId',
  projectManagerId: 'objectId',
};

const ALLOWED_SORT_FIELDS = [
  'createdAt',
  'name',
  'projectNumber',
  'plannedStartDate',
  'plannedEndDate',
  'status',
  'projectType',
  'customerId',
  'customerName',
  '_id',
];

const POPULATE_FIELDS = [
  { path: 'customerId', select: 'customerNumber name' },
  { path: 'projectManagerId', select: 'firstName lastName email' },
  { path: 'siteId', select: 'name street city' },
];

class ProjectRepository {
  async create(data) {
    const project = new Project(data);
    return project.save();
  }

  async findById(id) {
    return Project.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  // Bypass the soft-delete pre-hook so a deleted project can be inspected/restored.
  async findByIdWithDeleted(id) {
    return Project.findById(id)
      .setOptions({ includeDeleted: true })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search, plannedStartFrom, plannedStartTo, includeDeleted = false }) {
    const { includeDeleted: _drop, plannedStartFrom: _psfDrop, plannedStartTo: _pstDrop, ...safeFilters } = filters;

    const filter = {
      ...buildFilter(safeFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    // Apply soft-delete filter — mirror document.repository.js pattern
    if (!includeDeleted) {
      filter.isDeleted = { $ne: true };
    }

    // Date-range filter on plannedStartDate
    if (plannedStartFrom || plannedStartTo) {
      filter.plannedStartDate = {};
      if (plannedStartFrom) filter.plannedStartDate.$gte = new Date(plannedStartFrom);
      if (plannedStartTo) filter.plannedStartDate.$lte = new Date(plannedStartTo);
    }

    if (search) {
      const Customer = (await import('../crm/customer.model.js')).default;
      const matchingCustomers = await Customer.find({ name: { $regex: search, $options: 'i' } })
        .select('_id')
        .limit(1000)
        .lean();
      const customerIds = matchingCustomers.map((customer) => customer._id);

      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { projectNumber: { $regex: search, $options: 'i' } },
        ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
      ];
    }

    const resolvedSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const sort = buildCursorSort(resolvedSortBy, sortOrder);

    const query = Project.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v');

    // When includeDeleted is true use .setOptions to bypass the soft-delete
    // plugin — same mechanism as document.repository.js restore()
    if (includeDeleted) {
      query.setOptions({ includeDeleted: true });
    }

    const docs = await query.lean();

    return buildCursorResponse(docs, limit, resolvedSortBy);
  }

  async findAssignmentsForUser({
    userId,
    teamIds = [],
    assignmentType = 'all',
    cursor,
    limit = 25,
    sortBy = 'projectNumber',
    sortOrder = 'asc',
    search,
  }) {
    const clauses = [];
    if (assignmentType === 'all' || assignmentType === 'manager') {
      clauses.push({ projectManagerId: userId });
    }
    if ((assignmentType === 'all' || assignmentType === 'team') && teamIds.length > 0) {
      clauses.push({ teamId: { $in: teamIds } });
    }

    if (clauses.length === 0) {
      return buildCursorResponse([], limit, sortBy);
    }

    const resolvedSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'projectNumber';
    const filter = {
      isDeleted: { $ne: true },
      $and: [{ $or: clauses }],
    };

    const cursorClause = buildCursorQuery(cursor, resolvedSortBy, sortOrder);
    if (Object.keys(cursorClause).length > 0) {
      filter.$and.push(cursorClause);
    }

    if (search) {
      filter.$and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { projectNumber: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const sort = buildCursorSort(resolvedSortBy, sortOrder);
    const docs = await Project.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, resolvedSortBy);
  }

  async textSearch(searchTerm, limit = 25) {
    return Project.find(
      { $text: { $search: searchTerm } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();
  }

  async updateById(id, data) {
    return Project.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  // Pure soft-delete (PROJ-001 AC-6): mark deleted WITHOUT forcing ARCHIVED so the
  // record keeps its original status and can be restored to it. Archiving is a
  // distinct action (see archive()).
  async softDelete(id) {
    return Project.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async restore(id) {
    return Project.findByIdAndUpdate(
      id,
      { isDeleted: false, deletedAt: null },
      { returnDocument: 'after' },
    ).setOptions({ includeDeleted: true });
  }

  // Archive a project (PROJ-001 AC-7): status-only change, not a soft-delete.
  async archive(id) {
    return Project.findByIdAndUpdate(
      id,
      { status: 'ARCHIVED' },
      { returnDocument: 'after' },
    );
  }

  async bulkUpdate(ids, data) {
    const result = await Project.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: data },
      { runValidators: true },
    );
    return result.modifiedCount;
  }

  async bulkSoftDelete(ids) {
    const result = await Project.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), status: 'ARCHIVED' } },
    );
    return result.modifiedCount;
  }

  async findByIds(ids) {
    return Project.find({ _id: { $in: ids }, isDeleted: false }).lean();
  }

  async countAll() {
    return Project.countDocuments({ isDeleted: false });
  }

  async countByStatus() {
    return Project.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);
  }

  async countByType() {
    return Project.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$projectType', count: { $sum: 1 } } },
      { $project: { _id: 0, projectType: '$_id', count: 1 } },
    ]);
  }

  async getBudgetSummary() {
    const [summary] = await Project.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          estimatedBudgetTotal: { $sum: { $ifNull: ['$estimatedBudget', 0] } },
          budgetedProjects: {
            $sum: {
              $cond: [{ $ne: ['$estimatedBudget', null] }, 1, 0],
            },
          },
        },
      },
      { $project: { _id: 0, estimatedBudgetTotal: 1, budgetedProjects: 1 } },
    ]);

    return summary || { estimatedBudgetTotal: 0, budgetedProjects: 0 };
  }

  async findUpcomingMilestones(days = 7) {
    // Lazy import to avoid circular dependencies — ScheduleEntry may not exist yet
    const ScheduleEntry = (await import('./scheduleEntry.model.js')).default;

    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return ScheduleEntry.find({
      entryType: 'MILESTONE',
      milestoneDate: { $gte: now, $lte: future },
      status: 'PLANNED',
    })
      .populate({ path: 'projectId', select: 'name projectNumber' })
      .lean();
  }
}

const projectRepository = new ProjectRepository();
export default projectRepository;
