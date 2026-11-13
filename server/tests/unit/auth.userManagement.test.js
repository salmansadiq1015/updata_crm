import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { jest, describe, expect, test, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import { AuthenticationError, ConflictError } from '../../src/shared/errors/AppError.js';

const addJob = jest.fn(async () => ({}));
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob } }));

const revokeAllUserSessions = jest.fn(async () => 0);
const updateProject = jest.fn(async (projectId, patch) => ({ _id: projectId, ...patch }));
const findAssignmentsForUser = jest.fn(async () => ({ data: [], pagination: { hasNext: false, nextCursor: null, limit: 25 } }));

jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({
  default: {
    revokeAllUserSessions,
    getFailedLoginCount: jest.fn(async () => 0),
    clearFailedLogin: jest.fn(async () => 0),
    createSession: jest.fn(async () => ({})),
  },
}));

jest.unstable_mockModule('../../src/modules/pm/project.service.js', () => ({
  default: {
    update: updateProject,
  },
}));

jest.unstable_mockModule('../../src/modules/pm/project.repository.js', () => ({
  default: {
    findAssignmentsForUser,
  },
}));

let app, cacheManager, generateAccessToken, User, Role, Department, userService, authService, createUserSchema, updateUserSchema, updateMeSchema;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/permission.model.js');
  await import('../../src/modules/qop/department.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  Department = mongoose.model('Department');
  userService = (await import('../../src/modules/auth/user.service.js')).default;
  authService = (await import('../../src/modules/auth/auth.service.js')).default;
  cacheManager = (await import('../../src/shared/cache/CacheManager.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  const { default: routes } = await import('../../src/modules/auth/user.routes.js');
  app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.success = ({ data, statusCode = 200 }) => res.status(statusCode).json({ data });
    res.fail = ({ message, statusCode }) => res.status(statusCode).json({ message });
    next();
  });
  app.use('/users', routes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  ({ createUserSchema, updateUserSchema, updateMeSchema } = await import('../../src/modules/auth/user.validation.js'));
});

