export const REMINDER_QUERY_LIMIT = 100;

export const REMINDER_STATUSES = [
  'PENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'RESPONDED',
  'CANCELLED',
];

export const REMINDER_LANGUAGES = ['de', 'fr', 'it', 'en'];

export const REMINDER_CHANNELS = [
  { value: 'email', labelKey: 'qop.reminders.channel.email' },
  { value: 'whatsapp', labelKey: 'qop.reminders.channel.whatsapp' },
  { value: 'both', labelKey: 'qop.reminders.channel.both' },
];

export const REMINDER_DEFAULT_CHANNELS = REMINDER_CHANNELS.filter((channel) => (
  channel.value === 'email' || channel.value === 'both'
));

export const REMINDER_STATUS_META = {
  PENDING: {
    labelKey: 'qop.reminders.status.pending',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  SENT: {
    labelKey: 'qop.reminders.status.sent',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  DELIVERED: {
    labelKey: 'qop.reminders.status.delivered',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  READ: {
    labelKey: 'qop.reminders.status.read',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  FAILED: {
    labelKey: 'qop.reminders.status.failed',
    badgeClass: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  RESPONDED: {
    labelKey: 'qop.reminders.status.responded',
    badgeClass: 'border-primary/30 bg-primary/10 text-primary',
  },
  CANCELLED: {
    labelKey: 'qop.reminders.status.cancelled',
    badgeClass: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  },
};

export const REMINDER_FILTERS = [
  { value: 'all', labelKey: 'qop.reminders.table.allStatuses' },
  { value: 'attention', labelKey: 'qop.reminders.table.needsAttention' },
  ...REMINDER_STATUSES.map((status) => ({
    value: status,
    labelKey: REMINDER_STATUS_META[status].labelKey,
  })),
];

export const REMINDER_SORT_OPTIONS = [
  { value: 'newest', labelKey: 'qop.reminders.sort.newest' },
  { value: 'upcoming', labelKey: 'qop.reminders.sort.upcoming' },
  { value: 'customer', labelKey: 'qop.reminders.sort.customer' },
  { value: 'status', labelKey: 'qop.reminders.sort.status' },
];

export const REMINDER_QUICK_SEND_OPTIONS = [
  { minutes: 60, labelKey: 'qop.reminders.manual.quick.oneHour' },
  { minutes: 24 * 60, labelKey: 'qop.reminders.manual.quick.tomorrow' },
  { minutes: 48 * 60, labelKey: 'qop.reminders.manual.quick.twoDays' },
];

export const REMINDER_ADMIN_I18N_KEYS = [
  'qop.reminders.badge',
  'qop.reminders.title',
  'qop.reminders.subtitle',
  'qop.reminders.hero.refresh',
  'qop.reminders.hero.refreshing',
  'qop.reminders.hero.limit',
  'qop.reminders.stats.pending',
  'qop.reminders.stats.failed',
  'qop.reminders.stats.shown',
  'qop.reminders.stats.successRate',
  'qop.reminders.stats.overdue',
  'qop.reminders.stats.next',
  'qop.reminders.stats.none',
  'qop.reminders.stats.ofTotal',
  'qop.reminders.settings.title',
  'qop.reminders.settings.description',
  'qop.reminders.settings.appointmentHours',
  'qop.reminders.settings.appointmentHoursHelp',
  'qop.reminders.settings.followupDays',
  'qop.reminders.settings.followupDaysHelp',
  'qop.reminders.settings.expiryWarning',
  'qop.reminders.settings.expiryWarningHelp',
  'qop.reminders.settings.defaultLanguage',
  'qop.reminders.settings.defaultChannel',
  'qop.reminders.settings.channelHelp',
  'qop.reminders.settings.whatsappOutOfScope',
  'qop.reminders.settings.saved',
  'qop.reminders.settings.applyNote',
  'qop.reminders.settings.save',
  'qop.reminders.settings.saving',
  'qop.reminders.settings.reset',
  'qop.reminders.settings.invalidLists',
  'qop.reminders.settings.invalidAppointmentHours',
  'qop.reminders.settings.invalidFollowupDays',
  'qop.reminders.settings.invalidExpiryWarning',
  'qop.reminders.manual.title',
  'qop.reminders.manual.description',
  'qop.reminders.manual.customerSearch',
  'qop.reminders.manual.customerPlaceholder',
  'qop.reminders.manual.customerId',
  'qop.reminders.manual.customerSelected',
  'qop.reminders.manual.noCustomers',
  'qop.reminders.manual.searchFailed',
  'qop.reminders.manual.appointmentId',
  'qop.reminders.manual.sendAt',
  'qop.reminders.manual.quickLabel',
  'qop.reminders.manual.quick.oneHour',
  'qop.reminders.manual.quick.tomorrow',
  'qop.reminders.manual.quick.twoDays',
  'qop.reminders.manual.language',
  'qop.reminders.manual.channel',
  'qop.reminders.manual.messageLabel',
  'qop.reminders.manual.messagePlaceholder',
  'qop.reminders.manual.messageHelp',
  'qop.reminders.manual.required',
  'qop.reminders.manual.invalidIds',
  'qop.reminders.manual.invalidTime',
  'qop.reminders.manual.messageTooLong',
  'qop.reminders.manual.create',
  'qop.reminders.manual.creating',
  'qop.reminders.manual.reset',
  'qop.reminders.table.title',
  'qop.reminders.table.description',
  'qop.reminders.table.allStatuses',
  'qop.reminders.table.needsAttention',
  'qop.reminders.table.refresh',
  'qop.reminders.table.search',
  'qop.reminders.table.searchPlaceholder',
  'qop.reminders.table.sort',
  'qop.reminders.table.scheduled',
  'qop.reminders.table.customer',
  'qop.reminders.table.channel',
  'qop.reminders.table.status',
  'qop.reminders.table.appointment',
  'qop.reminders.table.details',
  'qop.reminders.table.actions',
  'qop.reminders.table.showing',
  'qop.reminders.table.lastUpdated',
  'qop.reminders.table.retry',
  'qop.reminders.table.cancel',
  'qop.reminders.table.setStatus',
  'qop.reminders.table.retryCount',
  'qop.reminders.table.response',
  'qop.reminders.table.error',
  'qop.reminders.table.emptyTitle',
  'qop.reminders.table.emptyBody',
  'qop.reminders.table.filteredEmptyTitle',
  'qop.reminders.table.filteredEmptyBody',
  'qop.reminders.channel.email',
  'qop.reminders.channel.whatsapp',
  'qop.reminders.channel.both',
  'qop.reminders.customerResponse.confirmed',
  'qop.reminders.customerResponse.reschedule',
  'qop.reminders.toast.settingsSaved',
  'qop.reminders.toast.created',
  'qop.reminders.toast.statusUpdated',
  'qop.reminders.toast.statusUpdateFailed',
  'qop.reminders.sort.newest',
  'qop.reminders.sort.upcoming',
  'qop.reminders.sort.customer',
  'qop.reminders.sort.status',
  ...REMINDER_STATUSES.map((status) => REMINDER_STATUS_META[status].labelKey),
];
