import {
  AlertTriangle,
  FileQuestion,
  KeyRound,
  RotateCcw,
  ShieldAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { errorKind, errorMessageKey, type ErrorKind } from '@/utils/errorMessages';

import { AppButton } from './AppButton';
import { AppEmptyState } from './AppEmptyState';

const ICONS: Record<ErrorKind, LucideIcon> = {
  offline: WifiOff,
  forbidden: ShieldAlert,
  not_found: FileQuestion,
  session: KeyRound,
  generic: AlertTriangle,
};

export type AppErrorStateProps = {
  error: unknown;
  /** Omit when retrying cannot help (forbidden, not found). */
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
};

/** Full-area error with a mapped, localized message — never the raw server text. */
export function AppErrorState({ error, onRetry, retrying, className }: AppErrorStateProps) {
  const { t } = useTranslation();
  const kind = errorKind(error);
  const canRetry = onRetry && kind !== 'forbidden' && kind !== 'not_found';

  return (
    <AppEmptyState
      icon={ICONS[kind]}
      iconColor={kind === 'generic' ? 'destructive' : 'mutedForeground'}
      title={t('errors.screenTitle')}
      description={t(errorMessageKey(error))}
      className={className}
      action={
        canRetry ? (
          <AppButton
            title={t('common.retry')}
            variant="outline"
            leftIcon={RotateCcw}
            loading={retrying}
            onPress={onRetry}
          />
        ) : undefined
      }
    />
  );
}
