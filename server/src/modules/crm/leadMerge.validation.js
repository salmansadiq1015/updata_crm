import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { MERGEABLE_FIELDS } from './leadMerge.service.js';
import { MERGE_STATUSES } from './leadMerge.model.js';

const winner = Joi.string().valid('survivor', 'loser');

export const listDuplicateGroups = {
  query: Joi.object({
    minConfidence: Joi.number().min(0).max(1).default(0),
    limit: Joi.number().integer().min(1).max(200).default(50),
  }),
};

export const candidateIdParam = { params: Joi.object({ id: objectId.required() }) };

export const dismissCandidate = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ reason: Joi.string().trim().max(500).allow('', null) }),
};

export const mergePreview = {
  query: Joi.object({ survivorId: objectId.required(), loserId: objectId.required() }),
};

export const createMerge = {
  body: Joi.object({
    survivorId: objectId.required(),
    loserId: objectId.required().invalid(Joi.ref('survivorId')).messages({ 'any.invalid': 'loserId must differ from survivorId' }),
    candidateId: objectId.allow(null),
    fieldSelections: Joi.object({
      ...Object.fromEntries(MERGEABLE_FIELDS.filter((f) => f !== 'notes').map((f) => [f, winner])),
      notes: Joi.string().valid('survivor', 'loser', 'both'),
    }).default({}),
  }),
};

export const mergeIdParam = { params: Joi.object({ id: objectId.required() }) };

export const listMerges = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    cursor: objectId.allow('', null),
    status: Joi.string().valid(...MERGE_STATUSES),
    leadId: objectId,
  }),
};
