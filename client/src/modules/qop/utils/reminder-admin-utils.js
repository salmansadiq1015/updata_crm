const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const LOCALE_MAP = {
  de: 'de-CH',
  fr: 'fr-CH',
  it: 'it-CH',
  en: 'en-US',
};

export function localDateTimeValue(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * @param {unknown} value
 * @param {{ min?: number, max?: number, sort?: 'none' | 'asc' | 'desc', maxItems?: number }} [options]
 */
export function parseNumberList(value, { min, max, sort = 'none', maxItems = 12 } = {}) {
  const seen = new Set();
  const numbers = String(value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item))
    .filter((item) => {
      const withinMin = min === undefined || item >= min;
      const withinMax = max === undefined || item <= max;
      if (!withinMin || !withinMax || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, maxItems);

  if (sort === 'asc') return [...numbers].sort((a, b) => a - b);
  if (sort === 'desc') return [...numbers].sort((a, b) => b - a);
  return numbers;
}

export function settingsToForm(settings) {
  return {
    appointmentReminderHours: (settings?.appointmentReminderHours || [48, 24, 2]).join(', '),
    quotationFollowupDays: (settings?.quotationFollowupDays || [7, 14, 21]).join(', '),
    quotationExpiryWarnDays: settings?.quotationExpiryWarnDays || 3,
    defaultAppointmentChannel: settings?.defaultAppointmentChannel || 'email',
    defaultLanguage: settings?.defaultLanguage || 'de',
  };
}

export function validateSettingsForm(settingsForm) {
  const appointmentReminderHours = parseNumberList(settingsForm.appointmentReminderHours, {
    min: 1,
    max: 720,
    sort: 'desc',
  });
  const quotationFollowupDays = parseNumberList(settingsForm.quotationFollowupDays, {
    min: 1,
    max: 365,
    sort: 'asc',
  });
  const quotationExpiryWarnDays = Number(settingsForm.quotationExpiryWarnDays);

  if (!appointmentReminderHours.length) {
    return { errorKey: 'qop.reminders.settings.invalidAppointmentHours' };
  }

  if (!quotationFollowupDays.length) {
    return { errorKey: 'qop.reminders.settings.invalidFollowupDays' };
  }

  if (!Number.isInteger(quotationExpiryWarnDays) || quotationExpiryWarnDays < 1 || quotationExpiryWarnDays > 90) {
    return { errorKey: 'qop.reminders.settings.invalidExpiryWarning' };
  }

  return {
    value: {
      appointmentReminderHours,
      quotationFollowupDays,
      quotationExpiryWarnDays,
      defaultAppointmentChannel: settingsForm.defaultAppointmentChannel,
      defaultLanguage: settingsForm.defaultLanguage,
    },
  };
}

export function validateManualReminderForm(form) {
  if (!form.appointmentId || !form.customerId || !form.scheduledAt) {
    return { errorKey: 'qop.reminders.manual.required' };
  }

  if (!OBJECT_ID_PATTERN.test(form.appointmentId) || !OBJECT_ID_PATTERN.test(form.customerId)) {
    return { errorKey: 'qop.reminders.manual.invalidIds' };
  }

  const scheduledAt = new Date(form.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60 * 1000) {
    return { errorKey: 'qop.reminders.manual.invalidTime' };
  }

  if (form.messageContent && form.messageContent.length > 2000) {
    return { errorKey: 'qop.reminders.manual.messageTooLong' };
  }

  return {
    value: {
      appointmentId: form.appointmentId,
      customerId: form.customerId,
      channel: form.channel,
      language: form.language,
      scheduledAt: scheduledAt.toISOString(),
      messageContent: form.messageContent.trim(),
      status: 'PENDING',
    },
  };
}

export function formatDateTime(value, language) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat(LOCALE_MAP[language] || LOCALE_MAP.en, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function customerLabel(customer) {
  if (!customer) return '-';
  if (typeof customer === 'string') return customer;
  return [customer.customerNumber, customer.name].filter(Boolean).join(' - ') || customer._id || '-';
}

export function customerContact(customer) {
  if (!customer || typeof customer === 'string') return '';
  return customer.email || customer.phone || customer.mobile || customer._id || '';
}

export function buildReminderStats(reminders, now = new Date()) {
  const total = reminders.length;
  const pending = reminders.filter((item) => item.status === 'PENDING');
  const failed = reminders.filter((item) => item.status === 'FAILED').length;
  const successful = reminders.filter((item) => (
    item.status === 'DELIVERED' || item.status === 'READ' || item.status === 'RESPONDED'
  )).length;
  const overdue = pending.filter((item) => {
    const date = new Date(item.scheduledAt);
    return !Number.isNaN(date.getTime()) && date < now;
  }).length;
  const nextReminder = pending
    .map((item) => ({ item, date: new Date(item.scheduledAt) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()) && date >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.item || null;

  return {
    total,
    pending: pending.length,
    failed,
    successful,
    overdue,
    nextReminder,
    successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
  };
}

export function filterAndSortReminders(reminders, { statusFilter, searchTerm, sortKey }, now = new Date()) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filtered = reminders.filter((reminder) => {
    if (statusFilter === 'attention') {
      const scheduledAt = new Date(reminder.scheduledAt);
      const overdue = reminder.status === 'PENDING'
        && !Number.isNaN(scheduledAt.getTime())
        && scheduledAt < now;
      if (reminder.status !== 'FAILED' && !overdue) return false;
    } else if (statusFilter !== 'all' && reminder.status !== statusFilter) {
      return false;
    }

    if (!normalizedSearch) return true;

    const haystack = [
      reminder.appointmentId,
      reminder.channel,
      reminder.status,
      reminder.language,
      reminder.messageContent,
      reminder.lastError,
      customerLabel(reminder.customerId),
      customerContact(reminder.customerId),
    ].filter(Boolean).join(' ').toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  return [...filtered].sort((a, b) => {
    if (sortKey === 'upcoming') {
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    }
    if (sortKey === 'customer') {
      return customerLabel(a.customerId).localeCompare(customerLabel(b.customerId));
    }
    if (sortKey === 'status') {
      return String(a.status).localeCompare(String(b.status));
    }
    return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
  });
}
