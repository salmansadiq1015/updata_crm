import Joi from 'joi';

const CATALOG_SOURCES = ['IGH', 'INTERNAL', 'ALL'];

export const searchCatalogSchema = {
  query: Joi.object({
    query: Joi.string().min(1).max(100).required(),
    source: Joi.string().valid(...CATALOG_SOURCES).default('ALL'),
    category: Joi.string().max(100),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
};

export const syncCatalogSchema = {
  query: Joi.object({
    since: Joi.date().iso(),
  }),
};

export const favoritesSchema = {
  query: Joi.object({}),
};

export const favoriteItemSchema = {
  params: Joi.object({ itemId: Joi.string().required() }),
};

export const recentSchema = {
  query: Joi.object({}),
};
