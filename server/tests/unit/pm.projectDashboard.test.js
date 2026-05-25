import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Customer;
let Project;
let projectRepository;
let projectService;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/crm/site.model.js');
  ({ default: Customer } = await import('../../src/modules/crm/customer.model.js'));
  ({ default: Project } = await import('../../src/modules/pm/project.model.js'));
  ({ default: projectRepository } = await import('../../src/modules/pm/project.repository.js'));
  ({ default: projectService } = await import('../../src/modules/pm/project.service.js'));
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

function objectId() {
  return new mongoose.Types.ObjectId();
}

async function createCustomer(name) {
  return Customer.create({
    customerNumber: `C-${Date.now()}-${Math.random()}`,
    name,
    type: 'business',
    street: 'Bahnhofstrasse 1',
    postalCode: '8001',
    city: 'Zuerich',
    canton: 'ZH',
    country: 'CH',
    createdBy: objectId(),
  });
}

async function createProject(customer, overrides = {}) {
  return Project.create({
    projectNumber: `P-${Date.now()}-${Math.random()}`,
    name: 'Boiler replacement',
    projectType: 'NEW_INSTALLATION',
    status: 'IN_PROGRESS',
    customerId: customer._id,
    projectManagerId: objectId(),
    plannedStartDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    plannedEndDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    estimatedBudget: 12000,
    createdBy: objectId(),
    ...overrides,
  });
}

describe('PM project dashboard and search', () => {
  test('searches projects by populated customer name', async () => {
    const customer = await createCustomer('Acme Heating AG');
    await createProject(customer);

    const result = await projectRepository.findWithCursor({
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      search: 'Acme',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].customerId.name).toBe('Acme Heating AG');
  });

  test('returns dashboard status, risk, and budget summary', async () => {
    const customer = await createCustomer('Risk Dashboard AG');
    await createProject(customer);

    const summary = await projectService.getDashboardSummary();

    expect(summary.total).toBe(1);
    expect(summary.byStatus.IN_PROGRESS).toBe(1);
    expect(summary.risk.overdue).toBe(1);
    expect(summary.budget.estimatedBudgetTotal).toBe(12000);
  });
});
