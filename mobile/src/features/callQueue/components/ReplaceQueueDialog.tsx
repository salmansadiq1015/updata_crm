import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';

import type { QueueProgress } from '../domain/queue';

type Props = {
  visible: boolean;
  progress: QueueProgress | null;
  onResume: () => void;
  onReplace: () => void;
  onCancel: () => void;
};

/** One queue at a time: continue the unfinished one, or replace it with the new selection. */
export function ReplaceQueueDialog({ visible, progress, onResume, onReplace, onCancel }: Props) {
  const { t } = useTranslation();
  return (
    <AppModal
      visible={visible}
      title={t('callQueue.replace.title')}
      description={t('callQueue.replace.body', {
        position: progress?.position ?? 0,
        total: progress?.total ?? 0,
      })}
      onClose={onCancel}
    >
      <View className="gap-2">
        <AppButton title={t('callQueue.replace.resume')} onPress={onResume} fullWidth />
        <AppButton title={t('callQueue.replace.replace')} variant="outline" onPress={onReplace} fullWidth />
        <AppButton title={t('common.cancel')} variant="ghost" onPress={onCancel} fullWidth />
      </View>
    </AppModal>
  );
}
