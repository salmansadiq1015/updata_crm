import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import { CloudUpload, Info, LogOut, Phone, Server, ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Appear } from '@/components/motion/Appear';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppListItem } from '@/components/ui/AppListItem';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { Icon } from '@/components/ui/Icon';
import { getEnv } from '@/config/env';
import { signOut } from '@/features/auth/services/session';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { hasUnsyncedWork } from '@/features/communication/domain/operations';
import { useAllOperations, useTelephonyCapabilities } from '@/features/communication/hooks/useCommunication';
import { applyLayoutDirection, i18next, resolveLocale } from '@/i18n';
import { LOCALE_NAMES, LOCALES, type Locale } from '@/i18n/locales';
import { logger } from '@/services/logging/logger';
import { flushPreferences, usePreferencesStore, type ThemePreference } from '@/store/preferencesStore';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const DEVICE = 'device';

async function changeLanguage(next: Locale | null) {
  usePreferencesStore.getState().setLanguage(next);
  const locale = resolveLocale(next);
  await i18next.changeLanguage(locale);
  // Android applies a layout-direction change only after a reload.
  if (applyLayoutDirection(locale)) {
    await flushPreferences();
    await reloadAppAsync('Layout direction changed').catch((error: unknown) =>
      logger.warn('settings.reload_failed', { error }),
    );
  }
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const user = useSessionStore((state) => state.user);
  const theme = usePreferencesStore((state) => state.theme);
  const language = usePreferencesStore((state) => state.language);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const env = getEnv();
  const navigation = useNavigation();
  const operations = useAllOperations();
  const unsynced = useMemo(() => operations.filter(hasUnsyncedWork).length, [operations]);
  const capabilities = useTelephonyCapabilities().data;
  const callingSummary = !capabilities?.hasTelephony
    ? capabilities?.dialerAvailable
      ? t('communication.settings.handoffOnly')
      : t('communication.settings.unavailable')
    : capabilities.callPhoneGranted && capabilities.readPhoneStateGranted
      ? t('communication.settings.full')
      : t('communication.settings.limited');

  const languageOptions = [
    { value: DEVICE, label: t('settings.languageSystem') },
    ...LOCALES.map((locale) => ({ value: locale, label: LOCALE_NAMES[locale] })),
  ];

  return (
    <Screen header={{ title: t('settings.title') }} contentClassName="gap-6">
      {user ? (
        <Appear>
          <GradientSurface className="flex-row items-center gap-4 rounded-4xl p-5">
            <AppAvatar name={user.fullName} imageUrl={user.avatarUrl} size="lg" ring />
            <View className="flex-1 gap-0.5">
              <AppText variant="title" className="text-lg text-white" numberOfLines={1}>
                {user.fullName}
              </AppText>
              <AppText className="text-white/75" numberOfLines={1}>
                {user.email}
              </AppText>
              {user.roleName ? (
                <View className="mt-2 flex-row items-center gap-1.5 self-start rounded-full border border-white/20 bg-white/15 px-2.5 py-1">
                  <Icon icon={ShieldCheck} size="xs" color="primaryForeground" />
                  <AppText variant="caption" className="font-geist-semibold text-white">
                    {user.roleName}
                  </AppText>
                </View>
              ) : null}
            </View>
          </GradientSurface>
        </Appear>
      ) : null}

      <Appear index={1}>
        <View className="gap-2">
          <SectionHeader title={t('settings.appearance')} />
          <AppRadioGroup
            accessibilityLabel={t('settings.appearance')}
            value={theme}
            onChange={setTheme}
            options={THEMES.map((value) => ({ value, label: t(`settings.theme.${value}`) }))}
          />
        </View>
      </Appear>

      <Appear index={2}>
        <View className="gap-2">
          <SectionHeader title={t('settings.language')} />
          <AppRadioGroup
            accessibilityLabel={t('settings.language')}
            value={language ?? DEVICE}
            onChange={(value) => void changeLanguage(value === DEVICE ? null : (value as Locale))}
            options={languageOptions}
          />
          <AppText variant="caption" tone="muted" className="ms-1">
            {t('settings.languageRestart')}
          </AppText>
        </View>
      </Appear>

      <Appear index={3}>
        <AppCard className="py-1">
          <SectionHeader title={t('communication.settings.title')} className="pt-2" />
          <AppListItem
            icon={CloudUpload}
            label={t('communication.queue.title')}
            value={
              unsynced > 0
                ? t('communication.settings.unsynced', { count: unsynced })
                : t('communication.settings.allSynced')
            }
            onPress={() => navigation.navigate('CommunicationQueue')}
            bordered
          />
          <AppListItem
            icon={Phone}
            label={t('communication.settings.calling')}
            value={callingSummary}
            bordered
          />
        </AppCard>
      </Appear>

      <Appear index={4}>
        <AppCard className="py-1">
          <SectionHeader title={t('settings.about')} className="pt-2" />
          <AppListItem
            icon={Info}
            label={t('settings.version')}
            value={Constants.expoConfig?.version ?? '—'}
            bordered
          />
          <AppListItem
            icon={Server}
            label={t('settings.environment')}
            value={`${t(`settings.envName.${env.appEnv}`)} · ${new URL(env.apiUrl).host}`}
            bordered
          />
        </AppCard>
      </Appear>

      <AppButton
        title={t('auth.signOut')}
        variant="outline"
        leftIcon={LogOut}
        onPress={() => setConfirmingSignOut(true)}
        fullWidth
      />

      <ConfirmDialog
        visible={confirmingSignOut}
        title={t('settings.signOutTitle')}
        description={
          unsynced > 0
            ? `${t('settings.signOutBody')}\n\n${t('communication.settings.signOutUnsynced', { count: unsynced })}`
            : t('settings.signOutBody')
        }
        confirmLabel={t('auth.signOut')}
        destructive
        loading={signingOut}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => {
          setSigningOut(true);
          // The navigator switches to Login when the session store changes; this screen unmounts.
          void signOut();
        }}
      />
    </Screen>
  );
}
