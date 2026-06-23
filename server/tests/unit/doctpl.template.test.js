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

test('accepts terms sections emitted by commercial template presets', async () => {
  const t = await DocumentTemplate.create({
    templateType: 'quotation',
    name: 'Quotation with terms',
    createdBy: userId,
    sections: [
      { id: 'header', name: 'Header', type: 'header', position: 1 },
      { id: 'body', name: 'Body', type: 'body', position: 2 },
      { id: 'terms', name: 'Terms', type: 'terms', position: 3 },
      { id: 'footer', name: 'Footer', type: 'footer', position: 4 },
    ],
  });

  expect(t.sections.map((section) => section.type)).toContain('terms');
});
