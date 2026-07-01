'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { customerService } from '@/modules/crm/services/customer-service';
import { useAppointmentReminders, useReminderSettings } from './use-qop-queries';
import { useReminderMutations } from './use-qop-mutations';
import {
  REMINDER_QUERY_LIMIT,
  REMINDER_STATUSES,
} from '../constants/reminder-admin';
import {
  buildReminderStats,
  customerLabel,
  filterAndSortReminders,
  localDateTimeValue,
  settingsToForm,
  validateManualReminderForm,
  validateSettingsForm,
} from '../utils/reminder-admin-utils';

function createEmptyManualForm(settings = {}) {
  return {
    appointmentId: '',
    customerId: '',
    customerQuery: '',
    scheduledAt: localDateTimeValue(),
    language: settings.defaultLanguage || 'de',
    channel: settings.defaultAppointmentChannel || 'email',
    messageContent: '',
  };
}

export function useReminderAdminController() {
  const { locale: language, t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('newest');
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualTouched, setManualTouched] = useState(false);
  const [manualForm, setManualForm] = useState(() => createEmptyManualForm());

  const backendStatus = REMINDER_STATUSES.includes(statusFilter) ? statusFilter : null;
  const reminderFilters = useMemo(() => ({
    limit: REMINDER_QUERY_LIMIT,
    ...(backendStatus ? { status: backendStatus } : {}),
  }), [backendStatus]);

  const remindersQuery = useAppointmentReminders(reminderFilters);
  const settingsQuery = useReminderSettings();
  const {
    createAppointmentReminder,
    updateAppointmentReminderStatus,
    updateReminderSettings,
  } = useReminderMutations();

  const settingsForm = useMemo(
    () => settingsDraft || settingsToForm(settingsQuery.data),
    [settingsDraft, settingsQuery.data],
  );

  const withSettingsDefaults = useCallback((form) => ({
    ...form,
    language: settingsForm.defaultLanguage || form.language,
    channel: settingsForm.defaultAppointmentChannel || form.channel,
  }), [settingsForm]);

  const effectiveManualForm = useMemo(
    () => (manualTouched ? manualForm : withSettingsDefaults(manualForm)),
    [manualForm, manualTouched, withSettingsDefaults],
  );

  const customerSearchQuery = effectiveManualForm.customerQuery.trim();
  const customersQuery = useQuery({
    queryKey: ['crm', 'customers', 'search', customerSearchQuery],
    queryFn: () => customerService.searchCustomers(customerSearchQuery, 8),
    enabled: customerSearchQuery.length >= 2 && !effectiveManualForm.customerId,
    select: (data) => (Array.isArray(data) ? data : []),
  });

  const rawReminders = useMemo(() => remindersQuery.data || [], [remindersQuery.data]);
  const stats = useMemo(() => buildReminderStats(rawReminders), [rawReminders]);
  const reminders = useMemo(
    () => filterAndSortReminders(rawReminders, { statusFilter, searchTerm, sortKey }),
    [rawReminders, searchTerm, sortKey, statusFilter],
  );

  const setSettingsValue = useCallback((key, value) => {
    setSettingsDraft((current) => ({ ...(current || settingsForm), [key]: value }));
    setSettingsError('');
  }, [settingsForm]);

  const resetSettingsDraft = useCallback(() => {
    setSettingsDraft(settingsToForm(settingsQuery.data));
    setSettingsError('');
  }, [settingsQuery.data]);

  const setManualValue = useCallback((key, value) => {
    setManualTouched(true);
    setManualForm((current) => {
      const base = manualTouched ? current : withSettingsDefaults(current);
      const next = { ...base, [key]: value };
      if (key === 'customerQuery') next.customerId = '';
      return next;
    });
    setManualError('');
  }, [manualTouched, withSettingsDefaults]);

  const selectCustomer = useCallback((customer) => {
    setManualTouched(true);
    setManualForm((current) => ({
      ...(manualTouched ? current : withSettingsDefaults(current)),
      customerId: customer._id,
      customerQuery: customerLabel(customer),
    }));
    setManualError('');
  }, [manualTouched, withSettingsDefaults]);

  const applyQuickSend = useCallback((minutes) => {
    setManualValue('scheduledAt', localDateTimeValue(new Date(Date.now() + minutes * 60 * 1000)));
  }, [setManualValue]);

  const resetManualForm = useCallback(() => {
    setManualForm(createEmptyManualForm(settingsForm));
    setManualTouched(false);
    setManualError('');
  }, [settingsForm]);

  const saveSettings = useCallback(() => {
    const result = validateSettingsForm(settingsForm);
    if (result.errorKey) {
      setSettingsError(t(result.errorKey));
      return;
    }

    updateReminderSettings.mutate(result.value, {
      onSuccess: (response) => {
        setSettingsDraft(settingsToForm(response.data));
        toast.success(t('qop.reminders.toast.settingsSaved'));
      },
      onError: (error) => {
        const message = error?.message || t('qop.reminders.settings.invalidLists');
        setSettingsError(message);
        toast.error(message);
      },
    });
  }, [settingsForm, t, updateReminderSettings]);

  const createReminder = useCallback(() => {
    const result = validateManualReminderForm(effectiveManualForm);
    if (result.errorKey) {
      setManualError(t(result.errorKey));
      return;
    }

    createAppointmentReminder.mutate(result.value, {
      onSuccess: () => {
        toast.success(t('qop.reminders.toast.created'));
        resetManualForm();
      },
      onError: (error) => {
        const message = error?.message || t('qop.reminders.manual.required');
        setManualError(message);
        toast.error(message);
      },
    });
  }, [createAppointmentReminder, effectiveManualForm, resetManualForm, t]);

  const updateStatus = useCallback((id, status, customerResponse = null) => {
    updateAppointmentReminderStatus.mutate({
      id,
      data: {
        status,
        customerResponse: status === 'RESPONDED' ? (customerResponse || 'confirmed') : null,
      },
    }, {
      onSuccess: () => toast.success(t('qop.reminders.toast.statusUpdated')),
      onError: (error) => toast.error(error?.message || t('qop.reminders.toast.statusUpdateFailed')),
    });
  }, [t, updateAppointmentReminderStatus]);

  const refresh = useCallback(() => {
    remindersQuery.refetch();
    settingsQuery.refetch();
  }, [remindersQuery, settingsQuery]);

  return {
    language,
    t,
    filters: {
      statusFilter,
      setStatusFilter,
      searchTerm,
      setSearchTerm,
      sortKey,
      setSortKey,
    },
    settings: {
      form: settingsForm,
      error: settingsError,
      isLoading: settingsQuery.isLoading,
      isFetching: settingsQuery.isFetching,
      isError: settingsQuery.isError,
      queryError: settingsQuery.error,
      isSaving: updateReminderSettings.isPending,
      isSaved: updateReminderSettings.isSuccess,
      setValue: setSettingsValue,
      reset: resetSettingsDraft,
      save: saveSettings,
    },
    manual: {
      form: effectiveManualForm,
      error: manualError,
      customers: customersQuery.data || [],
      isSearchingCustomers: customersQuery.isFetching,
      isCustomerSearchError: customersQuery.isError,
      isCreating: createAppointmentReminder.isPending,
      setValue: setManualValue,
      selectCustomer,
      applyQuickSend,
      reset: resetManualForm,
      create: createReminder,
    },
    table: {
      reminders,
      rawCount: rawReminders.length,
      isLoading: remindersQuery.isLoading,
      isFetching: remindersQuery.isFetching,
      isError: remindersQuery.isError,
      error: remindersQuery.error,
      isUpdatingStatus: updateAppointmentReminderStatus.isPending,
      lastUpdatedAt: remindersQuery.dataUpdatedAt,
      updateStatus,
    },
    stats,
    refresh,
  };
}
