import { describe, expect, it } from '@jest/globals';
import { buildNotificationDeepLink } from '../notificationDeepLink.js';

describe('buildNotificationDeepLink', () => {
  it('maps source entity types to platform routes', () => {
    expect(buildNotificationDeepLink('Task', 'task-1')).toBe('/tasks?taskId=task-1');
    expect(buildNotificationDeepLink('Project', 'project-1')).toBe('/projects/project-1');
    expect(buildNotificationDeepLink('ApInvoice', 'invoice-1')).toBe('/accounting/payables?invoiceId=invoice-1');
    expect(buildNotificationDeepLink('MaintenanceInterval', 'maintenance-1')).toBe('/crm/maintenance?maintenanceId=maintenance-1');
  });

  it('returns null when no route can be derived', () => {
    expect(buildNotificationDeepLink(null, 'id')).toBeNull();
    expect(buildNotificationDeepLink('Unknown', 'id')).toBeNull();
  });
});
