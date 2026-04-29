import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Project, ProjectDocument, ScheduleEntry, Role, User, Customer;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/pm/projectDocument.model.js');
  await import('../../src/modules/pm/scheduleEntry.model.js');
  Project = mongoose.model('Project');
  ProjectDocument = mongoose.model('ProjectDocument');
  ScheduleEntry = mongoose.model('ScheduleEntry');
  Role = mongoose.model('Role');
  User = mongoose.model('User');
  Customer = mongoose.model('Customer');
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let counter = 0;
function seq() { return ++counter; }

async function seedUser() {
  const role = await Role.create({ name: `R_${seq()}`, permissions: [] });
  return User.create({
    email: `u${seq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Test',
    lastName: 'PM',
    role: role._id,
    status: 'active',
  });
}

async function seedCustomer(userId) {
  const n = seq();
  return Customer.create({
    customerNumber: `K-${30000 + n}`,
    name: `Kunde ${n}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: userId,
  });
}

async function seedProject(overrides = {}) {
  const user = await seedUser();
  const customer = overrides.customerId
    ? { _id: overrides.customerId }
    : await seedCustomer(user._id);
  const n = seq();
  const { customerId: _c, projectManagerId: _p, ...rest } = overrides;
  return Project.create({
    projectNumber: `P-${40000 + n}`,
    name: `Projekt ${n}`,
    projectType: 'NEW_INSTALLATION',
    customerId: _c || customer._id,
    projectManagerId: _p || user._id,
    createdBy: user._id,
    status: 'DRAFT',
    ...rest,
  });
}

