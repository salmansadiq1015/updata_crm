import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';

const HEALTH_TTL = { l1Ttl: 30, l2Ttl: 120 };
const DASHBOARD_TTL = { l1Ttl: 30, l2Ttl: 60 };

let integrationHealthCheckRepository;
let integrationConfigRepository;

async function getHealthRepo() {
  if (!integrationHealthCheckRepository) {
    const mod = await import('./integrationHealthCheck.repository.js');
    integrationHealthCheckRepository = mod.default;
  }
  return integrationHealthCheckRepository;
}

async function getConfigRepo() {
  if (!integrationConfigRepository) {
    const mod = await import('./integrationConfig.repository.js');
    integrationConfigRepository = mod.default;
  }
  return integrationConfigRepository;
}

const healthCheckFunctions = {
  async igh_catalog() {
    try {
      const { default: ighService } = await import('../catalog/igh.service.js');
      const cfg = await ighService.getConfig();
      if (!cfg) {
        return { status: 'down', details: { reason: 'IGH config not found' } };
      }
      return { status: 'healthy', details: { configExists: true } };
    } catch (err) {
      return { status: 'down', details: { reason: err.message } };
    }
  },

  async banking_camt() {
    try {
      const configRepo = await getConfigRepo();
      const cfg = await configRepo.findByKey('banking_camt');
      if (!cfg || !cfg.isEnabled) {
        return { status: 'down', details: { reason: 'Banking CAMT config not found or disabled' } };
      }
      return { status: 'healthy', details: { configExists: true } };
    } catch (err) {
      return { status: 'down', details: { reason: err.message } };
    }
  },

  async whatsapp() {
    const token = process.env.WHATSAPP_API_TOKEN;
    if (!token) {
      return { status: 'down', details: { reason: 'WHATSAPP_API_TOKEN env var not set' } };
    }
    return { status: 'healthy', details: { tokenConfigured: true } };
  },

  async smtp_email() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_MAIL;
    const pass = process.env.SMTP_PASSWORD;
    if ((!process.env.SMTP_SERVICE && (!host || !port)) || !user || !pass) {
      return { status: 'down', details: { reason: 'SMTP connection credentials are incomplete' } };
    }
    try {
      const { verifyMailTransport } = await import('../../shared/mail/mail.js');
      await verifyMailTransport();
      return { status: 'healthy', details: { host: process.env.SMTP_SERVICE || host, port } };
    } catch (err) {
      const authenticationFailure = err?.code === 'EAUTH' || Number(err?.responseCode) === 535;
      return { status: 'down', details: { reason: authenticationFailure ? 'SMTP authentication failed' : 'SMTP connection failed' } };
    }
  },

  async ocr_service() {
    try {
      const configRepo = await getConfigRepo();
      const cfg = await configRepo.findByKey('ocr_service');
      if (!cfg || !cfg.isEnabled) {
        return { status: 'down', details: { reason: 'OCR service config not found or disabled' } };
      }
      return { status: 'healthy', details: { configExists: true } };
    } catch (err) {
      return { status: 'down', details: { reason: err.message } };
    }
  },

  async cloud_storage() {
    try {
      const { default: storageService } = await import('../../shared/storage/StorageService.js');
      const healthy = await storageService.healthCheck();
      return healthy
        ? { status: 'healthy', details: { bucketReachable: true } }
        : { status: 'down', details: { reason: 'Storage bucket is not reachable' } };
    } catch (err) {
      return { status: 'down', details: { reason: err.message } };
    }
  },

  async calendar_google() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { status: 'down', details: { reason: 'Google Calendar env vars not set' } };
    }
    return { status: 'healthy', details: { credentialsConfigured: true } };
  },

  async calendar_outlook() {
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { status: 'down', details: { reason: 'Outlook Calendar env vars not set' } };
    }
    return { status: 'healthy', details: { credentialsConfigured: true } };
  },

  async website_widget() {
    return { status: 'healthy', details: { reason: 'Self-hosted, always healthy' } };
  },
};

