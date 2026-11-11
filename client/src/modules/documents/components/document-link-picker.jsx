'use client';

import { useState } from 'react';
import { Combobox } from '@/components/ui/combobox';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDocumentLinkTargets } from '../hooks/use-document-repository';
import { LINK_META } from '../utils/document-visuals';

export const LINKABLE_TYPES = ['customer', 'project', 'job', 'employee', 'installation'];

/**
 * Searchable picker for one link target (customer, project, job, employee,
 * installation) — by name or number, never by database id.
 * `value` is { id, label } | null.
 */
export function DocumentLinkPicker({ type, value, onChange, disabled }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250).trim();
  const { data = [], isFetching } = useDocumentLinkTargets(type, debounced);
  const Icon = LINK_META[type]?.icon;
  const options = data.map((r) => ({ value: r.id, label: r.label || r.sub || r.id, description: r.sub || undefined }));

  return (
    <Combobox
      async
      options={options}
      value={value?.id || ''}
      selectedLabel={value?.label}
      onChange={(id, option) => onChange(id ? { id, label: option?.label || '' } : null)}
      onSearchChange={setSearch}
      loading={isFetching}
      allowClear
      disabled={disabled}
      triggerIcon={Icon}
      placeholder={t(`documents.hub.pick.${type}`, `Choose ${type}`)}
      searchPlaceholder={t('documents.hub.pick.search', 'Search by name or number…')}
      noResultsMessage={t('documents.hub.pick.none', 'Nothing found')}
      ariaLabel={t(`documents.repository.link.${type}`, type)}
      className="h-10 rounded-xl"
    />
  );
}
