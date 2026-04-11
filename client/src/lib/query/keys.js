export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'],
  },
  users: {
    all: () => ['users'],
    list: (filters) => ['users', 'list', filters],
    detail: (id) => ['users', 'detail', id],
    sessions: (id) => ['users', id, 'sessions'],
  },
  roles: {
    all: () => ['roles'],
    list: () => ['roles', 'list'],
    detail: (id) => ['roles', 'detail', id],
    permissions: () => ['roles', 'permissions'],
  },
  sessions: {
    list: () => ['auth', 'sessions'],
  },
  audit: {
    list: (params) => ['auth', 'audit', params],
  },
  notifications: {
    feed: (filters) => ['notifications', 'feed', filters],
    unreadCount: () => ['notifications', 'unreadCount'],
  },
  dashboard: {
    stats: () => ['dashboard', 'stats'],
  },
};
