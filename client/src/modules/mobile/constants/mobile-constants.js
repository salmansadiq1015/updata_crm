export const ORDER_STATUS = Object.freeze({
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

export const ORDER_TYPE = Object.freeze({
  SERVICE_CALL: 'SERVICE_CALL',
  PROJECT_WORK: 'PROJECT_WORK',
  MAINTENANCE: 'MAINTENANCE',
  INSTALLATION: 'INSTALLATION',
  INSPECTION: 'INSPECTION',
});

export const ORDER_PRIORITY = Object.freeze({
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

export const REPORT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

export const ACTIVITY_TYPE = Object.freeze({
  TRAVEL: 'TRAVEL',
  ONSITE_WORK: 'ONSITE_WORK',
  ADMINISTRATIVE: 'ADMINISTRATIVE',
  OTHER: 'OTHER',
});

export const RELEASE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RELEASED: 'RELEASED',
  LOCKED: 'LOCKED',
});

export const PHOTO_CATEGORY = Object.freeze({
  BEFORE: 'BEFORE',
  AFTER: 'AFTER',
  DAMAGE: 'DAMAGE',
  INSTALLATION: 'INSTALLATION',
  GENERAL: 'GENERAL',
  NAMEPLATE: 'NAMEPLATE',
});

export const MESSAGE_TYPE = Object.freeze({
  TEXT: 'TEXT',
  PHOTO: 'PHOTO',
  DOCUMENT: 'DOCUMENT',
  FILE: 'FILE',
});

export const ACCOUNTING_DOCUMENT_TYPE = Object.freeze({
  SUPPLIER_INVOICE: 'SUPPLIER_INVOICE',
  RECEIPT: 'RECEIPT',
  OTHER: 'OTHER',
});

export const CATALOG_SOURCE = Object.freeze({
  IGH: 'IGH',
  INTERNAL: 'INTERNAL',
  CUSTOM: 'CUSTOM',
  ALL: 'ALL',
});

export const NOTIFICATION_TYPE = Object.freeze({
  NEW_ASSIGNMENT: 'NEW_ASSIGNMENT',
  ORDER_CHANGED: 'ORDER_CHANGED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  DAILY_REMINDER: 'DAILY_REMINDER',
  ESCALATION: 'ESCALATION',
});

export const SYNC_STATUS = Object.freeze({
  SYNCED: 'SYNCED',
  PENDING_SYNC: 'PENDING_SYNC',
  SYNC_FAILED: 'SYNC_FAILED',
  CONFLICT: 'CONFLICT',
});

export const SYNC_ENTITY_TYPE = Object.freeze({
  WORK_REPORT: 'WORK_REPORT',
  TIME_ENTRY: 'TIME_ENTRY',
  PHOTO: 'PHOTO',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  MATERIAL_ITEM: 'MATERIAL_ITEM',
  SMALL_ORDER: 'SMALL_ORDER',
  DOCUMENT: 'DOCUMENT',
  ACCOUNTING_DOCUMENT: 'ACCOUNTING_DOCUMENT',
  INSTALLATION_CAPTURE: 'INSTALLATION_CAPTURE',
  NOTE: 'NOTE',
  CRM_IMAGE: 'CRM_IMAGE',
});

export const SYNC_OPERATION = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
});

export const SYNC_QUEUE_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CONFLICT: 'CONFLICT',
});

// Queue processing priority (lower = higher priority)
export const SYNC_PRIORITY = Object.freeze({
  [SYNC_ENTITY_TYPE.WORK_REPORT]: 10,
  [SYNC_ENTITY_TYPE.TIME_ENTRY]: 20,
  [SYNC_ENTITY_TYPE.PHOTO]: 30,
  [SYNC_ENTITY_TYPE.CHAT_MESSAGE]: 40,
  [SYNC_ENTITY_TYPE.MATERIAL_ITEM]: 50,
  [SYNC_ENTITY_TYPE.SMALL_ORDER]: 50,
  [SYNC_ENTITY_TYPE.DOCUMENT]: 50,
  [SYNC_ENTITY_TYPE.ACCOUNTING_DOCUMENT]: 35,
  [SYNC_ENTITY_TYPE.INSTALLATION_CAPTURE]: 25,
  [SYNC_ENTITY_TYPE.NOTE]: 15,
  [SYNC_ENTITY_TYPE.CRM_IMAGE]: 30,
});

export const SYNC_CONFIG = Object.freeze({
  MAX_RETRIES: 5,
  RETRY_DELAYS: [5000, 15000, 45000, 120000, 300000],
  POLL_INTERVAL: 5 * 60 * 1000,
  // Network-aware periodic poll intervals (CRM-003 AC-8). Wi-Fi is treated as
  // the default (cheaper/faster), cellular polls less often to save data/battery.
  POLL_INTERVAL_WIFI: 30 * 60 * 1000,
  POLL_INTERVAL_CELLULAR: 60 * 60 * 1000,
  PING_TIMEOUT: 5000,
  SYNC_TIMEOUT: 60000,
  UPLOAD_TIMEOUT: 30000,
  DATA_EXPIRY_DAYS: 30,
  STORAGE_WARN_THRESHOLD: 0.7,
});

export const PHOTO_CONFIG = Object.freeze({
  MAX_DIMENSION: 2048,
  THUMBNAIL_DIMENSION: 256,
  JPEG_QUALITY: 0.85,
  MIN_JPEG_QUALITY: 0.55,
  THUMBNAIL_QUALITY: 0.7,
  MAX_FILE_SIZE: 20 * 1024 * 1024,
  MAX_COMPRESSED_SIZE: 2 * 1024 * 1024,
});

export const MOBILE_NAV_TABS = Object.freeze([
  { key: 'orders', labelKey: 'mobile.nav.orders', href: '/orders', icon: 'ClipboardList' },
  { key: 'addressBook', labelKey: 'mobile.nav.addressBook', href: '/address-book', icon: 'BookOpen' },
  { key: 'chat', labelKey: 'mobile.nav.chat', href: '/chat', icon: 'MessageSquare' },
  { key: 'timer', labelKey: 'mobile.nav.timer', href: '/timer', icon: 'Timer' },
  { key: 'notifications', labelKey: 'mobile.nav.notifications', href: '/m/notifications', icon: 'Bell' },
  { key: 'settings', labelKey: 'mobile.nav.settings', href: '/settings', icon: 'Settings' },
]);

export const VALID_STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.PLANNED]: [ORDER_STATUS.IN_PROGRESS],
  [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
});