beforeEach(() => {
  cacheManager?.l1.flush();
  addJob.mockClear();
  revokeAllUserSessions.mockClear();
  updateProject.mockClear();
  findAssignmentsForUser.mockClear();
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

async function seedRole(name = `Role_${new mongoose.Types.ObjectId()}`) {
  return Role.create({ name, permissions: [], isSystem: true });
}

async function seedUser(overrides = {}) {
  const role = overrides.role || (await seedRole())._id;
  const passwordHash = await bcrypt.hash('Test1234!', 4);
  return User.create({
    email: overrides.email || `user${new mongoose.Types.ObjectId()}@test.ch`,
    passwordHash,
    firstName: 'Test',
    lastName: 'User',
    role,
    status: 'active',
    ...overrides,
  });
}

describe('admin user management validation', () => {
  test('create and update schemas accept editable address fields', () => {
    const roleId = new mongoose.Types.ObjectId().toString();
    const preferredDepartmentId = new mongoose.Types.ObjectId().toString();
    const payload = {
      email: 'max.muster@example.ch',
      firstName: 'Max',
      lastName: 'Muster',
      roleId,
      preferredDepartmentId,
      street: 'Musterstrasse 1',
      zip: '8000',
      city: 'Zuerich',
      country: 'Schweiz',
    };

    expect(createUserSchema.body.validate(payload, { abortEarly: false }).error).toBeUndefined();
    expect(updateUserSchema.body.validate({
      preferredDepartmentId,
      street: 'Neue Strasse 2',
      zip: '3000',
      city: 'Bern',
      country: 'Schweiz',
    }, { abortEarly: false }).error).toBeUndefined();
    expect(updateMeSchema.body.validate({
      department: 'Service',
      position: 'Techniker',
      street: 'Eigene Strasse 3',
      zip: '9000',
      city: 'St. Gallen',
      country: 'Schweiz',
    }, { abortEarly: false }).error).toBeUndefined();
  });
});

describe('admin activation lifecycle', () => {
  test('deactivate keeps the user visible in admin lists and revokes sessions', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser();

    const updated = await userService.deactivateUser(target._id.toString(), actor._id);

    expect(updated.status).toBe('deactivated');
    expect(revokeAllUserSessions).toHaveBeenCalledWith(target._id.toString());
    const visible = await User.findById(target._id).lean();
    expect(visible).toEqual(expect.objectContaining({
      status: 'deactivated',
      isDeleted: false,
      deletedAt: null,
    }));
  });

  test('activate restores legacy soft-deleted deactivated users', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser({ status: 'deactivated', isDeleted: true, deletedAt: new Date() });

    const updated = await userService.activateUser(target._id.toString(), actor._id);

    expect(updated.status).toBe('active');
    const visible = await User.findById(target._id).lean();
    expect(visible).toEqual(expect.objectContaining({
      status: 'active',
      isDeleted: false,
      deletedAt: null,
    }));
  });

  test.each(['Admin', 'Technician'])('new %s users are active and can finish invitation password setup', async (roleName) => {
    const role = await seedRole(roleName);
    const actor = await seedUser({ role: role._id });
    const created = await userService.createUser({
      email: 'new@example.ch', firstName: 'New', lastName: 'User', roleId: role._id.toString(),
    }, actor._id);
    expect(created.status).toBe('active');
    expect(created.passwordHash).toBeUndefined();
    expect(created.activationTokenHash).toBeUndefined();
    const job = addJob.mock.calls.find(([, name]) => name === 'send-activation-email');
    const token = new URL(job[2].activationUrl).searchParams.get('token');

    await userService.deactivateUser(created._id.toString(), actor._id);
    await expect(authService.activate(token, 'ChosenPassword123!')).rejects.toBeInstanceOf(AuthenticationError);
    await userService.activateUser(created._id.toString(), actor._id);
    await authService.activate(token, 'ChosenPassword123!');
    const saved = await User.findById(created._id).select('+passwordHash +activationTokenHash');
    expect(await bcrypt.compare('ChosenPassword123!', saved.passwordHash)).toBe(true);
    expect(saved.activationTokenHash).toBeNull();
    expect(saved.status).toBe('active');
    await expect(authService.activate(token, 'OtherPassword123!')).rejects.toBeInstanceOf(AuthenticationError);
  });

  test('admins can activate pending users without losing their password setup invitation', async () => {
    const { generateActivationToken } = await import('../../src/shared/utils/crypto.js');
    const { token, hashedToken, expires } = generateActivationToken();
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser({ status: 'pending_activation', activationTokenHash: hashedToken, activationTokenExpires: expires });
    const updated = await userService.activateUser(target._id.toString(), actor._id);
    expect(updated.status).toBe('active');
    await authService.activate(token, 'ChosenPassword123!');
    expect((await User.findById(target._id)).status).toBe('active');
  });

  test.each([false, true])('pending admins can be deactivated with only one other active admin (bulk=%s)', async (bulk) => {
    const role = await seedRole('Admin');
    const actor = await seedUser({ role: role._id });
    const target = await seedUser({ role: role._id, status: 'pending_activation' });
    if (bulk) {
      expect(await userService.bulkDeactivateUsers([target._id.toString()], actor._id)).toEqual({ deactivatedCount: 1 });
    } else {
      expect((await userService.deactivateUser(target._id.toString(), actor._id)).status).toBe('deactivated');
    }
    expect((await User.findById(actor._id)).status).toBe('active');
  });

  test('admins cannot deactivate themselves or the last active admin', async () => {
    const role = await seedRole('Admin');
    const target = await seedUser({ role: role._id });
    const actor = await seedUser();
    await expect(userService.deactivateUser(target._id.toString(), target._id)).rejects.toBeInstanceOf(ConflictError);
    await expect(userService.deactivateUser(target._id.toString(), actor._id)).rejects.toBeInstanceOf(ConflictError);
    await expect(userService.bulkDeactivateUsers([target._id.toString()], actor._id)).rejects.toBeInstanceOf(ConflictError);
  });

  test('role changes cannot remove the last active admin', async () => {
    const adminRole = await seedRole('Admin');
    const userRole = await seedRole('User');
    const target = await seedUser({ role: adminRole._id });

    await expect(
      userService.updateUser(
        target._id.toString(),
        { roleId: userRole._id.toString() },
        target._id,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('admin user project assignment', () => {
  test('assignProject delegates manager assignment through the PM service', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser();
    const projectId = new mongoose.Types.ObjectId().toString();

    await userService.assignProject(
      target._id.toString(),
      { projectId, assignmentType: 'manager' },
      actor._id,
      { ipAddress: '127.0.0.1' },
    );

    expect(updateProject).toHaveBeenCalledWith(
      projectId,
      { projectManagerId: target._id.toString() },
      actor._id,
      { ipAddress: '127.0.0.1' },
    );
  });

  test('assignProject rejects inactive users', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser({ status: 'deactivated' });

    await expect(userService.assignProject(
      target._id.toString(),
      { projectId: new mongoose.Types.ObjectId().toString(), assignmentType: 'manager' },
      actor._id,
    )).rejects.toBeInstanceOf(ConflictError);
  });

  test('assignProject delegates team assignment through the user preferred department', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const departmentId = new mongoose.Types.ObjectId();
    const target = await seedUser({
      preferences: { preferredDepartmentId: departmentId },
    });
    const projectId = new mongoose.Types.ObjectId().toString();

    await userService.assignProject(
      target._id.toString(),
      { projectId, assignmentType: 'team' },
      actor._id,
    );

    expect(updateProject).toHaveBeenCalledWith(
      projectId,
      { teamId: departmentId },
      actor._id,
      {},
    );
  });

  test('updateUser persists the preferred department target for team assignment', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser();
    const department = await Department.create({ name: 'Service', code: 'SVC' });

    const updated = await userService.updateUser(
      target._id.toString(),
      { preferredDepartmentId: department._id.toString() },
      actor._id,
    );

    expect(updated.preferences.preferredDepartmentId.toString()).toBe(department._id.toString());
  });

  test('listAssignmentTargets returns active departments only', async () => {
    const active = await Department.create({ name: 'Service', code: 'SVC' });
    await Department.create({ name: 'Inactive', code: 'OLD', isActive: false });

    const targets = await userService.listAssignmentTargets();

    expect(targets).toEqual([
      expect.objectContaining({
        _id: active._id,
        id: active._id.toString(),
        name: 'Service',
        code: 'SVC',
      }),
    ]);
  });

  test('listAssignedProjects marks manager and team assignment roles', async () => {
    const departmentId = new mongoose.Types.ObjectId();
    const target = await seedUser({
      preferences: { preferredDepartmentId: departmentId },
    });
    const managerProjectId = new mongoose.Types.ObjectId();
    const teamProjectId = new mongoose.Types.ObjectId();
    findAssignmentsForUser.mockResolvedValueOnce({
      data: [
        { _id: managerProjectId, projectManagerId: target._id, teamId: null },
        { _id: teamProjectId, projectManagerId: new mongoose.Types.ObjectId(), teamId: departmentId },
      ],
      pagination: { hasNext: false, nextCursor: null, limit: 25 },
    });

    const result = await userService.listAssignedProjects(target._id.toString(), {});

    expect(result.data[0].assignmentRoles).toEqual(['manager']);
    expect(result.data[1].assignmentRoles).toEqual(['team']);
    expect(findAssignmentsForUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: target._id.toString(),
      teamIds: [departmentId.toString()],
    }));
  });
});


