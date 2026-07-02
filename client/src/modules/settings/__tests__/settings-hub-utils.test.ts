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
    const ids = visible.map((item) => item.id);

    expect(ids).toEqual(['users', 'roles', 'system', 'templates']);
    expect(visible.every((item) => hasPermission(item.permission))).toBe(true);
  });

  test('keeps only categories with visible items plus the all category', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);
    const categories = getVisibleSettingsCategories(SETTINGS_HUB_CATEGORIES, visible);

    expect(categories.map((category) => category.id)).toEqual(['all', 'access', 'operations', 'documents']);
  });

  test('filters by category, translated text, href, and permission', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);

    expect(filterSettingsHubItems(visible, {
      category: 'documents',
      search: 'pdf',
      translate,
    }).map((item) => item.id)).toEqual(['templates']);

    expect(filterSettingsHubItems(visible, {
      category: SETTINGS_HUB_DEFAULT_CATEGORY,
      search: 'settings:read',
      translate,
    }).map((item) => item.id)).toEqual(['system']);

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
      available: 4,
      categories: 3,
      protected: 4,
      healthStatus: 'degraded',
      healthLabelKey: 'settingsHub.health.degraded',
      healthProgress: 65,
    });
    expect(getSettingsHealthMeta('missing')).toEqual(getSettingsHealthMeta('unknown'));
  });

  test('groups filtered settings by category for section rendering', () => {
    const visible = getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission);

    expect(groupSettingsItemsByCategory(visible)).toMatchObject({
      access: [{ id: 'users' }, { id: 'roles' }],
      operations: [{ id: 'system' }],
      documents: [{ id: 'templates' }],
    });
  });
});
