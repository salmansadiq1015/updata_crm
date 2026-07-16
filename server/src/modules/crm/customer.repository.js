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

  async textSearch(searchTerm, limit = 25) {
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

    const filter = wordConditions.length === 1 ? wordConditions[0] : { $and: wordConditions };

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
