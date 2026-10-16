import { onlineManager } from '@tanstack/react-query';

import { ApiError } from '@/services/api/apiErrors';

import { errorKind, errorMessageKey } from '../errorMessages';

const http = (status: number, code?: string) =>
  new ApiError({ kind: 'http', status, code, message: 'raw server text' });

describe('error mapping', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('maps known server codes before HTTP statuses', () => {
    expect(errorMessageKey(http(401, 'INVALID_CREDENTIALS'))).toBe('errors.invalidCredentials');
    expect(errorMessageKey(http(423, 'ACCOUNT_LOCKED'))).toBe('errors.accountLocked');
    expect(errorMessageKey(http(401, 'SESSION_EXPIRED'))).toBe('errors.sessionExpired');
  });

  it.each([
    [400, 'errors.validation'],
    [403, 'errors.forbidden'],
    [404, 'errors.notFound'],
    [429, 'errors.rateLimited'],
    [500, 'errors.server'],
    [418, 'errors.unknown'],
  ])('HTTP %i → %s', (status, key) => expect(errorMessageKey(http(status))).toBe(key));

  it('distinguishes offline from an unreachable server', () => {
    const network = new ApiError({ kind: 'network', message: 'x' });
    expect(errorMessageKey(network)).toBe('errors.network');
    onlineManager.setOnline(false);
    expect(errorMessageKey(network)).toBe('errors.offline');
    expect(errorKind(network)).toBe('offline');
  });

  it('never surfaces raw errors', () => {
    expect(errorMessageKey(new Error('TypeError: x is undefined at foo.js:1'))).toBe('errors.unknown');
    expect(errorKind(http(403))).toBe('forbidden');
  });
});
