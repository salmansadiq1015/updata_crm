import type { ConfigContext, ExpoConfig } from 'expo/config';

import { parseEnv } from './src/config/envSchema.ts';

// Fail the build (and `expo start`) early on missing or unsafe configuration:
// a production APK can never ship pointing at a development API.
const env = parseEnv({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_ENABLE_DEBUG_LOGS: process.env.EXPO_PUBLIC_ENABLE_DEBUG_LOGS,
});

// Navy behind the mark in the Updata logo artwork (assets/icon.png). The splash
// shows the bare mark on it, matching the logo in both light and dark mode.
const BRAND_NAVY = '#010F45';

const VARIANT = {
  development: { name: 'Updata (Dev)', idSuffix: '.dev' },
  staging: { name: 'Updata (Staging)', idSuffix: '.staging' },
  production: { name: 'Updata', idSuffix: '' },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: VARIANT[env.appEnv].name,
  slug: 'updata-mobile',
  scheme: 'updata',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Follows the device; the user can override it in Settings (light / dark / system).
  userInterfaceStyle: 'automatic',
  backgroundColor: '#F7F8FC',
  android: {
    // Each environment installs side by side, so a dev build never overwrites production.
    package: `ai.updata.crm${VARIANT[env.appEnv].idSuffix}`,
    versionCode: 1,
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
    // Deliberately absent: SEND_SMS / READ_SMS / RECEIVE_SMS and READ_CALL_LOG /
    // PROCESS_OUTGOING_CALLS (restricted groups; the app opens the system SMS composer instead
    // and never reads the call log), ANSWER_PHONE_CALLS, MANAGE_OWN_CALLS, READ_PHONE_NUMBERS,
    // foreground services, contacts and microphone. Telephony hardware is optional
    // (uses-feature required=false in the module manifest) so Wi-Fi tablets can install.
    permissions: ['android.permission.CALL_PHONE', 'android.permission.READ_PHONE_STATE'],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
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
  },
});
