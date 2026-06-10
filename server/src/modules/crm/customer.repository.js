import Customer from './customer.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  type: 'exact',
  postalCode: 'exact',
  canton: 'exact',
  newsletterOptIn: 'boolean',
};

class CustomerRepository {
  async create(data) {
    const customer = new Customer(data);
    return customer.save();
  }

  async findById(id) {
    const doc = await Customer.findById(id).lean();
    if (!doc) return doc;
    // Attach the same computed fields the list path exposes (CRM-001 AC-8).
    // _attachComputedFields operates on an array — wrap and unwrap the single doc.
    const [enriched] = await this._attachComputedFields([doc]);
    return enriched;
  }

  async findByCustomerNumber(customerNumber) {
    return Customer.findOne({ customerNumber }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { customerNumber: { $regex: search, $options: 'i' } },
        { uidNumber: { $regex: search, $options: 'i' } },
        { vatNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Customer.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    const response = buildCursorResponse(docs, limit, sortBy);
    response.data = await this._attachComputedFields(response.data);
    return response;
  }

  async _attachComputedFields(customers) {
    if (!customers.length) return customers;

    const customerIds = customers.map((customer) => customer._id);
    const [Site, Installation, MaintenanceInterval, Contact] = await Promise.all([
      import('./site.model.js').then((module) => module.default),
      import('./installation.model.js').then((module) => module.default),
      import('./maintenanceInterval.model.js').then((module) => module.default),
      import('./contact.model.js').then((module) => module.default),
    ]);

    const [siteCounts, installationCounts, lastServiceRows, primaryContacts] = await Promise.all([
      Site.aggregate([
        { $match: { customerId: { $in: customerIds }, isDeleted: false } },
        { $group: { _id: '$customerId', total: { $sum: 1 } } },
      ]),
      Site.aggregate([
        { $match: { customerId: { $in: customerIds }, isDeleted: false } },
        { $lookup: { from: Installation.collection.name, localField: '_id', foreignField: 'siteId', as: 'installations' } },
        { $unwind: '$installations' },
        { $match: { 'installations.isDeleted': false } },
        { $group: { _id: '$customerId', total: { $sum: 1 } } },
      ]),
      Site.aggregate([
        { $match: { customerId: { $in: customerIds }, isDeleted: false } },
        { $lookup: { from: Installation.collection.name, localField: '_id', foreignField: 'siteId', as: 'installations' } },
        { $unwind: '$installations' },
        { $match: { 'installations.isDeleted': false } },
        {
          $lookup: {
            from: MaintenanceInterval.collection.name,
            localField: 'installations._id',
            foreignField: 'installationId',
            as: 'maintenanceIntervals',
          },
        },
        { $unwind: '$maintenanceIntervals' },
        { $match: { 'maintenanceIntervals.lastServiceDate': { $ne: null } } },
        { $group: { _id: '$customerId', lastServiceDate: { $max: '$maintenanceIntervals.lastServiceDate' } } },
      ]),
      Contact.find({ customerId: { $in: customerIds }, isPrimary: true })
        .select('customerId firstName lastName functionTitle email phone mobile')
        .lean(),
    ]);

    const siteCountByCustomer = new Map(siteCounts.map((row) => [String(row._id), row.total]));
    const installationCountByCustomer = new Map(installationCounts.map((row) => [String(row._id), row.total]));
    const lastServiceByCustomer = new Map(lastServiceRows.map((row) => [String(row._id), row.lastServiceDate]));
    const primaryContactByCustomer = new Map(primaryContacts.map((contact) => [
      String(contact.customerId),
      {
        ...contact,
        fullName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      },
    ]));

    return customers.map((customer) => {
      const key = String(customer._id);
      const primaryContact = primaryContactByCustomer.get(key) || null;
      return {
        ...customer,
        totalSitesCount: siteCountByCustomer.get(key) || 0,
        totalInstallationsCount: installationCountByCustomer.get(key) || 0,
        lastServiceDate: lastServiceByCustomer.get(key) || null,
        primaryContact,
        primaryContactName: primaryContact?.fullName || null,
        primaryContactEmail: primaryContact?.email || null,
        primaryContactPhone: primaryContact?.phone || primaryContact?.mobile || null,
      };
    });
  }

  async findDuplicates(name, postalCode) {
    const filter = { name: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } };
    if (postalCode) filter.postalCode = postalCode;
    return Customer.find(filter)
      .select('_id customerNumber name postalCode city')
      .limit(5)
      .lean();
  }

  async textSearch(searchTerm, limit = 25) {
    return Customer.find(
      { $text: { $search: searchTerm } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .select('-__v')
      .lean();
  }

  async updateById(id, data) {
    return Customer.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Customer.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), status: 'archived' },
      { returnDocument: 'after' },
    );
  }

  async bulkUpdate(ids, data) {
    const result = await Customer.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: data },
      { runValidators: true },
    );
    return result.modifiedCount;
  }

  async bulkSoftDelete(ids) {
    const result = await Customer.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), status: 'archived' } },
    );
    return result.modifiedCount;
  }

  async findByIds(ids) {
    return Customer.find({ _id: { $in: ids }, isDeleted: false }).lean();
  }

  async countAll() {
    return Customer.countDocuments({ isDeleted: false });
  }
}

const customerRepository = new CustomerRepository();
export default customerRepository;
