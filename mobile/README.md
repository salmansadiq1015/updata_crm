# Updata Mobile (Android)

React Native app for the Updata CRM. It talks to the same `/api/v1` backend as the web client
(`../client`) and uses the same design tokens, translations (de/en/fr/ar, RTL for Arabic) and
error envelope.

The implementation/UX inventory, verified API boundaries, Android risks, and remaining staging work are
tracked in [`../docs/MOBILE_UI_AUDIT.md`](../docs/MOBILE_UI_AUDIT.md). Exact test/build evidence and the
release decision are in [`../docs/MOBILE_IMPLEMENTATION_REPORT.md`](../docs/MOBILE_IMPLEMENTATION_REPORT.md).

## Requirements

| Tool        | Version                                                   |
| ----------- | --------------------------------------------------------- |
| Node        | 22 (see `.nvmrc`; `^20.19.4 \|\| ^22.13.0 \|\| ^24.3.0`)  |
| npm         | 10+ (`package-lock.json` is the lockfile)                 |
| JDK         | 17                                                        |
| Android SDK | platform 36, build-tools 36, NDK 27 (installed by Gradle) |
| Device      | Android 7.0+ (API 24) emulator or phone                   |

## First run

```bash
cd mobile
npm ci
cp .env.example .env.local          # then edit EXPO_PUBLIC_API_URL
npm run android                      # prebuild + Gradle debug build + install + Metro
```

`npm run android` builds a **development client** (not Expo Go: the app uses native modules
Expo Go does not ship). After the first install, `npm start` is enough for JS-only changes.
Mobile development uses Metro on port `8082`; port `8081` is reserved by the LiveKit agent
worker's health server. When using a USB-connected Android device, run
`adb reverse tcp:8082 tcp:8082` if Expo does not create the reverse automatically.

The backend must be running (`cd ../server && npm run dev`, port 9097). From the Android
emulator the host machine is `10.0.2.2`; from a physical phone use your machine's LAN IP.

## Environments

All configuration is in `src/config/envSchema.ts`, validated at build time (`app.config.ts`)
and again at runtime. Missing or unsafe values stop the build, or show a configuration-error
screen instead of starting the app.

| Variable                        | Meaning                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `EXPO_PUBLIC_APP_ENV`           | `development` \| `staging` \| `production`                                   |
| `EXPO_PUBLIC_API_URL`           | API base including `/api/v1` — same value as the web's `NEXT_PUBLIC_API_URL` |
| `EXPO_PUBLIC_ENABLE_DEBUG_LOGS` | Redacted request logging in Metro. Always off in production.                 |

Rules enforced by the schema:

- `staging` and `production` require `https://` and a non-local host.
- A **release** JS bundle must declare `staging` or `production`. Expo also loads `.env.local`
  for release builds, so this stops a developer's local file from shipping a dev endpoint.
- Each environment has its own application id (`ai.updata.crm.dev`, `.staging`, none), so
  builds install side by side.

> **Development builds:** Expo SDK 57 merges the `.env*` files **over** shell variables at
> runtime in dev, so set `EXPO_PUBLIC_API_URL` in `.env.local` (restart Metro after changing it).
> `10.0.2.2` only exists inside the Android emulator — a physical phone needs the live
> server (`https://updata.behjja.com/api/v1`) or `http://localhost:9097/api/v1` with
> `adb reverse tcp:9097 tcp:9097`. Non-production builds show the API host under the sign-in form.
>
> Do not start Metro with `CI=1`: in CI mode Expo disables file watching, so edits never reach
> the device and the app keeps running a stale bundle.

Switching environment for release builds — shell variables override `.env*` files:

```bash
# Local release build against staging
EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_API_URL=https://<staging-host>/api/v1 \
  npx expo run:android --variant release

# Cloud builds: set EXPO_PUBLIC_API_URL per EAS environment, then
npx eas-cli@latest build --profile staging --platform android
```

`eas.json` defines `development`, `staging` and `production` profiles; the API URL for
staging/production lives in the EAS environment variables, not in the repository.

> Everything prefixed `EXPO_PUBLIC_` is compiled into the APK and can be extracted. Never put
> API keys, JWT secrets or provider credentials in the app; they stay on the server.

## Scripts

| Command                   | What it does                                                |
| ------------------------- | ----------------------------------------------------------- |
| `npm run android`         | Debug build, install on emulator/device, Metro on port 8082 |
| `npm start`               | Metro on port 8082 for an installed dev client              |
| `npm run android:release` | Local release build (signed with the debug key — see below) |
| `npm run prebuild`        | Regenerate `android/` from `app.config.ts`                  |
| `npm run check`           | typecheck + lint + format check + tests (CI gate)           |
| `npm test`                | Jest unit, component and navigation tests                   |
| `npm run doctor`          | `expo-doctor` dependency and config checks                  |

`android/` is generated (Continuous Native Generation) and git-ignored. Change native
configuration in `app.config.ts` or a config plugin, never by editing `android/`.

## Architecture

```
src/
  app/            App root, boot sequence, providers, query client, error boundary
  navigation/     Root stack (auth flow), bottom tabs, deep links, typed params
  config/         Validated environment
  theme/          Colour tokens (from client/src/app/globals.css), shadows, ThemeProvider
  components/     ui/ (AppButton, AppInput, AppModal, …), layout/, feedback/, forms/
  features/<name> api/ hooks/ screens/ components/ store/ types.ts — one folder per domain
  services/       api client, auth tokens/refresh, storage, logging, permissions, connectivity
  hooks/ utils/ constants/ i18n/ locales/ store/ test/
```

