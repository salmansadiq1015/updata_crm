import mongoose from 'mongoose';
import Installation from './installation.model.js';
import MaintenanceInterval from './maintenanceInterval.model.js';
import Contact from './contact.model.js';
import Assignment from '../deploy/assignment.model.js';
import User from '../auth/user.model.js';
import { buildCursorResponse, decodeCursor } from '../../shared/utils/pagination.js';

const FAR_FUTURE_DATE = new Date('9999-12-31T23:59:59.999Z');
const WORK_ASSIGNMENT_TYPES = ['MAINTENANCE', 'INSTALLATION'];

const SORT_FIELD_MAP = Object.freeze({
  nextDueDate: 'sortNextDueDate',
  createdAt: 'sortCreatedAt',
  installationNumber: 'installationNumber',
  maintenanceStatus: 'maintenanceStatus',
});

class AssetMaintenanceRepository {
  async findWorkItems({
    cursor,
    limit = 25,
    sortBy = 'nextDueDate',
    sortOrder = 'asc',
    filters = {},
  } = {}) {
    const internalSortBy = SORT_FIELD_MAP[sortBy] || SORT_FIELD_MAP.nextDueDate;
    const pipeline = this._buildWorkItemPipeline({ filters });

    pipeline.push({
      $project: {
        _id: { $ifNull: ['$maintenanceInterval._id', '$_id'] },
        workItemType: {
          $cond: [{ $ifNull: ['$maintenanceInterval._id', false] }, 'maintenance', 'installation'],
        },
        installationNumber: '$installationNumber',
        maintenanceStatus: '$maintenanceInterval.maintenanceStatus',
        sortNextDueDate: { $ifNull: ['$maintenanceInterval.nextDueDate', FAR_FUTURE_DATE] },
        sortCreatedAt: { $ifNull: ['$maintenanceInterval.createdAt', '$createdAt'] },
        createdAt: { $ifNull: ['$maintenanceInterval.createdAt', '$createdAt'] },
        installation: {
          _id: '$_id',
          installationNumber: '$installationNumber',
          type: '$type',
          manufacturer: '$manufacturer',
          model: '$model',
          serialNumber: '$serialNumber',
          status: '$status',
          fuelType: '$fuelType',
          powerOutputKw: '$powerOutputKw',
          commissioningDate: '$commissioningDate',
          warrantyEndDate: '$warrantyEndDate',
        },
        site: {
          _id: '$site._id',
          siteNumber: '$site.siteNumber',
          name: '$site.name',
          street: '$site.street',
          postalCode: '$site.postalCode',
          city: '$site.city',
          accessInstructions: '$site.accessInstructions',
          status: '$site.status',
        },
        customer: {
          _id: '$customer._id',
          customerNumber: '$customer.customerNumber',
          name: '$customer.name',
          ownerName: '$customer.ownerName',
          type: '$customer.type',
          phone: '$customer.phone',
          mobile: '$customer.mobile',
          email: '$customer.email',
          street: '$customer.street',
          postalCode: '$customer.postalCode',
          city: '$customer.city',
        },
        maintenance: {
          $cond: [
            { $ifNull: ['$maintenanceInterval._id', false] },
            {
              _id: '$maintenanceInterval._id',
              maintenanceType: '$maintenanceInterval.maintenanceType',
              customTypeLabel: '$maintenanceInterval.customTypeLabel',
              frequencyMonths: '$maintenanceInterval.frequencyMonths',
              lastServiceDate: '$maintenanceInterval.lastServiceDate',
              nextDueDate: '$maintenanceInterval.nextDueDate',
              maintenanceStatus: '$maintenanceInterval.maintenanceStatus',
              linkedServiceOrderId: '$maintenanceInterval.linkedServiceOrderId',
              notes: '$maintenanceInterval.notes',
              escalated: '$maintenanceInterval.escalated',
            },
            null,
          ],
        },
        assignment: { $ifNull: [{ $arrayElemAt: ['$linkedAssignments', 0] }, null] },
      },
    });

    const cursorMatch = buildCursorAggregateMatch({ cursor, sortBy: internalSortBy, sortOrder });
    if (cursorMatch) pipeline.push({ $match: cursorMatch });

    const dir = sortOrder === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { [internalSortBy]: dir, _id: dir } });
    pipeline.push({ $limit: Number(limit) + 1 });

    const rows = await Installation.aggregate(pipeline);
    return buildCursorResponse(rows, Number(limit), internalSortBy);
  }

  async findContextByInstallationId(installationId) {
    const installationObjectId = toObjectId(installationId);
    if (!installationObjectId) return null;

    const installation = await Installation.findById(installationObjectId)
      .populate({
        path: 'siteId',
        select: 'siteNumber name customerId street postalCode city canton accessInstructions status',
        populate: {
          path: 'customerId',
          select: 'customerNumber name ownerName type phone mobile email street postalCode city status',
        },
      })
      .lean();

    if (!installation) return null;

    const site = installation.siteId || null;
    const customer = site?.customerId || null;
    const customerId = customer?._id || customer || null;
    const siteId = site?._id || site || null;

    const [contacts, maintenanceIntervals, assignments] = await Promise.all([
      customerId
        ? Contact.find({ customerId })
          .sort({ isPrimary: -1, lastName: 1, firstName: 1 })
          .limit(8)
          .select('firstName lastName functionTitle phone mobile email isPrimary')
          .lean()
        : [],
      MaintenanceInterval.find({ installationId: installationObjectId })
        .sort({ nextDueDate: 1 })
        .select('-__v')
        .lean(),
      Assignment.find({
        isDeleted: false,
        status: { $ne: 'CANCELLED' },
        assignmentType: { $in: WORK_ASSIGNMENT_TYPES },
        $or: [
          { installationId: installationObjectId },
          ...(siteId ? [{ siteId }] : []),
        ],
      })
        .sort({ startDatetime: -1 })
        .limit(25)
        .populate({ path: 'employeeId', select: 'firstName lastName email' })
        .select('-__v')
        .lean(),
    ]);

    return {
      installation,
      site,
      customer,
      contacts: contacts.map((contact) => ({
        ...contact,
        fullName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      })),
      maintenanceIntervals,
      assignments,
    };
  }

  _buildWorkItemPipeline({ filters = {} }) {
    const {
      customerId,
      siteId,
      installationId,
      installationStatus,
      maintenanceStatus,
      technicianId,
      maintenanceType,
      dueFrom,
      dueTo,
      search,
      customerSearch,
      installationSearch,
    } = filters;

    const installationMatch = { isDeleted: false };
    if (installationId) installationMatch._id = toObjectId(installationId);
    if (siteId) installationMatch.siteId = toObjectId(siteId);
    if (installationStatus) installationMatch.status = installationStatus;

    const pipeline = [
      { $match: installationMatch },
      {
        $lookup: {
          from: 'sites',
          localField: 'siteId',
          foreignField: '_id',
          as: 'site',
        },
      },
      { $unwind: '$site' },
      { $match: { 'site.isDeleted': false } },
    ];

    if (customerId) {
      pipeline.push({ $match: { 'site.customerId': toObjectId(customerId) } });
    }

    pipeline.push(
      {
        $lookup: {
          from: 'customers',
          localField: 'site.customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      { $match: { 'customer.isDeleted': false } },
    );

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { installationNumber: regex },
            { manufacturer: regex },
            { model: regex },
            { serialNumber: regex },
            { 'site.name': regex },
            { 'site.city': regex },
            { 'customer.name': regex },
            { 'customer.ownerName': regex },
            { 'customer.customerNumber': regex },
          ],
        },
      });
    }

    if (customerSearch) {
      const regex = new RegExp(escapeRegex(customerSearch), 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'customer.name': regex },
            { 'customer.ownerName': regex },
            { 'customer.customerNumber': regex },
            { 'customer.email': regex },
            { 'customer.city': regex },
          ],
        },
      });
    }

    if (installationSearch) {
      const regex = new RegExp(escapeRegex(installationSearch), 'i');
      pipeline.push({
        $match: {
          $or: [
            { installationNumber: regex },
            { manufacturer: regex },
            { model: regex },
            { serialNumber: regex },
          ],
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: MaintenanceInterval.collection.name,
          localField: '_id',
          foreignField: 'installationId',
          as: 'maintenanceInterval',
        },
      },
      {
        $unwind: {
          path: '$maintenanceInterval',
          preserveNullAndEmptyArrays: true,
        },
      },
    );

    const maintenanceMatch = {};
    if (maintenanceStatus) maintenanceMatch['maintenanceInterval.maintenanceStatus'] = maintenanceStatus;
    if (maintenanceType) maintenanceMatch['maintenanceInterval.maintenanceType'] = maintenanceType;
    if (dueFrom || dueTo) {
      maintenanceMatch['maintenanceInterval.nextDueDate'] = {};
      if (dueFrom) maintenanceMatch['maintenanceInterval.nextDueDate'].$gte = parseDateBound(dueFrom, { endOfDay: false });
      if (dueTo) maintenanceMatch['maintenanceInterval.nextDueDate'].$lte = parseDateBound(dueTo, { endOfDay: true });
    }
    if (Object.keys(maintenanceMatch).length > 0) {
      pipeline.push({ $match: maintenanceMatch });
    }

    pipeline.push({
      $lookup: {
        from: Assignment.collection.name,
        let: {
          intervalId: '$maintenanceInterval._id',
          linkedAssignmentId: '$maintenanceInterval.linkedServiceOrderId',
          installationId: '$_id',
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$isDeleted', false] },
                  { $ne: ['$status', 'CANCELLED'] },
                  { $in: ['$assignmentType', WORK_ASSIGNMENT_TYPES] },
                  {
                    $or: [
                      {
                        $and: [
                          { $ne: ['$$intervalId', null] },
                          { $eq: ['$maintenanceIntervalId', '$$intervalId'] },
                        ],
                      },
                      {
                        $and: [
                          { $ne: ['$$linkedAssignmentId', null] },
                          { $eq: ['$_id', '$$linkedAssignmentId'] },
                        ],
                      },
                      {
                        $and: [
                          { $eq: ['$$intervalId', null] },
                          { $eq: ['$installationId', '$$installationId'] },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { $sort: { startDatetime: 1, createdAt: 1 } },
          {
            $lookup: {
              from: User.collection.name,
              localField: 'employeeId',
              foreignField: '_id',
              as: 'employee',
            },
          },
          {
            $unwind: {
              path: '$employee',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 1,
              assignmentNumber: 1,
              employeeId: 1,
              assignmentType: 1,
              title: 1,
              status: 1,
              priority: 1,
              startDatetime: 1,
              endDatetime: 1,
              isCustomerAppointment: 1,
              installationId: 1,
              maintenanceIntervalId: 1,
              employee: {
                _id: '$employee._id',
                firstName: '$employee.firstName',
                lastName: '$employee.lastName',
                email: '$employee.email',
              },
            },
          },
        ],
        as: 'linkedAssignments',
      },
    });

    if (technicianId) {
      pipeline.push({ $match: { 'linkedAssignments.employeeId': toObjectId(technicianId) } });
    }

    return pipeline;
  }
}

function buildCursorAggregateMatch({ cursor, sortBy, sortOrder }) {
  if (!cursor) return null;
  const decoded = decodeCursor(cursor);
  if (!decoded?._id) return null;

  const id = toObjectId(decoded._id);
  if (!id) return null;

  const op = sortOrder === 'desc' ? '$lt' : '$gt';
  if (sortBy === '_id' || decoded[sortBy] === undefined) {
    return { _id: { [op]: id } };
  }

  const sortValue = normalizeCursorValue(decoded[sortBy], sortBy);
  return {
    $or: [
      { [sortBy]: { [op]: sortValue } },
      { [sortBy]: sortValue, _id: { [op]: id } },
    ],
  };
}

function normalizeCursorValue(value, sortBy) {
  if (sortBy === 'sortNextDueDate' || sortBy === 'sortCreatedAt') {
    return new Date(value);
  }
  return value;
}

function parseDateBound(value, { endOfDay }) {
  if (value instanceof Date) {
    const date = new Date(value);
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
    return date;
  }

  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  }
  return new Date(value);
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const assetMaintenanceRepository = new AssetMaintenanceRepository();
export default assetMaintenanceRepository;
