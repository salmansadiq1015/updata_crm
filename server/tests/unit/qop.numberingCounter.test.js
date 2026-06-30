import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../setup.js';
import Counter from '../../src/modules/crm/counter.model.js';
import counterService from '../../src/modules/qop/counter.service.js';
import DocumentNumberSequence from '../../src/modules/qop/documentNumberSequence.model.js';

beforeAll(() => connectTestDb());
afterEach(() => clearTestDb());
afterAll(() => disconnectTestDb());

describe('QOP document numbering counter', () => {
  test('uses active configured sequences for generated numbers', async () => {
    const year = new Date().getFullYear();

    await DocumentNumberSequence.create({
      documentType: 'order',
      departmentId: null,
      prefix: 'ORD',
      separator: '/',
      yearFormat: 'YY',
      paddingLength: 3,
      resetsAnnually: true,
      isActive: true,
    });

    await expect(counterService.getNextOrderNumber()).resolves.toBe(`ORD/${String(year).slice(-2)}/001`);
  });

  test('ignores inactive global sequences and falls back to default numbering', async () => {
    const year = new Date().getFullYear();
    const inactiveSequence = await DocumentNumberSequence.create({
      documentType: 'invoice',
      departmentId: null,
      prefix: 'CUSTOM',
      separator: '/',
      yearFormat: 'YY',
      paddingLength: 2,
      resetsAnnually: true,
      isActive: false,
    });

    await expect(counterService.getNextInvoiceNumber()).resolves.toBe(`RE-${year}-0001`);

    const unchanged = await DocumentNumberSequence.findById(inactiveSequence._id).lean();
    expect(unchanged.currentValue).toBe(0);
  });

  test('falls back to the active global sequence when a department sequence is inactive', async () => {
    const year = new Date().getFullYear();
    const departmentId = new mongoose.Types.ObjectId();

    await DocumentNumberSequence.create({
      documentType: 'quotation',
      departmentId: null,
      prefix: 'GLOBAL',
      separator: '-',
      yearFormat: 'YYYY',
      paddingLength: 2,
      resetsAnnually: true,
      isActive: true,
    });
    await DocumentNumberSequence.create({
      documentType: 'quotation',
      departmentId,
      prefix: 'DEPT',
      separator: '/',
      yearFormat: 'none',
      paddingLength: 2,
      resetsAnnually: true,
      isActive: false,
    });

    await expect(counterService.getNextQuotationNumber(departmentId)).resolves.toBe(`GLOBAL-${year}-01`);

    const departmentCounter = await Counter.findById(`qop:quotation:${departmentId}:${year}`).lean();
    expect(departmentCounter.seq).toBe(1);
  });
});
