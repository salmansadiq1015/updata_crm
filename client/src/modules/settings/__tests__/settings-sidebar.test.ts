import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { PERMISSIONS } from '@/shared/constants/permissions';

function getSettingsSidebarItem() {
  const source = readFileSync(resolve(process.cwd(), 'src/layout/navigation.js'), 'utf8');
  const match = source.match(/\{ type: 'leaf', labelKey: 'sidebar\.settings'[^}]+}/s);
  return match?.[0] || '';
}

describe('settings sidebar entry', () => {
  test('is enabled and points at the settings hub', () => {
    const settingsItem = getSettingsSidebarItem();

    expect(settingsItem).toContain("href: '/admin/settings'");
    expect(settingsItem).toContain('permission: PERMISSIONS.SETTINGS_READ');
    expect(settingsItem).not.toContain('disabled');
    expect(PERMISSIONS.SETTINGS_READ).toBe('settings:read');
    expect(PERMISSIONS.SETTINGS_ADMIN).toBe('settings:admin');
  });
});
