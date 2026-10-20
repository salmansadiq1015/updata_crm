import { Building2, CheckSquare, Clock, Mail, Phone, Square, User } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppPressableCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/date';

import type { Lead } from '../types';
import { LeadStatusBadge } from './LeadStatusBadge';

type Props = {
  lead: Lead;
  onPress: (lead: Lead) => void;
  /** Long-press enters selection mode (e.g. to hand leads to the AI agent). */
  onLongPress?: (lead: Lead) => void;
  /** In selection mode the row is a checkbox: a press toggles instead of opening the lead. */
  selectionMode?: boolean;
  selected?: boolean;
};

/** One lead in a list. Memoised: list rows re-render only when their lead or selection changes. */
export const LeadListItem = memo(function LeadListItem({
  lead,
  onPress,
  onLongPress,
  selectionMode = false,
  selected = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const city = lead.address?.city ?? null;
  const lastContact = formatRelative(lead.lastContactedAt, i18n.language);
  const statusLabel = t(`leads.status.${lead.status}`);

  const lastContactLabel = lastContact
    ? lead.lastContactChannel
      ? t('leads.lastContactVia', {
          when: lastContact,
          channel: t(`leads.channel.${lead.lastContactChannel}`),
        })
      : lastContact
    : null;
  // One muted meta line (number · city · owner); last contact gets its own line when known.
  const meta = [lead.leadNumber, city, lead.assignedTo?.name].filter(Boolean).join(' · ');
  const contact = lead.mobile ?? lead.phone ?? lead.email;
  const ContactIcon = lead.mobile || lead.phone ? Phone : Mail;

  return (
    <AppPressableCard
      onPress={() => onPress(lead)}
      onLongPress={onLongPress ? () => onLongPress(lead) : undefined}
      accessibilityLabel={[lead.name, statusLabel, city].filter(Boolean).join(', ')}
      {...(selectionMode
        ? { accessibilityRole: 'checkbox' as const, accessibilityState: { checked: selected } }
        : {})}
      className={cn('px-3.5 py-3', selectionMode && selected && 'border-primary bg-primary/5')}
    >
      <View className="flex-row items-center gap-3">
        {selectionMode ? (
          <View className="h-10 w-6 items-center justify-center" testID={`lead-select-${lead.id}`}>
            <Icon
              icon={selected ? CheckSquare : Square}
              size="md"
              color={selected ? 'primary' : 'mutedForeground'}
            />
          </View>
        ) : null}
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent">
          <Icon icon={lead.type === 'private' ? User : Building2} size="sm" color="accentForeground" />
        </View>
        <View className="flex-1 gap-0.5">
          <AppText variant="title" numberOfLines={1}>
            {lead.name}
          </AppText>
          {meta ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {meta}
            </AppText>
          ) : null}
          {contact ? (
            <View className="flex-row items-center gap-1">
              <Icon icon={ContactIcon} size="xs" color="mutedForeground" />
              <AppText variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                {contact}
              </AppText>
            </View>
          ) : null}
          {lastContactLabel ? (
            <View className="flex-row items-center gap-1">
              <Icon icon={Clock} size="xs" color="mutedForeground" />
              <AppText variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                {lastContactLabel}
              </AppText>
            </View>
          ) : null}
        </View>
        <LeadStatusBadge status={lead.status} compact />
      </View>
    </AppPressableCard>
  );
});
