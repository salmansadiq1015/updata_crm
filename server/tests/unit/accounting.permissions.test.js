import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import Permission from '../../src/modules/auth/permission.model.js';
import {
  ACCOUNTING_PERMISSION_KEYS,
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
} from '../../src/seed/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const accountingModuleDir = path.resolve(__dirname, '../../src/modules/accounting');

function getAccountingRoutePermissions() {
  return fs
    .readdirSync(accountingModuleDir)
    .filter((file) => file.endsWith('.routes.js'))
    .flatMap((file) => {
      const source = fs.readFileSync(path.join(accountingModuleDir, file), 'utf8');
      return [...source.matchAll(/requirePermission\('([^']+)'\)/g)].map((match) => match[1]);
    })
    .filter((permission) => permission.startsWith('accounting:'));
}

describe('accounting permission contract', () => {
  test('permission model accepts scoped route actions', () => {
    const permission = new Permission({
      module: 'accounting',
      action: 'reconciliation:manage',
      description: 'Manage reconciliation',
    });

    expect(permission.validateSync()).toBeUndefined();
  });

  test('permission model rejects unsafe action strings', () => {
    const permission = new Permission({
      module: 'accounting',
      action: 'journal export',
      description: 'Invalid action',
    });

    expect(permission.validateSync()).toBeDefined();
  });

  test('all accounting route permissions are seeded', () => {
    const seededKeys = new Set(
      PERMISSION_DEFINITIONS.map((permission) => `${permission.module}:${permission.action}`),
    );

    for (const permission of getAccountingRoutePermissions()) {
      expect(seededKeys.has(permission)).toBe(true);
    }
  });

  test('Buchhalter role receives every accounting route permission', () => {
    const accountantRole = ROLE_DEFINITIONS.find((role) => role.name === 'Buchhalter');

    expect(accountantRole).toBeDefined();
    expect(accountantRole.permissionKeys).toEqual(expect.arrayContaining(ACCOUNTING_PERMISSION_KEYS));
    expect(accountantRole.permissionKeys).toEqual(expect.arrayContaining(getAccountingRoutePermissions()));
  });
});
