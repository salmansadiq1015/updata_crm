import mongoose from 'mongoose';
import Customer from './customer.model.js';
import Contact from './contact.model.js';
import Site from './site.model.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CANDIDATES = 5000;
const CUSTOMER_SELECT = 'customerNumber name ownerName type street addressSupplement postalCode city canton country phone mobile email status updatedAt';
const CONTACT_SELECT = 'customerId firstName lastName functionTitle phone mobile email isPrimary updatedAt';
const SITE_PROJECT = {
  __v: 0,
  'customer.__v': 0,
  'customer.createdBy': 0,
  'customer.migration': 0,
};

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeNumber(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function objectId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function toObjectId(value) {
  const id = objectId(value);
  return id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function compactAddress({ addressSupplement, street, postalCode, city, canton, country }) {
  const locality = [postalCode, city].filter(Boolean).join(' ');
  return [addressSupplement, street, locality, canton, country].filter(Boolean).join(', ');
}

function normalizeQuery(params = {}) {
  return {
    search: String(params.search || '').trim(),
    customerType: ['private', 'business'].includes(params.customerType) ? params.customerType : 'all',
    addressType: ['billing', 'site', 'delivery'].includes(params.addressType) ? params.addressType : 'all',
    canton: String(params.canton || '').trim().toUpperCase(),
    postalCode: String(params.postalCode || '').trim(),
    city: String(params.city || '').trim(),
    hasCoordinates: ['with', 'without'].includes(params.hasCoordinates) ? params.hasCoordinates : 'all',
    page: safeNumber(params.page, 1),
    limit: safeNumber(params.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT }),
  };
}

function addContactCustomerCondition(filter, ids) {
  if (!ids.length) return filter;
  if (!filter.$or) filter.$or = [];
  filter.$or.push({ _id: { $in: ids } });
  return filter;
}

function buildCustomerFilter(query, contactCustomerObjectIds = []) {
  if (query.hasCoordinates === 'with') return null;

  const filter = { status: 'active', isDeleted: false };
  if (query.customerType !== 'all') filter.type = query.customerType;
  if (query.canton) filter.canton = query.canton;
  if (query.postalCode) filter.postalCode = query.postalCode;
  if (query.city) filter.city = { $regex: escapeRegex(query.city), $options: 'i' };

  if (query.search) {
    const regex = { $regex: escapeRegex(query.search), $options: 'i' };
    filter.$or = [
      { name: regex },
      { ownerName: regex },
      { customerNumber: regex },
      { email: regex },
      { phone: regex },
      { mobile: regex },
      { street: regex },
      { postalCode: regex },
      { city: regex },
    ];
    addContactCustomerCondition(filter, contactCustomerObjectIds);
  }

  return filter;
}

function buildSitePipeline(query, contactCustomerObjectIds = []) {
  const siteMatch = { status: 'active', isDeleted: false };
  if (query.canton) siteMatch.canton = query.canton;
  if (query.postalCode) siteMatch.postalCode = query.postalCode;
  if (query.city) siteMatch.city = { $regex: escapeRegex(query.city), $options: 'i' };
  if (query.hasCoordinates === 'with') {
    siteMatch.latitude = { $ne: null };
    siteMatch.longitude = { $ne: null };
  }
  if (query.hasCoordinates === 'without') {
    siteMatch.$or = [{ latitude: null }, { longitude: null }];
  }

  const customerMatch = {
    'customer.isDeleted': false,
    'customer.status': 'active',
  };
  if (query.customerType !== 'all') customerMatch['customer.type'] = query.customerType;

  const pipeline = [
    { $match: siteMatch },
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

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    const searchConditions = [
      { name: regex },
      { siteNumber: regex },
      { street: regex },
      { postalCode: regex },
      { city: regex },
      { 'customer.name': regex },
      { 'customer.ownerName': regex },
      { 'customer.customerNumber': regex },
      { 'customer.email': regex },
      { 'customer.phone': regex },
      { 'customer.mobile': regex },
    ];
    if (contactCustomerObjectIds.length) {
      searchConditions.push({ customerId: { $in: contactCustomerObjectIds } });
    }
    pipeline.push({ $match: { $or: searchConditions } });
  }

  return pipeline;
}

function sortAddressEntries(a, b) {
  const customerCompare = (a.customer?.name || '').localeCompare(b.customer?.name || '', 'de-CH');
  if (customerCompare !== 0) return customerCompare;
  const typeCompare = a.addressType.localeCompare(b.addressType);
  if (typeCompare !== 0) return typeCompare;
  return (a.address?.label || '').localeCompare(b.address?.label || '', 'de-CH');
}

function emptyRelated() {
  return {
    projectCount: 0,
    orderCount: 0,
    assignmentCount: 0,
    jobCount: 0,
    firstProject: null,
    firstOrder: null,
    firstAssignment: null,
  };
}

function relationKey(row) {
  return String(row._id);
}

function mapFirstRelation(row, numberField, titleField = 'title') {
  if (!row?.firstId) return null;
  return {
    id: objectId(row.firstId),
    number: row.firstNumber || null,
    title: row.firstTitle || null,
    status: row.firstStatus || null,
    numberField,
    titleField,
  };
}

class AddressBookService {
  async list(params = {}) {
    const query = normalizeQuery(params);
    const includeBilling = query.addressType === 'all' || query.addressType === 'billing';
    const includeSites = query.addressType === 'all' || query.addressType === 'site' || query.addressType === 'delivery';
    const candidateLimit = Math.min((query.page * query.limit) + query.limit, MAX_CANDIDATES);
    const contactCustomerIds = query.search ? await this._findMatchingContactCustomerIds(query.search) : [];
    const contactCustomerObjectIds = contactCustomerIds.map(toObjectId).filter(Boolean);

    const [billingEntries, siteEntries, billingSummary, siteSummary] = await Promise.all([
      includeBilling ? this._listBillingEntries(query, contactCustomerObjectIds, candidateLimit) : Promise.resolve([]),
      includeSites ? this._listSiteEntries(query, contactCustomerObjectIds, candidateLimit) : Promise.resolve([]),
      includeBilling ? this._summarizeBilling(query, contactCustomerObjectIds) : Promise.resolve({ total: 0, byType: {} }),
      includeSites ? this._summarizeSites(query, contactCustomerObjectIds) : Promise.resolve({ total: 0, byType: {}, withCoordinates: 0 }),
    ]);

    const combined = [...billingEntries, ...siteEntries].sort(sortAddressEntries);
    const start = (query.page - 1) * query.limit;
    const entries = combined.slice(start, start + query.limit);
    await this._attachContactsAndRelations(entries);

    const total = billingSummary.total + siteSummary.total;
    return {
      data: entries,
      summary: {
        total,
        private: (billingSummary.byType.private || 0) + (siteSummary.byType.private || 0),
        business: (billingSummary.byType.business || 0) + (siteSummary.byType.business || 0),
        billing: billingSummary.total,
        site: siteSummary.total,
        delivery: siteSummary.total,
        withCoordinates: siteSummary.withCoordinates || 0,
      },
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.max(1, Math.ceil(total / query.limit)),
        hasNext: start + query.limit < total,
        hasPrev: query.page > 1,
      },
      filters: query,
    };
  }

  async _findMatchingContactCustomerIds(search) {
    const regex = { $regex: escapeRegex(search), $options: 'i' };
    const contacts = await Contact.find({
      $or: [
        { firstName: regex },
        { lastName: regex },
        { functionTitle: regex },
        { email: regex },
        { phone: regex },
        { mobile: regex },
      ],
    })
      .select('customerId')
      .limit(MAX_CANDIDATES)
      .lean();

    return [...new Set(contacts.map((contact) => objectId(contact.customerId)).filter(Boolean))];
  }

  async _listBillingEntries(query, contactCustomerObjectIds, limit) {
    const filter = buildCustomerFilter(query, contactCustomerObjectIds);
    if (!filter) return [];

    const customers = await Customer.find(filter)
      .select(CUSTOMER_SELECT)
      .sort({ name: 1, _id: 1 })
      .limit(limit)
      .lean();

    return customers.map((customer) => this._serializeBillingEntry(customer));
  }

  async _listSiteEntries(query, contactCustomerObjectIds, limit) {
    const pipeline = buildSitePipeline(query, contactCustomerObjectIds);
    pipeline.push(
      { $sort: { 'customer.name': 1, siteNumber: 1, name: 1, _id: 1 } },
      { $limit: limit },
      { $project: SITE_PROJECT },
    );

    const sites = await Site.aggregate(pipeline);
    return sites.map((site) => this._serializeSiteEntry(site));
  }

  async _summarizeBilling(query, contactCustomerObjectIds) {
    const filter = buildCustomerFilter(query, contactCustomerObjectIds);
    if (!filter) return { total: 0, byType: {} };

    const [total, byTypeRows] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.aggregate([
        { $match: filter },
        { $group: { _id: '$type', total: { $sum: 1 } } },
      ]),
    ]);

    return {
      total,
      byType: Object.fromEntries(byTypeRows.map((row) => [row._id, row.total])),
    };
  }

  async _summarizeSites(query, contactCustomerObjectIds) {
    const base = buildSitePipeline(query, contactCustomerObjectIds);
    const [totalRows, byTypeRows, withCoordinatesRows] = await Promise.all([
      Site.aggregate([...base, { $count: 'total' }]),
      Site.aggregate([...base, { $group: { _id: '$customer.type', total: { $sum: 1 } } }]),
      Site.aggregate([
        ...base,
        { $match: { latitude: { $ne: null }, longitude: { $ne: null } } },
        { $count: 'total' },
      ]),
    ]);

    return {
      total: totalRows[0]?.total || 0,
      byType: Object.fromEntries(byTypeRows.map((row) => [row._id, row.total])),
      withCoordinates: withCoordinatesRows[0]?.total || 0,
    };
  }

  _serializeBillingEntry(customer) {
    const customerId = objectId(customer);
    return {
      id: `customer:${customerId}:billing`,
      recordType: 'customer',
      addressType: 'billing',
      addressUsage: ['billing'],
      customer: this._serializeCustomer(customer),
      site: null,
      address: {
        label: 'Billing address',
        addressSupplement: customer.addressSupplement,
        street: customer.street,
        postalCode: customer.postalCode,
        city: customer.city,
        canton: customer.canton,
        country: customer.country,
        formatted: compactAddress(customer),
      },
      coordinates: null,
      contacts: [],
      primaryContact: null,
      contactCount: 0,
      related: emptyRelated(),
      updatedAt: customer.updatedAt,
    };
  }

  _serializeSiteEntry(site) {
    const siteId = objectId(site);
    const customer = site.customer || {};
    return {
      id: `site:${siteId}`,
      recordType: 'site',
      addressType: 'site',
      addressUsage: ['site', 'delivery'],
      customer: this._serializeCustomer(customer),
      site: {
        id: siteId,
        siteNumber: site.siteNumber,
        name: site.name,
        floorUnit: site.floorUnit,
        accessInstructions: site.accessInstructions,
        siteType: site.siteType,
        status: site.status,
      },
      address: {
        label: site.name,
        street: site.street,
        postalCode: site.postalCode,
        city: site.city,
        canton: site.canton,
        country: site.country,
        formatted: compactAddress(site),
      },
      coordinates: site.latitude != null && site.longitude != null
        ? { latitude: site.latitude, longitude: site.longitude }
        : null,
      contacts: [],
      primaryContact: null,
      contactCount: 0,
      related: emptyRelated(),
      updatedAt: site.updatedAt,
    };
  }

  _serializeCustomer(customer) {
    return {
      id: objectId(customer),
      customerNumber: customer.customerNumber,
      name: customer.name,
      ownerName: customer.ownerName,
      type: customer.type,
      street: customer.street,
      addressSupplement: customer.addressSupplement,
      postalCode: customer.postalCode,
      city: customer.city,
      canton: customer.canton,
      country: customer.country,
      phone: customer.phone,
      mobile: customer.mobile,
      email: customer.email,
      status: customer.status,
    };
  }

  async _attachContactsAndRelations(entries) {
    if (!entries.length) return entries;

    const customerIds = [...new Set(entries.map((entry) => entry.customer?.id).filter(Boolean))];
    const siteIds = [...new Set(entries.map((entry) => entry.site?.id).filter(Boolean))];
    const customerObjectIds = customerIds.map(toObjectId).filter(Boolean);
    const siteObjectIds = siteIds.map(toObjectId).filter(Boolean);

    const [contacts, relations] = await Promise.all([
      Contact.find({ customerId: { $in: customerObjectIds } })
        .select(CONTACT_SELECT)
        .sort({ isPrimary: -1, lastName: 1, firstName: 1, _id: 1 })
        .lean(),
      this._loadRelations(customerObjectIds, siteObjectIds),
    ]);

    const contactsByCustomer = new Map();
    for (const contact of contacts) {
      const key = objectId(contact.customerId);
      if (!contactsByCustomer.has(key)) contactsByCustomer.set(key, []);
      contactsByCustomer.get(key).push(this._serializeContact(contact));
    }

    for (const entry of entries) {
      const customerId = entry.customer?.id;
      const siteId = entry.site?.id;
      const customerContacts = contactsByCustomer.get(customerId) || [];
      const relation = this._resolveRelation(relations, customerId, siteId);
      entry.contacts = customerContacts.slice(0, 3);
      entry.primaryContact = customerContacts.find((contact) => contact.isPrimary) || customerContacts[0] || null;
      entry.contactCount = customerContacts.length;
      entry.related = relation;
    }

    return entries;
  }

  _serializeContact(contact) {
    return {
      id: objectId(contact),
      firstName: contact.firstName,
      lastName: contact.lastName,
      functionTitle: contact.functionTitle,
      phone: contact.phone,
      mobile: contact.mobile,
      email: contact.email,
      isPrimary: Boolean(contact.isPrimary),
      updatedAt: contact.updatedAt,
    };
  }

  async _loadRelations(customerObjectIds, siteObjectIds) {
    const [Project, Order, Assignment] = await Promise.all([
      import('../pm/project.model.js').then((module) => module.default),
      import('../qop/order.model.js').then((module) => module.default),
      import('../deploy/assignment.model.js').then((module) => module.default),
    ]);

    const [
      projectsByCustomer,
      projectsBySite,
      ordersByCustomer,
      assignmentsByCustomer,
      assignmentsBySite,
    ] = await Promise.all([
      this._aggregateRelation(Project, 'customerId', customerObjectIds, {
        numberField: 'projectNumber',
        titleField: 'name',
        statusField: 'status',
      }),
      this._aggregateRelation(Project, 'siteId', siteObjectIds, {
        numberField: 'projectNumber',
        titleField: 'name',
        statusField: 'status',
      }),
      this._aggregateRelation(Order, 'customerId', customerObjectIds, {
        numberField: 'orderNumber',
        titleField: 'title',
        statusField: 'status',
      }),
      this._aggregateRelation(Assignment, 'customerId', customerObjectIds, {
        numberField: 'assignmentNumber',
        titleField: 'title',
        statusField: 'status',
      }),
      this._aggregateRelation(Assignment, 'siteId', siteObjectIds, {
        numberField: 'assignmentNumber',
        titleField: 'title',
        statusField: 'status',
      }),
    ]);

    return {
      projectsByCustomer,
      projectsBySite,
      ordersByCustomer,
      assignmentsByCustomer,
      assignmentsBySite,
    };
  }

  async _aggregateRelation(Model, field, ids, { numberField, titleField, statusField }) {
    if (!ids.length) return new Map();

    const rows = await Model.aggregate([
      { $match: { [field]: { $in: ids }, isDeleted: false } },
      { $sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: `$${field}`,
          total: { $sum: 1 },
          firstId: { $first: '$_id' },
          firstNumber: { $first: `$${numberField}` },
          firstTitle: { $first: `$${titleField}` },
          firstStatus: { $first: `$${statusField}` },
        },
      },
    ]);

    return new Map(rows.map((row) => [
      relationKey(row),
      {
        count: row.total,
        first: mapFirstRelation(row, numberField, titleField),
      },
    ]));
  }

  _resolveRelation(relations, customerId, siteId) {
    const project = (siteId && relations.projectsBySite.get(siteId)) || relations.projectsByCustomer.get(customerId);
    const order = relations.ordersByCustomer.get(customerId);
    const assignment = (siteId && relations.assignmentsBySite.get(siteId)) || relations.assignmentsByCustomer.get(customerId);
    const orderCount = order?.count || 0;
    const assignmentCount = assignment?.count || 0;

    return {
      projectCount: project?.count || 0,
      orderCount,
      assignmentCount,
      jobCount: orderCount + assignmentCount,
      firstProject: project?.first || null,
      firstOrder: order?.first || null,
      firstAssignment: assignment?.first || null,
    };
  }
}

const addressBookService = new AddressBookService();
export default addressBookService;
