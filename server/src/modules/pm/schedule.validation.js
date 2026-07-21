import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createEntrySchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().required().trim().max(255),
    entryType: Joi.string().valid('PHASE', 'MILESTONE').required(),
    startDate: Joi.date().iso().when('entryType', {
      is: 'PHASE',
      then: Joi.date().iso().required(),
      otherwise: Joi.date().iso().allow(null),
    }),
    endDate: Joi.date().iso().when('entryType', {
      is: 'PHASE',
      then: Joi.date().iso().required(),
      otherwise: Joi.date().iso().allow(null),
    }),
    milestoneDate: Joi.date().iso().when('entryType', {
      is: 'MILESTONE',
      then: Joi.date().iso().required(),
      otherwise: Joi.date().iso().allow(null),
    }),
    responsibleType: Joi.string().valid('INTERNAL_TEAM', 'PARTNER_COMPANY').allow(null),
    responsibleTeamId: objectId.allow(null),
    partnerCompanyId: objectId.allow(null),
    predecessorId: objectId.allow(null),
    notes: Joi.string().max(5000).allow(null, ''),
    sortOrder: Joi.number().integer().min(0),
  }),
};

export const updateEntrySchema = {
  params: Joi.object({ entryId: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(255),
    entryType: Joi.string().valid('PHASE', 'MILESTONE'),
    startDate: Joi.date().iso().allow(null),
    endDate: Joi.date().iso().allow(null),
    milestoneDate: Joi.date().iso().allow(null),
    responsibleType: Joi.string().valid('INTERNAL_TEAM', 'PARTNER_COMPANY').allow(null),
    responsibleTeamId: objectId.allow(null),
    partnerCompanyId: objectId.allow(null),
    predecessorId: objectId.allow(null),
    status: Joi.string().valid('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'WAIVED'),
    notes: Joi.string().max(5000).allow(null, ''),
    sortOrder: Joi.number().integer().min(0),
  }).min(1),
};

export const deleteEntrySchema = {
  params: Joi.object({ entryId: objectId.required() }),
};

export const sendConfirmationSchema = {
  params: Joi.object({ entryId: objectId.required() }),
  body: Joi.object({
    partnerContactEmail: Joi.string().email().required().trim().lowercase(),
    partnerCompanyId: objectId.required(),
    partnerName: Joi.string().max(255).allow(null, ''),
    siteAddress: Joi.string().max(500).allow(null, ''),
    contactPerson: Joi.string().max(255).allow(null, ''),
    acknowledgeShortNotice: Joi.boolean().default(false),
  }),
};

export const conflictsSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const bulkConfirmationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    items: Joi.array().min(1).max(100).items(
      Joi.object({
        entryId: objectId.required(),
        partnerContactEmail: Joi.string().email().required().trim().lowercase(),
        partnerCompanyId: objectId.required(),
        partnerName: Joi.string().max(255).allow(null, ''),
        siteAddress: Joi.string().max(500).allow(null, ''),
        contactPerson: Joi.string().max(255).allow(null, ''),
        acknowledgeShortNotice: Joi.boolean().default(false),
      }),
    ).required(),
  }),
};

export const exportScheduleSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    format: Joi.string().valid('pdf', 'ical', 'excel').default('pdf'),
  }),
};

export const transferScheduleSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    target: Joi.string().valid('einsatzplanung', 'grobplanung').default('einsatzplanung'),
    // Grobplanung only: manual override of the weekly allocation; omitted =
    // derive it from each phase's working-day coverage of the week.
    allocationPercent: Joi.number().valid(25, 50, 75, 100),
  }),
};

export const updateConfirmationSchema = {
  params: Joi.object({ confId: objectId.required() }),
  body: Joi.object({
    confirmationStatus: Joi.string()
      .valid('CONFIRMED', 'DECLINED', 'ALTERNATIVE_PROPOSED')
      .required(),
    responseNotes: Joi.string().max(2000).allow(null, ''),
  }),
};
