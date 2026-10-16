import { useFocusEffect } from '@react-navigation/native';
import { ListChecks, Phone, ShieldCheck } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { useLead } from '@/features/leads/hooks/useLeads';
import type { Lead } from '@/features/leads/types';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { openAppSettings } from '@/services/permissions/permissionsService';
import { requestCallingPermissions, telephony } from '@/services/telephony/telephonyService';
import { showApiErrorToast, showErrorToast } from '@/utils/toast';

import { CallStatusCard } from '../components/CallStatusCard';
import { ContactHero } from '../components/ContactHero';
import { OutcomeForm } from '../components/OutcomeForm';
import { ReceiptCard } from '../components/ReceiptCard';
import { SimPicker } from '../components/SimPicker';
import { useFieldLabel } from '../components/QualificationEditor';
import {
  useActiveSims,
  useEligibility,
  useOperation,
  useQualification,
  useTelephonyCapabilities,
} from '../hooks/useCommunication';
import {
  ContactFlowError,
  dismissOperation,
  reconcileCallEvents,
  resolveUnknownDispatch,
  startCall,
} from '../services/contactFlows';
import { tKey } from '../i18n';
import { retryOperation } from '../services/outboxSync';
import type { DestinationField } from '../types';

export function CallSessionScreen({ route, navigation }: RootScreenProps<'CallSession'>) {
  const { leadId, operationId } = route.params;
  const lead = useLead(leadId);

  return (
    <Screen edges={[]} mode="keyboard" contentClassName="gap-4 pt-3 pb-10">
      {lead.isPending ? (
        <AppSkeleton className="h-20 w-full rounded-3xl" />
      ) : lead.isError ? (
        <AppErrorState error={lead.error} onRetry={() => void lead.refetch()} />
      ) : operationId ? (
        <ActiveCall operationId={operationId} lead={lead.data} onClose={() => navigation.goBack()} />
      ) : (
        <PrepareCall
          lead={lead.data}
          initialField={route.params.destinationField}
          onStarted={(id) => navigation.setParams({ operationId: id })}
        />
      )}
    </Screen>
  );
}