class IntegrationHealthService {
  async runHealthCheck(integrationKey) {
    const checkFn = healthCheckFunctions[integrationKey];
    if (!checkFn) {
      logger.warn('No health check function for integration', {
        module: 'integrations',
        action: 'health.check',
        integrationKey,
      });
      return { status: 'down', responseTimeMs: 0, details: { reason: 'Unknown integration key' } };
    }

    const startTime = Date.now();
    let result;
    try {
      result = await checkFn();
    } catch (err) {
      result = { status: 'down', details: { reason: err.message } };
    }
    const responseTimeMs = Date.now() - startTime;

    result.responseTimeMs = responseTimeMs;

    const healthRepo = await getHealthRepo();
    const checkRecord = await healthRepo.create({
      integrationKey,
      status: result.status,
      responseTimeMs,
      errorMessage: result.status !== 'healthy' ? (result.details?.reason || null) : null,
      details: result.details || {},
      checkedAt: new Date(),
    });

    const configRepo = await getConfigRepo();
    const existingConfig = await configRepo.findByKey(integrationKey);
    const previousStatus = existingConfig ? existingConfig.status : 'unknown';

    const configUpdate = {
      status: result.status,
      lastHealthCheckAt: new Date(),
    };
    if (result.status !== 'healthy') {
      configUpdate.lastErrorAt = new Date();
      configUpdate.lastErrorMessage = result.details?.reason || 'Health check failed';
    }
    await configRepo.upsertByKey(integrationKey, configUpdate);

    await Promise.all([
      cacheManager.del(`integ:health:${integrationKey}`),
      cacheManager.del(`integ:config:${integrationKey}`),
      cacheManager.del('integ:configs:all'),
      cacheManager.del('integ:dashboard'),
    ]);

    if (
      previousStatus === 'healthy' &&
      (result.status === 'degraded' || result.status === 'down')
    ) {
      eventBus.publish(
        EVENT_TYPES.INTEGRATION_STATUS_CHANGED,
        {
          integrationKey,
          previousStatus,
          currentStatus: result.status,
          oldStatus: previousStatus,
          newStatus: result.status,
          responseTimeMs,
          errorMessage: result.details?.reason || null,
        },
        { source: 'integrations:health' },
      );
    }

    logger.info('Health check completed', {
      module: 'integrations',
      action: 'health.check',
      integrationKey,
      status: result.status,
      responseTimeMs,
    });

    return {
      integrationKey,
      status: result.status,
      responseTimeMs,
      details: result.details,
      checkedAt: checkRecord.checkedAt,
    };
  }

  async runAllHealthChecks() {
    const configRepo = await getConfigRepo();
    const allConfigs = await configRepo.findAll();
    const enabledConfigs = allConfigs.filter((c) => c.isEnabled);

    const results = [];
    for (const cfg of enabledConfigs) {
      try {
        const result = await this.runHealthCheck(cfg.integrationKey);
        results.push(result);
      } catch (err) {
        logger.error('Health check failed for integration', {
          module: 'integrations',
          action: 'health.checkAll',
          integrationKey: cfg.integrationKey,
          error: err.message,
        });
        results.push({
          integrationKey: cfg.integrationKey,
          status: 'down',
          responseTimeMs: 0,
          details: { reason: err.message },
          checkedAt: new Date(),
        });
      }
    }

    logger.info('All health checks completed', {
      module: 'integrations',
      action: 'health.checkAll',
      total: results.length,
      healthy: results.filter((r) => r.status === 'healthy').length,
      degraded: results.filter((r) => r.status === 'degraded').length,
      down: results.filter((r) => r.status === 'down').length,
    });

    return results;
  }

  async getLatestStatus(integrationKey) {
    const cacheKey = `integ:health:${integrationKey}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const healthRepo = await getHealthRepo();
        return healthRepo.findLatestByKey(integrationKey);
      },
      HEALTH_TTL,
    );
  }

  async getHealthHistory(integrationKey, period = '24h') {
    const periodMap = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const ms = periodMap[period];
    if (!ms) {
      const sinceDate = new Date(Date.now() - periodMap['24h']);
      const healthRepo = await getHealthRepo();
      return healthRepo.findByKeySince(integrationKey, sinceDate);
    }

    const sinceDate = new Date(Date.now() - ms);
    const healthRepo = await getHealthRepo();
    return healthRepo.findByKeySince(integrationKey, sinceDate);
  }

  async getDashboard() {
    const cacheKey = 'integ:dashboard';
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const configRepo = await getConfigRepo();
        const healthRepo = await getHealthRepo();
        const allConfigs = await configRepo.findAll();

        const dashboard = [];
        for (const cfg of allConfigs) {
          const recentChecks = await healthRepo.findByKeySince(
            cfg.integrationKey,
            new Date(Date.now() - 24 * 60 * 60 * 1000),
          );

          const totalChecks = recentChecks.length;
          const errorCount = recentChecks.filter(
            (c) => c.status === 'down' || c.status === 'degraded',
          ).length;
          const errorRate = totalChecks > 0 ? (errorCount / totalChecks) * 100 : 0;
          const avgResponseTime =
            totalChecks > 0
              ? recentChecks.reduce((sum, c) => sum + (c.responseTimeMs || 0), 0) / totalChecks
              : 0;

          const latestCheck = recentChecks.length > 0 ? recentChecks[0] : null;

          dashboard.push({
            integrationKey: cfg.integrationKey,
            displayName: cfg.displayName,
            provider: cfg.provider,
            isEnabled: cfg.isEnabled,
            status: cfg.status,
            circuitBreakerState: cfg.circuitBreakerState,
            lastHealthCheckAt: cfg.lastHealthCheckAt,
            lastErrorAt: cfg.lastErrorAt,
            lastErrorMessage: cfg.lastErrorMessage,
            errorRate: Math.round(errorRate * 100) / 100,
            avgResponseTimeMs: Math.round(avgResponseTime),
            checksLast24h: totalChecks,
            latestCheck,
          });
        }

        return dashboard;
      },
      DASHBOARD_TTL,
    );
  }
}

const integrationHealthService = new IntegrationHealthService();
export default integrationHealthService;
