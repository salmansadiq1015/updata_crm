import { describe, expect, it } from 'vitest';
import {
  buildAuditMessage,
  buildAuditQueryParams,
  getAuditActor,
  getAuditEventLabel,
  getAuditEventType,
} from '../utils/audit-log-utils';

const t = (_key, fallback, values = {}) => Object.entries(values).reduce(
  (text, [key, value]) => text.replace(`{${key}}`, value),
  fallback,
);

describe('audit log utilities', () => {
  it('reads the backend eventType field and builds a readable activity message', () => {
    const entry = {
      eventType: 'session.revoked',
      email: 'admin@example.test',
      result: 'success',
      details: { targetUserEmail: 'worker@example.test' },
    };

    expect(getAuditEventType(entry)).toBe('session.revoked');
    expect(getAuditEventLabel(entry, t)).toBe('Revoked a session');
    expect(getAuditActor(entry, t)).toBe('admin@example.test');
    expect(buildAuditMessage(entry, t)).toBe('admin@example.test ended a user session.');
  });

  it('maps filter state to the server audit query contract', () => {
    expect(buildAuditQueryParams({
      startDate: '2026-06-01',
      endDate: '2026-06-29',
      eventType: 'notification.created',
      result: 'success',
      email: 'admin@example.test',
      module: 'notifications',
      search: 'chat',
      limit: 50,
    }, 'cursor-1')).toMatchObject({
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-29T23:59:59.999Z',
      eventType: 'notification.created',
      result: 'success',
      email: 'admin@example.test',
      module: 'notifications',
      search: 'chat',
      limit: 50,
      cursor: 'cursor-1',
    });
  });
});
