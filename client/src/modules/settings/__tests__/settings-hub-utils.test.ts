import { describe, expect, test } from 'vitest';
import {
  SETTINGS_HUB_CATEGORIES,
  SETTINGS_HUB_DEFAULT_CATEGORY,
  SETTINGS_HUB_ITEMS,
} from '../constants/settings-hub';
import {
  buildSettingsHubStats,
  filterSettingsHubItems,
  getSettingsHealthMeta,
  getVisibleSettingsCategories,
  getVisibleSettingsItems,
  groupSettingsItemsByCategory,
} from '../utils/settings-hub-utils';

type SettingsItem = (typeof SETTINGS_HUB_ITEMS)[number];
type SettingsCategory = (typeof SETTINGS_HUB_CATEGORIES)[number];

function hasPermission(permission: string) {
  return new Set(['users:read', 'roles:read', 'settings:read', 'templates:read']).has(permission);
}

function translate(key: string) {
  const values: Record<string, string> = {
    'settingsHub.item.users.title': 'Users',
    'settingsHub.item.users.description': 'Manage employee accounts',
    'settingsHub.item.users.badge': 'Access',
    'settingsHub.item.templates.title': 'Document Templates',
    'settingsHub.item.templates.description': 'Maintain PDF templates',
  };
  return values[key] || key;
}

describe('settings hub utilities', () => {
  test('filters visible settings by permissions', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);
    const ids = visible.map((item: SettingsItem) => item.id);

    // The rule, not the roster: every visible item is one this user may open,
    // and nothing they may open is hidden. Spelling the list out here meant
    // that adding an ordinary settings entry broke a test with nothing to say
    // about it.
    expect(visible.every((item: SettingsItem) => hasPermission(item.permission))).toBe(true);
    expect(ids).toEqual(expect.arrayContaining(['users', 'roles', 'system', 'templates']));
    expect(SETTINGS_HUB_ITEMS.filter((item: SettingsItem) => hasPermission(item.permission)).length)
      .toBe(visible.length);
  });

  test('keeps only categories with visible items plus the all category', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);
    const categories = getVisibleSettingsCategories(SETTINGS_HUB_CATEGORIES, visible);

    const ids = categories.map((category: SettingsCategory) => category.id);
    expect(ids[0]).toBe('all');
    // Every category kept has something in it, and nothing with something in
    // it was dropped.
    const withItems = new Set(visible.map((item: SettingsItem) => item.category));
    expect(new Set(ids.slice(1))).toEqual(withItems);
  });

  test('filters by category, translated text, href, and permission', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);

    expect(filterSettingsHubItems(visible, {
      category: 'documents',
      search: 'pdf',
      translate,
    }).map((item: SettingsItem) => item.id)).toEqual(['templates']);

    expect(filterSettingsHubItems(visible, {
      category: SETTINGS_HUB_DEFAULT_CATEGORY,
      search: 'settings:read',
      translate,
    }).map((item: SettingsItem) => item.id)).toEqual(['system']);

    expect(filterSettingsHubItems(visible, {
      category: 'integrations',
      search: '',
      translate,
    })).toEqual([]);
  });

  test('builds stats and health metadata without leaking inaccessible routes', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);
    const categories = getVisibleSettingsCategories(SETTINGS_HUB_CATEGORIES, visible);

    expect(buildSettingsHubStats(visible, categories, 'degraded')).toEqual({
      available: visible.length,
      // 'all' is a filter, not a section of its own.
      categories: categories.length - 1,
      protected: visible.filter((item: SettingsItem) => item.permission).length,
      healthStatus: 'degraded',
      healthLabelKey: 'settingsHub.health.degraded',
      healthProgress: 65,
    });
    expect(getSettingsHealthMeta('missing')).toEqual(getSettingsHealthMeta('unknown'));
  });

  test('groups filtered settings by category for section rendering', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);

    const grouped = groupSettingsItemsByCategory(visible);
    expect(grouped.access).toEqual([
      expect.objectContaining({ id: 'users' }),
      expect.objectContaining({ id: 'roles' }),
    ]);
    expect(grouped.operations).toEqual([expect.objectContaining({ id: 'system' })]);
    // Every visible item lands in its own category, and nowhere else.
    for (const item of visible) {
      expect(grouped[item.category].map((x: { id: string }) => x.id)).toContain(item.id);
    }
  });
});
