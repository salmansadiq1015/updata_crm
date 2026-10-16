// Runtime configuration. Expo inlines `process.env.EXPO_PUBLIC_*` only for
// direct, static property reads — do not destructure or index process.env here.
import { EnvConfigError, parseEnv, type Env } from './envSchema';

type EnvResult = { ok: true; env: Env } | { ok: false; error: EnvConfigError };

function load(): EnvResult {
  try {
    return {
      ok: true,
      env: parseEnv(
        {
          EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
          EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
          EXPO_PUBLIC_ENABLE_DEBUG_LOGS: process.env.EXPO_PUBLIC_ENABLE_DEBUG_LOGS,
        },
        { releaseBuild: !__DEV__ },
      ),
    };
  } catch (error) {
    if (error instanceof EnvConfigError) return { ok: false, error };
    throw error;
  }
}

/** Checked once by `App` so a misconfigured build shows a clear screen instead of crashing. */
export const envResult = load();

/**
 * The validated environment. Only read it below `App`, which refuses to render
 * the app tree when configuration is invalid.
 */
export function getEnv(): Env {
  if (!envResult.ok) throw envResult.error;
  return envResult.env;
}

export type { AppEnv, Env } from './envSchema';
