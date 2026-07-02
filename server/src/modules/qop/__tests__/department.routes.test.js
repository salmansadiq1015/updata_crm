import { describe, expect, it, jest } from '@jest/globals';

const requirePermissionMock = jest.fn((permission) => {
  const middleware = (_req, _res, next) => next();
  middleware.requiredPermission = permission;
  return middleware;
});

jest.unstable_mockModule('../../../shared/middleware/authenticate.js', () => ({
  authenticate: (_req, _res, next) => next(),
  requirePermission: requirePermissionMock,
}));

jest.unstable_mockModule('../department.controller.js', () => ({
  default: {
    list: (_req, _res, next) => next(),
    create: (_req, _res, next) => next(),
    update: (_req, _res, next) => next(),
  },
}));

describe('department routes', () => {
  it('allows department reference reads with quotation read permission only', async () => {
    await import('../department.routes.js');

    expect(requirePermissionMock.mock.calls.map(([permission]) => permission)).toEqual([
      'quotations:read',
      'quotations:admin',
      'quotations:admin',
    ]);
  });
});
