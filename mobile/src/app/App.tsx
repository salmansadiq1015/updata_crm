import '@/theme/global.css';
import '@/theme/interop';

import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { envResult } from '@/config/env';
import { logger } from '@/services/logging/logger';
import { RootNavigator } from '@/navigation/RootNavigator';

import { bootstrap } from './bootstrap';
import { ConfigErrorScreen } from './ConfigErrorScreen';
import { AppProviders } from './providers/AppProviders';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!envResult.ok) {
      SplashScreen.hide();
      return;
    }
    bootstrap()
      .catch((error: unknown) => logger.error('app.bootstrap_failed', { error }))
      .finally(() => {
        setReady(true);
        SplashScreen.hide();
      });
  }, []);

  if (!envResult.ok) {
    return <ConfigErrorScreen issues={envResult.error.issues} showIssues={__DEV__} />;
  }
  // The native splash stays up until language and preferences are loaded.
  if (!ready) return null;

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