function bearer(user) {
  return `Bearer ${generateAccessToken({ sub: String(user._id) })}`;
}

describe('user deletion and API access', () => {
  test.each(['active', 'pending_activation', 'deactivated', 'locked'])('Admin can delete another %s admin; historical references remain', async (status) => {
    const role = await seedRole('Admin');
    const actor = await seedUser({ role: role._id });
    const target = await seedUser({ role: role._id, status, activationTokenHash: 'secret', resetTokenHash: 'reset' });
    await mongoose.connection.collection('projects').insertOne({ projectManagerId: target._id, name: 'Historical project' });
    await userService.getById(String(target._id)); // warm detail cache
    await userService.getStats();
    const response = await request(app).delete(`/users/${target._id}`).set('Authorization', bearer(actor)).expect(200);
    expect(response.body.data).toEqual({ deletedCount: 1 });
    expect(await User.findById(target._id)).toBeNull();
    const saved = await User.findById(target._id).setOptions({ includeDeleted: true }).select('+activationTokenHash +resetTokenHash');
    expect(saved.status).toBe('deactivated');
    expect(saved.activationTokenHash).toBeNull();
    expect(saved.resetTokenHash).toBeNull();
    expect(revokeAllUserSessions).toHaveBeenCalledWith(String(target._id));
    expect((await userService.getStats()).total).toBe(1);
    await expect(userService.getById(String(target._id))).rejects.toThrow('not found');
    expect(await mongoose.connection.collection('projects').countDocuments({ projectManagerId: target._id })).toBe(1);
    await request(app).get('/users').set('Authorization', bearer(target)).expect(401);
    expect(addJob.mock.calls.some(([, , payload]) => payload?.eventType === 'user.deleted')).toBe(true);
  });

  test('bulk delete removes exactly selected accounts and fails before writes on a missing ID', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const first = await seedUser();
    const second = await seedUser({ status: 'pending_activation' });
    const other = await seedUser();
    await request(app).post('/users/bulk-delete').set('Authorization', bearer(actor))
      .send({ ids: [String(first._id), String(new mongoose.Types.ObjectId())] }).expect(404);
    expect(await User.findById(first._id)).not.toBeNull();
    await request(app).post('/users/bulk-delete').set('Authorization', bearer(actor))
      .send({ ids: [String(first._id), String(first._id)] }).expect(400);
    const response = await request(app).post('/users/bulk-delete').set('Authorization', bearer(actor))
      .send({ ids: [String(first._id), String(second._id)] }).expect(200);
    expect(response.body.data.deletedCount).toBe(2);
    expect(await User.findById(first._id)).toBeNull();
    expect(await User.findById(second._id)).toBeNull();
    expect(await User.findById(other._id)).not.toBeNull();
  });

  test('deletion protects the last active admin and permits self deletion when another remains', async () => {
    const role = await seedRole('Admin');
    const actor = await seedUser({ role: role._id });
    await request(app).delete(`/users/${actor._id}`).set('Authorization', bearer(actor)).expect(409);
    const other = await seedUser({ role: role._id });
    await request(app).post('/users/bulk-delete').set('Authorization', bearer(actor))
      .send({ ids: [String(actor._id), String(other._id)] }).expect(409);
    await request(app).delete(`/users/${actor._id}`).set('Authorization', bearer(actor)).expect(200);
    expect((await User.findById(other._id)).status).toBe('active');
  });

  test('Admin with no explicit permissions can create, read, edit, activate and bulk deactivate', async () => {
    const role = await seedRole('Admin');
    const actor = await seedUser({ role: role._id });
    const created = await request(app).post('/users').set('Authorization', bearer(actor)).send({
      firstName: 'New', lastName: 'Admin', email: 'new-admin@example.ch', roleId: String(role._id), birthDate: null,
    }).expect(201);
    const id = created.body.data._id;
    await request(app).get(`/users/${id}`).set('Authorization', bearer(actor)).expect(200);
    await request(app).patch(`/users/${id}`).set('Authorization', bearer(actor)).send({ city: 'Bern' }).expect(200);
    await request(app).post('/users/bulk-deactivate').set('Authorization', bearer(actor)).send({ ids: [id] }).expect(200);
    expect((await User.findById(id)).isDeleted).toBe(false);
    await request(app).patch('/users/bulk-update').set('Authorization', bearer(actor)).send({ ids: [id], data: { status: 'active' } }).expect(200);
    expect((await User.findById(id)).status).toBe('active');
  });

  test('users without permissions cannot create, edit, activate, deactivate or delete', async () => {
    const actor = await seedUser();
    const target = await seedUser();
    const auth = bearer(actor);
    for (const endpoint of [`/users/${target._id}`, '/users/bulk-update']) {
      await request(app).patch(endpoint).set('Authorization', auth).send({ firstName: 'Denied' }).expect(403);
    }
    await request(app).post('/users').set('Authorization', auth).send({}).expect(403);
    for (const suffix of ['activate', 'deactivate']) {
      await request(app).patch(`/users/${target._id}/${suffix}`).set('Authorization', auth).expect(403);
    }
    for (const action of ['bulk-delete', 'bulk-deactivate']) {
      await request(app).post(`/users/${action}`).set('Authorization', auth).send({ ids: [String(target._id)] }).expect(403);
    }
    await request(app).delete(`/users/${target._id}`).set('Authorization', auth).expect(403);
    await request(app).post(`/users/${target._id}/resend-invitation`).set('Authorization', auth).expect(403);
  });

  test('users:write alone allows profile edits but not status changes or deletes', async () => {
    const Permission = mongoose.model('Permission');
    const permission = await Permission.create({ module: 'users', action: 'write' });
    const role = await Role.create({ name: 'Editor', permissions: [permission._id] });
    const actor = await seedUser({ role: role._id });
    const target = await seedUser();
    await request(app).patch(`/users/${target._id}`).set('Authorization', bearer(actor)).send({ firstName: 'Allowed' }).expect(200);
    await request(app).patch(`/users/${target._id}`).set('Authorization', bearer(actor)).send({ status: 'deactivated' }).expect(403);
    await request(app).delete(`/users/${target._id}`).set('Authorization', bearer(actor)).expect(403);
    const adminRole = await seedRole('Admin');
    await request(app).patch(`/users/${actor._id}`).set('Authorization', bearer(actor)).send({ roleId: String(adminRole._id) }).expect(403);
    await request(app).post('/users').set('Authorization', bearer(actor)).send({
      firstName: 'Escalate', lastName: 'Role', email: 'escalate@example.ch', roleId: String(adminRole._id),
    }).expect(403);
  });

  test.each(['locked', 'deactivated'])('single and bulk status edits cannot disable the last admin (%s)', async (status) => {
    const admin = await seedUser({ role: (await seedRole('Admin'))._id });
    const actor = await seedUser();
    await expect(userService.updateUser(String(admin._id), { status }, actor._id)).rejects.toBeInstanceOf(ConflictError);
    await expect(userService.bulkUpdateUsers([String(admin._id)], { status }, actor._id)).rejects.toBeInstanceOf(ConflictError);
  });

  test('status edits revoke sessions and reactivation clears lockout fields', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser({ failedLoginAttempts: 9, lockedUntil: new Date(Date.now() + 10000) });
    await userService.updateUser(String(target._id), { status: 'locked' }, actor._id);
    expect(revokeAllUserSessions).toHaveBeenCalledWith(String(target._id));
    await userService.bulkUpdateUsers([String(target._id)], { status: 'active' }, actor._id);
    const saved = await User.findById(target._id).select('+failedLoginAttempts +lockedUntil');
    expect(saved.failedLoginAttempts).toBe(0);
    expect(saved.lockedUntil).toBeNull();
  });

  test('resending an invitation replaces its expired token without returning secrets', async () => {
    const role = await seedRole('Admin');
    const actor = await seedUser({ role: role._id });
    const target = await userService.createUser({ email: 'invite@example.ch', firstName: 'Invite', lastName: 'User', roleId: String(role._id) }, actor._id);
    await User.findByIdAndUpdate(target._id, { activationTokenExpires: new Date(0) });
    const response = await request(app).post(`/users/${target._id}/resend-invitation`).set('Authorization', bearer(actor)).expect(200);
    expect(response.body.data).toEqual({ sent: true });
    const jobs = addJob.mock.calls.filter(([, name]) => name === 'send-activation-email');
    const token = new URL(jobs.at(-1)[2].activationUrl).searchParams.get('token');
    await authService.activate(token, 'FreshPassword123!');
    expect((await userService.getById(String(target._id))).invitationPending).toBe(false);
    await request(app).post(`/users/${target._id}/resend-invitation`).set('Authorization', bearer(actor)).expect(409);
  });

  test('all submitted identity, address, assignment and scheduling data persist and invalid assignments are rejected', async () => {
    const role = await seedRole('Admin');
    const actor = await seedUser({ role: role._id });
    const department = await Department.create({ name: 'Operations', code: 'OPS' });
    const payload = {
      email: 'profile@example.ch', firstName: 'Full', lastName: 'Profile', salutation: 'frau', birthDate: '1990-01-02',
      initials: 'FP', phone: '+41791234567', department: 'Service', position: 'Manager', language: 'fr',
      street: 'Test 12', addressSupplement: 'c/o Team', zip: '8000', city: 'Zurich', country: 'Schweiz',
      roleId: String(role._id), preferredDepartmentId: String(department._id),
      schedulingSkills: ['Repair'], schedulingCertifications: ['Safety'],
    };
    const response = await request(app).post('/users').set('Authorization', bearer(actor)).send(payload).expect(201);
    const { roleId, preferredDepartmentId, birthDate, ...expected } = payload;
    expect(response.body.data).toMatchObject(expected);
    expect(response.body.data.role._id).toBe(roleId);
    expect(response.body.data.preferences.preferredDepartmentId).toBe(preferredDepartmentId);
    expect(response.body.data.birthDate).toBe('1990-01-02T00:00:00.000Z');
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|activationTokenHash|resetTokenHash/);
    await request(app).patch(`/users/${response.body.data._id}`).set('Authorization', bearer(actor))
      .send({ preferredDepartmentId: String(new mongoose.Types.ObjectId()) }).expect(404);
    await request(app).patch(`/users/${response.body.data._id}`).set('Authorization', bearer(actor)).send({}).expect(400);
  });
});


