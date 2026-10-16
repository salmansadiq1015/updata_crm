import { AlertTriangle } from 'lucide-react-native';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { i18next } from '@/i18n';
import { logger } from '@/services/logging/logger';

type State = { failed: boolean };

/**
 * Last line of defence for render errors. Shows a recoverable screen instead of
 * a white one; never shows the error itself (it may contain CRM data).
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('app.render_crash', { error, componentStack: info.componentStack?.slice(0, 500) });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View className="flex-1 justify-center bg-background">
        <AppEmptyState
          icon={AlertTriangle}
          iconColor="destructive"
          title={i18next.t('errors.screenTitle')}
          description={i18next.t('errors.unknown')}
          action={
            <AppButton title={i18next.t('common.retry')} onPress={() => this.setState({ failed: false })} />
          }
        />
      </View>
    );
  }
}
