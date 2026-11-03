import { LeadSmsHistory } from '@/features/messaging/LeadSmsHistory';
import {
  Bot,
  Building2,
  CalendarClock,
  CalendarPlus,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Smartphone,
  Tag,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { Appear } from '@/components/motion/Appear';
import { usePressScale } from '@/components/motion/usePressScale';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppListGroup, AppListItem } from '@/components/ui/AppListItem';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { Icon } from '@/components/ui/Icon';
import { IconContainer } from '@/components/ui/IconContainer';
import { CommunicationHistory } from '@/features/communication/components/CommunicationHistory';
import { QualificationSummary } from '@/features/communication/components/QualificationSummary';
import { LeadLinkSessions } from '@/features/linkAssistant/components/LeadLinkSessions';
import { useOpenLeadOperations } from '@/features/communication/hooks/useCommunication';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { logger } from '@/services/logging/logger';
import { brand } from '@/theme/colors';
import { iconSizes, motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';
import { toMailtoUri, toMapsUrl, toWebUrl } from '@/utils/links';
import { showErrorToast } from '@/utils/toast';

import { LEAD_STATUS_META } from '../components/LeadStatusBadge';
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
      contentClassName="gap-4 pt-3"
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

  // Edit lives in the header; converted leads are read-only (managed as customers).
  const editable = lead.status !== 'converted';
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: editable
        ? () => (
            <AppButton
              title={t('leadForm.edit')}
              leftIcon={Pencil}
              variant="ghost"
              size="sm"
              accessibilityLabel={t('leadForm.editA11y', { name: lead.name })}
              onPress={() => navigation.navigate('LeadForm', { leadId: lead.id })}
            />
          )
        : undefined,
    });
  }, [editable, lead.id, lead.name, navigation, t]);

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

  const number = lead.mobile ?? lead.phone;

  return (
    <>
      {/* Hero: identity, status and the three contact actions in one compact block. */}
      <Appear>
        <GradientSurface className="gap-3 rounded-3xl p-4">
          <View className="flex-row items-start gap-3">
            <IconContainer icon={lead.type === 'private' ? UserRound : Building2} tone="inverse" size="md" />
            <View className="min-w-0 flex-1 gap-1">
              <AppText variant="h3" className="text-white" numberOfLines={2} selectable>
                {lead.name}
              </AppText>
              <AppText variant="caption" className="font-geist text-white/60">
                {[lead.leadNumber, t(`leads.type.${lead.type}`)].filter(Boolean).join(' · ')}
              </AppText>
              {number ? (
                <AppText
                  variant="caption"
                  className="text-white/80"
                  style={{ fontVariant: ['tabular-nums'] }}
                  selectable
                >
                  {number}
                </AppText>
              ) : null}
            </View>
          </View>

          {/* Status and its action on their own row: nothing here may wrap or clip. */}
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <HeroStatus status={lead.status} />
            {lead.status === 'converted' ? null : (
              <AppButton
                title={t('leads.changeStatus')}
                variant="inverse"
                size="sm"
                className="rounded-full border-white/10 bg-white/5"
                loading={update.isPending}
                onPress={() => setPicking(true)}
              />
            )}
          </View>

          {hasNumber ? (
            <View className="flex-row items-stretch gap-2 border-t border-white/10 pt-3">
              <HeroAction
                icon={Phone}
                label={t('leads.call')}
                accessibilityLabel={t('leads.callA11y', { name: lead.name })}
                variant="primary"
                onPress={() => navigation.navigate('CallSession', { leadId: lead.id })}
              />
              <HeroAction
                icon={MessageSquare}
                label={t('leads.sms')}
                accessibilityLabel={t('leads.smsA11y', { name: lead.name })}
                onPress={() => navigation.navigate('SmsCompose', { leadId: lead.id })}
              />
              <HeroAction
                icon={Bot}
                label={t('readiness.leadCampaign')}
                accessibilityLabel={t('readiness.leadCampaignA11y', { name: lead.name })}
                variant="ai"
                onPress={() => navigation.navigate('CallCampaignCreate', { leadIds: [lead.id] })}
              />
            </View>
          ) : null}
        </GradientSurface>
      </Appear>

      {lead.status === 'converted' ? (
        <AppText variant="caption" tone="muted" className="-mt-2 px-1">
          {t('leads.convertedLocked')}
        </AppText>
      ) : null}

      {available.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
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

      <AppListGroup title={t('leads.contact')}>
        <AppListItem
          layout="inline"
          icon={Phone}
          label={t('leads.phone')}
          value={lead.phone ?? t('common.notSet')}
        />
        <AppListItem
          layout="inline"
          icon={Smartphone}
          label={t('leads.mobile')}
          value={lead.mobile ?? t('common.notSet')}
        />
        <AppListItem
          layout="inline"
          icon={Mail}
          label={t('leads.email')}
          value={lead.email ?? t('common.notSet')}
        />
        <AppListItem
          layout="inline"
          icon={Globe}
          label={t('leads.website')}
          value={lead.website ?? t('common.notSet')}
        />
        <AppListItem
          layout="inline"
          icon={MapPin}
          label={t('leads.address')}
          value={lead.address?.text ?? t('common.notSet')}
        />
      </AppListGroup>

      <AppListGroup title={t('leads.details')}>
        <AppListItem
          layout="inline"
          icon={UserRound}
          label={t('leads.assignedTo')}
          value={lead.assignedTo?.name ?? t('leads.unassigned')}
        />
        <AppListItem
          layout="inline"
          icon={Building2}
          label={t('leads.sourceLabel')}
          value={lead.source ? t(`leads.source.${lead.source}`) : t('common.notSet')}
        />
        <AppListItem
          layout="inline"
          icon={CalendarPlus}
          label={t('leads.createdAt')}
          value={formatDate(lead.createdAt, i18n.language) ?? t('common.notSet')}
        />
        <AppListItem
          layout="inline"
          icon={CalendarClock}
          label={t('leads.lastContactedAt')}
          value={formatDate(lead.lastContactedAt, i18n.language) ?? t('common.notSet')}
        />
        {lead.tags.length > 0 ? (
          <View className="min-h-12 flex-row items-center gap-3 px-4 py-2.5">
            <IconContainer icon={Tag} tone="muted" size="sm" />
            <View
              className="flex-1 flex-row flex-wrap gap-1.5"
              accessibilityLabel={`${t('leads.tags')}: ${lead.tags.join(', ')}`}
            >
              {lead.tags.map((tag) => (
                <AppBadge key={tag} label={tag} variant="outline" size="sm" />
              ))}
            </View>
          </View>
        ) : null}
      </AppListGroup>

      <LeadSmsHistory
        key={lead.id}
        leadId={lead.id}
        onCampaign={(campaignId) => navigation.navigate('SmsCampaignDetail', { campaignId })}
        onSimCampaign={(campaignId) => navigation.navigate('SimSmsCampaignDetail', { campaignId })}
      />
      <QualificationSummary leadId={lead.id} />
      <LeadLinkSessions leadId={lead.id} />

      <AppButton
        title={t('aiAgent.callHistory.open')}
        leftIcon={Bot}
        variant="outline"
        fullWidth
        onPress={() => navigation.navigate('AiCallHistory', { leadId: lead.id })}
      />

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
        <View className="gap-1.5">
          <AppText variant="overline" tone="muted" accessibilityRole="header" className="px-1">
            {t('leads.notes')}
          </AppText>
          <AppCard>
            <AppText selectable>{lead.notes}</AppText>
          </AppCard>
        </View>
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

/** Status pill readable on the navy hero (the tinted list badges are made for light surfaces). */
function HeroStatus({ status }: { status: Lead['status'] }) {
  const { t } = useTranslation();
  return (
    <View className="min-h-7 flex-row items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
      <Icon icon={LEAD_STATUS_META[status].icon} size="xs" color="primaryForeground" />
      <AppText
        variant="caption"
        style={{ includeFontPadding: false }}
        className="font-geist-semibold leading-4 text-white"
        numberOfLines={1}
      >
        {t(`leads.status.${status}`)}
      </AppText>
    </View>
  );
}

/** Equal-width actions grow with translated/scaled labels instead of truncating them. */
function HeroAction({
  icon: Glyph,
  label,
  accessibilityLabel,
  variant = 'secondary',
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  accessibilityLabel: string;
  variant?: 'primary' | 'secondary' | 'ai';
  onPress: () => void;
}) {
  const press = usePressScale(motion.pressScale.button);
  const foreground = variant === 'primary' ? brand.navy : '#FFFFFF';
  return (
    <Animated.View style={[press.style, { flex: 1, minWidth: 0 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className={cn(
          'min-h-[72px] flex-1 items-center justify-center gap-2 rounded-2xl border px-2 py-3 active:opacity-80',
          variant === 'primary' ? 'border-transparent bg-white' : 'border-white/15 bg-white/10',
        )}
        style={variant === 'ai' ? { backgroundColor: brand[600], borderColor: brand[400] } : undefined}
      >
        <Glyph size={iconSizes.md} color={foreground} strokeWidth={1.75} />
        <AppText
          variant="caption"
          style={{ color: foreground, includeFontPadding: false }}
          className="w-full text-center font-geist-semibold"
        >
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function LeadDetailSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar">
      <View className="gap-4 rounded-3xl border border-border bg-card p-4">
        <View className="flex-row items-center gap-3">
          <AppSkeleton className="h-12 w-12 rounded-2xl" />
          <View className="flex-1 gap-2">
            <AppSkeleton className="h-5 w-3/4" />
            <AppSkeleton className="h-3.5 w-1/3" />
          </View>
        </View>
        <View className="flex-row gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <AppSkeleton key={index} className="h-[72px] flex-1 rounded-2xl" />
          ))}
        </View>
      </View>
      <View className="gap-1 rounded-2xl border border-border bg-card p-4">
        {Array.from({ length: 5 }, (_, index) => (
          <AppSkeleton key={index} className="my-1.5 h-9 w-full" />
        ))}
      </View>
    </View>
  );
}
