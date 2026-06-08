import { PERMISSIONS } from '../../src/shared/constants/roles.js';

describe('PM fine-grained permission constants', () => {
  const REQUIRED = [
    'project:create',
    'project:edit',
    'project:read',
    'project:delete',
    'project:status:update',
    'project:status:override',
    'project:prep-actions:manage',
    'project:schedule:manage',
    'project:documents:read',
    'project:documents:write',
    'project:documents:create',
    'project:documents:delete',
  ];

  test.each(REQUIRED)('PERMISSIONS object contains "%s"', (slug) => {
    const values = Object.values(PERMISSIONS);
    expect(values).toContain(slug);
  });
});
