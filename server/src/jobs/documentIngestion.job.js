import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Brings in the paperwork nobody uploaded.
 *
 * Two sources, each switched on separately in the admin screen: a dedicated
 * mailbox and the folder the office copier scans to. A source that is off, or
 * not configured, is skipped in silence — this runs every few minutes, and a
 * warning per pass about an integration deliberately left off is noise that
 * teaches people to ignore the log.
 *
 * A source that IS on and fails is a different matter: that is recorded
 * against the integration, so the admin screen shows it went down and when.
 */
const SOURCES = [
  { key: 'document_inbox', module: './modules/documents/ingestion/mailbox.source.js' },
  { key: 'document_scan_folder', module: './modules/documents/ingestion/scanFolder.source.js' },
];

export class DocumentIngestionWorker extends BaseWorker {
  constructor() {
    super('document-ingestion');
  }

  async process(_job) {
    const integrationConfigService = (await import('../modules/integrations/integrationConfig.service.js')).default;
    const outcome = { checked: 0, taken: 0, sources: {} };

    for (const source of SOURCES) {
      let settings;
      try {
        settings = await integrationConfigService.getByKey(source.key);
      } catch (err) {
        logger.debug('Skipping unconfigured ingestion source', {
          module: 'document-ingestion', action: 'job', source: source.key, error: err.message,
        });
        continue;
      }
      if (!settings?.isEnabled) continue;

      outcome.checked += 1;
      const adapter = (await import(`../${source.module.replace('./', '')}`)).default;
      const result = await adapter.collect(settings.config || {}, { userId: null });
      outcome.sources[source.key] = { ok: result.ok, taken: result.taken, message: result.message };
      outcome.taken += result.taken || 0;

      // The screen has to be able to say "it stopped working on Tuesday".
      await integrationConfigService
        .updateStatus(source.key, result.ok ? 'healthy' : 'down', result.ok ? null : result.message)
        .catch(() => { /* status is a nicety; the run itself already happened */ });
    }

    if (outcome.taken > 0) {
      logger.info('Document ingestion run complete', {
        module: 'document-ingestion', action: 'job', ...outcome,
      });
    }
    return outcome;
  }
}

export default DocumentIngestionWorker;
