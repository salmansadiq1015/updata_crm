import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const { ObjectId } = mongoose.Types;

let counter = 0;
function seq() { return ++counter; }

export async function createRole(overrides = {}) {
  const Role = mongoose.model('Role');
  const n = seq();
  return Role.create({
    name: overrides.name || `TestRole_${n}`,
    description: overrides.description || `Test role ${n}`,
    permissions: overrides.permissions || [],
    isSystem: overrides.isSystem || false,
    ...overrides,
  });
}

export async function createUser(overrides = {}) {
  const User = mongoose.model('User');
  const n = seq();
  const role = overrides.role || (await createRole())._id;
  const passwordHash = overrides.passwordHash || await bcrypt.hash('Test1234!', 4);

  return User.create({
    email: overrides.email || `testuser${n}@example.com`,
    passwordHash,
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || `User${n}`,
    role,
    status: overrides.status || 'active',
    ...overrides,
  });
}

export async function createCustomer(overrides = {}) {
  const Customer = mongoose.model('Customer');
  const n = seq();
  return Customer.create({
    name: overrides.name || `Test Customer ${n}`,
    customerNumber: overrides.customerNumber || `K-${10000 + n}`,
    type: overrides.type || 'business',
    status: overrides.status || 'active',
    street: overrides.street || 'Bahnhofstrasse 1',
    postalCode: overrides.postalCode || '8001',
    city: overrides.city || 'Zürich',
    canton: overrides.canton || 'ZH',
    country: overrides.country || 'CH',
    ...overrides,
  });
}

export async function createProject(overrides = {}) {
  const Project = mongoose.model('Project');
  const n = seq();
  const customer = overrides.customerId || (await createCustomer())._id;
  const pm = overrides.projectManagerId || (await createUser())._id;

  return Project.create({
    name: overrides.name || `Test Project ${n}`,
    projectNumber: overrides.projectNumber || `P-${20000 + n}`,
    projectType: overrides.projectType || 'NEW_INSTALLATION',
    customerId: customer,
    projectManagerId: pm,
    status: overrides.status || 'DRAFT',
    ...overrides,
  });
}

export function objectId() {
  return new ObjectId();
}
