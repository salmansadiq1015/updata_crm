'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { crmAddressBookService } from '../services/crm-address-book-service';

const MIN_QUERY_LENGTH = 2;

export function useCrmAddressBook() {
  const [query, setQuery] = useState('');
  const normalizedQuery = useMemo(() => query.trim(), [query]);
  const effectiveQuery = normalizedQuery.length >= MIN_QUERY_LENGTH ? normalizedQuery : '';

  const results = useLiveQuery(
    () => crmAddressBookService.search(effectiveQuery),
    [effectiveQuery],
  );

  const summary = useLiveQuery(
    () => crmAddressBookService.getSummary(),
    [],
  );

  return {
    query,
    setQuery,
    results: results || [],
    summary: summary || null,
    isLoading: results === undefined || summary === undefined,
    isQueryTooShort: normalizedQuery.length > 0 && normalizedQuery.length < MIN_QUERY_LENGTH,
  };
}
