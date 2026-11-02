import { describe, expect, it } from 'vitest';
import { CRM_WEB_ORIGIN, crmApiBaseForOrigin, isTrustedCrmOrigin } from '../src/shared/crm-connect';
import { normalizeApiBaseUrl } from '../src/integration/crm-api';

describe('CRM connect origin trust gate', () => {
  it('trusts only the exact allow-listed CRM web origins', () => {
    expect(isTrustedCrmOrigin(CRM_WEB_ORIGIN)).toBe(true);
    expect(isTrustedCrmOrigin('https://updata-crm.vercel.app')).toBe(true); // production (Vercel) frontend
    expect(isTrustedCrmOrigin('https://updata.behjja.com/')).toBe(false); // trailing slash is not an origin
    expect(isTrustedCrmOrigin('https://evil.example')).toBe(false);
    expect(isTrustedCrmOrigin('http://updata.behjja.com')).toBe(false); // must be https
    expect(isTrustedCrmOrigin('https://updata.behjja.com.evil.example')).toBe(false);
    expect(isTrustedCrmOrigin('https://updata-crm.vercel.app.evil.example')).toBe(false);
    expect(isTrustedCrmOrigin('https://evil.vercel.app')).toBe(false); // not a blanket *.vercel.app
    expect(isTrustedCrmOrigin(null)).toBe(false);
    expect(isTrustedCrmOrigin(undefined)).toBe(false);
  });

  it('derives the versioned API base from a web origin', () => {
    expect(CRM_WEB_ORIGIN).toBe('https://updata-crm.vercel.app');
    expect(crmApiBaseForOrigin(CRM_WEB_ORIGIN)).toBe('https://updata-crm.vercel.app/api/v1');
    expect(crmApiBaseForOrigin('https://updata.behjja.com/')).toBe('https://updata.behjja.com/api/v1');
  });
});

describe('CRM API base normalisation (redeem endpoint target)', () => {
  it('always resolves to an /api/v1 base, idempotently', () => {
    expect(normalizeApiBaseUrl('https://updata.behjja.com')).toBe('https://updata.behjja.com/api/v1');
    expect(normalizeApiBaseUrl('https://updata.behjja.com/api/v1')).toBe('https://updata.behjja.com/api/v1');
    expect(normalizeApiBaseUrl('https://updata.behjja.com/')).toBe('https://updata.behjja.com/api/v1');
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => normalizeApiBaseUrl('ftp://updata.behjja.com')).toThrow();
  });
});
