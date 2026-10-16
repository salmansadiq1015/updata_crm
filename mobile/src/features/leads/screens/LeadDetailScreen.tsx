import {
  Bot,
  Building2,
  CalendarClock,
  CalendarPlus,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Smartphone,
  Tag,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppListItem } from '@/components/ui/AppListItem';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { CommunicationHistory } from '@/features/communication/components/CommunicationHistory';
import { QualificationSummary } from '@/features/communication/components/QualificationSummary';
import { useOpenLeadOperations } from '@/features/communication/hooks/useCommunication';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { logger } from '@/services/logging/logger';
import { formatDate } from '@/utils/date';
import { toMailtoUri, toMapsUrl, toWebUrl } from '@/utils/links';
import { showErrorToast } from '@/utils/toast';

import { LeadStatusBadge } from '../components/LeadStatusBadge';
import { LeadStatusPicker } from '../components/LeadStatusPicker';
import { isLeadId, useLead, useUpdateLeadStatus } from '../hooks/useLeads';
import type { AssignableLeadStatus, Lead } from '../types';

const NOT_FOUND = new ApiError({ kind: 'http', status: 404, message: 'Invalid lead id' });

async function openExternal(url: string, failureMessage: string) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    logger.info('lead.open_external_failed', { scheme: url.split(':')[0], error });
    showErrorToast(failureMessage);
  }
}

export function LeadDetailScreen({ route, navigation }: RootScreenProps<'LeadDetail'>) {
  const { leadId } = route.params;
  const query = useLead(leadId);

  if (!isLeadId(leadId)) return <AppErrorState error={NOT_FOUND} className="flex-1 bg-background" />;

  return (
    <Screen
      edges={[]}
      refreshing={query.isRefetching}
      onRefresh={query.data ? () => void query.refetch() : undefined}
      contentClassName="gap-4 pt-4"
    >
      {query.isPending ? (
        <LeadDetailSkeleton />
      ) : query.isError ? (
        <AppErrorState
          error={query.error}
          retrying={query.isRefetching}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <LeadDetail lead={query.data} navigation={navigation} />
      )}
    </Screen>
  );
}

