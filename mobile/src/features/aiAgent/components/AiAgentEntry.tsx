import { Bot } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, type ButtonSize, type ButtonVariant } from '@/components/ui/AppButton';

import { useStartAiAgent } from '../hooks/useAiAgent';

type Props = {
  /** Explicit lead ids only; the server re-validates each one at start. */
  leadIds: readonly string[];
  /** Overrides the default "Give to AI agent" label (e.g. with a count). */
  title?: string;
  accessibilityLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

/** Hands the given leads to the AI agent flow (AI call or AI SMS). */
export function AiAgentEntry({
  leadIds,
  title,
  accessibilityLabel,
  variant = 'outline',
  size = 'sm',
  fullWidth,
}: Props) {
  const { t } = useTranslation();
  const start = useStartAiAgent();
  return (
    <AppButton
      title={title ?? t('aiAgent.entry')}
      leftIcon={Bot}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      disabled={leadIds.length === 0}
      accessibilityLabel={accessibilityLabel}
      onPress={() => start(leadIds)}
    />
  );
}
