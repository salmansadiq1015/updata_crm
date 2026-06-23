import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const BUILT_IN_TEMPLATE_TYPES = [
  'quotation', 'order_confirmation', 'invoice_standard', 'invoice_advance',
  'invoice_final', 'cover_letter', 'service_report', 'inspection_certificate',
  'project_appointment_confirmation', 'project_status_report',
  'project_completion_certificate',
];
const TEMPLATE_TYPE_PATTERN = /^[a-z][a-z0-9_-]{1,79}$/;
const templateTypeSchema = Joi.string().trim().lowercase().max(80).pattern(TEMPLATE_TYPE_PATTERN)
  .messages({ 'string.pattern.base': 'Template type must be a lowercase slug, e.g. service_report' });

const layoutSchema = Joi.object({
  pageSize: Joi.string().valid('A4', 'Letter'),
  orientation: Joi.string().valid('portrait', 'landscape'),
  margins: Joi.object({
    top:    Joi.number().integer().min(0).max(50),
    bottom: Joi.number().integer().min(0).max(50),
    left:   Joi.number().integer().min(0).max(50),
    right:  Joi.number().integer().min(0).max(50),
  }).messages({ 'number.integer': 'Margins must be set in whole millimetres (1mm increments)' }),
  headerHeight: Joi.number().min(0),
  footerHeight: Joi.number().min(0),
});

const sectionSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  type: Joi.string().valid('header', 'body', 'table', 'totals', 'deductions', 'terms', 'qr_bill', 'report', 'footer', 'custom').required(),
  position: Joi.number().required(),
  isVisible: Joi.boolean(),
  isConditional: Joi.boolean(),
  conditionField: Joi.string().allow(null, ''),
  config: Joi.object(),
});

const textBlocksSchema = Joi.object({
  de: Joi.object({
    introduction: Joi.string().max(5000).allow('', null),
    terms: Joi.string().max(10000).allow('', null),
    footer: Joi.string().max(2000).allow('', null),
    emailSubject: Joi.string().max(500).allow('', null),
    emailBody: Joi.string().max(10000).allow('', null),
  }),
  fr: Joi.object({
    introduction: Joi.string().max(5000).allow('', null),
    terms: Joi.string().max(10000).allow('', null),
    footer: Joi.string().max(2000).allow('', null),
    emailSubject: Joi.string().max(500).allow('', null),
    emailBody: Joi.string().max(10000).allow('', null),
  }),
  it: Joi.object({
    introduction: Joi.string().max(5000).allow('', null),
    terms: Joi.string().max(10000).allow('', null),
    footer: Joi.string().max(2000).allow('', null),
    emailSubject: Joi.string().max(500).allow('', null),
    emailBody: Joi.string().max(10000).allow('', null),
  }),
  en: Joi.object({
    introduction: Joi.string().max(5000).allow('', null),
    terms: Joi.string().max(10000).allow('', null),
    footer: Joi.string().max(2000).allow('', null),
    emailSubject: Joi.string().max(500).allow('', null),
    emailBody: Joi.string().max(10000).allow('', null),
  }),
});

const tableColumnsSchema = Joi.array().items(
  Joi.object({
    field: Joi.string().required(),
    label: Joi.object({
      de: Joi.string(),
      fr: Joi.string(),
      it: Joi.string(),
      en: Joi.string(),
    }),
    widthPercent: Joi.number().min(1).max(100).required(),
    alignment: Joi.string().valid('left', 'center', 'right'),
    format: Joi.string().valid('text', 'number', 'currency', 'percent', 'date'),
  }),
).custom((cols, helpers) => {
  if (!cols || cols.length === 0) return cols;
  const sum = cols.reduce((s, c) => s + (c.widthPercent || 0), 0);
  if (Math.abs(sum - 100) > 1) {
    return helpers.error('any.invalid', { message: 'Column widths must sum to 100%' });
  }
  return cols;
}).messages({ 'any.invalid': 'Column widths must sum to 100%' });

const draftTemplateSchema = Joi.object({
  templateType: templateTypeSchema,
  name: Joi.string().trim().max(255),
  description: Joi.string().max(1000).allow('', null),
  isActive: Joi.boolean(),
  currentVersion: Joi.number().integer().min(1),
  layout: layoutSchema,
  sections: Joi.array().items(sectionSchema),
  textBlocks: textBlocksSchema,
  tableColumns: tableColumnsSchema,
});

export const listTemplatesSchema = {
  query: cursorPagination.keys({
    templateType: templateTypeSchema,
    isActive: Joi.boolean(),
    search: Joi.string().trim().max(100),
  }),
};

export const templateIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const updateTemplateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    changeDescription: Joi.string().max(1000).required(),
    expectedVersion: Joi.number().integer().min(1),
    name: Joi.string().trim().max(255),
    description: Joi.string().max(1000).allow('', null),
    isActive: Joi.boolean(),
    layout: layoutSchema,
    sections: Joi.array().items(sectionSchema),
    textBlocks: textBlocksSchema,
    tableColumns: tableColumnsSchema,
  }).min(1),
};

export const approvalActionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    note: Joi.string().max(1000).allow('', null),
  }).default({}),
};

export const rejectTemplateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().trim().min(1).max(1000).required(),
  }),
};

export const versionParamSchema = {
  params: Joi.object({
    id: objectId.required(),
    version: Joi.number().integer().min(1).required(),
  }),
};

export const revertTemplateSchema = {
  params: Joi.object({
    id: objectId.required(),
    version: Joi.number().integer().min(1).required(),
  }),
  body: Joi.object({
    expectedVersion: Joi.number().integer().min(1),
  }).default({}),
};

export const compareVersionsSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    fromVersion: Joi.number().integer().min(1).required(),
    toVersion: Joi.number().integer().min(1).required(),
  }),
};

export const previewSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    sampleData: Joi.object().default({}),
    language: Joi.string().valid('de', 'fr', 'it', 'en').default('de'),
    draftTemplate: draftTemplateSchema,
  }),
};

export const versionPreviewSchema = {
  params: Joi.object({
    id: objectId.required(),
    version: Joi.number().integer().min(1).required(),
  }),
  body: Joi.object({
    sampleData: Joi.object().default({}),
    language: Joi.string().valid('de', 'fr', 'it', 'en').default('de'),
  }),
};

export const createTemplateSchema = {
  body: Joi.object({
    templateType: templateTypeSchema.required(),
    name: Joi.string().trim().max(255).required(),
    description: Joi.string().max(1000).allow('', null),
    isActive: Joi.boolean(),
    layout: Joi.object({
      pageSize: Joi.string().valid('A4', 'Letter').default('A4'),
      orientation: Joi.string().valid('portrait', 'landscape').default('portrait'),
      margins: Joi.object({ top: Joi.number().integer().min(0).max(50).default(25), bottom: Joi.number().integer().min(0).max(50).default(20), left: Joi.number().integer().min(0).max(50).default(20), right: Joi.number().integer().min(0).max(50).default(15) }).messages({ 'number.integer': 'Margins must be set in whole millimetres (1mm increments)' }),
      headerHeight: Joi.number().default(45),
      footerHeight: Joi.number().default(30),
    }),
    sections: Joi.array().items(sectionSchema),
    textBlocks: Joi.object(),
    tableColumns: tableColumnsSchema,
  }),
};
