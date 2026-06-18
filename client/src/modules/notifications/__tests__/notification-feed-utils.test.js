import { describe, expect, it } from 'vitest';
import {
  dismissNotificationFromFeed,
  markNotificationReadInFeed,
  mergeNotificationIntoFeed,
  normalizeNotificationFeedResponse,
  normalizeUnreadCountResponse,
} from '../utils/notification-feed-utils';

describe('notification feed utils', () => {
  it('normalizes API envelopes into a stable feed contract', () => {
    const feed = normalizeNotificationFeedResponse({
      data: {
        items: [
          { _id: 'n1', title: 'Task due', category: 'TASK', isRead: false, sentAt: '2026-01-01T10:00:00Z' },
        ],
        summary: { total: 1, unread: 1, byCategory: { TASK: { total: 1, unread: 1 } } },
      },
      pagination: { hasNext: false, nextCursor: null, limit: 50 },
    });

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ id: 'n1', priority: 'NORMAL', isRead: false });
    expect(feed.summary.unread).toBe(1);
    expect(feed.pagination.limit).toBe(50);
  });

  it('normalizes unread-count envelopes', () => {
    expect(normalizeUnreadCountResponse({ data: { unreadCount: 7 } })).toBe(7);
    expect(normalizeUnreadCountResponse({ data: { count: 3 } })).toBe(3);
  });

  it('merges real-time notifications without duplicates and respects filters', () => {
    const baseFeed = normalizeNotificationFeedResponse({
      items: [{ id: 'n1', title: 'Existing', category: 'TASK', isRead: false }],
      summary: { total: 1, unread: 1, highPriority: 0, critical: 0, byCategory: { TASK: { total: 1, unread: 1 } } },
    });

    const merged = mergeNotificationIntoFeed(
      baseFeed,
      { id: 'n2', title: 'Invoice approval', body: 'Needs review', category: 'FINANCE', priority: 'HIGH', isRead: false },
      { category: 'FINANCE' },
    );
    expect(merged.items.map((item) => item.id)).toEqual(['n2', 'n1']);
    expect(merged.summary.total).toBe(2);
    expect(merged.summary.unread).toBe(2);

    const duplicate = mergeNotificationIntoFeed(merged, { id: 'n2', title: 'Invoice approval', category: 'FINANCE' }, {});
    expect(duplicate.items.filter((item) => item.id === 'n2')).toHaveLength(1);

    const filteredOut = mergeNotificationIntoFeed(merged, { id: 'n3', title: 'Chat', category: 'CHAT' }, { category: 'TASK' });
    expect(filteredOut.items.map((item) => item.id)).toEqual(['n2', 'n1']);
  });

  it('updates read and dismiss state in cached feeds', () => {
    const feed = normalizeNotificationFeedResponse({
      items: [{ id: 'n1', title: 'Existing', category: 'TASK', isRead: false }],
      summary: { total: 1, unread: 1, byCategory: { TASK: { total: 1, unread: 1 } }, pendingActions: [{ id: 'n1', category: 'TASK' }] },
    });

    const read = markNotificationReadInFeed(feed, 'n1');
    expect(read.items[0].isRead).toBe(true);
    expect(read.summary.unread).toBe(0);
    expect(read.summary.byCategory.TASK.unread).toBe(0);

    const dismissed = dismissNotificationFromFeed(read, 'n1');
    expect(dismissed.items).toHaveLength(0);
    expect(dismissed.summary.total).toBe(0);
  });
});
