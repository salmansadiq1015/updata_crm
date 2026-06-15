'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contactService } from '@/modules/crm/services/contact-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';

const INITIAL_PAGINATION = Object.freeze({ pageIndex: 0, pageSize: 25 });
const CONTACT_OVERVIEW_QUERY_ROOT = ['crm', 'contacts', 'overview'];

export function useContactOverview() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearchState] = useState('');
  const [typeFilter, setTypeFilterState] = useState('all');
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const debouncedSearch = useDebounce(search, 300).trim();

  const params = useMemo(
    () => ({
      search: debouncedSearch,
      type: typeFilter,
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
    }),
    [debouncedSearch, typeFilter, pagination.pageIndex, pagination.pageSize],
  );

  const overviewQuery = useQuery({
    queryKey: queryKeys.crm.contacts.overview(params),
    queryFn: () => contactService.getOverview(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const invalidateContacts = async (customerId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CONTACT_OVERVIEW_QUERY_ROOT }),
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.contacts.all() }),
      customerId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.crm.contacts.byCustomer(customerId) })
        : Promise.resolve(),
    ]);
  };

  const createContact = useMutation({
    mutationFn: ({ customerId, payload }) => contactService.createForCustomer(customerId, payload),
    onSuccess: (_data, variables) => {
      invalidateContacts(variables.customerId);
      showSuccess(t('crm.contacts.createdToast', 'Kontakt erstellt'));
    },
    onError: (error) => showError(error.message),
  });

  const updateContact = useMutation({
    mutationFn: ({ id, payload }) => contactService.update(id, payload),
    onSuccess: (_data, variables) => {
      invalidateContacts(variables.customerId);
      showSuccess(t('crm.contacts.updatedToast', 'Kontakt aktualisiert'));
    },
    onError: (error) => showError(error.message),
  });

  const archiveContact = useMutation({
    mutationFn: ({ id }) => contactService.archive(id),
    onSuccess: (_data, variables) => {
      invalidateContacts(variables.customerId);
      showSuccess(t('crm.contacts.archivedToast', 'Kontakt archiviert'));
    },
    onError: (error) => showError(error.message),
  });

  const setPrimaryContact = useMutation({
    mutationFn: ({ id }) => contactService.setPrimary(id),
    onSuccess: (_data, variables) => {
      invalidateContacts(variables.customerId);
      showSuccess(t('crm.contacts.primarySetToast', 'Primaerkontakt gesetzt'));
    },
    onError: (error) => showError(error.message),
  });

  const setSearch = (value) => {
    setSearchState(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const setTypeFilter = (value) => {
    setTypeFilterState(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const setPageSize = (value) => {
    setPagination({ pageIndex: 0, pageSize: Number(value) || INITIAL_PAGINATION.pageSize });
  };

  return {
    contacts: overviewQuery.data?.data || [],
    summary: overviewQuery.data?.summary || { total: 0, private: 0, business: 0 },
    serverPagination: overviewQuery.data?.pagination || null,
    isFetching: overviewQuery.isFetching,
    isError: overviewQuery.isError,
    error: overviewQuery.error,
    refetch: overviewQuery.refetch,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    pagination,
    setPagination,
    setPageSize,
    createContact,
    updateContact,
    archiveContact,
    setPrimaryContact,
  };
}
