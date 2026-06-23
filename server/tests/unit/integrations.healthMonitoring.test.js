import { afterEach, describe, expect, jest, test } from '@jest/globals';
import EVENT_TYPES from '../../src/shared/events/eventTypes.js';

async function loadHealthService({ existingStatus = 'healthy' } = {}) {
  jest.resetModules();

  const healthRepository = {
    create: jest.fn(async (record) => ({ _id: 'health-1', ...record })),
  };
  const configRepository = {
    findByKey: jest.fn(async () => ({
      integrationKey: 'whatsapp',
      status: existingStatus,
      isEnabled: true,
    })),
    upsertByKey: jest.fn(async (key, data) => ({ integrationKey: key, ...data })),
    findAll: jest.fn(async () => []),
  };
  const cacheManager = { del: jest.fn(async () => true) };
  const eventBus = { publish: jest.fn() };

  jest.unstable_mockModule('../../src/modules/integrations/integrationHealthCheck.repository.js', () => ({
    default: healthRepository,
  }));
  jest.unstable_mockModule('../../src/modules/integrations/integrationConfig.repository.js', () => ({
    default: configRepository,
  }));
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
    default: cacheManager,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/integrations/integrationHealth.service.js')).default;
  return { service, healthRepository, configRepository, cacheManager, eventBus };
}

describe('integration health monitoring', () => {
  const originalWhatsappToken = process.env.WHATSAPP_API_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalWhatsappToken) {
      process.env.WHATSAPP_API_TOKEN = originalWhatsappToken;
    } else {
      delete process.env.WHATSAPP_API_TOKEN;
    }
  });

  test('persists health checks and publishes status-transition payloads with old and new status aliases', async () => {
    delete process.env.WHATSAPP_API_TOKEN;
    const { service, healthRepository, configRepository, cacheManager, eventBus } = await loadHealthService();

    const result = await service.runHealthCheck('whatsapp');

    expect(result).toMatchObject({
      integrationKey: 'whatsapp',
      status: 'down',
      details: { reason: 'WHATSAPP_API_TOKEN env var not set' },
    });
    expect(healthRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      integrationKey: 'whatsapp',
      status: 'down',
      errorMessage: 'WHATSAPP_API_TOKEN env var not set',
    }));
    expect(configRepository.upsertByKey).toHaveBeenCalledWith('whatsapp', expect.objectContaining({
      status: 'down',
      lastErrorMessage: 'WHATSAPP_API_TOKEN env var not set',
    }));
    expect(cacheManager.del).toHaveBeenCalledWith('integ:dashboard');
    expect(eventBus.publish).toHaveBeenCalledWith(
      EVENT_TYPES.INTEGRATION_STATUS_CHANGED,
      expect.objectContaining({
        integrationKey: 'whatsapp',
        previousStatus: 'healthy',
        currentStatus: 'down',
        oldStatus: 'healthy',
        newStatus: 'down',
      }),
      { source: 'integrations:health' },
    );
  });
});
