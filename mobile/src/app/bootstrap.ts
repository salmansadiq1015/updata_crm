// Launch sequence: preferences → language → session. Each step degrades instead
// of blocking: a storage failure falls back to defaults, an offline launch lands
// on the session-error screen with a retry.
import { restoreSession } from '@/features/auth/services/session';
import { applyLayoutDirection, initI18n, resolveLocale } from '@/i18n';
import { logger } from '@/services/logging/logger';
import { wireQueryNetworking } from '@/services/connectivity/networkService';
import { usePreferencesStore, waitForPreferences } from '@/store/preferencesStore';

export async function bootstrap(): Promise<void> {
  wireQueryNetworking();
  await waitForPreferences();

  const locale = resolveLocale(usePreferencesStore.getState().language);
  // A direction change takes effect on the next launch; Settings reloads at once.
  applyLayoutDirection(locale);
  await initI18n(locale);

  // Not awaited: the navigator renders the restoring state itself.
  restoreSession().catch((error: unknown) => logger.error('auth.restore.crashed', { error }));
}
