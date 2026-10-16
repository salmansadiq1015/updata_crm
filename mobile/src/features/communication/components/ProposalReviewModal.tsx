import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppChip } from '@/components/ui/AppChip';
import { AppModal } from '@/components/ui/AppModal';
import { AppText } from '@/components/ui/AppText';

import type { Proposal } from '../types';
import { tKey } from '../i18n';
import { useFieldLabel } from './QualificationEditor';

/**
 * AI proposals are suggestions extracted from the user's own notes, each with the exact
 * quote it came from. Nothing is applied until the user accepts it here, and accepting
 * still only fills the form — the CRM is written when the user submits the outcome.
 */
export function ProposalReviewModal({
  visible,
  proposals,
  onClose,
  onApply,
}: {
  visible: boolean;
  proposals: Proposal[];
  onClose: () => void;
  onApply: (accepted: Proposal[]) => void;
}) {
  const { t } = useTranslation();
  const label = useFieldLabel();
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const toggle = (fieldKey: string) =>
    setRejected((current) => {
      const next = new Set(current);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });

  return (
    <AppModal
      visible={visible}
      title={t('communication.proposals.title')}
      description={
        proposals.length ? t('communication.proposals.description') : t('communication.proposals.none')
      }
      onClose={onClose}
      presentation="sheet"
      footer={
        <>
          <AppButton title={t('common.cancel')} variant="ghost" onPress={onClose} />
          {proposals.length ? (
            <AppButton
              title={t('communication.proposals.apply')}
              onPress={() => onApply(proposals.filter((proposal) => !rejected.has(proposal.fieldKey)))}
            />
          ) : null}
        </>
      }
    >
      <View className="gap-4">
        {proposals.map((proposal) => {
          const accepted = !rejected.has(proposal.fieldKey);
          return (
            <View
              key={proposal.fieldKey}
              className="gap-2 rounded-2xl border border-border bg-background p-3.5"
            >
              <AppText variant="label" tone="muted">
                {label(proposal)}
              </AppText>
              <AppText className="font-geist-medium">
                {proposal.status === 'answered'
                  ? String(proposal.proposedValue ?? '')
                  : tKey(t, `communication.answerStatus.${proposal.status}`)}
              </AppText>
              {proposal.evidence ? (
                <View className="flex-row gap-2.5">
                  <View className="w-0.5 rounded-full bg-primary/40" />
                  <AppText variant="caption" tone="muted" selectable className="flex-1">
                    {t('communication.qualification.evidence', { quote: proposal.evidence })}
                  </AppText>
                </View>
              ) : null}
              <View className="flex-row gap-2 pt-1">
                <AppChip
                  label={t('communication.proposals.accept')}
                  selected={accepted}
                  onPress={() => accepted || toggle(proposal.fieldKey)}
                />
                <AppChip
                  label={t('communication.proposals.reject')}
                  selected={!accepted}
                  onPress={() => accepted && toggle(proposal.fieldKey)}
                />
              </View>
            </View>
          );
        })}
      </View>
    </AppModal>
  );
}
