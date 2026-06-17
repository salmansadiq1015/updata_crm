import Joi from 'joi';
import { objectId } from './commonSchemas.js';

export const catalogSnapshotJoi = Joi.object({
  catalogArticleId: objectId.allow(null),
  articleNumber: Joi.string().trim().max(50).allow('', null),
  articleName: Joi.string().trim().max(300).allow('', null),
  articleDescription: Joi.string().max(5000).allow('', null),
  unitOfMeasure: Joi.string().trim().max(20).allow('', null),
  snapshotBasePrice: Joi.number().min(0).allow(null),
  snapshotPurchasePrice: Joi.number().min(0).allow(null),
  snapshotSalesPrice: Joi.number().min(0).allow(null),
  snapshotCurrency: Joi.string().trim().max(3).allow('', null),
  catalogSource: Joi.string().valid('INTERNAL', 'IGH', 'SUPPLIER', 'MANUFACTURER', 'CUSTOM').allow(null),
  catalogConnectionId: objectId.allow(null),
  externalCatalogItemId: Joi.string().trim().max(100).allow('', null),
  supplierId: objectId.allow(null),
  supplierName: Joi.string().trim().max(255).allow('', null),
  manufacturerName: Joi.string().trim().max(255).allow('', null),
  manufacturerPartNumber: Joi.string().trim().max(100).allow('', null),
  productGroup: Joi.string().trim().max(100).allow('', null),
  availabilityStatus: Joi.string().valid('UNKNOWN', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED').allow(null),
  availableQuantity: Joi.number().min(0).allow(null),
  appliedMarkupPercent: Joi.number().min(-100).max(1000).allow(null),
  marginPercent: Joi.number().min(-100).max(100).allow(null),
  manualPriceOverride: Joi.boolean(),
  snapshotTakenAt: Joi.date().iso().allow(null),
}).allow(null);

export default catalogSnapshotJoi;
