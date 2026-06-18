export const EMPTY_NOTIFICATION_SUMMARY = Object.freeze({
  total: 0,
  unread: 0,
  highPriority: 0,
  critical: 0,
  byCategory: {},
  pendingActions: [],
});

function getRawPayload(response) {
  return response?.data ?? response ?? {};
}

export function getNotificationId(notification) {
  const id = notification?._id ?? notification?.id;
  return id == null ? '' : String(id);
}

export function normalizeNotificationItem(notification = {}) {
  const id = getNotificationId(notification);
  return {
    ...notification,
    id,
    _id: notification._id ?? id,
    title: notification.title || 'Notification',
    body: notification.body || notification.message || '',
    category: notification.category || 'SYSTEM',
    priority: notification.priority || 'NORMAL',
    isRead: Boolean(notification.isRead ?? notification.is_read ?? false),
    deepLink: notification.deepLink || notification.deep_link || null,
    sentAt: notification.sentAt || notification.sent_at || notification.received_at || notification.createdAt || notification.created_at || new Date().toISOString(),
  };
}

function normalizeSummary(summary, items) {
  const normalizedItems = items.map(normalizeNotificationItem);
  const fallbackUnread = normalizedItems.filter((item) => !item.isRead).length;

  return {
    ...EMPTY_NOTIFICATION_SUMMARY,
    ...(summary || {}),
    unread: summary?.unread ?? fallbackUnread,
    total: summary?.total ?? normalizedItems.length,
    highPriority: summary?.highPriority ?? normalizedItems.filter((item) => ['HIGH', 'CRITICAL'].includes(item.priority)).length,
    critical: summary?.critical ?? normalizedItems.filter((item) => item.priority === 'CRITICAL').length,
    byCategory: summary?.byCategory || {},
    pendingActions: (summary?.pendingActions || []).map(normalizeNotificationItem),
  };
}

export function normalizeNotificationFeedResponse(response) {
  if (response?.pages) {
    const pages = response.pages.map(normalizeNotificationFeedResponse);
    return {
      ...response,
      pages,
      items: pages.flatMap((page) => page.items),
      summary: pages[0]?.summary || EMPTY_NOTIFICATION_SUMMARY,
      unreadCount: pages[0]?.unreadCount || 0,
      pagination: pages[pages.length - 1]?.pagination || null,
    };
  }

  const payload = getRawPayload(response);
  const rawItems = Array.isArray(payload)
    ? payload
    : payload.items || payload.notifications || payload.data || [];
  const items = rawItems.map(normalizeNotificationItem);
  const summary = normalizeSummary(payload.summary, items);

  return {
    items,
    summary,
    unreadCount: payload.unreadCount ?? summary.unread,
    pagination: response?.pagination || payload.pagination || null,
  };
}

export function normalizeUnreadCountResponse(response) {
  const payload = getRawPayload(response);
  return payload.unreadCount ?? payload.count ?? 0;
}

