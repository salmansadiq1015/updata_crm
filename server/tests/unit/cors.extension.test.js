import { LEAD_FINDER_EXTENSION_ORIGIN, isCorsOriginAllowed } from '../../src/shared/middleware/cors.js';

describe('Lead Finder extension CORS boundary', () => {
  test('allows only the release-pinned extension origin', () => {
    expect(LEAD_FINDER_EXTENSION_ORIGIN).toBe('chrome-extension://bnmjibohjdkkibimeknikhnolhlbgmnk');
    expect(isCorsOriginAllowed(LEAD_FINDER_EXTENSION_ORIGIN)).toBe(true);
    expect(isCorsOriginAllowed('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
  });
});
