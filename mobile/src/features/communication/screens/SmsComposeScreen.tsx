import { MessageSquare } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppInput } from '@/components/ui/AppInput';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { useLead } from '@/features/leads/hooks/useLeads';
import type { Lead } from '@/features/leads/types';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { showApiErrorToast, showErrorToast } from '@/utils/toast';

import { OutcomeForm } from '../components/OutcomeForm';
import { ReceiptCard } from '../components/ReceiptCard';
import { analyzeSms } from '../domain/smsEncoding';
import { findUnresolvedTokens, leadTemplateVariables, renderTemplate } from '../domain/templates';
import { useEligibility, useOperation, useSmsTemplates } from '../hooks/useCommunication';
import { ContactFlowError, dismissOperation, startSms } from '../services/contactFlows';
import { ContactHero } from '../components/ContactHero';
import { tKey } from '../i18n';
import { retryOperation } from '../services/outboxSync';
import type { DestinationField, SmsTemplate } from '../types';

const MAX_SEGMENTS = 10;

export function SmsComposeScreen({ route, navigation }: RootScreenProps<'SmsCompose'>) {
  const { leadId, operationId } = route.params;
  const lead = useLead(leadId);

  return (
    <Screen edges={[]} mode="keyboard" contentClassName="gap-4 pt-3 pb-10">
      {lead.isPending ? (
        <AppSkeleton className="h-20 w-full rounded-3xl" />
      ) : lead.isError ? (
        <AppErrorState error={lead.error} onRetry={() => void lead.refetch()} />
      ) : operationId ? (
        <SmsOutcome operationId={operationId} lead={lead.data} onClose={() => navigation.goBack()} />
      ) : (
        <Compose
          lead={lead.data}
          initialField={route.params.destinationField}
          onStarted={(id) => navigation.setParams({ operationId: id })}
        />
      )}
    </Screen>
  );
}

