import { Hand, PhoneOff, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';

import { callAudioView, canHangUp, canTakeOver, statsFresh } from '../domain/pairedPhoneDomain';
import { useActiveCalls, useCallControl } from '../hooks/usePairedPhone';
import type { ActiveCall } from '../types';

/** Calls in progress for a running AI call campaign, with paired-phone takeover / end controls. */
export function LiveCallsCard({ campaignId, active }: { campaignId: string; active: boolean }) {
  const { t } = useTranslation();
  const calls = useActiveCalls(campaignId, active);
  const list = calls.data ?? [];
  if (!active || list.length === 0) return null;
  return (
    <AppCard className="gap-3">
      <AppText variant="title">{t('pairedPhone.live.title', { count: list.length })}</AppText>
      {list.map((c) => (
        <LiveCallRow key={c.callId} campaignId={campaignId} call={c} />
      ))}
    </AppCard>
  );
}

function LiveCallRow({ campaignId, call }: { campaignId: string; call: ActiveCall }) {
  const { t } = useTranslation();
  const control = useCallControl(campaignId, t('pairedPhone.live.requested'));
  const [confirm, setConfirm] = useState<null | 'takeover' | 'hangup'>(null);
  const paired = call.transport === 'paired_phone';
  const view = callAudioView(call);
  const fresh = statsFresh(call);
  const mins = Math.floor(call.elapsedSeconds / 60);
  const secs = String(call.elapsedSeconds % 60).padStart(2, '0');
  return (
    <View className="gap-2 rounded-xl bg-muted/50 p-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <AppText numberOfLines={1} className="font-geist-semibold">
            {call.leadName}
          </AppText>
          <AppText tone="muted" numberOfLines={1}>
            {t('pairedPhone.live.progress', {
              question: call.currentQuestion || call.phase,
              answered: call.answered,
              total: call.total,
            })}
          </AppText>
        </View>
        <AppText tone="muted">{`${mins}:${secs}`}</AppText>
      </View>
      {paired ? (
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppBadge label={t('pairedPhone.live.paired')} variant="primary" icon={Smartphone} size="sm" />
            <AppBadge
              label={t(`pairedPhone.live.view.${view}`)}
              variant={view === 'lost' ? 'destructive' : view === 'live' ? 'success' : 'muted'}
              size="sm"
            />
          </View>
          {view === 'live' && call.gateway?.audio ? (
            <AppText tone="muted">
              {fresh
                ? t('pairedPhone.live.levels', {
                    rx: Math.round(call.gateway.audio.rxLevelDbfs ?? -120),
                    tx: Math.round(call.gateway.audio.txLevelDbfs ?? -120),
                  })
                : t('pairedPhone.live.stale')}
            </AppText>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {canTakeOver(call) ? (
              <AppButton
                title={t('pairedPhone.live.takeover')}
                leftIcon={Hand}
                size="sm"
                variant="outline"
                onPress={() => setConfirm('takeover')}
              />
            ) : null}
            {canHangUp(call) ? (
              <AppButton
                title={t('pairedPhone.live.hangup')}
                leftIcon={PhoneOff}
                size="sm"
                variant="destructive"
                onPress={() => setConfirm('hangup')}
              />
            ) : null}
          </View>
        </View>
      ) : null}
      <ConfirmDialog
        visible={confirm !== null}
        title={
          confirm === 'takeover' ? t('pairedPhone.live.takeoverTitle') : t('pairedPhone.live.hangupTitle')
        }
        description={
          confirm === 'takeover' ? t('pairedPhone.live.takeoverBody') : t('pairedPhone.live.hangupBody')
        }
        confirmLabel={confirm === 'takeover' ? t('pairedPhone.live.takeover') : t('pairedPhone.live.hangup')}
        destructive={confirm === 'hangup'}
        loading={control.isPending}
        onConfirm={() =>
          confirm &&
          control.mutate({ recordId: call.recordId, action: confirm }, { onSettled: () => setConfirm(null) })
        }
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}
