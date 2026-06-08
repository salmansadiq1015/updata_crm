import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ASSET_TYPES = ['logo_cmyk', 'logo_rgb', 'logo_png', 'font_300', 'font_500', 'font_700'];

export const updateCIConfigSchema = {
  body: Joi.object({
    companyName: Joi.string().trim().max(255),
    logo: Joi.object({
      cmykFileId: objectId.allow(null),
      rgbFileId: objectId.allow(null),
      pngFileId: objectId.allow(null),
      width: Joi.number().min(1),
      position: Joi.string().valid('left', 'center', 'right'),
    }),
    fonts: Joi.object({
      primary: Joi.string().trim().max(100),
      weights: Joi.object({
        light: Joi.object({
          fileId: objectId.allow(null),
          name: Joi.string().trim().max(100).allow(null),
        }),
        medium: Joi.object({
          fileId: objectId.allow(null),
          name: Joi.string().trim().max(100).allow(null),
        }),
        bold: Joi.object({
          fileId: objectId.allow(null),
          name: Joi.string().trim().max(100).allow(null),
        }),
      }),
    }),
    colors: Joi.object({
      primary: Joi.string().trim().max(20),
      secondary: Joi.string().trim().max(20),
      primaryCmyk: Joi.string().trim().max(50),
      secondaryCmyk: Joi.string().trim().max(50),
      text: Joi.string().trim().max(20),
      muted: Joi.string().trim().max(20),
      border: Joi.string().trim().max(20),
      tableHeader: Joi.string().trim().max(20),
    }),
    companyDetails: Joi.object({
      address: Joi.object({
        street: Joi.string().trim().max(255).allow(null, ''),
        zip: Joi.string().trim().max(20).allow(null, ''),
        city: Joi.string().trim().max(100).allow(null, ''),
        country: Joi.string().trim().max(100).allow(null, ''),
      }),
      phone: Joi.string().trim().max(50).allow(null, ''),
      email: Joi.string().trim().max(255).allow(null, ''),
      website: Joi.string().trim().max(255).allow(null, ''),
      vatNumber: Joi.string().trim().max(50).allow(null, ''),
      commercialRegister: Joi.string().trim().max(100).allow(null, ''),
      bankDetails: Joi.object({
        bankName: Joi.string().trim().max(255).allow(null, ''),
        iban: Joi.string().trim().max(50).allow(null, ''),
        qrIban: Joi.string().trim().max(50).allow(null, ''),
        bic: Joi.string().trim().max(20).allow(null, ''),
        accountHolder: Joi.string().trim().max(255).allow(null, ''),
      }),
    }),
  }).min(1),
};

export const uploadAssetSchema = {
  body: Joi.object({
    assetType: Joi.string().valid(...ASSET_TYPES).required(),
  }),
};

export const deleteAssetSchema = {
  params: Joi.object({ id: objectId.required() }),
};
