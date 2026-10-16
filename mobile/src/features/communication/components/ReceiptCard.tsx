import { CheckCircle2, CircleDashed, CircleMinus, CircleX, CloudUpload } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { IconContainer } from '@/components/ui/IconContainer';

import type { LocalOperation } from '../domain/operations';
import { RECEIPT_STEPS } from '../types';

const STEP_ICON = { ok: CheckCircle2, skipped: CircleMinus, failed: CircleX } as const;
const STEP_COLOR = { ok: 'success', skipped: 'mutedForeground', failed: 'destructive' } as const;

/** What the CRM confirmed, step by step. Local "saved" never reads as "saved in the CRM". */
export function ReceiptCard({
  op,
  onRetry,
  retrying,
}: {
  op: LocalOperation;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { t } = useTranslation();
  const error = op.sync.lastError;

  return (
    <AppCard className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconContainer
          icon={op.phase === 'done' ? CheckCircle2 : CloudUpload}
          tone={op.phase === 'done' ? 'success' : 'primary'}
          round
        />
        <AppText variant="title" className="flex-1" accessibilityLiveRegion="polite">
          {t(
            `communication.receipt.title.${op.phase === 'done' ? 'done' : op.phase === 'needs_attention' ? 'attention' : 'syncing'}`,
          )}
        </AppText>
      </View>

      {op.phase === 'submitting' ? (
        <AppText tone="muted">
          {error
            ? t('communication.receipt.retrying', { attempts: op.sync.attempts })
            : t('communication.receipt.syncing')}
        </AppText>
      ) : null}

      {op.receipt ? (
        <View className="gap-2.5 rounded-xl bg-muted/60 p-3" accessibilityRole="list">
          {RECEIPT_STEPS.map((step) => {
            const result = op.receipt?.steps[step];
            const status = result?.status;
            return (
              <View key={step} className="flex-row items-center gap-2">
                <Icon
                  icon={status ? STEP_ICON[status] : CircleDashed}
                  size="sm"
                  color={status ? STEP_COLOR[status] : 'mutedForeground'}
                />
                <AppText className="flex-1 font-geist-medium">
                  {t(`communication.receipt.step.${step}`)}
                </AppText>
                <AppText variant="caption" tone={status === 'failed' ? 'destructive' : 'muted'}>
                  {t(`communication.receipt.status.${status ?? 'pending'}`)}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      {op.phase === 'needs_attention' ? (
        <>
          <AppAlert
            tone={error ? 'destructive' : 'warning'}
            message={
              error
                ? t(`communication.syncError.${error.kind}`, {
                    code: error.code ?? String(error.status ?? ''),
                  })
                : t('communication.receipt.partial')
            }
          />
          <AppButton
            title={t('communication.receipt.retry')}
            variant="outline"
            loading={retrying}
            onPress={onRetry}
          />
        </>
      ) : null}
    </AppCard>
  );
}
