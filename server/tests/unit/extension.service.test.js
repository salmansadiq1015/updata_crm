import mongoose from 'mongoose';
import { jest, describe, expect, test, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import { verifyToken } from '../../src/shared/utils/crypto.js';
import { AuthenticationError } from '../../src/shared/errors/AppError.js';

// --- In-memory Redis fake (grants live only in Redis) -----------------------
const redisStore = new Map();
const fakeRedis = {
  async set(key, value) {
    redisStore.set(key, value);
    return 'OK';
  },
  multi() {
    const ops = [];
    const chain = {
      get(key) { ops.push(['get', key]); return chain; },
      del(key) { ops.push(['del', key]); return chain; },
      async exec() {
        return ops.map(([op, key]) => {
          if (op === 'get') return [null, redisStore.has(key) ? redisStore.get(key) : null];
          const existed = redisStore.delete(key);
          return [null, existed ? 1 : 0];
        });
      },
    };
    return chain;
  },
};

// --- Session service is Redis-backed in production; mock its surface --------
let sessionAlive = true;
const createSession = jest.fn(async () => ({}));
const isSessionActive = jest.fn(async () => sessionAlive);
const revokeSession = jest.fn(async () => undefined);

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  getRedisClient: () => fakeRedis,
  default: {},
}));

jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({
  default: { createSession, isSessionActive, revokeSession },
}));

jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

let User, Role, extensionService, ExtensionConnection;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/permission.model.js');
  await import('../../src/modules/extension/extensionConnection.model.js');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  ExtensionConnection = mongoose.model('ExtensionConnection');
  extensionService = (await import('../../src/modules/extension/extension.service.js')).default;
});

