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
  catalog: {
    categories: () => ['catalog', 'categories'],
    categoryDetail: (id) => ['catalog', 'categories', 'detail', id],
    articles: (filters) => ['catalog', 'articles', filters],
    articleDetail: (id) => ['catalog', 'articles', 'detail', id],
    articleVersions: (id) => ['catalog', 'articles', 'versions', id],
    articleImages: (id) => ['catalog', 'articles', 'images', id],
    facets: (filters) => ['catalog', 'facets', filters],
    textBlocks: (filters) => ['catalog', 'textBlocks', filters],
    textBlockDetail: (id) => ['catalog', 'textBlocks', 'detail', id],
    units: () => ['catalog', 'units'],
    unitDetail: (code) => ['catalog', 'units', code],
    priceHistory: (id) => ['catalog', 'prices', id],
    priceBatches: () => ['catalog', 'priceBatches'],
    ighConfig: () => ['catalog', 'igh', 'config'],
    ighImportHistory: () => ['catalog', 'igh', 'importHistory'],
    ighImportDetail: (jobId) => ['catalog', 'igh', 'import', jobId],
    pickerArticles: (params) => ['catalog', 'picker', 'articles', params],
    pickerTextBlocks: (params) => ['catalog', 'picker', 'textBlocks', params],
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
    spareParts: {
      all: () => ['crm', 'spareParts'],
      list: (filters) => ['crm', 'spareParts', 'list', filters],
      detail: (id) => ['crm', 'spareParts', 'detail', id],
      search: (q) => ['crm', 'spareParts', 'search', q],
      byInstallation: (installationId) => ['crm', 'spareParts', 'byInstallation', installationId],
      orderRequests: (filters) => ['crm', 'spareParts', 'orderRequests', filters],
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
    newsletters: {
      all: () => ['crm', 'newsletters'],
      list: (filters) => ['crm', 'newsletters', 'list', filters],
      detail: (id) => ['crm', 'newsletters', 'detail', id],
      stats: (id) => ['crm', 'newsletters', 'stats', id],
      recipientCount: (filter) => ['crm', 'newsletters', 'recipientCount', filter],
    },
  },
  mobile: {
    all: () => ['mobile'],
    orders: {
      all: () => ['mobile', 'orders'],
      list: (filters) => ['mobile', 'orders', 'list', filters],
      detail: (id) => ['mobile', 'orders', 'detail', id],
      history: (id) => ['mobile', 'orders', 'history', id],
    },
    reports: {
      list: (filters) => ['mobile', 'reports', 'list', filters],
      byOrder: (orderId) => ['mobile', 'reports', 'byOrder', orderId],
      detail: (id) => ['mobile', 'reports', 'detail', id],
    },
    photos: {
      byOrder: (orderId) => ['mobile', 'photos', 'byOrder', orderId],
    },
    timeEntries: {
      all: () => ['mobile', 'timeEntries'],
      byOrder: (orderId) => ['mobile', 'timeEntries', 'byOrder', orderId],
      list: (filters) => ['mobile', 'timeEntries', 'list', filters],
    },
    documents: {
      byOrder: (orderId) => ['mobile', 'documents', 'byOrder', orderId],
    },
    quotation: {
      byOrder: (orderId) => ['mobile', 'quotation', 'byOrder', orderId],
    },
    catalog: {
      search: (query) => ['mobile', 'catalog', 'search', query],
      favorites: () => ['mobile', 'catalog', 'favorites'],
      recent: () => ['mobile', 'catalog', 'recent'],
    },
    chat: {
      byProject: (projectId) => ['mobile', 'chat', 'byProject', projectId],
    },
    smallOrders: {
      byProject: (projectId) => ['mobile', 'smallOrders', 'byProject', projectId],
    },
    installations: {
      bySite: (siteId) => ['mobile', 'installations', 'bySite', siteId],
      detail: (id) => ['mobile', 'installations', 'detail', id],
      history: (id) => ['mobile', 'installations', 'history', id],
    },
    notifications: {
      list: () => ['mobile', 'notifications', 'list'],
      preferences: () => ['mobile', 'notifications', 'preferences'],
    },
    sync: {
      status: () => ['mobile', 'sync', 'status'],
    },
  },
  qop: {
    quotations: (filters) => ['qop', 'quotations', filters],
    quotationDetail: (id) => ['qop', 'quotations', 'detail', id],
    quotationHistory: (id) => ['qop', 'quotations', 'history', id],
    orders: (filters) => ['qop', 'orders', filters],
    orderDetail: (id) => ['qop', 'orders', 'detail', id],
    orderInvoices: (id) => ['qop', 'orders', 'invoices', id],
    orderHistory: (id) => ['qop', 'orders', 'history', id],
    invoices: (filters) => ['qop', 'invoices', filters],
    invoiceDetail: (id) => ['qop', 'invoices', 'detail', id],
    invoicePayments: (id) => ['qop', 'invoices', 'payments', id],
    invoiceHistory: (id) => ['qop', 'invoices', 'history', id],
    search: (params) => ['qop', 'search', params],
    pipeline: () => ['qop', 'pipeline'],
    aging: () => ['qop', 'aging'],
    customerDocs: (customerId) => ['qop', 'customerDocs', customerId],
    projectDocs: (projectId) => ['qop', 'projectDocs', projectId],
  },
  tasks: {
    all: () => ['tasks'],
    lists: () => ['tasks', 'lists'],
    listDetail: (id) => ['tasks', 'lists', 'detail', id],
    list: (filters) => ['tasks', 'list', filters],
    detail: (id) => ['tasks', 'detail', id],
    subtasks: (parentId) => ['tasks', 'subtasks', parentId],
    notes: (taskId) => ['tasks', 'notes', taskId],
    dashboard: (filters) => ['tasks', 'dashboard', filters],
    stats: (filters) => ['tasks', 'stats', filters],
  },
  chat: {
    rooms:    ()       => ['chat', 'rooms'],
    room:     (id)     => ['chat', 'room', id],
    messages: (roomId) => ['chat', 'messages', roomId],
  },
  ai: {
    all:          ()         => ['ai'],
    agentRuns:    (filters)  => ['ai', 'agentRuns', filters],
    agentRun:     (id)       => ['ai', 'agentRun', id],
    agentThread:  (threadId) => ['ai', 'agentThread', threadId],
    sessions:     (params)   => ['ai', 'sessions', params],
    session:      (id)       => ['ai', 'session', id],
  },
  deploy: {
    all: () => ['deploy'],
    calendar: {
      all: () => ['deploy', 'calendar'],
      data: (params) => ['deploy', 'calendar', 'data', params],
    },
    assignments: {
      all: () => ['deploy', 'assignments'],
      detail: (id) => ['deploy', 'assignments', 'detail', id],
      appointment: (id) => ['deploy', 'assignments', 'appointment', id],
    },
    conflicts: {
      all: () => ['deploy', 'conflicts'],
      list: (params) => ['deploy', 'conflicts', 'list', params],
    },
    dashboard: {
      all: () => ['deploy', 'dashboard'],
      summary: (date) => ['deploy', 'dashboard', 'summary', date],
      utilization: (params) => ['deploy', 'dashboard', 'utilization', params],
      alerts: () => ['deploy', 'dashboard', 'alerts'],
    },
    coarse: {
      all: () => ['deploy', 'coarse'],
      matrix: (params) => ['deploy', 'coarse', 'matrix', params],
    },
  },
  doctpl: {
    templates: {
      list:   (f)  => ['doctpl', 'templates', 'list', f],
      detail: (id) => ['doctpl', 'templates', 'detail', id],
      versions:(id)=> ['doctpl', 'templates', 'versions', id],
    },
    documents: {
      list:     (f)      => ['doctpl', 'documents', 'list', f],
      detail:   (id)     => ['doctpl', 'documents', 'detail', id],
      bySource: (mod,rid)=> ['doctpl', 'documents', 'source', mod, rid],
    },
    ci: {
      config: () => ['doctpl', 'ci', 'config'],
      assets: () => ['doctpl', 'ci', 'assets'],
    },
    emails: {
      list: (f) => ['doctpl', 'emails', 'list', f],
    },
  },
};
