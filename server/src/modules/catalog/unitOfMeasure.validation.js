import Joi from 'joi';

export const listUnitsSchema = {
  query: Joi.object({}),
};

export const createUnitSchema = {
  body: Joi.object({
    code: Joi.string().required().trim().max(10),
    nameDe: Joi.string().required().trim().max(100),
    nameFr: Joi.string().required().trim().max(100),
    nameIt: Joi.string().required().trim().max(100),
    baseUnitCode: Joi.string().trim().max(10).allow(null),
    conversionFactor: Joi.number().allow(null),
  }),
};

export const updateUnitSchema = {
  params: Joi.object({
    code: Joi.string().required(),
  }),
  body: Joi.object({
    nameDe: Joi.string().trim().max(100),
    nameFr: Joi.string().trim().max(100),
    nameIt: Joi.string().trim().max(100),
    baseUnitCode: Joi.string().trim().max(10).allow(null),
    conversionFactor: Joi.number().allow(null),
  }).min(1),
};

export const unitCodeParamSchema = {
  params: Joi.object({
    code: Joi.string().required(),
  }),
};
