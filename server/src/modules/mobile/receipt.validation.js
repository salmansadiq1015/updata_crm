import Joi from 'joi';

export const uploadReceiptSchema = {
  body: Joi.object({
    notes: Joi.string().trim().max(1000).allow('', null),
    projectReference: Joi.string().trim().max(120).allow('', null),
    supplierName: Joi.string().trim().max(200).allow('', null),
    receiptDate: Joi.date().iso().allow(null),
    amount: Joi.number().min(0).allow(null),
    vat: Joi.number().min(0).allow(null),
    receiptType: Joi.string().valid('MATERIAL', 'TRAVEL', 'MEAL', 'SERVICE', 'TOOLS', 'OTHER').allow(null),
    accountingCategory: Joi.string().trim().max(120).allow('', null),
    projectId: Joi.string().hex().length(24).allow('', null),
    customerId: Joi.string().hex().length(24).allow('', null),
    employeeId: Joi.string().hex().length(24).allow('', null),
    autoAssignmentStatus: Joi.string().valid('PENDING_REVIEW', 'CONFIRMED', 'AUTO_ASSIGNED').default('CONFIRMED'),
  }),
};
