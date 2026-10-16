import { useTranslation } from 'react-i18next';

import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get the red button. */
  destructive?: boolean;
  /** While true the dialog cannot be dismissed and the confirm button shows progress. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Every destructive or session-ending action goes through this dialog. */
export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <AppModal
      visible={visible}
      title={title}
      description={description}
      onClose={onCancel}
      dismissible={!loading}
      footer={
        <>
          <AppButton
            title={cancelLabel ?? t('common.cancel')}
            variant="ghost"
            disabled={loading}
            onPress={onCancel}
          />
          <AppButton
            title={confirmLabel}
            variant={destructive ? 'destructive' : 'primary'}
            loading={loading}
            onPress={onConfirm}
          />
        </>
      }
    />
  );
}
