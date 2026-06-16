import SparePart from './sparePart.model.js';
import InstallationSparePart from './installationSparePart.model.js';
import InventoryMovement from './inventoryMovement.model.js';
import Customer from './customer.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  category: 'exact',
  isActive: 'boolean',
  supplierId: 'exact',
  manufacturer: 'exact',
};

class SparePartRepository {
  // --- Spare Part CRUD ---

  async create(data) {
    const sparePart = new SparePart(data);
    return sparePart.save();
  }

  async findById(id) {
    const doc = await SparePart.findById(id)
      .populate({ path: 'supplierId', select: 'name customerNumber' })
      .lean();
    if (!doc) return doc;
    const [enriched] = await this._attachProcurementSupplierFields([doc]);
    return enriched;
  }

  async findByIds(ids) {
    return SparePart.find({ _id: { $in: ids } }).lean();
  }

  async findByPartNumbers(partNumbers) {
    return SparePart.find({ partNumber: { $in: partNumbers } })
      .select('partNumber')
      .lean();
  }

  async insertMany(docs) {
    return SparePart.insertMany(docs, { ordered: false });
  }

  async bulkUpsert(docs) {
    const operations = docs.map(({ createdBy, ...doc }) => ({
      updateOne: {
        filter: { partNumber: doc.partNumber },
        update: {
          $set: doc,
          $setOnInsert: {
            createdBy,
          },
        },
        upsert: true,
      },
    }));
    return SparePart.bulkWrite(operations, { ordered: false });
  }

  async updateById(id, data) {
    return SparePart.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async incrementStock(id, quantity) {
    return SparePart.findByIdAndUpdate(
      id,
      { $inc: { currentStock: quantity } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async softDelete(id) {
    return SparePart.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const { stockStatus, ...safeFilters } = filters;
    const filter = {
      ...buildFilter(safeFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (stockStatus === 'low') {
      filter.$expr = { $lte: ['$currentStock', '$minStockLevel'] };
    } else if (stockStatus === 'ok') {
      filter.$expr = { $gt: ['$currentStock', '$minStockLevel'] };
    } else if (stockStatus === 'out') {
      filter.currentStock = 0;
    }

    if (search) {
      filter.$or = [
        { partNumber: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await SparePart.find(filter)
      .populate({ path: 'supplierId', select: 'name customerNumber' })
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    const response = buildCursorResponse(docs, limit, sortBy);
    response.data = await this._attachProcurementSupplierFields(response.data);
    return response;
  }

  async _attachProcurementSupplierFields(parts) {
    if (!parts.length) return parts;

    const missingPreferredIds = parts
      .filter((part) => !part.supplierId)
      .map((part) => part._id);
    if (!missingPreferredIds.length) {
      return parts.map((part) => ({
        ...part,
        preferredSupplier: part.supplierId || null,
        supplierName: part.supplierId?.name || null,
      }));
    }

    const latestRows = await InventoryMovement.aggregate([
      {
        $match: {
          sparePartId: { $in: missingPreferredIds },
          supplierId: { $ne: null },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$sparePartId',
          supplierId: { $first: '$supplierId' },
          lastPurchaseDate: { $first: '$createdAt' },
        },
      },
    ]);

    const supplierIds = latestRows.map((row) => row.supplierId);
    const suppliers = supplierIds.length
      ? await Customer.find({ _id: { $in: supplierIds } }).select('name customerNumber').lean()
      : [];
    const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));
    const latestByPart = new Map(latestRows.map((row) => [String(row._id), {
      supplier: supplierById.get(String(row.supplierId)) || null,
      lastPurchaseDate: row.lastPurchaseDate,
    }]));

    return parts.map((part) => {
      const latest = latestByPart.get(String(part._id));
      const preferred = part.supplierId || latest?.supplier || null;
      return {
        ...part,
        preferredSupplier: preferred,
        lastSupplierId: latest?.supplier || null,
        lastPurchaseDate: latest?.lastPurchaseDate || null,
        supplierName: preferred?.name || null,
      };
    });
  }

  async textSearch(term, limit = 20) {
    return SparePart.find(
      { $text: { $search: term } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .select('-__v')
      .lean();
  }

  async countByCategory() {
    return SparePart.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
  }

  // --- Installation ↔ SparePart junction ---

  async findByInstallationId(installationId) {
    return InstallationSparePart.find({ installationId })
      .populate({ path: 'sparePartId', select: 'partNumber name manufacturer category unitPrice currency unit currentStock' })
      .sort({ needsOrdering: -1, orderUrgency: -1, createdAt: -1 })
      .lean();
  }

  async linkToInstallation(data) {
    const link = new InstallationSparePart(data);
    return link.save();
  }

  async findInstallationLink(installationId, sparePartId) {
    return InstallationSparePart.findOne({ installationId, sparePartId })
      .populate({ path: 'sparePartId', select: 'partNumber name manufacturer category unitPrice currency unit currentStock' })
      .lean();
  }

  async updateInstallationLink(installationId, sparePartId, data) {
    return InstallationSparePart.findOneAndUpdate(
      { installationId, sparePartId },
      data,
      { returnDocument: 'after', runValidators: true },
    )
      .populate({ path: 'sparePartId', select: 'partNumber name manufacturer category unitPrice currency unit currentStock' })
      .lean();
  }

  async findOrderRequests({ cursor, limit = 50, status = 'open', urgency }) {
    const filter = {};
    if (status === 'open') {
      filter.orderStatus = { $in: ['requested', 'ordered'] };
    } else if (status && status !== 'all') {
      filter.orderStatus = status;
    } else {
      filter.orderStatus = { $in: ['requested', 'ordered', 'received', 'cancelled'] };
    }
    if (urgency) filter.orderUrgency = urgency;

    const docs = await InstallationSparePart.find({
      ...filter,
      ...buildCursorQuery(cursor, 'orderFlaggedAt', 'desc'),
    })
      .populate({ path: 'sparePartId', select: 'partNumber name manufacturer category unitPrice currency unit currentStock supplierPartNumber' })
      .populate({
        path: 'installationId',
        select: 'installationNumber type manufacturer model serialNumber siteId',
        populate: {
          path: 'siteId',
          select: 'siteNumber name street postalCode city customerId',
          populate: { path: 'customerId', select: 'customerNumber name' },
        },
      })
      .sort(buildCursorSort('orderFlaggedAt', 'desc'))
      .limit(limit + 1)
      .lean();

    return buildCursorResponse(docs, limit, 'orderFlaggedAt');
  }

  async unlinkFromInstallation(installationId, sparePartId) {
    return InstallationSparePart.findOneAndDelete({ installationId, sparePartId });
  }

  async countByInstallation(installationId) {
    return InstallationSparePart.countDocuments({ installationId });
  }
}

const sparePartRepository = new SparePartRepository();
export default sparePartRepository;
