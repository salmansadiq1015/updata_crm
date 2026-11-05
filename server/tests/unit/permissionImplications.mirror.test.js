import { describe, expect, test } from '@jest/globals';
import { PERMISSION_IMPLICATIONS, satisfiesPermission } from '../../src/shared/middleware/authenticate.js';
import { PERMISSION_IMPLICATIONS as CLIENT_IMPLICATIONS, satisfiesPermission as clientSatisfies } from '../../../client/src/shared/auth/permission-implications.mjs';

/**
 * The web client mirrors the server's permission implications so the menu shows what
 * the API allows. The two maps must never drift.
 */
describe('client permission implications mirror', () => {
  test('the client map equals the server map exactly', () => {
    expect(CLIENT_IMPLICATIONS).toEqual(PERMISSION_IMPLICATIONS);
  });

  test('the client check gives the same answer as the server for every implication', () => {
    const all = [...new Set([...Object.keys(PERMISSION_IMPLICATIONS), ...Object.values(PERMISSION_IMPLICATIONS).flat()])];
    for (const held of Object.keys(PERMISSION_IMPLICATIONS)) {
      for (const required of all) expect([held, required, clientSatisfies([held], required)]).toEqual([held, required, satisfiesPermission([held], required)]);
    }
    expect(clientSatisfies(['ai-calling:read'], 'inbound-calls:read')).toBe(true);
    expect(clientSatisfies(['inbound-calls:read'], 'ai-calling:read')).toBe(false);
  });
});
