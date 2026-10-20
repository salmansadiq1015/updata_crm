import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppChip } from '@/components/ui/AppChip';
import { AppModal } from '@/components/ui/AppModal';
import { AppText } from '@/components/ui/AppText';
import { useSessionStore } from '@/features/auth/store/sessionStore';

import { useLeadDirectory } from '../hooks/useLeads';
import { DEFAULT_ADVANCED, type LeadAdvancedFilters } from '../store/leadFiltersStore';
import { LEAD_SOURCES, LEAD_TYPES, type LeadSortField, type SortOrder } from '../types';

const SORTS: {
  key: 'newest' | 'oldest' | 'nameAsc' | 'nameDesc' | 'status';
  sortBy: LeadSortField;
  sortOrder: SortOrder;
}[] = [
  { key: 'newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'oldest', sortBy: 'createdAt', sortOrder: 'asc' },
  { key: 'nameAsc', sortBy: 'name', sortOrder: 'asc' },
  { key: 'nameDesc', sortBy: 'name', sortOrder: 'desc' },
  { key: 'status', sortBy: 'status', sortOrder: 'asc' },
];

/** Edits a draft; the list only re-queries when the user applies it. */
export function LeadFiltersModal({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: LeadAdvancedFilters;
  onApply: (next: LeadAdvancedFilters) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const myUserId = useSessionStore((state) => state.user?.id);
  const directory = useLeadDirectory(visible);
  const [draft, setDraft] = useState(value);
  const set = (change: Partial<LeadAdvancedFilters>) => setDraft((current) => ({ ...current, ...change }));

  return (
    <AppModal
      visible={visible}
      title={t('leads.filters.title')}
      presentation="sheet"
      onClose={onClose}
      footer={
        <>
          <AppButton
            title={t('leads.filters.reset')}
            variant="ghost"
            onPress={() => setDraft(DEFAULT_ADVANCED)}
          />
          <AppButton title={t('leads.filters.apply')} onPress={() => onApply(draft)} />
        </>
      }
    >
      <View className="gap-4">
        <Group label={t('leads.filters.sort')}>
          {SORTS.map((sort) => (
            <AppChip
              key={sort.key}
              label={t(`leads.filters.sorts.${sort.key}`)}
              selected={draft.sortBy === sort.sortBy && draft.sortOrder === sort.sortOrder}
              onPress={() => set({ sortBy: sort.sortBy, sortOrder: sort.sortOrder })}
            />
          ))}
        </Group>
        <Group label={t('leads.assignedTo')}>
          <AppChip
            label={t('leads.all')}
            selected={!draft.assignedTo}
            onPress={() => set({ assignedTo: undefined })}
          />
          {myUserId ? (
            <AppChip
              label={t('leads.filters.mine')}
              selected={draft.assignedTo === myUserId}
              onPress={() => set({ assignedTo: myUserId })}
            />
          ) : null}
          {directory.data
            ?.filter((user) => user.id !== myUserId)
            .map((user) => (
              <AppChip
                key={user.id}
                label={user.name}
                selected={draft.assignedTo === user.id}
                onPress={() => set({ assignedTo: user.id })}
              />
            ))}
        </Group>
        <Group label={t('leads.sourceLabel')}>
          <AppChip
            label={t('leads.all')}
            selected={!draft.source}
            onPress={() => set({ source: undefined })}
          />
          {LEAD_SOURCES.map((source) => (
            <AppChip
              key={source}
              label={t(`leads.source.${source}`)}
              selected={draft.source === source}
              onPress={() => set({ source })}
            />
          ))}
        </Group>
        <Group label={t('leads.typeLabel')}>
          <AppChip label={t('leads.all')} selected={!draft.type} onPress={() => set({ type: undefined })} />
          {LEAD_TYPES.map((type) => (
            <AppChip
              key={type}
              label={t(`leads.type.${type}`)}
              selected={draft.type === type}
              onPress={() => set({ type })}
            />
          ))}
        </Group>
      </View>
    </AppModal>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <AppText variant="label">{label}</AppText>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}
