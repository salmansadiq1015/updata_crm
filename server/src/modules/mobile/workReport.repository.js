import WorkReport from './workReport.model.js';
import Assignment from '../deploy/assignment.model.js';
import User from '../auth/user.model.js';
import Customer from '../crm/customer.model.js';
import Order from '../qop/order.model.js';
import '../pm/project.model.js';
import '../qop/invoice.model.js';

const POPULATE_FIELDS = [
  { path: 'technicianId', select: 'firstName lastName email' },
  { path: 'projectId', select: 'projectNumber name customerName status' },
  {
    path: 'orderId',
    select: 'assignmentNumber title assignmentType startDatetime endDatetime status employeeId orderId projectId customerId siteId',
    populate: [
      { path: 'projectId', select: 'projectNumber name customerName status' },
      { path: 'customerId', select: 'customerNumber name ownerName type city' },
      { path: 'orderId', select: 'orderNumber title customerName customerId projectId status' },
    ],
  },
  { path: 'approvedBy', select: 'firstName lastName email' },
  { path: 'rejectedBy', select: 'firstName lastName email' },
  { path: 'invoicedBy', select: 'firstName lastName email' },
  { path: 'invoiceId', select: 'invoiceNumber status grandTotalRounded amountDue currency' },
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
      status: { $in: ['DRAFT', 'REJECTED'] },
      isDeleted: false,
    });
  }

  async countPendingSyncByTechnician(technicianId) {
    return WorkReport.countDocuments({
      technicianId,
      status: { $in: ['DRAFT', 'SUBMITTED', 'REJECTED'] },
      isDeleted: false,
    });
  }

  async list(filters = {}) {
    const query = await this._buildQuery(filters);
    const page = Math.max(Number(filters.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(filters.pageSize || 25), 1), 100);
    const sort = buildSort(filters);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      WorkReport.find(query)
        .populate(POPULATE_FIELDS)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      WorkReport.countDocuments(query),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
        hasNextPage: skip + items.length < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async listForExport(filters = {}) {
    const query = await this._buildQuery(filters);
    const limit = Math.min(Math.max(Number(filters.pageSize || 5000), 1), 5000);
    return WorkReport.find(query)
      .populate(POPULATE_FIELDS)
      .sort(buildSort(filters))
      .limit(limit)
      .lean();
  }

  async updateById(id, data) {
    const hasOperator = Object.keys(data || {}).some((key) => key.startsWith('$'));
    const update = hasOperator
      ? { ...data, $inc: { ...(data.$inc || {}), version: 1 } }
      : { $set: data, $inc: { version: 1 } };

    return WorkReport.findByIdAndUpdate(
      id,
      update,
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

  async hasSubmittedForOrder(orderId) {
    const existing = await WorkReport.exists({
      orderId,
      status: { $in: ['SUBMITTED', 'APPROVED', 'INVOICED'] },
      isDeleted: false,
    });
    return Boolean(existing);
  }

  async _buildQuery(filters = {}) {
    const query = { isDeleted: false };
    const and = [];

    if (filters.status) query.status = filters.status;
    if (filters.technicianId) query.technicianId = filters.technicianId;
    if (!filters.includeArchived) query.isArchived = false;

    if (filters.dateFrom || filters.dateTo) {
      query.reportDate = {};
      if (filters.dateFrom) query.reportDate.$gte = filters.dateFrom;
      if (filters.dateTo) query.reportDate.$lte = filters.dateTo;
    }

    if (filters.orderId) and.push({ orderId: filters.orderId });

    if (filters.projectId) {
      const assignmentIds = await Assignment.find({ projectId: filters.projectId }).distinct('_id');
      and.push({
        $or: [
          { projectId: filters.projectId },
          { orderId: { $in: assignmentIds } },
        ],
      });
    }

    if (filters.customerId) {
      const assignmentIds = await Assignment.find({ customerId: filters.customerId }).distinct('_id');
      and.push({ orderId: { $in: assignmentIds } });
    }

    const search = `${filters.search || ''}`.trim();
    if (search) {
      and.push({ $or: await this._buildSearchOr(search) });
    }

    if (and.length) query.$and = and;
    return query;
  }

  async _buildSearchOr(search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const clauses = [
      { reportNumber: regex },
      { workPerformed: regex },
      { findings: regex },
      { nextSteps: regex },
      { technicianNotes: regex },
      { customerSignerName: regex },
      { invoiceReference: regex },
    ];

    const [technicianIds, assignmentIds, customerIds, qopOrderIds] = await Promise.all([
      User.find({
        $or: [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
        ],
      }).distinct('_id'),
      Assignment.find({
        $or: [
          { assignmentNumber: regex },
          { title: regex },
        ],
      }).distinct('_id'),
      Customer.find({
        $or: [
          { customerNumber: regex },
          { name: regex },
          { ownerName: regex },
          { city: regex },
        ],
      }).distinct('_id'),
      Order.find({
        $or: [
          { orderNumber: regex },
          { title: regex },
          { customerName: regex },
        ],
      }).distinct('_id'),
    ]);

    const contextualAssignmentIds = new Set(assignmentIds.map((id) => id.toString()));

    if (customerIds.length) {
      const ids = await Assignment.find({ customerId: { $in: customerIds } }).distinct('_id');
      ids.forEach((id) => contextualAssignmentIds.add(id.toString()));
    }

    if (qopOrderIds.length) {
      const ids = await Assignment.find({ orderId: { $in: qopOrderIds } }).distinct('_id');
      ids.forEach((id) => contextualAssignmentIds.add(id.toString()));
    }

    if (technicianIds.length) clauses.push({ technicianId: { $in: technicianIds } });
    if (contextualAssignmentIds.size) clauses.push({ orderId: { $in: [...contextualAssignmentIds] } });

    return clauses;
  }
}

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSort(filters = {}) {
  const allowed = new Set(['createdAt', 'reportDate', 'status', 'reportNumber']);
  const sortBy = allowed.has(filters.sortBy) ? filters.sortBy : 'createdAt';
  const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
  return { [sortBy]: sortOrder, _id: sortOrder };
}

const workReportRepository = new WorkReportRepository();
export default workReportRepository;
