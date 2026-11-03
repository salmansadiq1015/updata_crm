import { jest, test, expect } from '@jest/globals';

const updateById = jest.fn(async (id, data) => ({ _id: id, ...data }));
jest.unstable_mockModule('../../src/modules/auth/role.repository.js', () => ({ default: {
  findById: async () => ({ _id: 'admin', name: 'Admin', isSystem: true }), updateById,
} }));
jest.unstable_mockModule('../../src/modules/auth/permission.repository.js', () => ({ default: {
  findByIds: async () => [{ _id: 'read' }],
  findAll: async () => [{ _id: 'read' }, { _id: 'write' }, { _id: 'new-page' }],
} }));
jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({ default: {
  del: async () => {}, invalidatePattern: async () => {},
} }));
jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({ default: { publish: () => {} } }));
const { default: roleService } = await import('../../src/modules/auth/role.service.js');

test('editing Admin retains its name and every permission in the catalog', async () => {
  const result = await roleService.updateRole('admin', { name: 'Renamed', permissions: ['read'], description: 'Updated description' });
  expect(result.name).toBe('Admin');
  expect(result.permissions).toEqual(['read', 'write', 'new-page']);
  expect(result.description).toBe('Updated description');
});