Where state lives:

| Kind of state                       | Where                                     |
| ----------------------------------- | ----------------------------------------- |
| Server data (leads, notifications…) | TanStack Query (`constants/queryKeys.ts`) |
| Session status + signed-in user     | `features/auth/store/sessionStore.ts`     |
| Refresh token                       | `expo-secure-store` (Android Keystore)    |
| Access token                        | Memory only (15-minute lifetime)          |
| Theme / language                    | Zustand + AsyncStorage (non-sensitive)    |
| Screen UI state (filters)           | Small feature Zustand stores              |

Request flow: screen → feature hook (`useLeadList`) → feature api (`leadsApi.list`) →
`services/api/apiClient` (Bearer token, `X-Request-Id`, timeout, envelope + zod validation,
one shared refresh on 401, typed `ApiError`) → UI via `errorMessageKey()` (never raw server text).
Reads retry transient failures twice; writes never auto-retry, and `useSingleFlight` blocks
double taps before the re-render disables a button.

### Adding a feature

1. `src/features/<name>/types.ts` — zod schema for the server shape (tolerant parsing).
2. `api/<name>Api.ts` — calls `api.get/post/patch` with that schema. Add paths to
   `services/api/endpoints.ts` only after finding them in `server/src/modules/**/*.routes.js`.
3. `hooks/` — `useQuery`/`useMutation` with keys from `constants/queryKeys.ts`.
4. `screens/` — compose `Screen`, `AppCard`, `AppListItem`, `AppErrorState`… from `components/`.
5. Register the screen in `navigation/navigationTypes.ts` and a navigator.
6. Add strings to `locales/en.ts`; the typecheck then fails until `de`, `fr`, `ar` have them.

### Permissions and native code

Requested: `INTERNET`, plus `CALL_PHONE` and `READ_PHONE_STATE` for SIM calling (place the call
on the SIM the user picks; list SIMs; observe idle/ringing/off-hook). Both are ordinary runtime
permissions, asked only from the call screen, and the app still works without them (the number
opens in the phone app). **Not requested, on purpose:** `SEND_SMS`/`READ_SMS`/`RECEIVE_SMS`,
`READ_CALL_LOG`, `RECORD_AUDIO`, `ANSWER_PHONE_CALLS`, foreground services — Google Play restricts
the SMS/Call-Log groups and no shipped feature needs them. SMS goes through the system composer.
Details, capability matrix and test evidence: [`../LEAD-MOBILE-CALLING.md`](../LEAD-MOBILE-CALLING.md).

Native telephony lives in the local Expo module `modules/updata-telephony` (Kotlin, survives
`prebuild --clean`); app code reaches it only through `src/services/telephony/telephonyService.ts`.
To add another permission:

1. add it to `android.permissions` in `app.config.ts` and remove it from `blockedPermissions`;
2. request it at the moment of use with `usePermission()` / `ensurePermission()`
   (`services/permissions`), which reports `granted | denied | blocked | unavailable` and
   offers `openAppSettings()` for `blocked`;
3. justify it for Google Play (SMS and call-log permissions require a declared core use).

## Release signing

`expo run:android --variant release` signs with the debug keystore — fine for testing, not
for distribution. Use EAS Build (managed credentials) or add a release keystore through a
config plugin. Keystores are git-ignored (`*.jks`, `*.keystore`).

## Dependencies

All native packages were installed with `npx expo install`, which pins the versions tested
with Expo SDK 57 / React Native 0.86 (`npx expo-doctor` passes). Notes:

| Package                                                      | Why / compatibility note                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `expo` 57, `react-native` 0.86, `react` 19.2                 | New Architecture + Hermes (default)                                        |
| `nativewind` 4.2 + `tailwindcss` 3.4                         | NativeWind 4 requires Tailwind 3; do not upgrade to Tailwind 4             |
| `react-native-reanimated` 4.5 + `react-native-worklets` 0.10 | Reanimated 4 needs worklets; Babel plugin comes from `babel-preset-expo`   |
| `@react-navigation/*` 7 + `react-native-screens`             | Native stack and bottom tabs                                               |
| `@tanstack/react-query` 5, `zustand` 5                       | Server state / local state                                                 |
| `axios` 1.20                                                 | Single HTTP client in `services/api` (lint forbids importing it elsewhere) |
| `react-hook-form` 7 + `@hookform/resolvers` 5 + `zod` 4      | Forms and API response validation                                          |
| `expo-secure-store`                                          | Refresh token in Android Keystore; Auto Backup disabled                    |
| `sonner-native`                                              | Toasts (native counterpart of the web's sonner)                            |
| `react-native-keyboard-controller`                           | Keyboard-aware forms                                                       |
| `lucide-react-native`                                        | Same icon set as the web; Jest maps it to its CJS build                    |
| `i18next` + `react-i18next` + `expo-localization`            | Same locales as the web                                                    |

`npm audit` reports advisories in build-time tooling (Tailwind's `braces`/`postcss`, the
Expo and React Native CLIs). Its suggested fixes are breaking downgrades outside SDK 57;
revisit on the next SDK upgrade.