export function notificationMatchesFilters(notification, filters = {}) {
  const item = normalizeNotificationItem(notification);
  if (filters.category && item.category !== filters.category) return false;
  if (typeof filters.isRead === 'boolean' && item.isRead !== filters.isRead) return false;

  const search = String(filters.search || '').trim().toLowerCase();
  if (search) {
    const haystack = `${item.title} ${item.body}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

function incrementCategory(summary, item, delta) {
  const byCategory = { ...(summary.byCategory || {}) };
  const current = byCategory[item.category] || { total: 0, unread: 0 };
  byCategory[item.category] = {
    total: Math.max(0, current.total + delta.total),
    unread: Math.max(0, current.unread + delta.unread),
  };
  return byCategory;
}

function addSummaryItem(summary, item) {
  return {
    ...summary,
    total: summary.total + 1,
    unread: summary.unread + (item.isRead ? 0 : 1),
    highPriority: summary.highPriority + (['HIGH', 'CRITICAL'].includes(item.priority) ? 1 : 0),
    critical: summary.critical + (item.priority === 'CRITICAL' ? 1 : 0),
    byCategory: incrementCategory(summary, item, { total: 1, unread: item.isRead ? 0 : 1 }),
    pendingActions: item.isRead ? summary.pendingActions : [item, ...(summary.pendingActions || [])].slice(0, 5),
  };
}

function markSummaryItemRead(summary, item) {
  if (item.isRead) return summary;
  return {
    ...summary,
    unread: Math.max(0, summary.unread - 1),
    byCategory: incrementCategory(summary, item, { total: 0, unread: -1 }),
    pendingActions: (summary.pendingActions || []).filter((action) => getNotificationId(action) !== getNotificationId(item)),
  };
}

function dismissSummaryItem(summary, item) {
  return {
    ...summary,
    total: Math.max(0, summary.total - 1),
    unread: Math.max(0, summary.unread - (item.isRead ? 0 : 1)),
    highPriority: Math.max(0, summary.highPriority - (['HIGH', 'CRITICAL'].includes(item.priority) ? 1 : 0)),
    critical: Math.max(0, summary.critical - (item.priority === 'CRITICAL' ? 1 : 0)),
    byCategory: incrementCategory(summary, item, { total: -1, unread: item.isRead ? 0 : -1 }),
    pendingActions: (summary.pendingActions || []).filter((action) => getNotificationId(action) !== getNotificationId(item)),
  };
}

function normalizeFeedState(feed) {
  if (!feed) return null;
  if (feed.pages) return feed;
  return normalizeNotificationFeedResponse(feed);
}

export function mergeNotificationIntoFeed(feed, notification, filters = {}) {
  const item = normalizeNotificationItem(notification);
  if (!notificationMatchesFilters(item, filters)) return feed;

  if (feed?.pages) {
    const firstPage = normalizeNotificationFeedResponse(feed.pages[0]);
    const exists = firstPage.items.some((existing) => getNotificationId(existing) === getNotificationId(item));
    const pages = [...feed.pages];
    pages[0] = {
      ...firstPage,
      items: exists
        ? firstPage.items.map((existing) => (getNotificationId(existing) === getNotificationId(item) ? item : existing))
        : [item, ...firstPage.items].slice(0, firstPage.pagination?.limit || 50),
      summary: exists ? firstPage.summary : addSummaryItem(firstPage.summary, item),
    };
    pages[0].unreadCount = pages[0].summary.unread;
    return { ...feed, pages };
  }

  const state = normalizeFeedState(feed);
  if (!state) return feed;

  const exists = state.items.some((existing) => getNotificationId(existing) === getNotificationId(item));
  const items = exists
    ? state.items.map((existing) => (getNotificationId(existing) === getNotificationId(item) ? item : existing))
    : [item, ...state.items].slice(0, state.pagination?.limit || 50);
  const summary = exists ? state.summary : addSummaryItem(state.summary, item);
  return { ...state, items, summary, unreadCount: summary.unread };
}

export function markNotificationReadInFeed(feed, id) {
  if (!feed) return feed;

  if (feed.pages) {
    return {
      ...feed,
      pages: feed.pages.map((page) => markNotificationReadInFeed(page, id)),
    };
  }

  const state = normalizeFeedState(feed);
  const existing = state.items.find((item) => getNotificationId(item) === String(id));
  if (!existing) return state;

  const summary = markSummaryItemRead(state.summary, existing);
  return {
    ...state,
    items: state.items.map((item) => (getNotificationId(item) === String(id) ? { ...item, isRead: true } : item)),
    summary,
    unreadCount: summary.unread,
  };
}

export function findNotificationInFeed(feed, id) {
  if (!feed) return null;
  const targetId = String(id);

  if (feed.pages) {
    for (const page of feed.pages) {
      const found = findNotificationInFeed(page, targetId);
      if (found) return found;
    }
    return null;
  }

  const state = normalizeFeedState(feed);
  if (!state) return null;
  return state.items.find((item) => getNotificationId(item) === targetId) || null;
}

export function dismissNotificationFromFeed(feed, id) {
  if (!feed) return feed;

  if (feed.pages) {
    return {
      ...feed,
      pages: feed.pages.map((page) => dismissNotificationFromFeed(page, id)),
    };
  }

  const state = normalizeFeedState(feed);
  const existing = state.items.find((item) => getNotificationId(item) === String(id));
  if (!existing) return state;

  const summary = dismissSummaryItem(state.summary, existing);
  return {
    ...state,
    items: state.items.filter((item) => getNotificationId(item) !== String(id)),
    summary,
    unreadCount: summary.unread,
  };
}

export function markAllNotificationsReadInFeed(feed) {
  if (!feed) return feed;

  if (feed.pages) {
    return {
      ...feed,
      pages: feed.pages.map(markAllNotificationsReadInFeed),
    };
  }

  const state = normalizeFeedState(feed);
  const byCategory = Object.fromEntries(
    Object.entries(state.summary.byCategory || {}).map(([category, counts]) => [
      category,
      { ...counts, unread: 0 },
    ]),
  );

  return {
    ...state,
    items: state.items.map((item) => ({ ...item, isRead: true })),
    summary: { ...state.summary, unread: 0, byCategory, pendingActions: [] },
    unreadCount: 0,
  };
}
