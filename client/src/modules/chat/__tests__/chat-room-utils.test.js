import { describe, test, expect } from 'vitest';
import { filterRooms, getRoomStats } from '../utils/chat-room-utils';
import { mergeChatMessages } from '../hooks/use-chat-messages';
describe('conversation navigation and history', () => {
  const rooms = [{ _id: 'a', roomType: 'LEAD', name: 'Accounts', unreadCount: 3, leadIds: [{ name: 'Northwind', leadNumber: 'L-123' }] }, { _id: 'b', roomType: 'DM', members: [], unreadCount: 0 }];
  test('lead and unread filters search CRM names and numbers', () => {
    expect(filterRooms(rooms, 'Leads', 'L-123', 'me')).toEqual([rooms[0]]);
    expect(filterRooms(rooms, 'Unread', '', 'me')).toEqual([rooms[0]]);
    expect(getRoomStats(rooms)).toMatchObject({ total: 2, leads: 1, unread: 3, unreadRooms: 1 });
  });
  test('reconnects and history pages merge chronologically without duplicate socket echoes', () => {
    const original = { _id: 'a', sentAt: '2026-11-05T10:00:00Z', content: 'Before edit' };
    const newer = { _id: 'b', sentAt: '2026-11-05T10:00:00Z', content: 'Next' };
    const result = mergeChatMessages([newer, original], [{ ...original, content: 'Updated' }]);
    expect(result.map(message => message._id)).toEqual(['a', 'b']);
    expect(result[0].content).toBe('Updated');
  });
});
