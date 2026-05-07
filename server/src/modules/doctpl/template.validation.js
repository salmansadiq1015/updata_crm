import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const TEMPLATE_TYPES = [
  'quotation', 'order_confirmation', 'invoice_standard', 'invoice_advance',
  'invoice_final', 'cover_letter', 'service_report', 'inspection_certificate',
];

export const listTemplatesSchema = {
  query: cursorPagination.keys({
    templateType: Joi.string().valid(...TEMPLATE_TYPES),
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
    name: Joi.string().trim().max(255),
    description: Joi.string().max(1000).allow('', null),
    isActive: Joi.boolean(),
    layout: Joi.object({
      pageSize: Joi.string().valid('A4', 'Letter'),
      orientation: Joi.string().valid('portrait', 'landscape'),
      margins: Joi.object({
        top: Joi.number().min(0),
        bottom: Joi.number().min(0),
        left: Joi.number().min(0),
        right: Joi.number().min(0),
      }),
      headerHeight: Joi.number().min(0),
      footerHeight: Joi.number().min(0),
    }),
    sections: Joi.array().items(
      Joi.object({
        id: Joi.string().required(),
        name: Joi.string().required(),
        type: Joi.string().valid('header', 'body', 'table', 'totals', 'deductions', 'qr_bill', 'footer', 'custom').required(),
        position: Joi.number().required(),
        isVisible: Joi.boolean(),
        isConditional: Joi.boolean(),
        conditionField: Joi.string().allow(null, ''),
        config: Joi.object(),
      }),
    ),
    textBlocks: Joi.object({
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
    }),
    tableColumns: Joi.array().items(
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
    ),
  }).min(1),
};

export const versionParamSchema = {
  params: Joi.object({
    id: objectId.required(),
    version: Joi.number().integer().min(1).required(),
  }),
};

export const previewSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    sampleData: Joi.object().default({}),
    language: Joi.string().valid('de', 'fr', 'it', 'en').default('de'),
  }),
};

export const createTemplateSchema = {
  body: Joi.object({
    templateType: Joi.string().valid(...TEMPLATE_TYPES).required(),
    name: Joi.string().trim().max(255).required(),
    description: Joi.string().max(1000).allow('', null),
    layout: Joi.object({
      pageSize: Joi.string().valid('A4', 'Letter').default('A4'),
      orientation: Joi.string().valid('portrait', 'landscape').default('portrait'),
      margins: Joi.object({ top: Joi.number().default(25), bottom: Joi.number().default(20), left: Joi.number().default(20), right: Joi.number().default(15) }),
      headerHeight: Joi.number().default(45),
      footerHeight: Joi.number().default(30),
    }),
    sections: Joi.array().items(Joi.object({ id: Joi.string().required(), name: Joi.string().required(), type: Joi.string().valid('header','body','table','totals','deductions','qr_bill','footer','custom').required(), position: Joi.number().required(), isVisible: Joi.boolean().default(true), isConditional: Joi.boolean().default(false), conditionField: Joi.string().allow(null,''), config: Joi.object().default({}) })),
    textBlocks: Joi.object(),
    tableColumns: Joi.array(),
  }),
};
