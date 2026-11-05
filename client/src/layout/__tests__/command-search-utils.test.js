import { describe, it, expect } from 'vitest';
import { getSearchPages, rankSearchItems } from '../command-search-utils';

describe('command search matching', () => {
  const items = [
    { label: 'Lead generation', href: '/lead-generation', keywords: ['discovery'] },
    { label: 'Leads', href: '/leads' },
    { label: 'Employés', href: '/settings/users', keywords: ['employees', 'users'] },
  ];
  it('ranks exact labels ahead of longer labels and supports aliases', () => {
    expect(rankSearchItems(items, 'leads')[0].label).toBe('Leads');
    expect(rankSearchItems(items, 'discovery')[0].href).toBe('/lead-generation');
    expect(rankSearchItems(items, 'users')[0].label).toBe('Employés');
  });
  it('normalizes accents, case and whitespace, and supports reordered tokens', () => {
    expect(rankSearchItems(items, '  EMPLOYES  ')).toHaveLength(1);
    expect(rankSearchItems(items, 'generation lead')[0].href).toBe('/lead-generation');
    expect(rankSearchItems(items, 'lead-generation')[0].href).toBe('/lead-generation');
    expect(rankSearchItems(items, '/settings/users')[0].href).toBe('/settings/users');
    expect(rankSearchItems(items, 'zzzz')).toEqual([]);
  });
  it('deduplicates routes while retaining aliases and respects leaf permissions', () => {
    const sections = [{ titleKey: 'main', items: [
      { labelKey: 'nav.employees', href: '/users', permission: 'users:read' },
      { labelKey: 'nav.users', href: '/users', permission: 'users:read' },
      { labelKey: 'nav.admin', children: [
        { labelKey: 'nav.audit', href: '/audit', permission: 'audit:read' },
        { labelKey: 'nav.tasks', href: '/tasks', permission: 'tasks:read' },
      ] },
    ] }];
    const pages = getSearchPages(sections, permission => permission !== 'audit:read', key => key);
    expect(pages.map(page => page.href)).toEqual(['/users', '/tasks']);
    expect(rankSearchItems(pages, 'users')[0].href).toBe('/users');
  });
});
