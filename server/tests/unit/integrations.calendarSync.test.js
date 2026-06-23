import { afterEach, describe, expect, jest, test } from '@jest/globals';

async function loadCalendarService() {
  jest.resetModules();

  const calendarConnectionRepository = {
    findByUserId: jest.fn(async () => [
      {
        provider: 'google',
        status: 'connected',
        connectedAt: new Date('2026-06-01T10:00:00Z'),
        tokenExpiresAt: new Date('2026-06-01T11:00:00Z'),
        lastSyncAt: new Date('2026-06-01T10:30:00Z'),
      },
    ]),
    findByUserIdAndProvider: jest.fn(async () => ({
      _id: 'conn-1',
      provider: 'google',
      status: 'connected',
    })),
    upsert: jest.fn(async (userId, provider, data) => ({ userId, provider, ...data })),
    deleteByUserId: jest.fn(async () => ({ deletedCount: 1 })),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/integrations/calendarConnection.repository.js', () => ({
    default: calendarConnectionRepository,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/integrations/calendarSync.service.js')).default;
  return { service, calendarConnectionRepository, auditService };
}

describe('calendarSyncService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  });

  test('generates Google OAuth URL with state containing user and provider', async () => {
    const { service } = await loadCalendarService();
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'google-client';
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://api.example.test/calendar/callback';

    const authUrl = service.getAuthUrl('user-1', 'google');
    const url = new URL(authUrl);
    const state = JSON.parse(url.searchParams.get('state'));

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('google-client');
    expect(state).toEqual({ userId: 'user-1', provider: 'google' });
  });

  test('stores OAuth tokens and reports per-provider connection status', async () => {
    const { service, calendarConnectionRepository } = await loadCalendarService();
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'google-client';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'google-secret';
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://api.example.test/calendar/callback';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      }),
    });

    await service.handleCallback('user-1', 'google', 'code-1');
    const status = await service.getConnectionStatus('user-1');

    expect(calendarConnectionRepository.upsert).toHaveBeenCalledWith('user-1', 'google', expect.objectContaining({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      status: 'connected',
      connectedAt: expect.any(Date),
    }));
    expect(status.google).toMatchObject({ isConnected: true, status: 'connected' });
    expect(status.outlook).toMatchObject({ isConnected: false, status: 'disconnected' });
  });
});
