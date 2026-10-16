import { Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppModal } from '@/components/ui/AppModal';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { ASSIGNABLE_LEAD_STATUSES, type LeadStatus } from '@/features/leads/types';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { formatDate } from '@/utils/date';
import { showApiErrorToast, showErrorToast } from '@/utils/toast';

import { analyzeSms } from '../domain/smsEncoding';
import type { LocalOperation, OutcomeDraft } from '../domain/operations';
import { useProposeQualification, useQualification } from '../hooks/useCommunication';
import { saveDraft, submitOutcome } from '../services/contactFlows';
import {
  CALL_DISPOSITIONS,
  SMS_DISPOSITIONS,
  type Connected,
  type Disposition,
  type Proposal,
  type QualificationAnswer,
  type SmsSendStatus,
} from '../types';
import { tKey } from '../i18n';
import { ProposalReviewModal } from './ProposalReviewModal';
import { QualificationEditor, useFieldLabel } from './QualificationEditor';

const FOLLOW_UP_PRESETS = [
  { key: 'tomorrow', days: 1 },
  { key: 'in3days', days: 3 },
  { key: 'nextWeek', days: 7 },
] as const;

function followUpDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0); // 10:00 in the device's own time zone, sent with that zone
  return date.toISOString();
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const SMS_STATUS: Record<(typeof SMS_DISPOSITIONS)[number], SmsSendStatus> = {
  sent: 'user_reported_sent',
  not_sent: 'user_reported_not_sent',
  unknown: 'unknown',
};

