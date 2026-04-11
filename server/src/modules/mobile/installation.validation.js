import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const siteInstallationsSchema = {
  params: Joi.object({ siteId: objectId.required() }),
};

export const installationIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};
