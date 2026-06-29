import mongoose from 'mongoose';
import { describe, expect, test } from '@jest/globals';
import {
  buildOrderExportRows,
  buildOrderImportTemplateCsv,
  buildOrderListFilters,
  parseOrderImportCsv,
  prepareOrderImportRow,
} from '../../src/modules/mobile/orderManagement.service.js';

describe('mobile order import/export helpers', () => {
  test('builds a reference CSV that can be parsed back into an import row', () => {
    const csv = buildOrderImportTemplateCsv();
    expect(csv).toContain('orderType,title,scheduledStart,scheduledEnd');
    expect(csv).toContain('overrideConflicts,overrideReason');

    const rows = parseOrderImportCsv(Buffer.from(csv));
    expect(rows).toHaveLength(1);
    expect(rows[0].orderType).toBe('SERVICE_CALL');
    expect(rows[0].title).toBe('Annual boiler maintenance');
  });

  test('prepares a valid unassigned order row without database references', async () => {
    const result = await prepareOrderImportRow({
      orderType: 'maintenance',
      title: 'Pump service',
      scheduledStart: '2026-07-15T08:00:00.000Z',
      scheduledEnd: '2026-07-15T10:00:00.000Z',
      priority: 'high',
      status: 'confirmed',
      customerName: 'Max Muster',
      description: 'Inspect pump',
    }, 2);

    expect(result.errors).toEqual([]);
    expect(result.value.payload).toMatchObject({
      orderType: 'MAINTENANCE',
      title: 'Pump service',
      priority: 'HIGH',
      status: 'CONFIRMED',
      assignmentTargetType: 'EMPLOYEE',
      employeeId: null,
      customerName: 'Max Muster',
    });
  });

  test('returns row-level validation errors for unsafe import rows', async () => {
    const result = await prepareOrderImportRow({
      orderType: 'invalid',
      title: '',
      scheduledStart: 'not-a-date',
      scheduledEnd: '2026-07-15T10:00:00.000Z',
      priority: 'critical',
      employeeId: 'not-an-object-id',
      assignmentTargetType: 'TEAM',
    }, 4);

    expect(result.value).toBeNull();
    expect(result.errors.map((error) => error.field)).toEqual(expect.arrayContaining([
      'orderType',
      'title',
      'scheduledStart',
      'priority',
      'employeeId',
      'assignmentTargetId',
    ]));
  });

  test('shares order list filters between table and export use cases', () => {
    expect(buildOrderListFilters({
      status: 'PLANNED',
      orderType: 'SERVICE_CALL',
      priority: 'URGENT',
      teamId: 'field-team-a',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    })).toEqual({
      status: 'PLANNED',
      assignmentType: 'SERVICE_CALL',
      priority: 'URGENT',
      assignmentTargetId: 'field-team-a',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });
  });

  test('exports normalized order rows with assignment, customer, site, and appointment context', () => {
    const assignmentId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const projectId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const siteId = new mongoose.Types.ObjectId();
    const rows = buildOrderExportRows([{
      _id: assignmentId,
      assignmentNumber: 'ASN-2026-00001',
      title: 'Boiler inspection',
      assignmentType: 'SERVICE_CALL',
      status: 'PLANNED',
      priority: 'NORMAL',
      startDatetime: new Date('2026-07-15T08:00:00.000Z'),
      endDatetime: new Date('2026-07-15T12:00:00.000Z'),
      employeeId: { _id: employeeId, firstName: 'Tech', lastName: 'User', email: 'tech@example.com' },
      projectId: { _id: projectId, projectNumber: 'PRJ-1', name: 'Heating Upgrade', customerName: 'Project Customer' },
      customerId: { _id: customerId, name: 'CRM Customer', phone: '+41 44 555 11 11', email: 'crm@example.com' },
      siteId: { _id: siteId, name: 'Main Site', street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zurich' },
      instructions: 'Inspect heat exchanger',
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      updatedAt: new Date('2026-07-02T08:00:00.000Z'),
    }], new Map([
      [assignmentId.toString(), {
        customerContactName: 'Site Contact',
        customerContactPhone: '+41 44 555 22 22',
        customerContactEmail: 'site@example.com',
      }],
    ]));

    expect(rows[0]).toMatchObject({
      assignmentNumber: 'ASN-2026-00001',
      employeeId: employeeId.toString(),
      employeeName: 'Tech User',
      projectId: projectId.toString(),
      customerId: customerId.toString(),
      siteId: siteId.toString(),
      customerName: 'Site Contact',
      customerPhone: '+41 44 555 22 22',
      customerEmail: 'site@example.com',
      siteAddress: 'Bahnhofstrasse 1, 8001, Zurich',
    });
  });
});