beforeEach(() => {
  sessionAlive = true;
  createSession.mockClear();
  isSessionActive.mockClear();
  revokeSession.mockClear();
  redisStore.clear();
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

async function seedUser(overrides = {}) {
  const role = await Role.create({ name: `Role_${new mongoose.Types.ObjectId()}`, permissions: [], isSystem: true });
  return User.create({
    email: `u_${new mongoose.Types.ObjectId()}@example.com`,
    firstName: 'Ada',
    lastName: 'Lovelace',
    passwordHash: 'x',
    role: role._id,
    status: 'active',
    ...overrides,
  });
}

describe('extension pairing grant', () => {
  test('mints a single-use grant bound to the user and pinned extension id', async () => {
    const user = await seedUser();
    const { grant, extensionId, expiresInSec } = await extensionService.createPairingGrant(user._id, {});
    expect(grant).toMatch(/^[a-f0-9]{64}$/);
    expect(extensionId).toBe('bnmjibohjdkkibimeknikhnolhlbgmnk');
    expect(expiresInSec).toBe(300);
    // Stored only in Redis, keyed by the opaque code.
    expect([...redisStore.keys()][0]).toContain(grant);
  });

  test('redeeming a grant mints an extension session + rotating tokens, no password', async () => {
    const user = await seedUser();
    const { grant } = await extensionService.createPairingGrant(user._id, {});

    const result = await extensionService.redeemPairingGrant(grant, {
      instanceId: 'browser-abc',
      extensionVersion: '0.3.0',
      meta: { ipAddress: '1.2.3.4', browser: 'Chrome', os: 'macOS' },
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.id).toBe(user._id.toString());

    // Tokens are real JWTs tied to a new session (sid), subject = the user.
    const decoded = verifyToken(result.accessToken);
    expect(decoded.sub).toBe(user._id.toString());
    expect(decoded.sid).toBeTruthy();

    // A dedicated 'extension' session was created via the existing stack.
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0][2]).toMatchObject({ deviceType: 'extension' });

    // The connection record is owned by the grant's user (server-derived).
    const conn = await ExtensionConnection.findOne({ createdBy: user._id });
    expect(conn).toBeTruthy();
    expect(conn.status).toBe('connected');
    expect(conn.instanceId).toBe('browser-abc');
    expect(conn.sessionId).toBe(decoded.sid);
  });

  test('a grant cannot be redeemed twice (single-use)', async () => {
    const user = await seedUser();
    const { grant } = await extensionService.createPairingGrant(user._id, {});
    await extensionService.redeemPairingGrant(grant, { instanceId: 'b1' });
    await expect(extensionService.redeemPairingGrant(grant, { instanceId: 'b1' }))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  test('an unknown/expired grant is rejected', async () => {
    await expect(extensionService.redeemPairingGrant('deadbeef'.repeat(8), { instanceId: 'b1' }))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  test('redeeming for a deactivated account is refused', async () => {
    const user = await seedUser();
    const { grant } = await extensionService.createPairingGrant(user._id, {});
    await User.findByIdAndUpdate(user._id, { status: 'deactivated' });
    await expect(extensionService.redeemPairingGrant(grant, { instanceId: 'b1' }))
      .rejects.toBeInstanceOf(AuthenticationError);
  });

  test('reconnecting the same browser install reuses one row and revokes the old session', async () => {
    const user = await seedUser();
    const first = await extensionService.createPairingGrant(user._id, {});
    const r1 = await extensionService.redeemPairingGrant(first.grant, { instanceId: 'same-install' });
    const firstSid = verifyToken(r1.accessToken).sid;

    const second = await extensionService.createPairingGrant(user._id, {});
    await extensionService.redeemPairingGrant(second.grant, { instanceId: 'same-install' });

    // Old session revoked, still exactly one connection row for that install.
    // (Compare as strings: the service loads its own ObjectId instance.)
    expect(revokeSession).toHaveBeenCalledTimes(1);
    const [calledUserId, calledSid] = revokeSession.mock.calls[0];
    expect(String(calledUserId)).toBe(user._id.toString());
    expect(calledSid).toBe(firstSid);
    const rows = await ExtensionConnection.find({ createdBy: user._id, instanceId: 'same-install' });
    expect(rows).toHaveLength(1);
  });
});

describe('extension status + disconnect', () => {
  test('status is connected only while the backing session is alive', async () => {
    const user = await seedUser();
    const { grant } = await extensionService.createPairingGrant(user._id, {});
    await extensionService.redeemPairingGrant(grant, { instanceId: 'b1' });

    sessionAlive = true;
    const ok = await extensionService.getStatusForUser(user._id);
    expect(ok.connected).toBe(true);
    expect(ok.extensionId).toBe('bnmjibohjdkkibimeknikhnolhlbgmnk');

    // Session gone (logout-all / revoked elsewhere) → never falsely "connected".
    sessionAlive = false;
    const stale = await extensionService.getStatusForUser(user._id);
    expect(stale.connected).toBe(false);
    expect(stale.error).toBe('session_expired');
  });

  test('status is false when the user never connected', async () => {
    const user = await seedUser();
    const status = await extensionService.getStatusForUser(user._id);
    expect(status.connected).toBe(false);
    expect(status.connection).toBeNull();
  });

  test('disconnect revokes the token session and marks the record revoked', async () => {
    const user = await seedUser();
    const { grant } = await extensionService.createPairingGrant(user._id, {});
    const r = await extensionService.redeemPairingGrant(grant, { instanceId: 'b1' });
    const sid = verifyToken(r.accessToken).sid;

    const out = await extensionService.disconnect(user._id, {});
    expect(out.disconnected).toBe(1);
    expect(revokeSession).toHaveBeenCalledWith(user._id, sid);

    const conn = await ExtensionConnection.findOne({ createdBy: user._id });
    expect(conn.status).toBe('revoked');
    expect(conn.sessionId).toBeNull();

    sessionAlive = true; // even if a session somehow lingered
    const status = await extensionService.getStatusForUser(user._id);
    expect(status.connected).toBe(false);
  });

  test("one user cannot disconnect another user's connection", async () => {
    const a = await seedUser();
    const b = await seedUser();
    const g = await extensionService.createPairingGrant(a._id, {});
    const r = await extensionService.redeemPairingGrant(g.grant, { instanceId: 'b1' });
    const aSid = verifyToken(r.accessToken).sid;
    const aConn = await ExtensionConnection.findOne({ createdBy: a._id });

    // User B targets A's connection id explicitly — must be a no-op.
    const out = await extensionService.disconnect(b._id, { connectionId: aConn._id.toString() });
    expect(out.disconnected).toBe(0);
    expect(revokeSession).not.toHaveBeenCalledWith(a._id, aSid);
    const stillThere = await ExtensionConnection.findOne({ createdBy: a._id });
    expect(stillThere.status).toBe('connected');
  });
});
