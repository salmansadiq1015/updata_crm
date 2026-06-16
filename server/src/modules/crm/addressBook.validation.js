import Joi from 'joi';

export const listAddressBookSchema = {
  query: Joi.object({
    search: Joi.string().trim().max(120).allow('', null).default(''),
    customerType: Joi.string().valid('all', 'private', 'business').default('all'),
    addressType: Joi.string().valid('all', 'billing', 'site', 'delivery').default('all'),
    canton: Joi.string().trim().uppercase().max(2).allow('', null).default(''),
    postalCode: Joi.string().trim().max(10).allow('', null).default(''),
    city: Joi.string().trim().max(100).allow('', null).default(''),
    hasCoordinates: Joi.string().valid('all', 'with', 'without').default('all'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
};
