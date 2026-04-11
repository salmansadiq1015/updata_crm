import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

let integrationSyncLogRepository;

async function getRepository() {
  if (!integrationSyncLogRepository) {
    const mod = await import('./integrationSyncLog.repository.js');
    integrationSyncLogRepository = mod.default;
  }
  return integrationSyncLogRepository;
}

class IntegrationSyncLogService {
  async startSync(integrationKey, syncType, triggeredBy) {
    const repo = await getRepository();

    const running = await repo.findRunningByKey(integrationKey);
    if (running) {
      throw new AppError(
        `A sync is already running for integration '${integrationKey}'`,
        409,
        ERROR_CODES.INTEG_SYNC_RUNNING,
      );
    }

    const syncLog = await repo.create({
      integrationKey,
      syncType,
      status: 'running',
      triggeredBy,
      startedAt: new Date(),
    });

    logger.info('Sync started', {
      module: 'integrations',
      action: 'sync.start',
      integrationKey,
      syncType,
      syncId: syncLog._id,
    });

    return syncLog;
  }

  async completeSync(syncId, results = {}) {
    const repo = await getRepository();
    const syncLog = await repo.findById(syncId);
    if (!syncLog) throw new NotFoundError('IntegrationSyncLog', syncId);

    const now = new Date();
    const durationMs = now.getTime() - new Date(syncLog.startedAt).getTime();

    const updated = await repo.updateById(syncId, {
      status: 'completed',
      recordsProcessed: results.recordsProcessed || 0,
      recordsCreated: results.recordsCreated || 0,
      recordsUpdated: results.recordsUpdated || 0,
      recordsSkipped: results.recordsSkipped || 0,
      recordsDeleted: results.recordsDeleted || 0,
      errorCount: results.errorCount || 0,
      errorDetails: results.errorDetails || [],
      summary: results.summary || null,
      completedAt: now,
      durationMs,
    });

    eventBus.publish(
      EVENT_TYPES.INTEGRATION_SYNC_COMPLETED,
      {
        syncId,
        integrationKey: syncLog.integrationKey,
        syncType: syncLog.syncType,
        durationMs,
        recordsProcessed: results.recordsProcessed || 0,
        recordsCreated: results.recordsCreated || 0,
        recordsUpdated: results.recordsUpdated || 0,
      },
      { source: 'integrations:sync' },
    );

    logger.info('Sync completed', {
      module: 'integrations',
      action: 'sync.complete',
      integrationKey: syncLog.integrationKey,
      syncId,
      durationMs,
      recordsProcessed: results.recordsProcessed || 0,
    });

    return updated;
  }

  async failSync(syncId, errorMessage, errorDetails = null) {
    const repo = await getRepository();
    const syncLog = await repo.findById(syncId);
    if (!syncLog) throw new NotFoundError('IntegrationSyncLog', syncId);

    const now = new Date();
    const durationMs = now.getTime() - new Date(syncLog.startedAt).getTime();

    const updated = await repo.updateById(syncId, {
      status: 'failed',
      errorCount: (syncLog.errorCount || 0) + 1,
      errorDetails: errorDetails ? [].concat(syncLog.errorDetails || [], errorDetails) : syncLog.errorDetails,
      summary: errorMessage,
      completedAt: now,
      durationMs,
    });

    eventBus.publish(
      EVENT_TYPES.INTEGRATION_SYNC_FAILED,
      {
        syncId,
        integrationKey: syncLog.integrationKey,
        syncType: syncLog.syncType,
        errorMessage,
        durationMs,
      },
      { source: 'integrations:sync' },
    );

    logger.error('Sync failed', {
      module: 'integrations',
      action: 'sync.fail',
      integrationKey: syncLog.integrationKey,
      syncId,
      errorMessage,
      durationMs,
    });

    return updated;
  }

  async getById(syncId) {
    const repo = await getRepository();
    const syncLog = await repo.findById(syncId);
    if (!syncLog) throw new NotFoundError('IntegrationSyncLog', syncId);
    return syncLog;
  }

  async getHistory(integrationKey, queryParams = {}) {
    const { cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' } = queryParams;
    const repo = await getRepository();
    return repo.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters: { integrationKey },
    });
  }
}

const integrationSyncLogService = new IntegrationSyncLogService();
export default integrationSyncLogService;
