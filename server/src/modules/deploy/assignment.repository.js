import Assignment from './assignment.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  assignmentType: 'exact',
  employeeId: 'objectId',
  projectId: 'objectId',
  priority: 'exact',
};

const POPULATE_FIELDS = [
  { path: 'employeeId', select: 'firstName lastName email' },
  { path: 'orderId', select: 'orderNumber title customerName status projectId customerId' },
  { path: 'customerId', select: 'name phone email street postalCode city' },
  { path: 'siteId', select: 'name street postalCode city' },
  {
    path: 'projectId',
    select: 'name projectNumber customerName status siteId plannedStartDate plannedEndDate',
    populate: { path: 'siteId', select: 'name street postalCode city' },
  },
];

class AssignmentRepository {
  async create(data) {
    const assignment = new Assignment(data);
    return assignment.save();
  }

  async findById(id) {
    return Assignment.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const { dateFrom, dateTo, ...exactFilters } = filters;
    const filter = {
      ...buildFilter(exactFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };
    if (dateFrom || dateTo) {
      filter.startDatetime = {};
      if (dateFrom) filter.startDatetime.$gte = new Date(dateFrom);
      if (dateTo) filter.startDatetime.$lte = new Date(dateTo);
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { assignmentNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Assignment.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findByEmployeeAndDateRange(employeeId, startDate, endDate) {
    return Assignment.find({
      employeeId,
      startDatetime: { $lt: endDate },
      endDatetime: { $gt: startDate },
      status: { $ne: 'CANCELLED' },
    })
      .sort({ startDatetime: 1 })
      .lean();
  }

  async findByDateRange(startDate, endDate, { employeeIds, type, status } = {}) {
    const filter = {
      startDatetime: { $lt: endDate },
      endDatetime: { $gt: startDate },
    };

    if (employeeIds?.length) filter.employeeId = { $in: employeeIds };
    if (type) filter.assignmentType = type;
    if (status) filter.status = status;

    return Assignment.find(filter)
      .sort({ startDatetime: 1 })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async countUnassigned() {
    return Assignment.countDocuments({
      employeeId: null,
      status: { $ne: 'CANCELLED' },
    });
  }

  async findUnassigned(limit = 25) {
    return Assignment.find({
      employeeId: null,
      status: { $ne: 'CANCELLED' },
    })
      .sort({ startDatetime: 1, createdAt: 1 })
      .limit(limit)
      .lean();
  }

  async findConflicting(employeeId, start, end, excludeId) {
    const filter = {
      employeeId,
      startDatetime: { $lt: end },
      endDatetime: { $gt: start },
      status: { $ne: 'CANCELLED' },
    };

    if (excludeId) filter._id = { $ne: excludeId };

    return Assignment.find(filter)
      .sort({ startDatetime: 1 })
      .lean();
  }

  async countByStatus(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return Assignment.aggregate([
      {
        $match: {
          isDeleted: false,
          startDatetime: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);
  }

  async updateById(id, data) {
    return Assignment.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return Assignment.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' },
      { returnDocument: 'after' },
    );
  }

  async bulkCreate(dataArray) {
    return Assignment.insertMany(dataArray);
  }
}

const assignmentRepository = new AssignmentRepository();
export default assignmentRepository;
