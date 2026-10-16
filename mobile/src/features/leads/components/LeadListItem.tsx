import { Building2, CheckSquare, Clock, MapPin, Square, User, UserRound } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppPressableCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
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

  return (
    <AppPressableCard
      onPress={() => onPress(lead)}
      onLongPress={onLongPress ? () => onLongPress(lead) : undefined}
      accessibilityLabel={[lead.name, statusLabel, city].filter(Boolean).join(', ')}
      {...(selectionMode
        ? { accessibilityRole: 'checkbox' as const, accessibilityState: { checked: selected } }
        : {})}
      className={selectionMode && selected ? 'gap-2 border-primary' : 'gap-2'}
    >
      <View className="flex-row items-start gap-3">
        {selectionMode ? (
          <View className="h-10 w-6 items-center justify-center" testID={`lead-select-${lead.id}`}>
            <Icon
              icon={selected ? CheckSquare : Square}
              size="md"
              color={selected ? 'primary' : 'mutedForeground'}
            />
          </View>
        ) : null}
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <Icon icon={lead.type === 'private' ? User : Building2} size="sm" color="accentForeground" />
        </View>
        <View className="flex-1 gap-1">
          <AppText variant="title" numberOfLines={1}>
            {lead.name}
          </AppText>
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            {lead.leadNumber ? (
              <AppText variant="caption" tone="muted">
                {lead.leadNumber}
              </AppText>
            ) : null}
            {city ? (
              <View className="flex-row items-center gap-1">
                <Icon icon={MapPin} size="xs" color="mutedForeground" />
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {city}
                </AppText>
              </View>
            ) : null}
            {lead.assignedTo?.name ? (
              <View className="flex-row items-center gap-1">
                <Icon icon={UserRound} size="xs" color="mutedForeground" />
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {lead.assignedTo.name}
                </AppText>
              </View>
            ) : null}
            {lastContact ? (
              <View className="flex-row items-center gap-1">
                <Icon icon={Clock} size="xs" color="mutedForeground" />
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {lead.lastContactChannel
                    ? t('leads.lastContactVia', {
                        when: lastContact,
                        channel: t(`leads.channel.${lead.lastContactChannel}`),
                      })
                    : lastContact}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
        <LeadStatusBadge status={lead.status} />
      </View>
    </AppPressableCard>
  );
});
