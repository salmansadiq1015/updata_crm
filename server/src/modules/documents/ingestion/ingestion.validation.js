import Joi from 'joi';

const sourceKey = Joi.string().valid('document_inbox', 'document_scan_folder').required();

/**
 * The mailbox configuration, minus the password.
 *
 * `passwordEnv` names the environment variable the server reads the password
 * from — the value itself never travels through this API and never lands in
 * the database.
 */
const mailboxConfig = Joi.object({
  host: Joi.string().hostname().max(200).allow('', null),
  port: Joi.number().integer().min(1).max(65535).default(993),
  secure: Joi.boolean().default(true),
  user: Joi.string().max(200).allow('', null),
  passwordEnv: Joi.string().pattern(/^[A-Z][A-Z0-9_]*$/).max(80).default('DOCUMENT_INBOX_PASSWORD'),
  folder: Joi.string().max(120).default('INBOX'),
  maxPerRun: Joi.number().integer().min(1).max(100).default(20),
}).unknown(false);

const scanFolderConfig = Joi.object({
  folder: Joi.string().max(500).allow('', null),
  maxPerRun: Joi.number().integer().min(1).max(200).default(30),
}).unknown(false);

export const updateSourceSchema = {
  params: Joi.object({ key: sourceKey }),
  body: Joi.object({
    isEnabled: Joi.boolean().required(),
    config: Joi.alternatives().try(mailboxConfig, scanFolderConfig).required(),
  }),
};

export const sourceKeySchema = {
  params: Joi.object({ key: sourceKey }),
  body: Joi.object({
    config: Joi.alternatives().try(mailboxConfig, scanFolderConfig).optional(),
  }).optional(),
};
