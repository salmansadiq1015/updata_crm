import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from '@jest/globals';
import { PERMISSION_DEFINITIONS, ROLE_DEFINITIONS } from '../../src/seed/seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const keys = PERMISSION_DEFINITIONS.map((p) => `${p.module}:${p.action}`);
const seeded = new Set(keys);
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.[jt]sx?$/.test(file) ? [fs.readFileSync(file, 'utf8')] : [];
  });
}

describe('page permission catalog', () => {
  test('seeds every permission constant and literal page or route guard', () => {
    const used = new Set();
    for (const file of ['client/src/shared/constants/permissions.ts', 'server/src/shared/constants/roles.js']) {
      for (const match of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/: '([a-z][a-z-]*:[a-z][a-z:_-]*)'/g)) used.add(match[1]);
    }
    for (const source of [...sources(path.join(root, 'server/src/modules')), ...sources(path.join(root, 'client/src'))]) {
      for (const match of source.matchAll(/(?:requirePermission\(['"]|hasPermission\(['"]|permission[=:]\s*[{'"]*)([a-z][a-z-]*:[a-z][a-z:_-]*)/g)) used.add(match[1]);
    }
    expect([...used].filter((key) => !seeded.has(key))).toEqual([]);
  });
  test('has no duplicates and automatically grants all permissions to Admin', () => {
    expect(seeded.size).toBe(keys.length);
    expect(ROLE_DEFINITIONS.find((role) => role.name === 'Admin').permissionKeys).toBe('*');
  });
});
