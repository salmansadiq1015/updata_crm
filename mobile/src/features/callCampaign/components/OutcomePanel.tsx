import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { VoiceNoteButton } from '@/features/communication/components/VoiceNoteButton';

import { OUTCOMES_AFTER_DIAL, OUTCOMES_WITHOUT_DIAL, type CallEvidence } from '../domain/campaignDomain';
import type { AttemptDraft } from '../store/campaignOutbox';
import type { CallOutcome } from '../types';
import { CallbackFields } from './CallbackFields';

type Props = {
  draft: AttemptDraft;
  onChange: (change: Partial<AttemptDraft>) => void;
  dialled: boolean;
  evidence: CallEvidence;
  leadId: string;
  campaignTimezone: string;
  error: string | null;
  saving: boolean;
  onSubmit: () => void;
};

/**
 * The caller confirms what happened. Android cannot tell an answered call from an unanswered
 * one for a normal app, so the outcome is always the caller's choice; the call-state evidence
 * is shown only as context.
 */
export function OutcomePanel({
  draft,
  onChange,
  dialled,
  evidence,
  leadId,
  campaignTimezone,
  error,
  saving,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const outcomes: readonly CallOutcome[] = dialled
    ? [...OUTCOMES_AFTER_DIAL, 'failed']
    : OUTCOMES_WITHOUT_DIAL;
  return (
    <AppCard className="gap-4">
      <AppText variant="h3">{t('callCampaign.outcome.title')}</AppText>
      <AppAlert
        tone="info"
        message={
          evidence.ended && evidence.offhookDurationSec !== null
            ? t('callCampaign.outcome.evidenceEnded', { seconds: evidence.offhookDurationSec })
            : dialled
              ? t('callCampaign.outcome.evidenceUnknown')
              : t('callCampaign.outcome.notDialled')
        }
      />
      <View className="flex-row flex-wrap gap-2">
        {outcomes.map((o) => (
          <AppChip
            key={o}
            label={t(`callCampaign.outcomes.${o}`)}
            selected={draft.outcome === o}
            onPress={() => onChange({ outcome: o })}
          />
        ))}
      </View>
      {draft.outcome === 'answered' ? (
        <View className="gap-1">
          <AppText variant="label">{t('callCampaign.outcome.interest')}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {(['interested', 'not_interested'] as const).map((i) => (
              <AppChip
                key={i}
                label={t(`callCampaign.interest.${i}`)}
                selected={draft.interest === i}
                onPress={() => onChange({ interest: draft.interest === i ? null : i })}
              />
            ))}
          </View>
        </View>
      ) : null}
      {draft.outcome === 'callback_requested' ? (
        <CallbackFields
          campaignTimezone={campaignTimezone}
          value={{
            date: draft.callbackDate,
            time: draft.callbackTime,
            timezone: draft.callbackTimezone,
            reason: draft.callbackReason,
          }}
          onChange={(v) =>
            onChange({
              callbackDate: v.date,
              callbackTime: v.time ?? '10:00',
              callbackTimezone: v.timezone,
              callbackReason: v.reason,
            })
          }
        />
      ) : null}
      <AppInput
        label={t('callCampaign.outcome.notes')}
        value={draft.notes}
        onChangeText={(notes) => onChange({ notes })}
        multiline
        maxLength={5000}
      />
      {dialled ? (
        <View className="gap-2">
          <VoiceNoteButton
            leadId={leadId}
            onText={(text) =>
              onChange({ transcript: draft.transcript ? `${draft.transcript}\n${text}` : text })
            }
          />
          {draft.transcript ? (
            <AppInput
              label={t('callCampaign.outcome.transcript')}
              helperText={t('callCampaign.outcome.transcriptHelp')}
              value={draft.transcript}
              onChangeText={(transcript) => onChange({ transcript })}
              multiline
              maxLength={10_000}
            />
          ) : null}
        </View>
      ) : null}
      {dialled && draft.outcome && !['failed', 'cancelled'].includes(draft.outcome) ? (
        <AppChip
          label={t('callCampaign.outcome.doNotContact')}
          selected={draft.doNotContact}
          onPress={() => onChange({ doNotContact: !draft.doNotContact })}
        />
      ) : null}
      {error ? <AppAlert tone="destructive" message={error} /> : null}
      <AppButton
        title={t('callCampaign.outcome.save')}
        loading={saving}
        disabled={!draft.outcome || saving}
        onPress={onSubmit}
      />
    </AppCard>
  );
}
