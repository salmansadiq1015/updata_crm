import Project from './project.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  projectType: 'exact',
  customerId: 'objectId',
  projectManagerId: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'projectNumber', 'plannedStartDate', '_id'];

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

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { projectNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Project.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
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
      new: true,
      runValidators: true,
    })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return Project.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), status: 'ARCHIVED' },
      { new: true },
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
