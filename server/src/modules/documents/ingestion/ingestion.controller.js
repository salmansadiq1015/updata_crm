import ingestionService from './ingestion.service.js';
import mailboxSource from './mailbox.source.js';
import scanFolderSource from './scanFolder.source.js';
import integrationConfigService from '../../integrations/integrationConfig.service.js';
import { AppError } from '../../../shared/errors/AppError.js';
import ERROR_CODES from '../../../shared/errors/errorCodes.js';

const SOURCES = {
  document_inbox: { adapter: mailboxSource, source: 'mailbox' },
  document_scan_folder: { adapter: scanFolderSource, source: 'scan_folder' },
};

/**
 * A source nobody has configured yet is not an error.
 *
 * The integration service raises NotFound for a key with no row, which is the
 * right answer to "fetch this integration" and the wrong one to "show me the
 * ingestion screen": on a system where neither source has ever been touched,
 * both are absent, and the screen has to open anyway.
 */
async function settingsFor(key) {
  try {
    return await integrationConfigService.getByKey(key);
  } catch (err) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

function adapterFor(key) {
  const entry = SOURCES[key];
  if (!entry) throw new AppError(`Unknown ingestion source: ${key}`, 400, ERROR_CODES.VALIDATION_ERROR);
  return entry;
}

class IngestionController {
  /** Both configurations, what came in lately, and the last day in numbers. */
  async overview(req, res, next) {
    try {
      const [inbox, folder, recent, summary] = await Promise.all([
        settingsFor('document_inbox'),
        settingsFor('document_scan_folder'),
        ingestionService.recent({ limit: 50 }),
        ingestionService.summary(),
      ]);

      res.success({
        data: {
          sources: [
            { key: 'document_inbox', ...serialise(inbox) },
            { key: 'document_scan_folder', ...serialise(folder) },
          ],
          recent,
          summary,
          // Said here rather than in the form's help text: the operator needs
          // to know the password is not something this screen can hold.
          passwordHint: 'Das Postfach-Passwort wird nie in der Datenbank gespeichert. Es steht in einer Umgebungsvariablen auf dem Server.',
        },
      });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const { key } = req.params;
      adapterFor(key);
      const updated = await integrationConfigService.upsert(key, {
        config: req.body.config || {},
        isEnabled: Boolean(req.body.isEnabled),
        credentialsRef: req.body.config?.passwordEnv || null,
      }, req.user?._id, { ipAddress: req.ip });
      res.success({ data: serialise(updated), message: 'Konfiguration gespeichert.' });
    } catch (err) { next(err); }
  }

  /** Opens the mailbox or reads the folder, and reports back. Changes nothing. */
  async test(req, res, next) {
    try {
      const { key } = req.params;
      const { adapter } = adapterFor(key);
      const current = await settingsFor(key);
      const result = await adapter.testConnection(req.body?.config || current?.config || {});
      res.success({ data: result, message: result.message });
    } catch (err) { next(err); }
  }

  /** One pass, now, without waiting for the schedule. */
  async runNow(req, res, next) {
    try {
      const { key } = req.params;
      const { adapter } = adapterFor(key);
      const current = await settingsFor(key);
      if (!current?.isEnabled) {
        throw new AppError('Diese Quelle ist ausgeschaltet.', 409, ERROR_CODES.CONFLICT);
      }
      const result = await adapter.collect(current.config || {}, { userId: req.user?._id });
      res.success({ data: result, message: result.message });
    } catch (err) { next(err); }
  }
}

/** Never lets the stored configuration carry a secret back to the browser. */
function serialise(doc) {
  if (!doc) return { isEnabled: false, config: {}, status: 'unknown' };
  const { password, pass, ...config } = doc.config || {};
  return {
    displayName: doc.displayName,
    isEnabled: Boolean(doc.isEnabled),
    config,
    status: doc.status,
    lastSyncAt: doc.lastSyncAt || null,
    lastErrorAt: doc.lastErrorAt || null,
    lastErrorMessage: doc.lastErrorMessage || null,
  };
}

export default new IngestionController();
