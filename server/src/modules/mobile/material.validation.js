import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { catalogSnapshotJoi } from '../../shared/validation/catalogSnapshot.schema.js';

const catalogSource = Joi.string().valid(
  'IGH',
  'INTERNAL',
  'CUSTOM',
  'catalog',
  'manual',
).default('CUSTOM');

const materialBody = {
  articleCode: Joi.string().trim().max(50).allow('', null),
  catalogItemId: Joi.string().trim().max(50).allow('', null),
  catalogSnapshot: catalogSnapshotJoi,
  catalogSource,
  description: Joi.string().trim().max(300).required(),
  quantity: Joi.number().min(0).required(),
  unit: Joi.string().trim().max(20).required(),
  sortOrder: Joi.number().integer().min(0),
  // Accepted for mobile compatibility but ignored server-side in this route.
  unitPrice: Joi.number().min(0),
};

export const listMaterialsSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createMaterialSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(materialBody),
};

export const updateMaterialSchema = {
  params: Joi.object({
    id: objectId.required(),
    materialId: objectId.required(),
  }),
  body: Joi.object({
    ...materialBody,
    description: materialBody.description.optional(),
    quantity: materialBody.quantity.optional(),
    unit: materialBody.unit.optional(),
  }).min(1),
};

export const deleteMaterialSchema = {
  params: Joi.object({
    id: objectId.required(),
    materialId: objectId.required(),
  }),
};
