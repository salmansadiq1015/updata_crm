'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { addressBookService } from '@/modules/crm/services/address-book-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';

export const ADDRESS_BOOK_PAGE_SIZE = 50;

const INITIAL_FILTERS = Object.freeze({
  search: '',
  customerType: 'all',
  addressType: 'all',
  canton: '',
  hasCoordinates: 'all',
});

export function useAddressBook() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: ADDRESS_BOOK_PAGE_SIZE });
  const debouncedSearch = useDebounce(filters.search, 300).trim();

  const params = useMemo(
    () => ({
      search: debouncedSearch,
      customerType: filters.customerType,
      addressType: filters.addressType,
      canton: filters.canton,
      hasCoordinates: filters.hasCoordinates,
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
    }),
    [
      debouncedSearch,
      filters.customerType,
      filters.addressType,
      filters.canton,
      filters.hasCoordinates,
      pagination.pageIndex,
      pagination.pageSize,
    ],
  );

  const query = useQuery({
    queryKey: queryKeys.crm.addressBook.list(params),
    queryFn: () => addressBookService.list(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const setFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
    filters.customerType !== 'all' ||
    filters.addressType !== 'all' ||
    filters.canton ||
    filters.hasCoordinates !== 'all',
  );

  return {
    entries: query.data?.data || [],
    summary: query.data?.summary || null,
    serverPagination: query.data?.pagination || null,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    filters,
    setFilter,
    resetFilters,
    hasActiveFilters,
    pagination,
    setPagination,
  };
}
