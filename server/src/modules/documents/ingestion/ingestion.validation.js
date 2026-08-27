import Joi from 'joi';

const sourceKey = Joi.string().valid('document_inbox', 'document_scan_folder').required();

/**
 * The mailbox configuration — no password, and no way to name one.
 *
 * The variable the password is read from is fixed in the source. Accepting a
 * name here would let anyone with this screen read any secret the server
 * holds: point the host at a mailbox you control, name JWT_SECRET, press
 * "test connection", and the server offers it as a password. `unknown(false)`
 * makes the field an error rather than something quietly dropped, so a stored
 * configuration carrying one is rejected instead of half-honoured.
 */
const mailboxConfig = Joi.object({
  host: Joi.string().hostname().max(200).allow('', null),
  port: Joi.number().integer().min(1).max(65535).default(993),
  secure: Joi.boolean().default(true),
  user: Joi.string().max(200).allow('', null),
  folder: Joi.string().max(120).default('INBOX'),
  maxPerRun: Joi.number().integer().min(1).max(100).default(20),
}).unknown(false);

const scanFolderConfig = Joi.object({
  folder: Joi.string().max(500).allow('', null),
  maxPerRun: Joi.number().integer().min(1).max(200).default(30),
}).unknown(false);

/**
 * One schema for both sources rather than a choice between two.
 *
 * `alternatives().try()` did reject an unknown field, but reported only that
 * the object "does not match any of the allowed types" — which tells an
 * administrator nothing about which field is the problem. Merged and strict,
 * the error names the field. The cost is that a scan folder may carry a `host`
 * it does not use, which the source ignores; the benefit is that the one field
 * that must never be accepted is refused by name.
 */
const sourceConfig = mailboxConfig.concat(scanFolderConfig).unknown(false);

export const updateSourceSchema = {
  params: Joi.object({ key: sourceKey }),
  body: Joi.object({
    isEnabled: Joi.boolean().required(),
    config: sourceConfig.required(),
  }),
};

export const sourceKeySchema = {
  params: Joi.object({ key: sourceKey }),
  body: Joi.object({
    config: sourceConfig.optional(),
  }).optional(),
};
