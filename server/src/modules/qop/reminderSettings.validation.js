import Joi from 'joi';

const intList = (min, max) => Joi.array()
  .items(Joi.number().integer().min(min).max(max))
  .min(1)
  .max(12)
  .unique()
  .required();

export const updateReminderSettingsSchema = {
  body: Joi.object({
    appointmentReminderHours: intList(1, 720),
    quotationFollowupDays: intList(1, 365),
    quotationExpiryWarnDays: Joi.number().integer().min(1).max(90).required(),
    defaultAppointmentChannel: Joi.string().valid('email', 'both').default('email'),
    defaultLanguage: Joi.string().valid('de', 'fr', 'it', 'en').default('de'),
  }),
};
