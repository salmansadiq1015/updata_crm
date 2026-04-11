import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const quotationSchema = {
  params: Joi.object({ id: objectId.required() }),
};
