import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const PHOTO_CATEGORIES = ['BEFORE', 'AFTER', 'DAMAGE', 'INSTALLATION', 'GENERAL', 'NAMEPLATE'];

export const uploadPhotoSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    category: Joi.string().valid(...PHOTO_CATEGORIES).required(),
    caption: Joi.string().max(300).allow('', null),
    annotationData: Joi.string().allow('', null),
    latitude: Joi.number(),
    longitude: Joi.number(),
    capturedAt: Joi.date().iso().required(),
    workReportId: objectId.allow(null),
  }),
};

export const listPhotosSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const deletePhotoSchema = {
  params: Joi.object({ photoId: objectId.required() }),
};
