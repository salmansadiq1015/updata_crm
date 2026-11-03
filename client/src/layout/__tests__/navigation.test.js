import { describe, expect, it } from 'vitest';
import { isNavigationLeafActive } from '../navigation';

describe('sidebar active route', () => {
  it.each(['/leads/follow-ups', '/leads/follow-ups/123', '/leads/follow-ups/'])(
    'highlights only Follow-ups on %s', (pathname) => {
      expect(isNavigationLeafActive('/leads/follow-ups', pathname)).toBe(true);
      expect(isNavigationLeafActive('/leads', pathname)).toBe(false);
    },
  );

  it.each(['/leads', '/leads/123', '/leads/123/edit'])(
    'keeps Leads active on %s', (pathname) => {
      expect(isNavigationLeafActive('/leads', pathname)).toBe(true);
      expect(isNavigationLeafActive('/leads/follow-ups', pathname)).toBe(false);
    },
  );

  it('also gives dedicated catalog and integration pages their own highlight', () => {
    expect(isNavigationLeafActive('/catalog', '/catalog/connections')).toBe(false);
    expect(isNavigationLeafActive('/catalog/connections', '/catalog/connections')).toBe(true);
    expect(isNavigationLeafActive('/admin/integrations', '/admin/integrations/widget/submissions')).toBe(false);
    expect(isNavigationLeafActive('/admin/integrations/widget/submissions', '/admin/integrations/widget/submissions')).toBe(true);
  });

  it('requires a path segment boundary', () => {
    expect(isNavigationLeafActive('/leads', '/leads-other')).toBe(false);
    expect(isNavigationLeafActive('/leads/follow-ups', '/leads/follow-ups-other')).toBe(false);
    expect(isNavigationLeafActive('/leads', '/leads/follow-ups-other')).toBe(true);
  });
});