function LeadDetail({
  lead,
  navigation,
}: {
  lead: Lead;
  navigation: RootScreenProps<'LeadDetail'>['navigation'];
}) {
  const { t, i18n } = useTranslation();
  const openOperations = useOpenLeadOperations(lead.id);
  const [picking, setPicking] = useState(false);
  const update = useUpdateLeadStatus(lead.id);
  const { mutateAsync } = update;
  const saveStatus = useSingleFlight(
    useCallback(
      async (status: AssignableLeadStatus) => {
        await mutateAsync(status);
        setPicking(false);
      },
      [mutateAsync],
    ),
  );

  const hasNumber = Boolean(lead.phone ?? lead.mobile);
  type Action = { key: string; label: string; icon: LucideIcon; url: string | null; a11y?: string };
  // Call and SMS go through the in-app flow (CRM-authorised, logged, outcome recorded);
  // only links that need no record (email, web, map) open external apps directly.
  const actions: Action[] = [
    {
      key: 'email',
      label: t('leads.sendEmail'),
      icon: Mail,
      url: toMailtoUri(lead.email),
      a11y: t('leads.emailA11y', { name: lead.name }),
    },
    { key: 'web', label: t('leads.openWebsite'), icon: Globe, url: toWebUrl(lead.website) },
    {
      key: 'map',
      label: t('leads.openMap'),
      icon: MapPin,
      url: toMapsUrl(lead.mapsUrl, lead.address?.text ?? null),
    },
  ];
  const available = actions.filter((action): action is Action & { url: string } => action.url !== null);

  return (
    <>
      <AppCard className="gap-4">
        <View className="gap-2">
          <AppText variant="h3">{lead.name}</AppText>
          <View className="flex-row flex-wrap items-center gap-2">
            <LeadStatusBadge status={lead.status} />
            <AppBadge label={t(`leads.type.${lead.type}`)} variant="outline" />
            {lead.leadNumber ? <AppBadge label={lead.leadNumber} variant="muted" /> : null}
          </View>
        </View>
        {available.length > 0 || hasNumber ? (
          <View className="flex-row flex-wrap gap-2">
            {hasNumber ? (
              <>
                <AppButton
                  title={t('leads.call')}
                  leftIcon={Phone}
                  size="sm"
                  accessibilityLabel={t('leads.callA11y', { name: lead.name })}
                  onPress={() => navigation.navigate('CallSession', { leadId: lead.id })}
                />
                <AppButton
                  title={t('leads.sms')}
                  leftIcon={MessageSquare}
                  variant="outline"
                  size="sm"
                  accessibilityLabel={t('leads.smsA11y', { name: lead.name })}
                  onPress={() => navigation.navigate('SmsCompose', { leadId: lead.id })}
                />
                <AppButton
                  title={t('aiAgent.entry')}
                  leftIcon={Bot}
                  variant="outline"
                  size="sm"
                  accessibilityLabel={t('aiAgent.entryA11y', { name: lead.name })}
                  onPress={() => navigation.navigate('AiAgentLaunch', { leadIds: [lead.id] })}
                />
              </>
            ) : null}
            {available.map((action) => (
              <AppButton
                key={action.key}
                title={action.label}
                leftIcon={action.icon}
                variant="outline"
                size="sm"
                accessibilityLabel={action.a11y}
                onPress={() => void openExternal(action.url, t('leads.cannotOpen'))}
              />
            ))}
          </View>
        ) : null}
        {lead.status === 'converted' ? (
          <AppText variant="caption" tone="muted">
            {t('leads.convertedLocked')}
          </AppText>
        ) : (
          <AppButton
            title={t('leads.changeStatus')}
            variant="secondary"
            loading={update.isPending}
            onPress={() => setPicking(true)}
            fullWidth
          />
        )}
      </AppCard>

      <AppCard className="py-1">
        <SectionHeader title={t('leads.contact')} className="pt-2" />
        <AppListItem
          icon={Phone}
          label={t('leads.phone')}
          value={lead.phone ?? t('common.notSet')}
          bordered
        />
        <AppListItem
          icon={Smartphone}
          label={t('leads.mobile')}
          value={lead.mobile ?? t('common.notSet')}
          bordered
        />
        <AppListItem icon={Mail} label={t('leads.email')} value={lead.email ?? t('common.notSet')} bordered />
        <AppListItem
          icon={Globe}
          label={t('leads.website')}
          value={lead.website ?? t('common.notSet')}
          bordered
        />
        <AppListItem
          icon={MapPin}
          label={t('leads.address')}
          value={lead.address?.text ?? t('common.notSet')}
          bordered
        />
      </AppCard>

      <AppCard className="py-1">
        <SectionHeader title={t('leads.details')} className="pt-2" />
        <AppListItem
          icon={UserRound}
          label={t('leads.assignedTo')}
          value={lead.assignedTo?.name ?? t('leads.unassigned')}
          bordered
        />
        <AppListItem
          icon={Building2}
          label={t('leads.sourceLabel')}
          value={lead.source ? t(`leads.source.${lead.source}`) : t('common.notSet')}
          bordered
        />
        <AppListItem
          icon={CalendarPlus}
          label={t('leads.createdAt')}
          value={formatDate(lead.createdAt, i18n.language) ?? t('common.notSet')}
          bordered
        />
        <AppListItem
          icon={CalendarClock}
          label={t('leads.lastContactedAt')}
          value={formatDate(lead.lastContactedAt, i18n.language) ?? t('common.notSet')}
          bordered
        />
        {lead.tags.length > 0 ? (
          <View className="flex-row items-center gap-3 border-t border-border py-3">
            <Icon icon={Tag} size="sm" color="mutedForeground" />
            <View
              className="flex-1 flex-row flex-wrap gap-1.5"
              accessibilityLabel={`${t('leads.tags')}: ${lead.tags.join(', ')}`}
            >
              {lead.tags.map((tag) => (
                <AppBadge key={tag} label={tag} variant="outline" />
              ))}
            </View>
          </View>
        ) : null}
      </AppCard>

      <QualificationSummary leadId={lead.id} />

      <CommunicationHistory
        leadId={lead.id}
        openOperations={openOperations}
        onResume={(op) =>
          navigation.navigate(op.channel === 'sms' ? 'SmsCompose' : 'CallSession', {
            leadId: lead.id,
            operationId: op.operationId,
          })
        }
      />

      {lead.notes ? (
        <AppCard className="gap-2">
          <SectionHeader title={t('leads.notes')} />
          <AppText selectable>{lead.notes}</AppText>
        </AppCard>
      ) : null}

      {lead.status !== 'converted' ? (
        <LeadStatusPicker
          key={`${lead.status}-${picking}`}
          visible={picking}
          current={lead.status}
          saving={update.isPending}
          onClose={() => setPicking(false)}
          onSave={saveStatus}
        />
      ) : null}
    </>
  );
}

function LeadDetailSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar">
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <AppSkeleton className="h-6 w-3/4" />
        <AppSkeleton className="h-5 w-1/3 rounded-full" />
        <AppSkeleton className="mt-2 h-12 w-full rounded-xl" />
      </View>
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        {Array.from({ length: 5 }, (_, index) => (
          <AppSkeleton key={index} className="h-10 w-full" />
        ))}
      </View>
    </View>
  );
}