describe('permission hydration for client sessions', () => {
  test('login queries and profile reads return usable role permissions after reload and profile save', async () => {
    const permission = await mongoose.model('Permission').create({ module: 'users', action: 'write' });
    const role = await Role.create({ name: 'Profile Editor', permissions: [permission._id] });
    const actor = await seedUser({ role: role._id });
    const { default: repo } = await import('../../src/modules/auth/user.repository.js');
    const loginUser = await repo.findByEmail(actor.email, { includeSecrets: true, populateRole: { permissions: true } });
    expect(loginUser.role.permissions[0]).toMatchObject({ module: 'users', action: 'write' });
    const me = await userService.getMe(String(actor._id));
    expect(me.role.permissions[0]).toMatchObject({ module: 'users', action: 'write' });
    const updated = await userService.updateMe(String(actor._id), { city: 'Bern' });
    expect(updated.role.permissions[0]).toMatchObject({ module: 'users', action: 'write' });
    expect(updated.city).toBe('Bern');
    expect(updated.passwordHash).toBeUndefined();
  });
});


it('password reset consumes any outstanding invitation so it cannot replace the new password', async () => {
  const { generateActivationToken, generateResetToken } = await import('../../src/shared/utils/crypto.js');
  const invite = generateActivationToken();
  const reset = generateResetToken();
  const user = await seedUser({ activationTokenHash: invite.hashedToken, activationTokenExpires: invite.expires,
    resetTokenHash: reset.hashedToken, resetTokenExpires: reset.expires });
  await authService.confirmPasswordReset(reset.resetToken, 'NewPasswordForReset123!');
  await expect(authService.activate(invite.token, 'OtherPassword123!')).rejects.toBeInstanceOf(AuthenticationError);
  expect((await userService.getById(String(user._id))).invitationPending).toBe(false);
});


