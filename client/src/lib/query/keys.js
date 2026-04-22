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
  platform: {
    health: () => ['platform', 'health'],
    jobs: (filters) => ['platform', 'jobs', filters],
    files: (params) => ['platform', 'files', params],
    logs: (filters) => ['platform', 'logs', filters],
  },
  integrations: {
    all: () => ['integrations'],
    widget: {
      submissions: (filters) => ['integrations', 'widget', 'submissions', filters],
      submissionDetail: (id) => ['integrations', 'widget', 'submission', id],
      config: () => ['integrations', 'widget', 'config'],
    },
  },
  pm: {
    all: () => ['pm'],
    projects: {
      all: () => ['pm', 'projects'],
      list: (filters) => ['pm', 'projects', 'list', filters],
      detail: (id) => ['pm', 'projects', 'detail', id],
      search: (q) => ['pm', 'projects', 'search', q],
    },
    dashboard: {
      summary: () => ['pm', 'dashboard', 'summary'],
      milestones: (days) => ['pm', 'dashboard', 'milestones', days],
    },
    statusHistory: {
      byProject: (projectId) => ['pm', 'statusHistory', projectId],
    },
    prepActions: {
      byProject: (projectId) => ['pm', 'prepActions', projectId],
      detail: (projectId, actionId) => ['pm', 'prepActions', projectId, actionId],
    },
    schedule: {
      byProject: (projectId) => ['pm', 'schedule', projectId],
    },
    confirmations: {
      byEntry: (projectId, entryId) => ['pm', 'confirmations', projectId, entryId],
    },
    documents: {
      byProject: (projectId, category) => ['pm', 'documents', projectId, category],
    },
  },
  crm: {
    all: () => ['crm'],
    customers: {
      all: () => ['crm', 'customers'],
      list: (filters) => ['crm', 'customers', 'list', filters],
      detail: (id) => ['crm', 'customers', 'detail', id],
      search: (q) => ['crm', 'customers', 'search', q],
      duplicates: (params) => ['crm', 'customers', 'duplicates', params],
      activity: (id, filters) => ['crm', 'customers', 'activity', id, filters],
    },
    contacts: {
      all: () => ['crm', 'contacts'],
      byCustomer: (customerId) => ['crm', 'contacts', 'byCustomer', customerId],
      detail: (id) => ['crm', 'contacts', 'detail', id],
      search: (q) => ['crm', 'contacts', 'search', q],
    },
    sites: {
      all: () => ['crm', 'sites'],
      list: (filters) => ['crm', 'sites', 'list', filters],
      byCustomer: (customerId) => ['crm', 'sites', 'byCustomer', customerId],
      detail: (id) => ['crm', 'sites', 'detail', id],
    },
    installations: {
      all: () => ['crm', 'installations'],
      list: (filters) => ['crm', 'installations', 'list', filters],
      bySite: (siteId) => ['crm', 'installations', 'bySite', siteId],
      detail: (id) => ['crm', 'installations', 'detail', id],
    },
    maintenance: {
      all: () => ['crm', 'maintenance'],
      dashboard: () => ['crm', 'maintenance', 'dashboard'],
      due: (filters) => ['crm', 'maintenance', 'due', filters],
      overdue: (filters) => ['crm', 'maintenance', 'overdue', filters],
      byInstallation: (installationId) => ['crm', 'maintenance', 'byInstallation', installationId],
    },
    notes: {
      bySite: (siteId) => ['crm', 'notes', 'bySite', siteId],
      byInstallation: (installationId) => ['crm', 'notes', 'byInstallation', installationId],
    },
    images: {
      bySite: (siteId) => ['crm', 'images', 'bySite', siteId],
      byInstallation: (installationId) => ['crm', 'images', 'byInstallation', installationId],
    },
  },
};
