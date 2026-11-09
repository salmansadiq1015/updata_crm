import Joi from 'joi';
import { REALTIME_VOICES } from './voiceAgent.instructions.js';

export const createVoiceSessionSchema = Joi.object({
  voice: Joi.string().valid(...REALTIME_VOICES).optional(),
  locale: Joi.string().valid('de', 'en', 'fr', 'ar', 'it').optional(),
  currentPage: Joi.string().max(300).allow('', null).optional(),
  threadId: Joi.string().max(100).allow(null).optional(),
  timeZone: Joi.string().max(64).optional(),
});

export const runVoiceToolSchema = Joi.object({
  name: Joi.string().max(64).pattern(/^[a-z_]+$/).required(),
  arguments: Joi.object().unknown(true).default({}),
  threadId: Joi.string().max(100).required(),
  currentPage: Joi.string().max(300).allow('', null).optional(),
  timeZone: Joi.string().max(64).optional(),
});
