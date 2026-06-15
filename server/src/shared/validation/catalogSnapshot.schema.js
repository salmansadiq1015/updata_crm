import Joi from 'joi';
import { objectId } from './commonSchemas.js';

export const catalogSnapshotJoi = Joi.object({
  catalogArticleId: objectId.allow(null),
  articleNumber: Joi.string().trim().max(50).allow('', null),
  articleName: Joi.string().trim().max(300).allow('', null),
  articleDescription: Joi.string().max(5000).allow('', null),
  unitOfMeasure: Joi.string().trim().max(20).allow('', null),
  snapshotBasePrice: Joi.number().min(0).allow(null),
  snapshotCurrency: Joi.string().trim().max(3).allow('', null),
  catalogSource: Joi.string().valid('INTERNAL', 'IGH', 'CUSTOM').allow(null),
  snapshotTakenAt: Joi.date().iso().allow(null),
}).allow(null);

export default catalogSnapshotJoi;
