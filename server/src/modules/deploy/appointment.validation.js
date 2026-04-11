import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { CONFIRMATION_METHODS } from './appointmentDetails.model.js';

export const getAppointmentSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const updateAppointmentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    customerContactName: Joi.string().trim().max(255),
    customerContactPhone: Joi.string().trim().max(50),
    customerContactEmail: Joi.string().trim().email(),
    appointmentWindow: Joi.string().trim().max(100),
    confirmationMethod: Joi.string().valid(...CONFIRMATION_METHODS),
    customerNotes: Joi.string().max(2000),
  }).min(1),
};

export const confirmAppointmentSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const cancelAppointmentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().max(2000).required(),
  }),
};

export const rescheduleAppointmentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    newStartDatetime: Joi.date().iso(),
    newEndDatetime: Joi.date().iso(),
    appointmentWindow: Joi.string().trim().max(100),
    customerNotes: Joi.string().max(2000),
  }),
};
