import { describe, it, expect } from '@jest/globals';
import { satisfiesPermission, PERMISSION_IMPLICATIONS } from '../authenticate.js';

describe('satisfiesPermission — granular permission implications', () => {
  it('matches a directly-held permission', () => {
    expect(satisfiesPermission(['projects:read'], 'projects:read')).toBe(true);
    expect(satisfiesPermission(['project:create'], 'project:create')).toBe(true);
  });

  it('grants granular spec permissions via the coarse implication', () => {
    expect(satisfiesPermission(['projects:write'], 'project:create')).toBe(true);
    expect(satisfiesPermission(['projects:write'], 'project:edit')).toBe(true);
    expect(satisfiesPermission(['projects:write'], 'project:documents:write')).toBe(true);
    expect(satisfiesPermission(['projects:read'], 'project:read')).toBe(true);
    expect(satisfiesPermission(['projects:admin'], 'project:status:override')).toBe(true);
    expect(satisfiesPermission(['projects:delete'], 'project:documents:delete')).toBe(true);
  });

  it('denies when neither a direct match nor an implication exists', () => {
    expect(satisfiesPermission(['projects:read'], 'project:create')).toBe(false);
    expect(satisfiesPermission([], 'project:read')).toBe(false);
    expect(satisfiesPermission(['crm:write'], 'project:create')).toBe(false);
  });

  it('implication map is purely additive (coarse keys only)', () => {
    for (const key of Object.keys(PERMISSION_IMPLICATIONS)) {
      expect(key.startsWith('projects:')).toBe(true);
    }
  });
});