describe('Project Model', () => {
  test('creates a project with defaults', async () => {
    const p = await seedProject();
    expect(p._id).toBeDefined();
    expect(p.status).toBe('DRAFT');
    expect(p.currency).toBe('CHF');
  });

  test('enforces unique projectNumber', async () => {
    await seedProject({ projectNumber: 'P-DUP' });
    await expect(seedProject({ projectNumber: 'P-DUP' })).rejects.toThrow();
  });

  test('soft-delete hides project', async () => {
    const p = await seedProject();
    await Project.findByIdAndUpdate(p._id, { isDeleted: true, deletedAt: new Date() });
    expect(await Project.findById(p._id)).toBeNull();
    expect(
      await Project.findById(p._id).setOptions({ includeDeleted: true }),
    ).not.toBeNull();
  });

  test('rejects invalid projectType', async () => {
    await expect(seedProject({ projectType: 'INVALID_TYPE' })).rejects.toThrow();
  });

  test('rejects invalid status', async () => {
    const p = await seedProject();
    await expect(
      Project.findByIdAndUpdate(p._id, { status: 'INVALID' }, { runValidators: true }),
    ).rejects.toThrow();
  });

  test('stores planned dates', async () => {
    const start = new Date('2026-06-01');
    const end = new Date('2026-12-31');
    const p = await seedProject({ plannedStartDate: start, plannedEndDate: end });
    const found = await Project.findById(p._id).lean();
    expect(found.plannedStartDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(found.plannedEndDate.toISOString().slice(0, 10)).toBe('2026-12-31');
  });
});

describe('ProjectDocument Model', () => {
  test('creates a document linked to project', async () => {
    const p = await seedProject();
    const user = await seedUser();
    const doc = await ProjectDocument.create({
      projectId: p._id,
      fileName: 'plan-v1.pdf',
      category: 'PLANS',
      uploadedBy: user._id,
    });
    expect(doc.category).toBe('PLANS');
    expect(doc.isGenerated).toBe(false);
    expect(doc.version).toBe(1);
  });

  test('soft-delete and restore', async () => {
    const p = await seedProject();
    const user = await seedUser();
    const doc = await ProjectDocument.create({
      projectId: p._id,
      fileName: 'contract.pdf',
      category: 'CONTRACTS',
      uploadedBy: user._id,
    });

    await ProjectDocument.findByIdAndUpdate(doc._id, { isDeleted: true, deletedAt: new Date() });
    expect(await ProjectDocument.findById(doc._id)).toBeNull();

    await ProjectDocument.findByIdAndUpdate(
      doc._id,
      { isDeleted: false, deletedAt: null },
      { new: true },
    ).setOptions({ includeDeleted: true });
    const restored = await ProjectDocument.findById(doc._id).lean();
    expect(restored).not.toBeNull();
    expect(restored.isDeleted).toBe(false);
  });

  test('rejects invalid category', async () => {
    const p = await seedProject();
    const user = await seedUser();
    await expect(
      ProjectDocument.create({
        projectId: p._id,
        fileName: 'file.pdf',
        category: 'INVALID_CATEGORY',
        uploadedBy: user._id,
      }),
    ).rejects.toThrow();
  });

  test('filters by category and search', async () => {
    const p = await seedProject();
    const user = await seedUser();
    await ProjectDocument.create([
      { projectId: p._id, fileName: 'plan-alpha.pdf', category: 'PLANS', uploadedBy: user._id },
      { projectId: p._id, fileName: 'plan-beta.pdf', category: 'PLANS', uploadedBy: user._id },
      { projectId: p._id, fileName: 'contract.pdf', category: 'CONTRACTS', uploadedBy: user._id },
    ]);

    const plans = await ProjectDocument.find({ projectId: p._id, category: 'PLANS' }).lean();
    expect(plans).toHaveLength(2);

    const searchResult = await ProjectDocument.find({
      projectId: p._id,
      fileName: { $regex: 'alpha', $options: 'i' },
    }).lean();
    expect(searchResult).toHaveLength(1);
    expect(searchResult[0].fileName).toBe('plan-alpha.pdf');
  });
});

describe('ScheduleEntry Model', () => {
  test('creates a PHASE entry', async () => {
    const p = await seedProject();
    const user = await seedUser();
    const entry = await ScheduleEntry.create({
      projectId: p._id,
      name: 'Rohbau',
      entryType: 'PHASE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-08-15'),
      createdBy: user._id,
    });
    expect(entry.entryType).toBe('PHASE');
    expect(entry.status).toBe('PLANNED');
  });

  test('creates a MILESTONE entry', async () => {
    const p = await seedProject();
    const user = await seedUser();
    const entry = await ScheduleEntry.create({
      projectId: p._id,
      name: 'Abnahme',
      entryType: 'MILESTONE',
      milestoneDate: new Date('2026-09-01'),
      createdBy: user._id,
    });
    expect(entry.entryType).toBe('MILESTONE');
    expect(entry.milestoneDate).toBeDefined();
  });

  test('soft-delete hides entry', async () => {
    const p = await seedProject();
    const user = await seedUser();
    const entry = await ScheduleEntry.create({
      projectId: p._id,
      name: 'Hidden phase',
      entryType: 'PHASE',
      createdBy: user._id,
    });
    await ScheduleEntry.findByIdAndUpdate(entry._id, { isDeleted: true, deletedAt: new Date() });
    expect(await ScheduleEntry.findById(entry._id)).toBeNull();
  });

  test('sorts by sortOrder', async () => {
    const p = await seedProject();
    const user = await seedUser();
    await ScheduleEntry.create([
      { projectId: p._id, name: 'Phase C', entryType: 'PHASE', sortOrder: 3, createdBy: user._id },
      { projectId: p._id, name: 'Phase A', entryType: 'PHASE', sortOrder: 1, createdBy: user._id },
      { projectId: p._id, name: 'Phase B', entryType: 'PHASE', sortOrder: 2, createdBy: user._id },
    ]);
    const entries = await ScheduleEntry.find({ projectId: p._id }).sort({ sortOrder: 1 }).lean();
    expect(entries.map(e => e.name)).toEqual(['Phase A', 'Phase B', 'Phase C']);
  });

  test('status transitions are valid', async () => {
    const p = await seedProject();
    const user = await seedUser();
    const entry = await ScheduleEntry.create({
      projectId: p._id,
      name: 'Transition test',
      entryType: 'PHASE',
      createdBy: user._id,
    });

    const updated = await ScheduleEntry.findByIdAndUpdate(
      entry._id,
      { status: 'IN_PROGRESS' },
      { new: true, runValidators: true },
    ).lean();
    expect(updated.status).toBe('IN_PROGRESS');

    const completed = await ScheduleEntry.findByIdAndUpdate(
      entry._id,
      { status: 'COMPLETED' },
      { new: true, runValidators: true },
    ).lean();
    expect(completed.status).toBe('COMPLETED');
  });
});

describe('PM Joi Validation', () => {
  let createProjectSchema;
  let listProjectsSchema;

  beforeAll(async () => {
    const mod = await import('../../src/modules/pm/project.validation.js');
    createProjectSchema = mod.createProjectSchema;
    listProjectsSchema = mod.listProjectsSchema;
  });

  test('rejects end date before start date', () => {
    const { error } = createProjectSchema.body.validate({
      name: 'Test',
      projectType: 'NEW_INSTALLATION',
      customerId: new mongoose.Types.ObjectId().toString(),
      projectManagerId: new mongoose.Types.ObjectId().toString(),
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-05-01',
    });
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('after planned start date');
  });

  test('accepts valid date range', () => {
    const { error } = createProjectSchema.body.validate({
      name: 'Test',
      projectType: 'NEW_INSTALLATION',
      customerId: new mongoose.Types.ObjectId().toString(),
      projectManagerId: new mongoose.Types.ObjectId().toString(),
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-12-31',
    });
    expect(error).toBeUndefined();
  });

  test('listProjectsSchema accepts myOnly boolean', () => {
    const { error, value } = listProjectsSchema.query.validate({
      myOnly: true,
    });
    expect(error).toBeUndefined();
    expect(value.myOnly).toBe(true);
  });
});
