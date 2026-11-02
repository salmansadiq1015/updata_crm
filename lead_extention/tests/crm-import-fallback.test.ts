import { afterEach, describe, expect, it, vi } from 'vitest';
import { importLeads } from '../src/integration/crm-api';
import { makeLead } from '../src/shared/normalize';

const gym = () => makeLead({
  businessName: 'PURE GYM', googleMapsUrl: 'https://www.google.com/maps/place/PURE+GYM',
  area: 'Park Plaza', city: 'Mohammedia', country: 'Morocco', rating: 4.8,
}, 'search-gym', 'Mohammedia, Morocco', 'Gym');

function setupAuth() {
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: (key: string, callback: (value: unknown) => void) => callback({ [key]: { apiBaseUrl: 'https://crm.example.invalid/api/v1', user: { id: 'user-1' } } }) },
      session: { get: (_keys: string[], callback: (value: unknown) => void) => callback({ 'crm-access-token': 'isolated-test-token' }) },
    },
  });
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('authenticated extension import fallback', () => {
  it('retains provenance, area, fallback category and actual row identity after a 404', async () => {
    setupAuth();
    const lead = gym();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not found' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: {
        summary: { total: 1, created: 1, duplicates: 0, failed: 0 },
        results: [{ clientId: lead.id, status: 'created', leadId: 'crm-1' }],
      } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await importLeads([lead]);
    expect(result).toMatchObject({ created: 1, failed: 0, results: [{ clientId: lead.id, leadId: 'crm-1', status: 'created' }] });
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toMatch(/\/crm\/leads\/import$/);
    expect(request.headers.get('Authorization')).toBe('Bearer isolated-test-token');
    const form = request.body as FormData;
    expect(form.get('source')).toBe('extension');
    const csv = await (form.get('file') as Blob).text();
    expect(csv).toContain('extensionRecord');
    expect(csv).toContain('""category"":""Gym""');
    expect(csv).toContain('Park Plaza');
    const structured = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(structured.leads[0]).toMatchObject({ category: 'Gym', discoveryCategories: ['Gym'], area: 'Park Plaza', city: 'Mohammedia', rating: 4.8 });
  });

  it('does not hide real validation errors behind a generic CSV import', async () => {
    setupAuth();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Invalid record' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(importLeads([gym()])).rejects.toThrow('Invalid record');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