export function OutcomeForm({ op, leadStatus }: { op: LocalOperation; leadStatus: LeadStatus }) {
  const { t, i18n } = useTranslation();
  const label = useFieldLabel();
  const qualification = useQualification(op.leadId);
  const propose = useProposeQualification(op.leadId);
  const [draft, setDraft] = useState<OutcomeDraft>(op.draft);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState<string | null>(null);
  const isSms = op.channel === 'sms';

  // Persist the draft (debounced) so notes survive navigation, interruptions and restarts.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => saveDraft(op.operationId, draft), 400);
    return () => clearTimeout(timer);
  }, [draft, op.operationId]);

  const update = (change: Partial<OutcomeDraft>) => setDraft((current) => ({ ...current, ...change }));

  const answers: QualificationAnswer[] = useMemo(() => {
    const schema = qualification.data?.schema ?? [];
    return Object.entries(draft.answers)
      .filter(([, answer]) => answer.status !== 'unknown' || answer.value.trim())
      .map(([fieldKey, answer]) => {
        const field = schema.find((entry) => entry.fieldKey === fieldKey);
        return {
          fieldKey,
          label: field?.label ?? fieldKey,
          value: answer.status === 'answered' ? answer.value.trim() : null,
          status: answer.status as QualificationAnswer['status'],
          source: answer.source as QualificationAnswer['source'],
          evidence: answer.evidence,
          confidence: null,
        };
      });
  }, [draft.answers, qualification.data?.schema]);

  const suggest = useSingleFlight(
    useCallback(async () => {
      try {
        const result = await propose.mutateAsync({ notes: draft.notes, language: i18n.language });
        if (!result.available) {
          setAiUnavailable(
            result.reason === 'ai_not_configured'
              ? t('communication.proposals.unavailable.notConfigured')
              : t('communication.proposals.unavailable.failed'),
          );
          return;
        }
        setAiUnavailable(null);
        setProposals(result.proposals);
      } catch (error) {
        showApiErrorToast(error);
      }
    }, [propose, draft.notes, i18n.language, t]),
  );

  const applyProposals = (accepted: Proposal[]) => {
    setDraft((current) => {
      const next = { ...current.answers };
      for (const proposal of accepted) {
        next[proposal.fieldKey] = {
          value: proposal.status === 'answered' ? String(proposal.proposedValue ?? '') : '',
          status: proposal.status,
          source: 'ai_proposed_user_confirmed',
          evidence: proposal.evidence,
        };
      }
      return { ...current, answers: next };
    });
    setProposals(null);
  };

  const disposition = draft.disposition as Disposition | null;
  const canReview = Boolean(disposition);

  const submit = useSingleFlight(
    useCallback(async () => {
      if (!disposition) return;
      const sms = isSms
        ? (() => {
            const info = analyzeSms(op.smsBody ?? '');
            return {
              sendStatus: SMS_STATUS[disposition as keyof typeof SMS_STATUS] ?? 'unknown',
              encoding: info.encoding,
              segments: info.segments,
            };
          })()
        : undefined;
      try {
        saveDraft(op.operationId, draft);
        await submitOutcome(op.operationId, {
          disposition,
          connected: isSms ? 'unknown' : draft.connected,
          notes: draft.notes,
          followUpAt: draft.followUpAt,
          followUpTimezone: draft.followUpAt ? deviceTimeZone() : null,
          statusChange: draft.statusChange,
          doNotContact: draft.doNotContact,
          answers,
          sms,
        });
        setReviewing(false);
      } catch {
        showErrorToast(t('communication.submitFailed'));
      }
    }, [disposition, isSms, op.operationId, op.smsBody, draft, answers, t]),
  );

  const stored = qualification.data?.fields ?? [];
  const conflicts = answers.filter((answer) => {
    const current = stored.find((entry) => entry.fieldKey === answer.fieldKey);
    return (
      current?.status === 'answered' &&
      answer.status === 'answered' &&
      String(current.value) !== String(answer.value)
    );
  });

  const dispositionOptions = (isSms ? SMS_DISPOSITIONS : CALL_DISPOSITIONS).map((value) => ({
    value,
    label: tKey(t, `communication.disposition.${value}`),
  }));

  return (
    <View className="gap-4">
      <AppCard className="gap-3">
        <SectionHeader
          title={isSms ? t('communication.outcome.smsTitle') : t('communication.outcome.title')}
        />
        <AppRadioGroup
          options={dispositionOptions}
          value={draft.disposition ?? ''}
          onChange={(value) =>
            update({ disposition: value, doNotContact: value === 'do_not_contact' || draft.doNotContact })
          }
          accessibilityLabel={t('communication.outcome.title')}
        />
        {!isSms ? (
          <View className="gap-2">
            <AppText variant="label">{t('communication.outcome.connected')}</AppText>
            <View className="flex-row flex-wrap gap-2">
              {(['yes', 'no', 'unknown'] as Connected[]).map((value) => (
                <AppChip
                  key={value}
                  label={t(`communication.connected.${value}`)}
                  selected={draft.connected === value}
                  onPress={() => update({ connected: value })}
                />
              ))}
            </View>
            <AppText variant="caption" tone="muted">
              {t('communication.outcome.connectedHint')}
            </AppText>
          </View>
        ) : null}
      </AppCard>

      <AppCard className="gap-3">
        <SectionHeader title={t('communication.notes.title')} />
        <AppInput
          value={draft.notes}
          onChangeText={(notes) => update({ notes })}
          placeholder={t('communication.notes.placeholder')}
          multiline
          maxLength={5000}
          accessibilityLabel={t('communication.notes.title')}
        />
        {!isSms ? (
          <AppButton
            title={t('communication.proposals.suggest')}
            leftIcon={Sparkles}
            variant="outline"
            size="sm"
            disabled={draft.notes.trim().length < 10}
            loading={propose.isPending}
            onPress={suggest}
          />
        ) : null}
        {aiUnavailable ? <AppAlert tone="info" message={aiUnavailable} /> : null}
      </AppCard>

      {!isSms ? (
        <AppCard className="gap-3">
          <SectionHeader title={t('communication.qualification.title')} />
          <AppText variant="caption" tone="muted">
            {t('communication.qualification.hint')}
          </AppText>
          {qualification.isPending ? (
            <AppText tone="muted">{t('common.loading')}</AppText>
          ) : qualification.isError ? (
            <AppAlert tone="warning" message={t('communication.qualification.loadFailed')} />
          ) : (
            <QualificationEditor
              schema={qualification.data.schema}
              stored={stored}
              answers={draft.answers}
              onChange={(fieldKey, answer) => update({ answers: { ...draft.answers, [fieldKey]: answer } })}
            />
          )}
        </AppCard>
      ) : null}

      <AppCard className="gap-3">
        <SectionHeader title={t('communication.next.title')} />
        <AppText variant="label">{t('communication.next.followUp')}</AppText>
        <View className="flex-row flex-wrap gap-2">
          <AppChip
            label={t('communication.next.none')}
            selected={!draft.followUpAt}
            onPress={() => update({ followUpAt: null })}
          />
          {FOLLOW_UP_PRESETS.map((preset) => {
            const value = followUpDate(preset.days);
            const selected = draft.followUpAt?.slice(0, 10) === value.slice(0, 10);
            return (
              <AppChip
                key={preset.key}
                label={t(`communication.next.${preset.key}`)}
                selected={selected}
                onPress={() => update({ followUpAt: value })}
              />
            );
          })}
        </View>
        {draft.followUpAt ? (
          <AppText variant="caption" tone="muted">
            {t('communication.next.followUpAt', {
              date: formatDate(draft.followUpAt, i18n.language) ?? '',
              zone: deviceTimeZone(),
            })}
          </AppText>
        ) : null}

        {leadStatus !== 'converted' ? (
          <>
            <AppText variant="label">{t('communication.next.status')}</AppText>
            <View className="flex-row flex-wrap gap-2">
              <AppChip
                label={t('communication.next.keepStatus')}
                selected={!draft.statusChange}
                onPress={() => update({ statusChange: null })}
              />
              {ASSIGNABLE_LEAD_STATUSES.filter((status) => status !== leadStatus).map((status) => (
                <AppChip
                  key={status}
                  label={t(`leads.status.${status}`)}
                  selected={draft.statusChange === status}
                  onPress={() => update({ statusChange: status })}
                />
              ))}
            </View>
          </>
        ) : null}

        <AppChip
          label={t('communication.next.doNotContact')}
          selected={draft.doNotContact}
          onPress={() => update({ doNotContact: !draft.doNotContact })}
        />
        {draft.doNotContact ? (
          <AppAlert tone="warning" message={t('communication.next.doNotContactHint')} />
        ) : null}
      </AppCard>

      <AppButton
        title={t('communication.review.open')}
        disabled={!canReview}
        onPress={() => setReviewing(true)}
        fullWidth
      />

      <AppModal
        visible={reviewing}
        title={t('communication.review.title')}
        description={t('communication.review.description')}
        onClose={() => setReviewing(false)}
        presentation="sheet"
        footer={
          <>
            <AppButton title={t('common.back')} variant="ghost" onPress={() => setReviewing(false)} />
            <AppButton title={t('communication.review.confirm')} onPress={submit} />
          </>
        }
      >
        <View className="gap-2">
          <ReviewRow
            label={t('communication.review.outcome')}
            value={disposition ? tKey(t, `communication.disposition.${disposition}`) : '—'}
          />
          {!isSms ? (
            <ReviewRow
              label={t('communication.outcome.connected')}
              value={t(`communication.connected.${draft.connected}`)}
            />
          ) : null}
          <ReviewRow
            label={t('communication.review.status')}
            value={
              draft.statusChange
                ? `${t(`leads.status.${leadStatus}`)} → ${tKey(t, `leads.status.${draft.statusChange}`)}`
                : t('communication.next.keepStatus')
            }
          />
          <ReviewRow
            label={t('communication.next.followUp')}
            value={
              draft.followUpAt
                ? `${formatDate(draft.followUpAt, i18n.language)} (${deviceTimeZone()})`
                : t('communication.next.none')
            }
          />
          {draft.doNotContact ? (
            <AppAlert tone="warning" message={t('communication.next.doNotContactHint')} />
          ) : null}
          {answers.map((answer) => {
            const current = stored.find((entry) => entry.fieldKey === answer.fieldKey);
            const before =
              current?.status === 'answered'
                ? String(current.value)
                : current
                  ? tKey(t, `communication.answerStatus.${current.status}`)
                  : '—';
            const after =
              answer.status === 'answered'
                ? String(answer.value)
                : tKey(t, `communication.answerStatus.${answer.status}`);
            return <ReviewRow key={answer.fieldKey} label={label(answer)} value={`${before} → ${after}`} />;
          })}
          {conflicts.length > 0 ? (
            <AppAlert
              tone="warning"
              message={t('communication.review.conflicts', { count: conflicts.length })}
            />
          ) : null}
        </View>
      </AppModal>

      {proposals ? (
        <ProposalReviewModal
          visible
          proposals={proposals}
          onClose={() => setProposals(null)}
          onApply={applyProposals}
        />
      ) : null}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3 border-b border-border py-2">
      <AppText variant="label" tone="muted" className="w-2/5">
        {label}
      </AppText>
      <AppText className="flex-1 font-geist-medium">{value}</AppText>
    </View>
  );
}
