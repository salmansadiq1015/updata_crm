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
  customerId: 'objectId',
  siteId: 'objectId',
  installationId: 'objectId',
  maintenanceIntervalId: 'objectId',
  assignmentTargetType: 'exact',
  assignmentTargetId: 'exact',
  priority: 'exact',
};

const POPULATE_FIELDS = [
  { path: 'employeeId', select: 'firstName lastName email' },
  { path: 'orderId', select: 'orderNumber title customerName status projectId customerId' },
  { path: 'customerId', select: 'name phone email street postalCode city' },
  { path: 'siteId', select: 'name street postalCode city' },
  { path: 'installationId', select: 'installationNumber type manufacturer model status siteId' },
  { path: 'maintenanceIntervalId', select: 'maintenanceType customTypeLabel maintenanceStatus nextDueDate' },
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
    const filter = await this._buildListFilter({ filters, search, cursor, sortBy, sortOrder });
    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Assignment.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async getStatusSummary({ filters = {}, search } = {}) {
    const filter = await this._buildListFilter({ filters, search });
    const rows = await Assignment.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);

    return rows.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});
  }

  async findByEmployeeAndDateRange(employeeId, startDate, endDate) {
    return this.findVisibleToEmployee(employeeId, startDate, endDate);
  }

  async findVisibleToEmployee(employeeId, startDate, endDate, { targetIds = [] } = {}) {
    const visibility = [{ employeeId }];
    const normalizedTargets = [...new Set(targetIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (normalizedTargets.length > 0) {
      visibility.push({
        assignmentTargetType: { $in: ['TEAM', 'DEPARTMENT'] },
        assignmentTargetId: { $in: normalizedTargets },
      });
    }

    return Assignment.find({
      $or: visibility,
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

    // _id breaks start-time ties: without it the order of simultaneous starts
    // depends on the chosen index (natural order is not stable).
    return Assignment.find(filter)
      .sort({ startDatetime: 1, _id: 1 })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async countUnassigned() {
    return Assignment.countDocuments({
      employeeId: null,
      assignmentTargetType: 'EMPLOYEE',
      status: { $ne: 'CANCELLED' },
    });
  }

  async findUnassigned(limit = 25) {
    return Assignment.find({
      employeeId: null,
      assignmentTargetType: 'EMPLOYEE',
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

  async _buildListFilter({ filters = {}, search, cursor, sortBy = 'createdAt', sortOrder = 'desc' }) {
    const { dateFrom, dateTo, ...exactFilters } = filters;
    const filter = {
      isDeleted: false,
      ...buildFilter(exactFilters, ALLOWED_FILTERS),
    };
    const andClauses = [];
    const cursorQuery = cursor ? buildCursorQuery(cursor, sortBy, sortOrder) : {};
    if (Object.keys(cursorQuery).length > 0) andClauses.push(cursorQuery);

    if (dateFrom || dateTo) {
      filter.startDatetime = {};
      if (dateFrom) filter.startDatetime.$gte = parseDateBound(dateFrom, { endOfDay: false });
      if (dateTo) filter.startDatetime.$lte = parseDateBound(dateTo, { endOfDay: true });
    }

    const searchClauses = await this._buildSearchClauses(search);
    if (searchClauses.length > 0) {
      andClauses.push({ $or: searchClauses });
    }

    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    return filter;
  }

  async _buildSearchClauses(search) {
    const term = String(search || '').trim();
    if (!term) return [];

    const regex = new RegExp(escapeRegex(term), 'i');
    const clauses = [
      { title: regex },
      { assignmentNumber: regex },
      { assignmentTargetLabel: regex },
    ];

    const [users, customers, projects, sites] = await Promise.all([
      import('../auth/user.model.js').then(({ default: User }) => (
        User.find({
          $or: [
            { firstName: regex },
            { lastName: regex },
            { email: regex },
            { department: regex },
            { position: regex },
          ],
        }).distinct('_id')
      )),
      import('../crm/customer.model.js').then(({ default: Customer }) => (
        Customer.find({
          $or: [
            { name: regex },
            { ownerName: regex },
            { customerNumber: regex },
            { email: regex },
            { city: regex },
          ],
        }).distinct('_id')
      )),
      import('../pm/project.model.js').then(({ default: Project }) => (
        Project.find({
          $or: [
            { name: regex },
            { projectNumber: regex },
            { customerName: regex },
          ],
        }).distinct('_id')
      )),
      import('../crm/site.model.js').then(({ default: Site }) => (
        Site.find({
          $or: [
            { name: regex },
            { street: regex },
            { city: regex },
            { postalCode: regex },
          ],
        }).distinct('_id')
      )),
    ]);

    if (users.length) clauses.push({ employeeId: { $in: users } });
    if (customers.length) clauses.push({ customerId: { $in: customers } });
    if (projects.length) clauses.push({ projectId: { $in: projects } });
    if (sites.length) clauses.push({ siteId: { $in: sites } });

    return clauses;
  }
}

const assignmentRepository = new AssignmentRepository();
export default assignmentRepository;

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDateBound(value, { endOfDay }) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  }
  return new Date(value);
}
