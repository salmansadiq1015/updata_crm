import type { ConfigContext, ExpoConfig } from 'expo/config';
import {
  AndroidConfig,
  withAndroidManifest,
  withGradleProperties,
  type ConfigPlugin,
} from 'expo/config-plugins';

import { parseEnv } from './src/config/envSchema.ts';

// Release builds compile every Kotlin module; the template's 512 MB Metaspace runs out
// ("Metaspace" in compileReleaseKotlin). android/ is generated, so set it here.
const GRADLE_JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError';
const withGradleMemory: ConfigPlugin = (config) =>
  withGradleProperties(config, (gradle) => {
    for (const [key, value] of [
      ['org.gradle.jvmargs', GRADLE_JVM_ARGS],
      ['kotlin.daemon.jvmargs', '-Xmx3072m -XX:MaxMetaspaceSize=1024m'],
      ['android.enableMinifyInReleaseBuilds', 'true'],
      ['android.enableShrinkResourcesInReleaseBuilds', 'true'],
    ] as const) {
      gradle.modResults = gradle.modResults.filter((item) => !(item.type === 'property' && item.key === key));
      gradle.modResults.push({ type: 'property', key, value });
    }
    return gradle;
  });

// Fail the build (and `expo start`) early on missing or unsafe configuration:
// a production APK can never ship pointing at a development API.
const env = parseEnv({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_ENABLE_DEBUG_LOGS: process.env.EXPO_PUBLIC_ENABLE_DEBUG_LOGS,
  EXPO_PUBLIC_DISTRIBUTION: process.env.EXPO_PUBLIC_DISTRIBUTION,
});

const PRIVATE_BUILD = env.distribution === 'private';
const SMS_PERMISSIONS = ['android.permission.SEND_SMS', 'android.permission.RECEIVE_SMS'] as const;
// Keeps the process alive while the AI SMS agent runs in the background.
const AGENT_SERVICE_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.POST_NOTIFICATIONS',
  // HeadlessJsTaskService holds a partial wake lock while the agent loop runs.
  'android.permission.WAKE_LOCK',
  // Agent phones (e.g. TECNO/HiOS) kill background apps aggressively; the user is asked
  // once to exempt the app so a running campaign is not frozen.
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
] as const;
const PKG = 'expo.modules.updatatelephony';

/**
 * Reconcile SMS components on every prebuild, including private -> play switches
 * without --clean. A shared APK must not retain a private build's SMS receiver.
 *  - SmsResultReceiver   : SENT / DELIVERED PendingIntents (explicit, not exported)
 *  - SmsInboundReceiver  : SMS_RECEIVED, only from the system (BROADCAST_SMS); it keeps
 *                          nothing except replies from numbers in an active conversation
 *  - SmsAgentService     : dataSync foreground service while the agent is running
 */
const withSmsComponents: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    if (!PRIVATE_BUILD) {
      app.receiver = (app.receiver ?? []).filter(
        (item) => ![`${PKG}.SmsResultReceiver`, `${PKG}.SmsInboundReceiver`].includes(item.$['android:name']),
      );
      app.service = (app.service ?? []).filter((item) => item.$['android:name'] !== `${PKG}.SmsAgentService`);
      return mod;
    }
    const named = (list: { $: { 'android:name': string } }[] | undefined, name: string) =>
      (list ?? []).some((item) => item.$['android:name'] === name);
    app.receiver = app.receiver ?? [];
    app.service = app.service ?? [];
    if (!named(app.receiver, `${PKG}.SmsResultReceiver`)) {
      app.receiver.push({ $: { 'android:name': `${PKG}.SmsResultReceiver`, 'android:exported': 'false' } });
    }
    if (!named(app.receiver, `${PKG}.SmsInboundReceiver`)) {
      app.receiver.push({
        $: {
          'android:name': `${PKG}.SmsInboundReceiver`,
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }] }],
      } as never);
    }
    if (!named(app.service, `${PKG}.SmsAgentService`)) {
      app.service.push({
        $: {
          'android:name': `${PKG}.SmsAgentService`,
          'android:exported': 'false',
          'android:foregroundServiceType': 'dataSync',
        },
      } as never);
    }
    return mod;
  });

// Navy behind the mark in the Updata logo artwork (assets/icon.png). The splash
// shows the bare mark on it, matching the logo in both light and dark mode.
const BRAND_NAVY = '#010F45';

const VARIANT = {
  development: { name: 'Updata (Dev)', idSuffix: '.dev' },
  staging: { name: 'Updata (Staging)', idSuffix: '.staging' },
  production: { name: 'Updata', idSuffix: '' },
} as const;

