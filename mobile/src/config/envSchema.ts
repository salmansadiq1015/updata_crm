// Pure environment schema, shared by `app.config.ts` (build time, Node) and
// `env.ts` (runtime, bundle). Keep it free of React Native imports.
//
// Names mirror the web client (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_ENV`)
// with Expo's mandatory `EXPO_PUBLIC_` prefix. Everything here is bundled into
// the APK and can be extracted — never add a secret to this schema.
import { z } from 'zod';

export const APP_ENVS = ['development', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * - play:    Google Play build. No SMS permissions at all (Play restricts SEND_SMS /
 *            RECEIVE_SMS to default SMS apps); SMS goes through the system composer.
 * - private: directly installed APK for company phones. Adds SEND_SMS + RECEIVE_SMS,
 *            the SMS receivers and the agent foreground service, enabling the
 *            automatic AI SMS agent over the phone's own SIM.
 */
export const DISTRIBUTIONS = ['play', 'private'] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0']);

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const rawEnvSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(APP_ENVS, {
    error: `EXPO_PUBLIC_APP_ENV must be one of: ${APP_ENVS.join(', ')}`,
  }),
  EXPO_PUBLIC_API_URL: z
    .string({ error: 'EXPO_PUBLIC_API_URL is required (e.g. https://crm.example.com/api/v1)' })
    .trim()
    .min(1, 'EXPO_PUBLIC_API_URL is required (e.g. https://crm.example.com/api/v1)')
    .pipe(z.url({ protocol: /^https?$/, error: 'EXPO_PUBLIC_API_URL must be an http(s) URL' })),
  EXPO_PUBLIC_ENABLE_DEBUG_LOGS: booleanFlag,
  // Omitted → 'play': a build never gains SMS permissions by accident.
  EXPO_PUBLIC_DISTRIBUTION: z
    .enum(DISTRIBUTIONS, { error: `EXPO_PUBLIC_DISTRIBUTION must be one of: ${DISTRIBUTIONS.join(', ')}` })
    .optional()
    .transform((value) => value ?? 'play'),
});

export type RawEnv = Record<
  Exclude<keyof z.input<typeof rawEnvSchema>, 'EXPO_PUBLIC_DISTRIBUTION'>,
  string | undefined
> & {
  EXPO_PUBLIC_DISTRIBUTION?: string | undefined;
};

export type Env = {
  appEnv: AppEnv;
  /** Normalised API base, e.g. `https://crm.example.com/api/v1` (no trailing slash). */
  apiUrl: string;
  /** Verbose, redacted request logging. Always false in production. */
  debugLogs: boolean;
  /** Which store/channel this binary is built for (see DISTRIBUTIONS). */
  distribution: Distribution;
};

export class EnvConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid app configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvConfigError';
    this.issues = issues;
  }
}

/** Strip trailing slashes so endpoint paths can always start with `/`. */
export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export type ParseEnvOptions = {
  /**
   * The JS bundle is a release build (`__DEV__ === false`). Expo also loads
   * `.env.local` for release bundles, so a developer's local file could
   * otherwise ship a development endpoint: release bundles must declare
   * staging or production (which in turn require https and a public host).
   */
  releaseBuild?: boolean;
};

export function parseEnv(raw: RawEnv, { releaseBuild = false }: ParseEnvOptions = {}): Env {
  const parsed = rawEnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvConfigError(parsed.error.issues.map((issue) => issue.message));
  }

  const { EXPO_PUBLIC_APP_ENV: appEnv, EXPO_PUBLIC_ENABLE_DEBUG_LOGS: debugFlag } = parsed.data;
  const apiUrl = normalizeApiUrl(parsed.data.EXPO_PUBLIC_API_URL);
  const { protocol, hostname } = new URL(apiUrl);

  if (releaseBuild && appEnv === 'development') {
    throw new EnvConfigError([
      'Release builds must set EXPO_PUBLIC_APP_ENV to staging or production (is .env.local leaking into this build?)',
    ]);
  }

  if (appEnv !== 'development') {
    const issues: string[] = [];
    if (protocol !== 'https:') issues.push(`${appEnv} builds require an https:// EXPO_PUBLIC_API_URL`);
    if (LOOPBACK_HOSTS.has(hostname)) {
      issues.push(`${appEnv} builds cannot point EXPO_PUBLIC_API_URL at a local development host`);
    }
    if (issues.length > 0) throw new EnvConfigError(issues);
  }

  return {
    appEnv,
    apiUrl,
    debugLogs: appEnv !== 'production' && debugFlag,
    distribution: parsed.data.EXPO_PUBLIC_DISTRIBUTION,
  };
}
