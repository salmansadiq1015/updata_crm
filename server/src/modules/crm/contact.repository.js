import Contact from './contact.model.js';

const CONTACT_OVERVIEW_LIMIT_MAX = 100;
function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeNumber(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toKey(value) {
  return String(value?._id || value);
}

class ContactRepository {
  async create(data) {
    const contact = new Contact(data);
    return contact.save();
  }

  async findById(id) {
    return Contact.findById(id).lean();
  }

  async findByCustomerId(customerId) {
    return Contact.find({ customerId })
      .sort({ isPrimary: -1, lastName: 1 })
      .lean();
  }

  async findPrimaryByCustomerId(customerId) {
    return Contact.findOne({ customerId, isPrimary: true }).lean();
  }

  async updateById(id, data) {
    return Contact.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Contact.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async unsetPrimaryForCustomer(customerId) {
    return Contact.updateMany(
      { customerId, isPrimary: true },
      { $set: { isPrimary: false } },
    );
  }

  async findAll(limit = 500) {
    return Contact.find()
      .populate('customerId', 'name customerNumber type status city postalCode street')
      .sort({ lastName: 1, firstName: 1 })
      .limit(limit)
      .lean();
  }

  async findOverview({ search, type = 'all', page = 1, limit = 25 } = {}) {
    const Customer = (await import('./customer.model.js')).default;
    const safeLimit = safeNumber(limit, 25, { min: 1, max: CONTACT_OVERVIEW_LIMIT_MAX });
    const safePage = safeNumber(page, 1, { min: 1 });
    const skip = (safePage - 1) * safeLimit;
    const normalizedType = ['private', 'business'].includes(type) ? type : 'all';
    const searchTerm = String(search || '').trim();

    const customerMatch = { 'customer.isDeleted': false };
    if (normalizedType !== 'all') customerMatch['customer.type'] = normalizedType;

    const pipeline = [
      { $match: { isDeleted: false } },
      {
        $lookup: {
          from: Customer.collection.name,
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      { $match: customerMatch },
    ];

    if (searchTerm) {
      const query = new RegExp(escapeRegex(searchTerm), 'i');
      pipeline.push({
        $match: {
          $or: [
            { firstName: query },
            { lastName: query },
            { functionTitle: query },
            { email: query },
            { phone: query },
            { mobile: query },
            { 'customer.name': query },
            { 'customer.customerNumber': query },
            { 'customer.city': query },
            { 'customer.email': query },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { lastName: 1, firstName: 1, _id: 1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: safeLimit },
            {
              $project: {
                __v: 0,
                'customer.__v': 0,
                'customer.createdBy': 0,
                'customer.migration': 0,
              },
            },
          ],
        },
      },
    );

    const [result] = await Contact.aggregate(pipeline);
    const rows = result?.data || [];
    const total = result?.metadata?.[0]?.total || 0;
    const enriched = await this._attachOverviewRelations(rows);

    return {
      data: enriched,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pageCount: Math.max(1, Math.ceil(total / safeLimit)),
        hasNext: skip + safeLimit < total,
        hasPrev: safePage > 1,
      },
      summary: await this.countOverviewSummary({ search: searchTerm }),
    };
  }

  async countOverviewSummary({ search } = {}) {
    const Customer = (await import('./customer.model.js')).default;
    const searchTerm = String(search || '').trim();
    const pipeline = [
      { $match: { isDeleted: false } },
      {
        $lookup: {
          from: Customer.collection.name,
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      { $match: { 'customer.isDeleted': false } },
    ];

    if (searchTerm) {
      const query = new RegExp(escapeRegex(searchTerm), 'i');
      pipeline.push({
        $match: {
          $or: [
            { firstName: query },
            { lastName: query },
            { functionTitle: query },
            { email: query },
            { phone: query },
            { mobile: query },
            { 'customer.name': query },
            { 'customer.customerNumber': query },
            { 'customer.city': query },
            { 'customer.email': query },
          ],
        },
      });
    }

    pipeline.push({
      $group: {
        _id: '$customer.type',
        count: { $sum: 1 },
      },
    });

    const rows = await Contact.aggregate(pipeline);
    return rows.reduce(
      (summary, row) => ({
        ...summary,
        [row._id === 'private' ? 'private' : 'business']: row.count,
        total: summary.total + row.count,
      }),
      { total: 0, private: 0, business: 0 },
    );
  }

  async _attachOverviewRelations(rows) {
    if (!rows.length) return rows;

    const [Project, Quotation, Order] = await Promise.all([
      import('../pm/project.model.js').then((module) => module.default),
      import('../qop/quotation.model.js').then((module) => module.default),
      import('../qop/order.model.js').then((module) => module.default),
    ]);

    const contactIds = rows.map((row) => row._id);
    const customerIds = rows.map((row) => row.customer?._id).filter(Boolean);

    const [
      projectCounts,
      quotationContactCounts,
      quotationCustomerCounts,
      orderContactCounts,
      orderCustomerCounts,
    ] = await Promise.all([
      Project.aggregate([
        { $match: { customerId: { $in: customerIds }, isDeleted: false } },
        { $group: { _id: '$customerId', total: { $sum: 1 } } },
      ]),
      Quotation.aggregate([
        { $match: { contactId: { $in: contactIds }, isDeleted: false } },
        { $group: { _id: '$contactId', total: { $sum: 1 } } },
      ]),
      Quotation.aggregate([
        { $match: { customerId: { $in: customerIds }, isDeleted: false } },
        { $group: { _id: '$customerId', total: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { contactId: { $in: contactIds }, isDeleted: false } },
        { $group: { _id: '$contactId', total: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { customerId: { $in: customerIds }, isDeleted: false } },
        { $group: { _id: '$customerId', total: { $sum: 1 } } },
      ]),
    ]);

    const projectCountsByCustomer = new Map(projectCounts.map((row) => [toKey(row._id), row.total]));
    const quotationCountsByContact = new Map(quotationContactCounts.map((row) => [toKey(row._id), row.total]));
    const quotationCountsByCustomer = new Map(quotationCustomerCounts.map((row) => [toKey(row._id), row.total]));
    const orderCountsByContact = new Map(orderContactCounts.map((row) => [toKey(row._id), row.total]));
    const orderCountsByCustomer = new Map(orderCustomerCounts.map((row) => [toKey(row._id), row.total]));

    return rows.map((row) => {
      const contactKey = toKey(row._id);
      const customer = row.customer || null;
      const customerKey = customer ? toKey(customer._id) : null;
      const directQuotationCount = quotationCountsByContact.get(contactKey) || 0;
      const directOrderCount = orderCountsByContact.get(contactKey) || 0;

      return {
        ...row,
        customerId: customer,
        customer,
        contactType: customer?.type === 'private' ? 'private' : 'business',
        related: {
          projectCount: customerKey ? projectCountsByCustomer.get(customerKey) || 0 : 0,
          quotationCount: directQuotationCount || (customerKey ? quotationCountsByCustomer.get(customerKey) || 0 : 0),
          orderCount: directOrderCount || (customerKey ? orderCountsByCustomer.get(customerKey) || 0 : 0),
          directQuotationCount,
          directOrderCount,
        },
      };
    });
  }

  async search(searchTerm, limit = 25) {
    return Contact.find({
      $or: [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
        { mobile: { $regex: searchTerm, $options: 'i' } },
      ],
    })
      .populate('customerId', 'name customerNumber type status')
      .limit(limit)
      .lean();
  }
}

const contactRepository = new ContactRepository();
export default contactRepository;
