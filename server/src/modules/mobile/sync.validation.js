import Joi from 'joi';

export const fullSyncSchema = {
  body: Joi.object({
    lastSyncTimestamp: Joi.date().iso().required(),
    outbound: Joi.object({
      workReports: Joi.array().items(Joi.object().unknown(true)),
      timeEntries: Joi.array().items(Joi.object().unknown(true)),
      photos: Joi.array().items(Joi.object().unknown(true)),
      chatMessages: Joi.array().items(Joi.object().unknown(true)),
      materialItems: Joi.array().items(Joi.object().unknown(true)),
    }),
    deviceInfo: Joi.object().unknown(true),
  }),
};

export const syncStatusSchema = {
  query: Joi.object({}),
};
