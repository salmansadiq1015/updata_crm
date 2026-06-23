import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { jest, describe, expect, test, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import { ConflictError } from '../../src/shared/errors/AppError.js';

const revokeAllUserSessions = jest.fn(async () => 0);
const updateProject = jest.fn(async (projectId, patch) => ({ _id: projectId, ...patch }));
const findAssignmentsForUser = jest.fn(async () => ({ data: [], pagination: { hasNext: false, nextCursor: null, limit: 25 } }));

jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({
  default: {
    revokeAllUserSessions,
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

let User, Role, Department, userService, createUserSchema, updateUserSchema, updateMeSchema;

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
  ({ createUserSchema, updateUserSchema, updateMeSchema } = await import('../../src/modules/auth/user.validation.js'));
});

beforeEach(() => {
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

  test('admin activation does not bypass pending invitation activation', async () => {
    const actor = await seedUser({ role: (await seedRole('Admin'))._id });
    const target = await seedUser({ status: 'pending_activation' });

    await expect(
      userService.activateUser(target._id.toString(), actor._id),
    ).rejects.toBeInstanceOf(ConflictError);
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
