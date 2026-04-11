import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import { INTEGRATION_KEYS } from './integrationConfig.model.js';

const ENTITY_TTL = { l1Ttl: 120, l2Ttl: 600 };
const LIST_TTL = { l1Ttl: 60, l2Ttl: 300 };

const INTEGRATION_DEFAULTS = {
  igh_catalog: { displayName: 'IGH Catalog', provider: 'igh' },
  banking_camt: { displayName: 'Banking CAMT', provider: 'camt' },
  whatsapp: { displayName: 'WhatsApp', provider: 'meta' },
  smtp_email: { displayName: 'SMTP Email', provider: 'smtp' },
  ocr_service: { displayName: 'OCR Service', provider: 'ocr' },
  cloud_storage: { displayName: 'Cloud Storage', provider: 's3' },
  calendar_google: { displayName: 'Google Calendar', provider: 'google' },
  calendar_outlook: { displayName: 'Outlook Calendar', provider: 'microsoft' },
  website_widget: { displayName: 'Website Widget', provider: 'self' },
};

let integrationConfigRepository;

async function getRepository() {
  if (!integrationConfigRepository) {
    const mod = await import('./integrationConfig.repository.js');
    integrationConfigRepository = mod.default;
  }
  return integrationConfigRepository;
}

class IntegrationConfigService {
  async getAll() {
    const cacheKey = 'integ:configs:all';
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const repo = await getRepository();
        return repo.findAll();
      },
      LIST_TTL,
    );
  }

  async getByKey(integrationKey) {
    const cacheKey = `integ:config:${integrationKey}`;
    const cfg = await cacheManager.getOrSet(
      cacheKey,
      async () => {
        const repo = await getRepository();
        return repo.findByKey(integrationKey);
      },
      ENTITY_TTL,
    );
    if (!cfg) throw new NotFoundError('IntegrationConfig', integrationKey);
    return cfg;
  }

  async upsert(integrationKey, data, userId, meta = {}) {
    if (!INTEGRATION_KEYS.includes(integrationKey)) {
      throw new AppError(
        `Invalid integration key '${integrationKey}'`,
        400,
        ERROR_CODES.INTEG_CONFIG_INVALID,
      );
    }

    const repo = await getRepository();
    const updated = await repo.upsertByKey(integrationKey, {
      ...data,
      integrationKey,
      updatedBy: userId,
    });

    await this._invalidateCache(integrationKey);

    auditService.logEvent({
      eventType: 'integration.config.upserted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { integrationKey, changedFields: Object.keys(data) },
      module: 'integrations',
    });

    logger.info('Integration config upserted', {
      module: 'integrations',
      action: 'config.upsert',
      integrationKey,
    });

    return updated;
  }

  async enable(integrationKey, userId, meta = {}) {
    const cfg = await this.getByKey(integrationKey);

    const repo = await getRepository();
    const updated = await repo.upsertByKey(integrationKey, {
      isEnabled: true,
      status: 'unknown',
      updatedBy: userId,
    });

    await this._invalidateCache(integrationKey);

    auditService.logEvent({
      eventType: 'integration.enabled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { integrationKey, previousStatus: cfg.status },
      module: 'integrations',
    });

    logger.info('Integration enabled', {
      module: 'integrations',
      action: 'enable',
      integrationKey,
    });

    return updated;
  }

  async disable(integrationKey, userId, meta = {}) {
    const cfg = await this.getByKey(integrationKey);

    const repo = await getRepository();
    const updated = await repo.upsertByKey(integrationKey, {
      isEnabled: false,
      status: 'disabled',
      updatedBy: userId,
    });

    await this._invalidateCache(integrationKey);

    auditService.logEvent({
      eventType: 'integration.disabled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { integrationKey, previousStatus: cfg.status },
      module: 'integrations',
    });

    logger.info('Integration disabled', {
      module: 'integrations',
      action: 'disable',
      integrationKey,
    });

    return updated;
  }

  async updateStatus(integrationKey, status, errorMessage = null) {
    const repo = await getRepository();
    const existing = await repo.findByKey(integrationKey);
    if (!existing) throw new NotFoundError('IntegrationConfig', integrationKey);

    const previousStatus = existing.status;
    const updateData = { status };

    if (errorMessage) {
      updateData.lastErrorAt = new Date();
      updateData.lastErrorMessage = errorMessage;
    }

    if (status === 'healthy') {
      updateData.lastHealthCheckAt = new Date();
    }

    const updated = await repo.upsertByKey(integrationKey, updateData);
    await this._invalidateCache(integrationKey);

    if (
      previousStatus === 'healthy' &&
      (status === 'degraded' || status === 'down')
    ) {
      eventBus.publish(
        EVENT_TYPES.INTEGRATION_STATUS_CHANGED,
        {
          integrationKey,
          previousStatus,
          currentStatus: status,
          errorMessage,
        },
        { source: 'integrations:config' },
      );

      logger.warn('Integration status degraded', {
        module: 'integrations',
        action: 'status.changed',
        integrationKey,
        previousStatus,
        currentStatus: status,
      });
    }

    return updated;
  }

  async updateCircuitBreakerState(integrationKey, state) {
    const repo = await getRepository();
    const existing = await repo.findByKey(integrationKey);
    if (!existing) throw new NotFoundError('IntegrationConfig', integrationKey);

    const updateData = { circuitBreakerState: state };
    if (state === 'OPEN') {
      updateData.circuitBreakerOpenedAt = new Date();
    }

    const updated = await repo.upsertByKey(integrationKey, updateData);
    await this._invalidateCache(integrationKey);

    logger.info('Circuit breaker state updated', {
      module: 'integrations',
      action: 'circuit_breaker.update',
      integrationKey,
      state,
    });

    return updated;
  }

  async ensureDefaults() {
    const repo = await getRepository();

    for (const key of INTEGRATION_KEYS) {
      const existing = await repo.findByKey(key);
      if (!existing) {
        const defaults = INTEGRATION_DEFAULTS[key] || { displayName: key, provider: 'unknown' };
        await repo.upsertByKey(key, {
          integrationKey: key,
          displayName: defaults.displayName,
          provider: defaults.provider,
          isEnabled: false,
          status: 'unknown',
          config: {},
          circuitBreakerState: 'CLOSED',
        });

        logger.info('Integration config default created', {
          module: 'integrations',
          action: 'config.seed',
          integrationKey: key,
        });
      }
    }

    await cacheManager.del('integ:configs:all');
    logger.info('Integration config defaults ensured', {
      module: 'integrations',
      action: 'config.ensureDefaults',
    });
  }

  async _invalidateCache(integrationKey) {
    await Promise.all([
      cacheManager.del(`integ:config:${integrationKey}`),
      cacheManager.del('integ:configs:all'),
    ]);
  }
}

const integrationConfigService = new IntegrationConfigService();
export default integrationConfigService;
