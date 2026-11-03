import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const findById = jest.fn();
const findByIdAndUpdate = jest.fn();
jest.unstable_mockModule('../../src/modules/system/sidebarSettings.model.js', () => ({ default: { findById, findByIdAndUpdate } }));
jest.unstable_mockModule('../../src/modules/system/system.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.user = { _id: 'admin-id' };
    next();
  },
  requirePermission: (permission) => (req, res, next) => {
    if (permission !== 'settings:admin' || req.headers.authorization !== 'admin') return res.sendStatus(403);
    next();
  },
}));
const { default: router } = await import('../../src/modules/system/system.routes.js');
function dispatch(method, authorization, body) {
  return new Promise((resolve, reject) => {
    const req = { method, url: '/sidebar', headers: { authorization }, body };
    const res = {
      sendStatus: (status) => resolve({ status }),
      success: (body) => resolve({ status: 200, body }),
      fail: ({ statusCode, ...body }) => resolve({ status: statusCode, body }),
    };
    router.handle(req, res, (error) => error ? reject(error) : reject(new Error('No response')));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  findById.mockReturnValue({ lean: async () => null });
  findByIdAndUpdate.mockImplementation((id, update) => ({ lean: async () => update.$set }));
});
describe('shared sidebar settings', () => {
  test('requires authentication to read and admin permission to write', async () => {
    expect((await dispatch('GET')).status).toBe(401);
    expect((await dispatch('PUT', 'reader', { hiddenMenus: [] })).status).toBe(403);
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
    expect((await dispatch('GET', 'reader')).body.data).toEqual({ hiddenMenus: [] });
  });
  test('persists menu choices, deduplicates and prevents hiding Settings', async () => {
    const response = await dispatch('PUT', 'admin', { hiddenMenus: ['ai-admin', '/leads', '/leads', '/admin/settings'] });
    expect(response.status).toBe(200);
    expect(response.body.data.hiddenMenus).toEqual(['ai-admin', '/leads']);
    expect(findByIdAndUpdate).toHaveBeenCalledWith('sidebar', { $set: { hiddenMenus: ['ai-admin', '/leads'], updatedBy: 'admin-id' } }, expect.objectContaining({ upsert: true, runValidators: true }));
  });
  test.each([null, 'ai-admin', [123], [''], Array(301).fill('/leads')])('rejects invalid menu lists (case %#)', async (hiddenMenus) => {
    expect((await dispatch('PUT', 'admin', { hiddenMenus })).status).toBe(400);
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });
  test('reads saved choices for other users', async () => {
    findById.mockReturnValue({ lean: async () => ({ hiddenMenus: ['ai-admin'] }) });
    const response = await dispatch('GET', 'reader');
    expect(response.body.data).toEqual({ hiddenMenus: ['ai-admin'] });
  });
});
