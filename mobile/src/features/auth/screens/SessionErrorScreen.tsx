import { CloudOff } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppEmptyState } from '@/components/ui/AppEmptyState';

import { restoreSession, signOut } from '../services/session';

/**
 * The stored session could not be verified because the server was unreachable.
 * The sign-in is kept: retrying is the expected path, signing out is the escape.
 */
export function SessionErrorScreen() {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Screen edges={['top', 'bottom']} contentClassName="justify-center">
      <AppEmptyState
        icon={CloudOff}
        title={t('auth.sessionErrorTitle')}
        description={t('auth.sessionErrorBody')}
        action={
          <View className="w-64 gap-2">
            <AppButton title={t('common.retry')} onPress={() => void restoreSession()} fullWidth />
            <AppButton
              title={t('auth.signOut')}
              variant="ghost"
              onPress={() => setConfirming(true)}
              fullWidth
            />
          </View>
        }
      />
      <ConfirmDialog
        visible={confirming}
        title={t('settings.signOutTitle')}
        description={t('settings.signOutBody')}
        confirmLabel={t('auth.signOut')}
        destructive
        loading={signingOut}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setSigningOut(true);
          void signOut().finally(() => setSigningOut(false));
        }}
      />
    </Screen>
  );
}
