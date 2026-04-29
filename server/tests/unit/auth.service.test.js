import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let User, Role, AuditLog;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  AuditLog = mongoose.model('AuditLog');
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

async function seedRole(name = 'Admin', permissions = []) {
  return Role.create({ name, permissions, isSystem: true });
}

async function seedUser(overrides = {}) {
  const role = overrides.role || (await seedRole(`Role_${Date.now()}_${Math.random()}`))._id;
  const passwordHash = await bcrypt.hash('Test1234!', 4);
  return User.create({
    email: overrides.email || `user${Date.now()}${Math.random()}@test.ch`,
    passwordHash,
    firstName: 'Test',
    lastName: 'User',
    role,
    status: overrides.status || 'active',
    ...overrides,
  });
}

describe('User Model', () => {
  test('creates a user with required fields', async () => {
    const user = await seedUser({ email: 'hello@test.ch' });
    expect(user._id).toBeDefined();
    expect(user.email).toBe('hello@test.ch');
    expect(user.status).toBe('active');
  });

  test('lowercases email on save', async () => {
    const user = await seedUser({ email: 'UPPER@TEST.CH' });
    expect(user.email).toBe('upper@test.ch');
  });

  test('enforces unique email', async () => {
    await seedUser({ email: 'dup@test.ch' });
    await expect(seedUser({ email: 'dup@test.ch' })).rejects.toThrow();
  });

  test('soft-delete pre-hook excludes deleted users', async () => {
    const user = await seedUser();
    await User.findByIdAndUpdate(user._id, { isDeleted: true, deletedAt: new Date() });
    const found = await User.findById(user._id);
    expect(found).toBeNull();
    const foundWithDeleted = await User.findById(user._id).setOptions({ includeDeleted: true });
    expect(foundWithDeleted).not.toBeNull();
  });

  test('passwordHash is excluded by default', async () => {
    const user = await seedUser();
    const found = await User.findById(user._id).lean();
    expect(found.passwordHash).toBeUndefined();
  });

  test('passwordHash is included with select +passwordHash', async () => {
    const user = await seedUser();
    const found = await User.findById(user._id).select('+passwordHash').lean();
    expect(found.passwordHash).toBeDefined();
  });

  test('changedPasswordAfter returns true for old timestamps', async () => {
    const user = await seedUser();
    const doc = await User.findById(user._id);
    doc.passwordChangedAt = new Date();
    await doc.save();
    expect(doc.changedPasswordAfter(Math.floor(Date.now() / 1000) - 100)).toBe(true);
  });

  test('changedPasswordAfter returns false when no passwordChangedAt', async () => {
    const user = await seedUser();
    const doc = await User.findById(user._id);
    expect(doc.changedPasswordAfter(Math.floor(Date.now() / 1000))).toBe(false);
  });

  test('failedLoginAttempts and lockedUntil fields exist', async () => {
    const user = await seedUser();
    await User.findByIdAndUpdate(user._id, {
      failedLoginAttempts: 3,
      lockedUntil: new Date(Date.now() + 900000),
    });
    const found = await User.findById(user._id).select('+failedLoginAttempts +lockedUntil').lean();
    expect(found.failedLoginAttempts).toBe(3);
    expect(found.lockedUntil).toBeDefined();
  });
});

describe('AuditLog Model', () => {
  test('accepts any eventType string (no strict enum)', async () => {
    const log = await AuditLog.create({
      eventType: 'customer.created',
      userId: new mongoose.Types.ObjectId(),
      ipAddress: '127.0.0.1',
      result: 'success',
      module: 'crm',
    });
    expect(log.eventType).toBe('customer.created');
  });

  test('accepts auth event types', async () => {
    const log = await AuditLog.create({
      eventType: 'login.success',
      userId: new mongoose.Types.ObjectId(),
      ipAddress: '127.0.0.1',
      result: 'success',
    });
    expect(log.eventType).toBe('login.success');
  });

  test('accepts PM event types', async () => {
    const log = await AuditLog.create({
      eventType: 'project_document.uploaded',
      userId: new mongoose.Types.ObjectId(),
      ipAddress: '127.0.0.1',
      result: 'success',
      module: 'pm',
    });
    expect(log.eventType).toBe('project_document.uploaded');
  });

  test('rejects missing eventType', async () => {
    await expect(
      AuditLog.create({
        userId: new mongoose.Types.ObjectId(),
        ipAddress: '127.0.0.1',
        result: 'success',
      }),
    ).rejects.toThrow();
  });
});

describe('Role Model', () => {
  test('creates a role', async () => {
    const role = await seedRole('Technician');
    expect(role.name).toBe('Technician');
    expect(role.isSystem).toBe(true);
  });

  test('enforces unique role name', async () => {
    await seedRole('UniqueRole');
    await expect(seedRole('UniqueRole')).rejects.toThrow();
  });
});