function Compose({
  lead,
  initialField,
  onStarted,
}: {
  lead: Lead;
  initialField?: DestinationField;
  onStarted: (operationId: string) => void;
}) {
  const { t } = useTranslation();
  const user = useSessionStore((state) => state.user);
  const fields = useMemo(
    () => (['mobile', 'phone'] as const).filter((field) => Boolean(lead[field])),
    [lead],
  );
  const [field, setField] = useState<DestinationField>(initialField ?? fields[0] ?? 'mobile');
  const eligibility = useEligibility(lead.id, 'sms', field, fields.length > 0);
  const templates = useSmsTemplates();
  const [template, setTemplate] = useState<SmsTemplate | null>(null);
  const [body, setBody] = useState('');
  const [starting, setStarting] = useState(false);

  const variables = useMemo(
    () => leadTemplateVariables(lead, { senderName: user?.fullName ?? null }),
    [lead, user?.fullName],
  );

  const pickTemplate = (next: SmsTemplate | null) => {
    setTemplate(next);
    if (!next) return setBody('');
    const rendered = renderTemplate(next.bodyText, variables, next.fallbackValues);
    setBody(rendered.text);
  };

  const unresolved = findUnresolvedTokens(body);
  const info = analyzeSms(body);
  const blockers: string[] = [];
  if (fields.length === 0) blockers.push(t('communication.blockers.noNumber'));
  if (eligibility.data && !eligibility.data.eligible) {
    for (const reason of eligibility.data.reasons)
      blockers.push(tKey(t, `communication.eligibility.${reason}`, { defaultValue: reason }));
  }
  if (unresolved.length > 0)
    blockers.push(t('communication.sms.unresolved', { tokens: unresolved.join(', ') }));
  if (info.segments > MAX_SEGMENTS) blockers.push(t('communication.sms.tooLong', { max: MAX_SEGMENTS }));

  const open = useSingleFlight(
    useCallback(async () => {
      if (!user) return;
      setStarting(true);
      try {
        const id = await startSms({
          userId: user.id,
          lead: { id: lead.id, name: lead.name },
          destinationField: field,
          body: body.trim(),
          templateId: template?.id ?? null,
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
    }, [user, lead.id, lead.name, field, body, template, onStarted, t, eligibility]),
  );

  return (
    <>
      <View className="gap-2">
        <ContactHero
          name={lead.name}
          subtitle={
            eligibility.data?.destinationMasked
              ? t('communication.sms.to', { number: eligibility.data.destinationMasked })
              : null
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

      <AppCard className="gap-3">
        <SectionHeader title={t('communication.sms.templates')} />
        {templates.isPending ? (
          <AppSkeleton className="h-9 w-full rounded-full" />
        ) : templates.isError ? (
          <AppAlert tone="warning" message={t('communication.sms.templatesFailed')} />
        ) : templates.data.length === 0 ? (
          <AppText tone="muted">{t('communication.sms.noTemplates')}</AppText>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-4"
            contentContainerClassName="gap-2 px-4"
          >
            <AppChip
              label={t('communication.sms.blank')}
              selected={!template}
              onPress={() => pickTemplate(null)}
            />
            {templates.data.map((entry) => (
              <AppChip
                key={entry.id}
                label={entry.name}
                selected={template?.id === entry.id}
                onPress={() => pickTemplate(entry)}
              />
            ))}
          </ScrollView>
        )}
        <AppInput
          value={body}
          onChangeText={setBody}
          multiline
          placeholder={t('communication.sms.placeholder')}
          accessibilityLabel={t('communication.sms.body')}
        />
        <AppText
          variant="caption"
          tone={info.segments > 1 ? 'warning' : 'muted'}
          accessibilityLiveRegion="polite"
        >
          {t('communication.sms.meter', {
            characters: info.characters,
            encoding: info.encoding,
            segments: info.segments,
            remaining: info.remainingInSegment,
          })}
        </AppText>
        {info.encoding === 'UCS-2' ? (
          <AppText variant="caption" tone="muted">
            {t('communication.sms.unicodeHint')}
          </AppText>
        ) : null}
      </AppCard>

      {blockers.length > 0 ? (
        <AppAlert
          tone="destructive"
          title={t('communication.blockers.title')}
          message={blockers.join('\n')}
        />
      ) : null}
      <AppAlert tone="info" message={t('communication.sms.composerExplain')} />

      <AppButton
        title={t('communication.sms.open')}
        leftIcon={MessageSquare}
        disabled={blockers.length > 0 || !body.trim() || eligibility.isPending || starting}
        loading={starting}
        onPress={open}
        fullWidth
      />
    </>
  );
}

function SmsOutcome({
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
  const [retrying, setRetrying] = useState(false);
  if (!op) return <AppAlert tone="warning" message={t('communication.operationMissing')} />;

  return (
    <>
      <ContactHero name={lead.name} subtitle={t(`communication.phase.${op.phase}`)}>
        {op.smsBody ? (
          <AppText selectable className="rounded-2xl border border-white/15 bg-white/10 p-3 text-white">
            {op.smsBody}
          </AppText>
        ) : null}
      </ContactHero>

      {op.phase === 'dispatch_failed' || op.phase === 'abandoned' ? (
        <AppCard className="gap-3">
          <AppAlert tone="destructive" message={t('communication.dispatchError.NO_ACTIVITY')} />
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

      {(op.phase === 'in_progress' || op.phase === 'dispatch_unknown') && !op.completePayload ? (
        <>
          <AppAlert tone="info" message={t('communication.sms.didYouSend')} />
          <OutcomeForm op={op} leadStatus={lead.status} />
        </>
      ) : null}

      {op.completePayload ? (
        <>
          <ReceiptCard
            op={op}
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              void retryOperation(operationId).finally(() => setRetrying(false));
            }}
          />
          <AppButton title={t('communication.backToLead')} onPress={onClose} fullWidth />
        </>
      ) : null}
    </>
  );
}
