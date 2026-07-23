import Customer from './customer.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

// Build a regex pattern where each letter matches its accented variants too.
// "mull" → "[mM][uüùûú][lL][lL]" so it matches "Müller", "muller", etc.
// Combined with $options:'i' this gives full accent+case insensitive search.
const ACCENT_GROUPS = [
  'aäàâáå', 'oöòôó', 'uüùûú', 'eèêéë', 'iìîíï', 'cç', 'nñ', 'sß',
];
const ACCENT_MAP = {};
for (const group of ACCENT_GROUPS) {
  const cls = `[${group}]`;
  for (const ch of group) ACCENT_MAP[ch] = cls;
}

function accentSafeRegex(term) {
  let result = '';
  for (const ch of term) {
    const lower = ch.toLowerCase();
    if (ACCENT_MAP[lower]) result += ACCENT_MAP[lower];
    else if (/[.*+?^${}()|[\]\\]/.test(ch)) result += `\\${ch}`;
    else result += ch;
  }
  return result;
}

const ALLOWED_FILTERS = {
  status: 'exact',
  type: 'exact',
  postalCode: 'exact',
  canton: 'exact',
  newsletterOptIn: 'boolean',
};

// Derive a customer's sales status from the set of its quotation statuses.
// Priority when outcomes are mixed: acceptance > only offer received > rejection.
function deriveSalesStatus(statuses = []) {
  const set = new Set(statuses);
  if (set.has('ACCEPTED') || set.has('CONVERTED')) return 'zusage';
  if (set.has('SENT') || set.has('VIEWED')) return 'offer_received';
  if (set.has('DECLINED')) return 'absage';
  return null;
}

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

  // Sales status is derived from the customer's quotations (not a stored field).
  // Priority when a customer has mixed outcomes: Zusage > only offer received > Absage.
  async _customerIdsBySalesStatus(salesStatus) {
    const Quotation = (await import('../qop/quotation.model.js')).default;
    const base = { isDeleted: { $ne: true } };
    const accepted = await Quotation.distinct('customerId', { ...base, status: { $in: ['ACCEPTED', 'CONVERTED'] } });
    if (salesStatus === 'zusage') return accepted;

    const acceptedSet = new Set(accepted.map(String));
    const open = await Quotation.distinct('customerId', { ...base, status: { $in: ['SENT', 'VIEWED'] } });
    if (salesStatus === 'offer_received') {
      return open.filter((id) => !acceptedSet.has(String(id)));
    }
    if (salesStatus === 'absage') {
      const openSet = new Set(open.map(String));
      const declined = await Quotation.distinct('customerId', { ...base, status: 'DECLINED' });
      return declined.filter((id) => !acceptedSet.has(String(id)) && !openSet.has(String(id)));
    }
    return [];
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const { salesStatus, ...listFilters } = filters;
    const filter = {
      ...buildFilter(listFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (salesStatus) {
      filter._id = { $in: await this._customerIdsBySalesStatus(salesStatus) };
    }

    if (search) {
      const safePattern = accentSafeRegex(search);
      filter.$or = [
        { name: { $regex: safePattern, $options: 'i' } },
        { ownerName: { $regex: safePattern, $options: 'i' } },
        { customerNumber: { $regex: safePattern, $options: 'i' } },
        { uidNumber: { $regex: safePattern, $options: 'i' } },
        { vatNumber: { $regex: safePattern, $options: 'i' } },
        { email: { $regex: safePattern, $options: 'i' } },
        { city: { $regex: safePattern, $options: 'i' } },
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
    const [Site, Installation, MaintenanceInterval, Contact, Quotation] = await Promise.all([
      import('./site.model.js').then((module) => module.default),
      import('./installation.model.js').then((module) => module.default),
      import('./maintenanceInterval.model.js').then((module) => module.default),
      import('./contact.model.js').then((module) => module.default),
      import('../qop/quotation.model.js').then((module) => module.default),
    ]);

    const [siteCounts, installationCounts, lastServiceRows, primaryContacts, quotationStatusRows] = await Promise.all([
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
      Quotation.aggregate([
        { $match: { customerId: { $in: customerIds }, isDeleted: { $ne: true } } },
        { $group: { _id: '$customerId', statuses: { $addToSet: '$status' } } },
      ]),
    ]);

    const siteCountByCustomer = new Map(siteCounts.map((row) => [String(row._id), row.total]));
    const installationCountByCustomer = new Map(installationCounts.map((row) => [String(row._id), row.total]));
    const lastServiceByCustomer = new Map(lastServiceRows.map((row) => [String(row._id), row.lastServiceDate]));
    const salesStatusByCustomer = new Map(quotationStatusRows.map((row) => [String(row._id), deriveSalesStatus(row.statuses)]));
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
        salesStatus: salesStatusByCustomer.get(key) || null,
        primaryContact,
        primaryContactName: primaryContact?.fullName || null,
        primaryContactEmail: primaryContact?.email || null,
        primaryContactPhone: primaryContact?.phone || primaryContact?.mobile || null,
      };
    });
  }

  async findDuplicates(name, postalCode) {
    const raw = (name || '').trim();
    if (!raw) return [];

    const words = raw.split(/\s+/).filter((w) => w.length >= 2);

    // Build multiple match strategies (accent-insensitive):
    // 1. Full name (case+accent insensitive substring match)
    // 2. Each word individually (catches "Max" in "Max Muster AG")
    const conditions = [{ name: { $regex: accentSafeRegex(raw), $options: 'i' } }];
    for (const word of words) {
      conditions.push({ name: { $regex: accentSafeRegex(word), $options: 'i' } });
    }

    const filter = { $or: conditions };
    if (postalCode) filter.postalCode = postalCode;

    const candidates = await Customer.find(filter)
      .select('_id customerNumber name postalCode city')
      .limit(20)
      .lean();

    // Score candidates by similarity: prefer exact/close matches
    const inputLower = raw.toLowerCase();
    const scored = candidates.map((c) => {
      const candidateLower = (c.name || '').toLowerCase();
      let score = 0;
      // Exact match
      if (candidateLower === inputLower) score = 100;
      // One contains the other
      else if (candidateLower.includes(inputLower) || inputLower.includes(candidateLower)) score = 80;
      // Word overlap
      else {
        const inputWords = inputLower.split(/\s+/);
        const candidateWords = candidateLower.split(/\s+/);
        const matches = inputWords.filter((w) => candidateWords.some((cw) => cw.includes(w) || w.includes(cw)));
        score = Math.round((matches.length / Math.max(inputWords.length, 1)) * 60);
      }
      return { ...c, _score: score };
    });

    return scored
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5)
      .map(({ _score, ...rest }) => rest);
  }

  /**
   * Picker-facing search. Deactivated customers are excluded by default: they
   * must not be selectable when creating projects, sites or documents, while
   * staying fully visible in the customer list, which goes through
   * findWithCursor instead. Filters that need them pass includeInactive.
   */
  async textSearch(searchTerm, limit = 25, { includeInactive = false } = {}) {
    const raw = (searchTerm || '').trim();
    if (!raw) return [];

    // Split into individual words and escape regex characters.
    const words = raw.split(/\s+/).filter((w) => w.length >= 1);
    if (!words.length) return [];

    const searchFields = ['name', 'ownerName', 'customerNumber', 'email', 'city', 'street', 'phone', 'mobile'];

    // Each word must match at least one field (AND across words).
    // accentSafeRegex makes "mull" match "Müller", "uber" match "Über", etc.
    const wordConditions = words.map((word) => {
      const regex = { $regex: accentSafeRegex(word), $options: 'i' };
      return { $or: searchFields.map((field) => ({ [field]: regex })) };
    });

    const matchWords = wordConditions.length === 1 ? wordConditions[0] : { $and: wordConditions };
    const filter = includeInactive ? matchWords : { ...matchWords, status: { $ne: 'inactive' } };

    return Customer.find(filter)
      .sort({ name: 1 })
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
      { status: 'inactive' },
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

  /**
   * Customers are deactivated, never soft-deleted: they stay listed and can be
   * reactivated. Setting isDeleted here would hide them behind the pre-find
   * hook with no way back through the UI.
   */
  async bulkDeactivate(ids) {
    const result = await Customer.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: { status: 'inactive' } },
    );
    return result.modifiedCount;
  }

  async findByIds(ids) {
    return Customer.find({ _id: { $in: ids }, isDeleted: false }).lean();
  }

  async countAll() {
    return Customer.countDocuments({ isDeleted: false });
  }

  /**
   * Return ALL customers (including soft-deleted) with activity counts for the
   * data-cleanup admin view. Uses aggregation to $lookup related collections.
   */
  async cleanupAudit() {
    return Customer.aggregate([
      // Include ALL customers (even soft-deleted) for cleanup review
      { $lookup: { from: 'sites', localField: '_id', foreignField: 'customerId', pipeline: [{ $match: { isDeleted: { $ne: true } } }, { $project: { _id: 1 } }], as: '_sites' } },
      { $lookup: { from: 'contacts', localField: '_id', foreignField: 'customerId', pipeline: [{ $match: { isDeleted: { $ne: true } } }, { $project: { _id: 1 } }], as: '_contacts' } },
      { $lookup: { from: 'quotations', localField: '_id', foreignField: 'customerId', pipeline: [{ $match: { isDeleted: { $ne: true } } }, { $project: { _id: 1, status: 1 } }], as: '_quotations' } },
      { $lookup: { from: 'orders', localField: '_id', foreignField: 'customerId', pipeline: [{ $match: { isDeleted: { $ne: true } } }, { $project: { _id: 1 } }], as: '_orders' } },
      { $lookup: { from: 'invoices', localField: '_id', foreignField: 'customerId', pipeline: [{ $match: { isDeleted: { $ne: true } } }, { $project: { _id: 1 } }], as: '_invoices' } },
      {
        $project: {
          customerNumber: 1,
          name: 1,
          type: 1,
          status: 1,
          isDeleted: 1,
          city: 1,
          createdAt: 1,
          sitesCount: { $size: '$_sites' },
          contactsCount: { $size: '$_contacts' },
          quotationsCount: { $size: '$_quotations' },
          ordersCount: { $size: '$_orders' },
          invoicesCount: { $size: '$_invoices' },
          hasDeclined: {
            $gt: [{ $size: { $filter: { input: '$_quotations', cond: { $eq: ['$$this.status', 'DECLINED'] } } } }, 0],
          },
          totalActivity: {
            $add: [{ $size: '$_sites' }, { $size: '$_contacts' }, { $size: '$_quotations' }, { $size: '$_orders' }, { $size: '$_invoices' }],
          },
        },
      },
      { $sort: { totalActivity: 1, createdAt: 1 } },
    ]);
  }
}

const customerRepository = new CustomerRepository();
export default customerRepository;