describe('admin-created sign-in credentials', () => {
  test('accepts a chosen password, stores only its hash and signs in without invitation setup', async () => {
    const role = await seedRole('Admin');
    const actor = await seedUser({ role: role._id });
    const password = 'ChosenCredential123!';
    const response = await request(app).post('/users').set('Authorization', bearer(actor)).send({
      firstName: 'Password', lastName: 'User', email: 'chosen@example.ch', roleId: String(role._id), password,
    }).expect(201);
    expect(response.body.data.status).toBe('active');
    expect(response.body.data.invitationPending).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain(password);
    const saved = await User.findById(response.body.data._id).select('+passwordHash +activationTokenHash +passwordChangedAt');
    expect(saved.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, saved.passwordHash)).toBe(true);
    expect(saved.activationTokenHash).toBeNull();
    expect(saved.passwordChangedAt).toBeInstanceOf(Date);
    expect(addJob.mock.calls.some(([, name]) => name === 'send-activation-email')).toBe(false);
    const signedIn = await authService.login('chosen@example.ch', password);
    expect(signedIn.accessToken).toBeTruthy();
    expect(signedIn.user.email).toBe('chosen@example.ch');
    expect(JSON.stringify(signedIn)).not.toContain(password);
  });

  test.each(['short', 'alllowercasepassword', 'NoNumberOrSymbol', 'x'.repeat(129)])('rejects a password outside the shared policy (%s)', (password) => {
    const result = createUserSchema.body.validate({ firstName: 'New', lastName: 'User', email: 'valid@example.ch',
      roleId: String(new mongoose.Types.ObjectId()), password });
    expect(result.error).toBeDefined();
  });
});


