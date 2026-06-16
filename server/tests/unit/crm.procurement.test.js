import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Customer, SparePart, InventoryMovement, PurchaseOrder, Role, User;
let procurementService, cacheManager;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/permission.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/counter.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/sparePart.model.js');
  await import('../../src/modules/crm/inventoryMovement.model.js');
  await import('../../src/modules/crm/purchaseOrder.model.js');
  await import('../../src/modules/crm/deliveryNoteOcrJob.model.js');

  Customer = mongoose.model('Customer');
  SparePart = mongoose.model('SparePart');
  InventoryMovement = mongoose.model('InventoryMovement');
  PurchaseOrder = mongoose.model('PurchaseOrder');
  Role = mongoose.model('Role');
  User = mongoose.model('User');

  ({ default: procurementService } = await import('../../src/modules/crm/procurement.service.js'));
  ({ default: cacheManager } = await import('../../src/shared/cache/CacheManager.js'));
});

afterEach(async () => {
  cacheManager.l1.flush();
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

let seqValue = 0;
function seq() {
  seqValue += 1;
  return seqValue;
}

async function seedUser() {
  const role = await Role.create({ name: `ProcurementRole${seq()}`, permissions: [] });
  return User.create({
    email: `procurement${seq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Procurement',
    lastName: 'User',
    role: role._id,
    status: 'active',
  });
}

async function seedSupplier(userId, overrides = {}) {
  const n = seq();
  return Customer.create({
    customerNumber: `SUP-T-${n}`,
    name: `Supplier ${n}`,
    type: 'business',
    street: 'Industriestrasse 1',
    postalCode: '8001',
    city: 'Zurich',
    country: 'CH',
    createdBy: userId,
    ...overrides,
  });
}

async function seedPart(userId, overrides = {}) {
  const n = seq();
  return SparePart.create({
    partNumber: `PART-${n}`,
    name: `Part ${n}`,
    category: 'filter',
    unit: 'pcs',
    unitPrice: 12,
    minStockLevel: 5,
    currentStock: 2,
    isActive: true,
    createdBy: userId,
    ...overrides,
  });
}

describe('CRM procurement service', () => {
  test('stats and low-stock list identify items that require reorder', async () => {
    const user = await seedUser();
    await seedPart(user._id, { partNumber: 'LOW-1', name: 'Low part', currentStock: 1, minStockLevel: 3 });
    await seedPart(user._id, { partNumber: 'OK-1', name: 'Healthy part', currentStock: 10, minStockLevel: 3 });

    const stats = await procurementService.getStats();
    const lowStock = await procurementService.listLowStock({ limit: 10, sortBy: 'name', sortOrder: 'asc' });

    expect(stats.totalArticles).toBe(2);
    expect(stats.lowStockCount).toBe(1);
    expect(lowStock.data.map((part) => part.partNumber)).toEqual(['LOW-1']);
    expect(lowStock.pagination.total).toBe(1);
  });

  test('low-stock list falls back to the most recent supplier from purchase history', async () => {
    const user = await seedUser();
    const supplier = await seedSupplier(user._id, { name: 'History Supplier AG' });
    const part = await seedPart(user._id, {
      partNumber: 'HIST-1',
      name: 'History part',
      currentStock: 1,
      minStockLevel: 5,
      supplierId: null,
    });
    await InventoryMovement.create({
      sparePartId: part._id,
      type: 'receipt',
      quantity: 1,
      stockBefore: 0,
      stockAfter: 1,
      unit: 'pcs',
      supplierId: supplier._id,
      referenceType: 'purchase_order',
      createdBy: user._id,
    });

    const lowStock = await procurementService.listLowStock({ limit: 10, sortBy: 'name', sortOrder: 'asc' });

    expect(lowStock.data[0].partNumber).toBe('HIST-1');
    expect(lowStock.data[0].supplierName).toBe('History Supplier AG');
    expect(lowStock.data[0].preferredSupplier.name).toBe('History Supplier AG');
  });

  test('purchase-order receipt updates stock and writes an inventory movement', async () => {
    const user = await seedUser();
    const supplier = await seedSupplier(user._id);
    const part = await seedPart(user._id, { partNumber: 'REC-1', name: 'Receipt filter', currentStock: 2, minStockLevel: 4 });

    const order = await procurementService.createPurchaseOrder({
      supplierId: supplier._id.toString(),
      items: [{
        sparePartId: part._id.toString(),
        name: part.name,
        partNumber: part.partNumber,
        quantity: 3,
        unitPrice: 20,
        unit: 'pcs',
      }],
    }, user._id);

    const received = await procurementService.receivePurchaseOrder(order._id, {
      deliveryNoteNumber: 'DN-100',
      items: [{
        itemId: order.items[0]._id.toString(),
        name: part.name,
        quantity: 3,
        receivedQuantity: 3,
      }],
    }, user._id);

    const updatedPart = await SparePart.findById(part._id).lean();
    const movements = await InventoryMovement.find({ sparePartId: part._id }).lean();
    const storedOrder = await PurchaseOrder.findById(order._id).lean();

    expect(received.status).toBe('received');
    expect(storedOrder.status).toBe('received');
    expect(storedOrder.items[0].receivedQuantity).toBe(3);
    expect(updatedPart.currentStock).toBe(5);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: 'receipt',
      quantity: 3,
      stockBefore: 2,
      stockAfter: 5,
      referenceType: 'purchase_order',
      deliveryNoteNumber: 'DN-100',
    });
  });

  test('goods issue cannot create negative stock and valid issue is tracked', async () => {
    const user = await seedUser();
    const part = await seedPart(user._id, { currentStock: 2, minStockLevel: 1 });

    await expect(procurementService.adjustStock(part._id, {
      type: 'out',
      quantity: 3,
      reason: 'Technician van issue',
    }, user._id)).rejects.toThrow('Insufficient stock');

    await procurementService.adjustStock(part._id, {
      type: 'out',
      quantity: 2,
      reason: 'Technician van issue',
    }, user._id);

    const updatedPart = await SparePart.findById(part._id).lean();
    const movement = await InventoryMovement.findOne({ sparePartId: part._id }).lean();

    expect(updatedPart.currentStock).toBe(0);
    expect(movement).toMatchObject({
      type: 'out',
      quantity: -2,
      stockBefore: 2,
      stockAfter: 0,
      reason: 'Technician van issue',
    });
  });

  test('delivery-note OCR confirmation receives matched inventory items', async () => {
    const user = await seedUser();
    const part = await seedPart(user._id, { partNumber: 'OCR-1', name: 'OCR filter', currentStock: 0, minStockLevel: 2 });

    const upload = await procurementService.uploadDeliveryNote({
      originalname: 'delivery-note.txt',
      mimetype: 'text/plain',
      size: 64,
      buffer: Buffer.from('Delivery note: DN-OCR-1\nSupplier: Test Supplier\nPart: OCR-1 Qty: 4 pcs'),
    }, {}, user._id);

    expect(upload.items).toHaveLength(1);
    expect(String(upload.items[0].sparePartId)).toBe(String(part._id));

    const confirmed = await procurementService.confirmDeliveryNoteOcr(upload.jobId, {
      deliveryNoteNumber: 'DN-OCR-1',
      items: upload.items.map((item) => ({
        sparePartId: item.sparePartId.toString(),
        partNumber: item.partNumber,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      })),
    }, user._id);

    const updatedPart = await SparePart.findById(part._id).lean();
    const movement = await InventoryMovement.findOne({ deliveryNoteJobId: upload.jobId }).lean();

    expect(confirmed.status).toBe('confirmed');
    expect(updatedPart.currentStock).toBe(4);
    expect(movement).toMatchObject({
      type: 'receipt',
      quantity: 4,
      stockBefore: 0,
      stockAfter: 4,
      referenceType: 'delivery_note',
      deliveryNoteNumber: 'DN-OCR-1',
    });
  });
});
