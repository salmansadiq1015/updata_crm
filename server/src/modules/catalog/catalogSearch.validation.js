import Joi from 'joi';

export const recentSearchesSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(10).default(10),
  }),
};