describe('administrator password updates', () => {
  test('hashes the new password, revokes sessions and invalidates outstanding credential links', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser({ activationTokenHash: 'invite', resetTokenHash: 'reset' });
    const id = String(target._id);
    await userService.getById(id);
    const password = 'UpdatedCredential123!';
    const response = await request(app).patch(`/users/${id}`).set('Authorization', bearer(actor))
      .send({ password }).expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|activationTokenHash|resetTokenHash/);
    expect(JSON.stringify(response.body)).not.toContain(password);
    const saved = await User.findById(id).select('+passwordHash +passwordChangedAt +activationTokenHash +resetTokenHash');
    expect(await bcrypt.compare(password, saved.passwordHash)).toBe(true);
    expect(await bcrypt.compare('Test1234!', saved.passwordHash)).toBe(false);
    expect(saved.passwordChangedAt).toBeInstanceOf(Date);
    expect(saved.activationTokenHash).toBeNull();
    expect(saved.resetTokenHash).toBeNull();
    expect(revokeAllUserSessions).toHaveBeenCalledWith(id);
    expect((await userService.getById(id)).invitationPending).toBe(false);
    expect(addJob.mock.calls.some(([, , payload]) => payload?.eventType === 'password.changed')).toBe(true);
    await request(app).patch(`/users/${id}`).set('Authorization', bearer(actor)).send({ password }).expect(400);
    await request(app).patch(`/users/${id}`).set('Authorization', bearer(actor)).send({ password: 'AnotherCredential123!' }).expect(200);
    await request(app).patch(`/users/${id}`).set('Authorization', bearer(actor)).send({ password }).expect(400);
  });

  test('rejects weak or blank passwords and prevents profile editors from changing credentials', async () => {
    const admin = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser();
    for (const password of ['', 'weak', 'x'.repeat(129)]) {
      await request(app).patch(`/users/${target._id}`).set('Authorization', bearer(admin)).send({ password }).expect(400);
    }
    const permission = await mongoose.model('Permission').create({ module: 'users', action: 'write' });
    const role = await Role.create({ name: 'Profile editor', permissions: [permission._id] });
    const editor = await seedUser({ role: role._id });
    await request(app).patch(`/users/${target._id}`).set('Authorization', bearer(editor))
      .send({ password: 'DeniedCredential123!' }).expect(403);
    const saved = await User.findById(target._id).select('+passwordHash');
    expect(await bcrypt.compare('Test1234!', saved.passwordHash)).toBe(true);
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
  });
});