export default ({ config }: ConfigContext): ExpoConfig =>
  withSmsComponents(
    withGradleMemory({
      ...config,
      name: VARIANT[env.appEnv].name,
      slug: 'updata-mobile',
      scheme: 'updata',
      version: '0.1.4',
      orientation: 'portrait',
      icon: './assets/icon.png',
      // Follows the device; the user can override it in Settings (light / dark / system).
      userInterfaceStyle: 'automatic',
      backgroundColor: '#F7F8FC',
      android: {
        // Each environment installs side by side, so a dev build never overwrites production.
        package: `ai.updata.crm${VARIANT[env.appEnv].idSuffix}`,
        versionCode: 5,
        adaptiveIcon: {
          foregroundImage: './assets/android-icon-foreground.png',
          backgroundColor: BRAND_NAVY,
        },
        // Session material lives in the Android Keystore; never let Auto Backup copy app data off-device.
        allowBackup: false,
        predictiveBackGestureEnabled: false,
        // Calling (local module modules/updata-telephony):
        // - CALL_PHONE: TelecomManager.placeCall on the SIM the user picked (without it the app
        //   only opens the dialer with the number pre-filled).
        // - READ_PHONE_STATE: list active SIMs and observe idle/ringing/offhook for a call the
        //   user started from the app.
        // Both are ordinary runtime ("dangerous") permissions requested at the moment of use; neither
        // is in Google Play's restricted SMS / Call Log groups, so no core-use declaration is needed.
        // SMS (EXPO_PUBLIC_DISTRIBUTION):
        // - play    : for Play AND shared APKs; no SMS permissions;
        //             the app opens the system composer instead.
        // - private : NOT for WhatsApp/browser sharing (Play Protect blocks RECEIVE_SMS).
        //             SEND_SMS + RECEIVE_SMS for the automatic AI SMS agent over the phone's
        //             own SIM, plus a dataSync foreground service + notification while it runs.
        //             READ_SMS is never requested: replies arrive via the SMS_RECEIVED broadcast
        //             and only those from active conversation numbers are kept.
        // Always absent: READ_SMS, READ_CALL_LOG / PROCESS_OUTGOING_CALLS (the app never reads the
        // inbox or call log), ANSWER_PHONE_CALLS, MANAGE_OWN_CALLS, READ_PHONE_NUMBERS, contacts and
        // call audio (Android gives a normal app none; calls are human-led). The microphone is used only
        // for opt-in post-call voice notes, transcribed by the CRM and never stored.
        // Telephony hardware is optional (uses-feature required=false) so Wi-Fi tablets can install.
        permissions: [
          'android.permission.CALL_PHONE',
          'android.permission.READ_PHONE_STATE',
          // Voice notes: recorded only when the user taps Record after a call, never during one.
          'android.permission.RECORD_AUDIO',
          ...(PRIVATE_BUILD ? [...SMS_PERMISSIONS, ...AGENT_SERVICE_PERMISSIONS] : []),
        ],
        blockedPermissions: [
          'android.permission.READ_EXTERNAL_STORAGE',
          'android.permission.WRITE_EXTERNAL_STORAGE',
          'android.permission.SYSTEM_ALERT_WINDOW',
          'android.permission.READ_SMS',
          'android.permission.READ_CALL_LOG',
          'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          ...(PRIVATE_BUILD
            ? []
            : [
                ...SMS_PERMISSIONS,
                'android.permission.RECEIVE_MMS',
                'android.permission.RECEIVE_WAP_PUSH',
                'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
                'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
              ]),
        ],
      },
      plugins: [
        ['expo-audio', { microphonePermission: 'Record a voice note to fill in your call notes.' }],
        '@react-native-community/datetimepicker',
        [
          'expo-splash-screen',
          {
            image: './assets/splash-icon.png',
            imageWidth: 120,
            backgroundColor: BRAND_NAVY,
            dark: { image: './assets/splash-icon.png', backgroundColor: BRAND_NAVY },
          },
        ],
        [
          'expo-font',
          {
            fonts: [
              './assets/fonts/Geist-Regular.ttf',
              './assets/fonts/Geist-Medium.ttf',
              './assets/fonts/Geist-SemiBold.ttf',
              './assets/fonts/Geist-Bold.ttf',
            ],
          },
        ],
        ['expo-secure-store', { configureAndroidBackup: true }],
        ['expo-localization', { supportsRTL: true }],
        'expo-system-ui',
      ],
      extra: {
        appEnv: env.appEnv,
        distribution: env.distribution,
      },
    }),
  );
