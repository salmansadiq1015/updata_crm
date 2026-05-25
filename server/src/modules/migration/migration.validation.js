import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  EXECUTABLE_DOMAINS,
  RUN_ENVIRONMENTS,
  RUN_STATUSES,
  RUN_TYPES,
  ROLLBACK_TYPES,
  ISSUE_SEVERITIES,
  ERROR_TYPES,
} from './migration.constants.js';

const sourceRecord = Joi.object().unknown(true);

export const createRunSchema = {
  body: Joi.object({
    runType: Joi.string().valid(...RUN_TYPES).required(),
    environment: Joi.string().valid(...RUN_ENVIRONMENTS).required(),
    sourceDataDate: Joi.date().iso().required(),
    domains: Joi.array().items(Joi.string().valid(...EXECUTABLE_DOMAINS)).min(1).unique().default(EXECUTABLE_DOMAINS),
    batchSize: Joi.number().integer().min(1).max(5000).default(500),
    errorThresholdPercent: Joi.number().min(0).max(100).default(5),
    scopeFilter: Joi.object().unknown(true).default({}),
    sourceDataRef: Joi.string().trim().max(500).allow(null, ''),
    rollbackBackupRef: Joi.string().trim().max(500).allow(null, ''),
    notes: Joi.string().trim().max(5000).allow('', null),
    sourceData: Joi.object(
      Object.fromEntries(EXECUTABLE_DOMAINS.map((domain) => [domain, Joi.array().items(sourceRecord).default([])])),
    ).unknown(false).default({}),
  }),
};

export const listRunsSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(25),
    status: Joi.string().valid(...RUN_STATUSES),
    environment: Joi.string().valid(...RUN_ENVIRONMENTS),
    runType: Joi.string().valid(...RUN_TYPES),
  }),
};

export const runIdParamSchema = {
  params: Joi.object({
    runId: objectId.required(),
  }),
};

export const addSourceRecordsSchema = {
  params: runIdParamSchema.params,
  body: Joi.object({
    domain: Joi.string().valid(...EXECUTABLE_DOMAINS).required(),
    records: Joi.array().items(sourceRecord).min(1).max(10000).required(),
  }),
};

export const rollbackSchema = {
  params: runIdParamSchema.params,
  body: Joi.object({
    rollbackType: Joi.string().valid(...ROLLBACK_TYPES).default('full'),
    domains: Joi.when('rollbackType', {
      is: 'partial',
      then: Joi.array().items(Joi.string().valid(...EXECUTABLE_DOMAINS)).min(1).unique().required(),
      otherwise: Joi.array().items(Joi.string().valid(...EXECUTABLE_DOMAINS)).unique().default([]),
    }),
    rollbackBackupRef: Joi.string().trim().max(500).allow(null, ''),
  }),
};

export const listErrorsSchema = {
  params: runIdParamSchema.params,
  query: Joi.object({
    domain: Joi.string().valid(...EXECUTABLE_DOMAINS),
    severity: Joi.string().valid(...ISSUE_SEVERITIES),
    errorType: Joi.string().valid(...ERROR_TYPES),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(500).default(50),
  }),
};

export const exportErrorsSchema = {
  params: runIdParamSchema.params,
  query: Joi.object({
    domain: Joi.string().valid(...EXECUTABLE_DOMAINS),
    severity: Joi.string().valid(...ISSUE_SEVERITIES),
    errorType: Joi.string().valid(...ERROR_TYPES),
  }),
};

export const spotCheckSchema = {
  params: runIdParamSchema.params,
  body: Joi.object({
    sampleSizePerDomain: Joi.number().integer().min(1).max(100).default(10),
    domains: Joi.array().items(Joi.string().valid(...EXECUTABLE_DOMAINS)).min(1).unique().default(EXECUTABLE_DOMAINS),
  }),
};
