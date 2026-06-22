import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let DocumentTemplate;

beforeAll(async () => {
  await connectTestDb();
  const m = await import('../../src/modules/doctpl/documentTemplate.model.js');
  DocumentTemplate = m.default;
});
afterEach(() => clearTestDb());
afterAll(() => disconnectTestDb());

const userId = new mongoose.Types.ObjectId();

test('creates template with required fields', async () => {
  const t = await DocumentTemplate.create({ templateType: 'quotation', name: 'Test', createdBy: userId });
  expect(t._id).toBeDefined();
  expect(t.currentVersion).toBe(1);
  expect(t.isActive).toBe(true);
});

test('soft-delete pre-hook hides deleted templates', async () => {
  await DocumentTemplate.create({ templateType: 'invoice_standard', name: 'Del', createdBy: userId, isDeleted: true, deletedAt: new Date() });
  const found = await DocumentTemplate.find({ templateType: 'invoice_standard' });
  expect(found.length).toBe(0);
});