function PrepareCall({
  lead,
  initialField,
  onStarted,
}: {
  lead: Lead;
  initialField?: DestinationField;
  onStarted: (operationId: string) => void;
}) {
  const { t } = useTranslation();
  const label = useFieldLabel();
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const fields = useMemo(
    () => (['mobile', 'phone'] as const).filter((field) => Boolean(lead[field])),
    [lead],
  );
  const [field, setField] = useState<DestinationField>(initialField ?? fields[0] ?? 'phone');
  const capabilities = useTelephonyCapabilities();
  const caps = capabilities.data;
  const sims = useActiveSims(Boolean(caps?.readPhoneStateGranted));
  const eligibility = useEligibility(lead.id, 'phone', field, fields.length > 0);
  const qualification = useQualification(lead.id);
  const [chosenSim, setSelectedSim] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  // Permissions and SIMs can change in system settings while we are away.
  const { refetch: refetchCaps } = capabilities;
  const { refetch: refetchSims } = sims;
  useFocusEffect(
    useCallback(() => {
      void refetchCaps();
      void refetchSims();
    }, [refetchCaps, refetchSims]),
  );

  const simList = useMemo(() => sims.data ?? [], [sims.data]);
  // A SIM that disappeared (removed, disabled) is never kept as the choice. Without an
  // explicit choice, preselect only an unambiguous one: the only SIM, or the default voice SIM.
  const selectedSim = simList.some((sim) => sim.subscriptionId === chosenSim)
    ? chosenSim
    : ((simList.length === 1 ? simList[0] : simList.find((sim) => sim.isDefaultVoice))?.subscriptionId ??
      null);

  const canPlaceDirect = Boolean(caps?.callPhoneGranted && caps.hasTelephony);
  const sim = simList.find((entry) => entry.subscriptionId === selectedSim) ?? null;
  const simRequired = canPlaceDirect && simList.length > 1 && !sim;

  const blockers: string[] = [];
  if (!telephony.isAvailable()) blockers.push(t('communication.blockers.nativeMissing'));
  else if (caps && !caps.dialerAvailable && !canPlaceDirect)
    blockers.push(t('communication.blockers.noDialer'));
  if (caps?.hasTelephony && caps.simState === 'absent') blockers.push(t('communication.blockers.noSim'));
  if (fields.length === 0) blockers.push(t('communication.blockers.noNumber'));
  if (eligibility.data && !eligibility.data.eligible) {
    for (const reason of eligibility.data.reasons)
      blockers.push(tKey(t, `communication.eligibility.${reason}`, { defaultValue: reason }));
  }

  const askPermissions = useSingleFlight(
    useCallback(async () => {
      const result = await requestCallingPermissions({
        callPhone: {
          title: t('communication.permissions.callTitle'),
          message: t('communication.permissions.callMessage'),
          buttonPositive: t('common.continue'),
        },
        phoneState: {
          title: t('communication.permissions.stateTitle'),
          message: t('communication.permissions.stateMessage'),
          buttonPositive: t('common.continue'),
        },
      });
      setPermissionBlocked(result.callPhone === 'blocked' || result.phoneState === 'blocked');
      await refetchCaps();
      await refetchSims();
    }, [t, refetchCaps, refetchSims]),
  );

  const start = useSingleFlight(
    useCallback(async () => {
      if (!userId) return;
      setStarting(true);
      try {
        const id = await startCall({
          userId,
          lead: { id: lead.id, name: lead.name },
          destinationField: field,
          sim: canPlaceDirect ? sim : null,
          canPlaceDirect,
          mode: 'assisted',
        });
        onStarted(id);
      } catch (error) {
        if (error instanceof ContactFlowError && error.code === 'NOT_AUTHORISED')
          showApiErrorToast(error.cause);
        else showErrorToast(t('communication.startFailed'));
        void eligibility.refetch();
      } finally {
        setStarting(false);
      }
    }, [userId, lead.id, lead.name, field, canPlaceDirect, sim, onStarted, t, eligibility]),
  );

  const disabled = blockers.length > 0 || simRequired || !caps || eligibility.isPending || starting;

  return (
    <>
      <View className="gap-2">
        <ContactHero
          name={lead.name}
          subtitle={
            eligibility.data?.destinationMasked
              ? t('communication.calling', { number: eligibility.data.destinationMasked })
              : t(`leads.${field}`)
          }
        />
        {fields.length > 1 ? (
          <View className="flex-row gap-2">
            {fields.map((value) => (
              <AppChip
                key={value}
                label={t(`leads.${value}`)}
                selected={field === value}
                onPress={() => setField(value)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {caps && caps.hasTelephony && !(caps.callPhoneGranted && caps.readPhoneStateGranted) ? (
        <AppCard className="gap-3">
          <View className="flex-row items-center gap-3">
            <IconContainer icon={ShieldCheck} tone="primary" round />
            <AppText variant="title" className="flex-1">
              {t('communication.permissions.cardTitle')}
            </AppText>
          </View>
          <AppText tone="muted">{t('communication.permissions.cardBody')}</AppText>
          {permissionBlocked ? (
            <AppButton
              title={t('communication.permissions.openSettings')}
              variant="outline"
              onPress={() => void openAppSettings()}
            />
          ) : (
            <AppButton
              title={t('communication.permissions.allow')}
              variant="outline"
              onPress={askPermissions}
            />
          )}
        </AppCard>
      ) : null}

      {caps && !caps.hasTelephony && telephony.isAvailable() ? (
        <AppAlert tone="info" message={t('communication.blockers.noTelephonyHandoff')} />
      ) : null}
      {caps?.airplaneMode ? <AppAlert tone="warning" message={t('communication.blockers.airplane')} /> : null}

      {canPlaceDirect && simList.length > 0 ? (
        <AppCard>
          <SimPicker sims={simList} selected={selectedSim} onSelect={setSelectedSim} />
          {simRequired ? (
            <AppText variant="caption" tone="warning" className="mt-2">
              {t('communication.sim.chooseRequired')}
            </AppText>
          ) : null}
        </AppCard>
      ) : caps && !canPlaceDirect && caps.dialerAvailable ? (
        <AppAlert tone="info" message={t('communication.route.handoffExplain')} />
      ) : null}

      {blockers.length > 0 ? (
        <AppAlert
          tone="destructive"
          title={t('communication.blockers.title')}
          message={blockers.join('\n')}
        />
      ) : null}

      {qualification.data && qualification.data.schema.length > 0 ? (
        <AppCard className="gap-2">
          <View className="flex-row items-center gap-3">
            <IconContainer icon={ListChecks} tone="primary" size="sm" />
            <SectionHeader title={t('communication.guide.title')} className="flex-1" />
          </View>
          <AppText variant="caption" tone="muted">
            {t('communication.guide.body')}
          </AppText>
          {qualification.data.schema.map((entry) => {
            const known = qualification.data.fields.find(
              (stored) => stored.fieldKey === entry.fieldKey && stored.status === 'answered',
            );
            return (
              <AppText key={entry.fieldKey} tone={known ? 'muted' : 'default'}>
                {known ? '✓ ' : '• '}
                {label(entry)}
                {known ? ` — ${String(known.value)}` : ''}
              </AppText>
            );
          })}
        </AppCard>
      ) : null}

      <AppButton
        title={canPlaceDirect ? t('communication.startCall') : t('communication.openDialer')}
        leftIcon={Phone}
        loading={starting}
        disabled={disabled}
        onPress={start}
        fullWidth
      />
      <AppText variant="caption" tone="muted" className="text-center">
        {t('communication.startHint')}
      </AppText>
    </>
  );
}

function ActiveCall({
  operationId,
  lead,
  onClose,
}: {
  operationId: string;
  lead: Lead;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const op = useOperation(operationId);
  const capabilities = useTelephonyCapabilities();
  const [retrying, setRetrying] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reconcileCallEvents(operationId);
    }, [operationId]),
  );

  if (!op) {
    return <AppAlert tone="warning" message={t('communication.operationMissing')} />;
  }

  const monitoring = Boolean(capabilities.data?.readPhoneStateGranted && op.dispatchedAt);
  const retry = async () => {
    setRetrying(true);
    await retryOperation(operationId).finally(() => setRetrying(false));
  };

  return (
    <>
      <ContactHero
        name={lead.name}
        subtitle={
          op.sim ? t('communication.sim.using', { sim: op.sim.label, slot: op.sim.slotIndex + 1 }) : null
        }
      />
      <CallStatusCard op={op} monitoringAvailable={monitoring} />

      {op.phase === 'dispatch_unknown' ? (
        <AppCard className="gap-3">
          <AppAlert tone="warning" message={t('communication.dispatchUnknown')} />
          <AppButton
            title={t('communication.recordWhatHappened')}
            onPress={() => resolveUnknownDispatch(operationId)}
          />
        </AppCard>
      ) : null}

      {op.phase === 'dispatch_failed' || op.phase === 'abandoned' ? (
        <AppCard className="gap-3">
          <AppAlert
            tone="destructive"
            message={tKey(t, `communication.dispatchError.${op.dispatchError ?? 'CALL_FAILED'}`, {
              defaultValue: t('communication.dispatchError.CALL_FAILED'),
            })}
          />
          <AppButton
            title={t('common.close')}
            variant="outline"
            onPress={() => {
              dismissOperation(operationId);
              onClose();
            }}
          />
        </AppCard>
      ) : null}

      {op.phase === 'in_progress' && !op.completePayload ? (
        <OutcomeForm op={op} leadStatus={lead.status} />
      ) : null}

      {op.completePayload ? (
        <>
          <ReceiptCard op={op} onRetry={() => void retry()} retrying={retrying} />
          <AppButton
            title={t('communication.backToLead')}
            variant={op.phase === 'done' ? 'primary' : 'outline'}
            onPress={onClose}
            fullWidth
          />
        </>
      ) : null}
    </>
  );
}
