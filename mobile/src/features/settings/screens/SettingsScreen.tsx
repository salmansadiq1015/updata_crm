import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import {
  Bot,
  CloudUpload,
  Info,
  LogOut,
  Smartphone,
  Phone,
  Server,
  Settings2,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Appear } from '@/components/motion/Appear';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppButton } from '@/components/ui/AppButton';
import { AppListGroup, AppListItem } from '@/components/ui/AppListItem';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { Icon } from '@/components/ui/Icon';
import { getEnv } from '@/config/env';
import { signOut } from '@/features/auth/services/session';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { useAgentDefaults } from '@/features/callAgent/hooks/useCallAgent';
import { hasUnsyncedWork } from '@/features/communication/domain/operations';
import { useAllOperations, useTelephonyCapabilities } from '@/features/communication/hooks/useCommunication';
import { applyLayoutDirection, i18next, resolveLocale } from '@/i18n';
import { LOCALE_NAMES, LOCALES, type Locale } from '@/i18n/locales';
import { logger } from '@/services/logging/logger';
import { openAppSettings } from '@/services/permissions/permissionsService';
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
  const defaults = useAgentDefaults();
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
    <Screen header={{ title: t('settings.title') }} contentClassName="gap-5 pt-1">
      {user ? (
        <Appear>
          <GradientSurface className="flex-row items-center gap-3 rounded-3xl p-4">
            <AppAvatar name={user.fullName} imageUrl={user.avatarUrl} size="lg" ring />
            <View className="flex-1 gap-0.5">
              <AppText variant="h3" className="text-white" numberOfLines={1}>
                {user.fullName}
              </AppText>
              <AppText variant="label" className="font-geist text-white/70" numberOfLines={1}>
                {user.email}
              </AppText>
              {user.roleName ? (
                <View className="mt-1.5 h-6 flex-row items-center gap-1.5 self-start rounded-full border border-white/20 bg-white/15 px-2.5">
                  <Icon icon={ShieldCheck} size="xs" color="primaryForeground" />
                  <AppText
                    variant="caption"
                    style={{ includeFontPadding: false }}
                    className="font-geist-semibold leading-4 text-white"
                  >
                    {user.roleName}
                  </AppText>
                </View>
              ) : null}
            </View>
          </GradientSurface>
        </Appear>
      ) : null}

      <Appear index={1}>
        <View className="gap-1.5">
          <SectionHeader title={t('settings.appearance')} size="group" />
          <AppRadioGroup
            accessibilityLabel={t('settings.appearance')}
            appearance="segmented"
            value={theme}
            onChange={setTheme}
            options={THEMES.map((value) => ({ value, label: t(`settings.theme.${value}`) }))}
          />
        </View>
      </Appear>

      <Appear index={2}>
        <View className="gap-1.5">
          <SectionHeader title={t('settings.language')} size="group" />
          <AppRadioGroup
            accessibilityLabel={t('settings.language')}
            value={language ?? DEVICE}
            onChange={(value) => void changeLanguage(value === DEVICE ? null : (value as Locale))}
            options={languageOptions}
          />
          <AppText variant="caption" tone="muted" className="px-1">
            {t('settings.languageRestart')}
          </AppText>
        </View>
      </Appear>

      <Appear index={3}>
        <AppListGroup title={t('communication.settings.title')}>
          <AppListItem
            icon={CloudUpload}
            iconTone={unsynced > 0 ? 'warning' : 'success'}
            layout="inline"
            label={t('communication.queue.title')}
            value={
              unsynced > 0
                ? t('communication.settings.unsynced', { count: unsynced })
                : t('communication.settings.allSynced')
            }
            onPress={() => navigation.navigate('CommunicationQueue')}
          />
          <AppListItem
            icon={Phone}
            iconTone="primary"
            layout="inline"
            label={t('communication.settings.calling')}
            value={callingSummary}
            onPress={() => void openAppSettings()}
          />
          {Platform.OS === 'android' ? (
            <AppListItem
              icon={Stethoscope}
              iconTone="muted"
              layout="inline"
              label={t('communication.callCheck.title')}
              onPress={() => navigation.navigate('CallAudioCheck')}
            />
          ) : null}
          <AppListItem
            icon={Settings2}
            iconTone="muted"
            layout="inline"
            label={t('settings.devicePermissions')}
            value={t('settings.openSystemSettings')}
            onPress={() => void openAppSettings()}
          />
        </AppListGroup>
      </Appear>

      <Appear index={4}>
        <AppListGroup title={t('settings.aiAgent')}>
          <AppListItem
            icon={Bot}
            iconTone="primary"
            layout="inline"
            label={t('settings.agentDefaults')}
            value={defaults.data ? t('settings.configured') : t('settings.notConfigured')}
            onPress={() => navigation.navigate('CallAgentSettings')}
          />
          <AppListItem
            icon={Smartphone}
            iconTone="primary"
            layout="inline"
            label={t('readiness.title')}
            onPress={() => navigation.navigate('MobileReadiness')}
          />
        </AppListGroup>
      </Appear>

      <Appear index={5}>
        <AppListGroup title={t('settings.about')}>
          <AppListItem
            icon={Info}
            iconTone="info"
            layout="inline"
            label={t('settings.version')}
            value={Constants.expoConfig?.version ?? '—'}
          />
          <AppListItem
            icon={Server}
            iconTone="muted"
            layout="inline"
            label={t('settings.environment')}
            value={`${t(`settings.envName.${env.appEnv}`)} · ${new URL(env.apiUrl).host}`}
          />
        </AppListGroup>
      </Appear>

      <AppButton
        title={t('auth.signOut')}
        variant="outline"
        leftIcon={LogOut}
        onPress={() => setConfirmingSignOut(true)}
        className="border-destructive/30"
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
