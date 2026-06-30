import InventoryAccountingEntry from './inventoryAccountingEntry.model.js';
import SparePart from '../crm/sparePart.model.js';
import InventoryMovement from '../crm/inventoryMovement.model.js';

class InventoryAccountingRepository {
  async findStockParts(filters = {}) {
    const query = {
      isDeleted: false,
      isActive: true,
      currentStock: { $gt: 0 },
    };
    if (filters.currency) query.currency = filters.currency;
    if (filters.category) query.category = filters.category;

    return SparePart.find(query)
      .sort({ category: 1, name: 1, _id: 1 })
      .limit(filters.limit || 1000)
      .lean();
  }

  async findMovementById(id) {
    return InventoryMovement.findById(id)
      .populate({ path: 'sparePartId', select: 'partNumber name category unitPrice currency unit currentStock' })
      .lean();
  }

  async findUnpostedMovements(filters = {}) {
    const posted = await InventoryAccountingEntry.distinct('movementId');
    const query = { _id: { $nin: posted } };
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }
    if (filters.type) query.type = filters.type;

    return InventoryMovement.find(query)
      .populate({ path: 'sparePartId', select: 'partNumber name category unitPrice currency unit currentStock' })
      .sort({ createdAt: 1, _id: 1 })
      .limit(filters.limit || 250)
      .lean();
  }

  async findEntryByMovement(movementId) {
    return InventoryAccountingEntry.findOne({ movementId }).lean();
  }

  async createEntry(data, options = {}) {
    const entry = new InventoryAccountingEntry(data);
    return entry.save({ session: options.session });
  }

  async updateEntry(id, data, options = {}) {
    return InventoryAccountingEntry.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }

  async listEntries(filters = {}) {
    const query = {};
    if (filters.currency) query.currency = filters.currency;
    if (filters.costingMethod) query.costingMethod = filters.costingMethod;
    return InventoryAccountingEntry.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(filters.limit || 100)
      .lean();
  }
}

const inventoryAccountingRepository = new InventoryAccountingRepository();
export default inventoryAccountingRepository;
