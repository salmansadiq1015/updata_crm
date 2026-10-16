import { EnvConfigError, parseEnv, type RawEnv } from '../envSchema';

const base: RawEnv = {
  EXPO_PUBLIC_APP_ENV: 'development',
  EXPO_PUBLIC_API_URL: 'http://10.0.2.2:9097/api/v1',
  EXPO_PUBLIC_ENABLE_DEBUG_LOGS: 'true',
};

function issuesOf(raw: RawEnv): string[] {
  try {
    parseEnv(raw);
  } catch (error) {
    if (error instanceof EnvConfigError) return error.issues;
    throw error;
  }
  throw new Error('expected parseEnv to fail');
}

describe('parseEnv', () => {
  it('accepts a valid development configuration', () => {
    expect(parseEnv(base)).toEqual({
      appEnv: 'development',
      apiUrl: 'http://10.0.2.2:9097/api/v1',
      debugLogs: true,
    });
  });

  it('fails clearly when required values are missing', () => {
    const issues = issuesOf({ ...base, EXPO_PUBLIC_APP_ENV: undefined, EXPO_PUBLIC_API_URL: undefined });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('EXPO_PUBLIC_APP_ENV'),
        expect.stringContaining('EXPO_PUBLIC_API_URL is required'),
      ]),
    );
  });

  it('rejects an unknown environment name and a non-http URL', () => {
    expect(issuesOf({ ...base, EXPO_PUBLIC_APP_ENV: 'prod' })[0]).toContain('must be one of');
    expect(issuesOf({ ...base, EXPO_PUBLIC_API_URL: 'ftp://example.com' })[0]).toContain('http(s)');
  });

  it('normalises trailing slashes on the API base', () => {
    expect(parseEnv({ ...base, EXPO_PUBLIC_API_URL: 'https://crm.example.com/api/v1///' }).apiUrl).toBe(
      'https://crm.example.com/api/v1',
    );
  });

  it.each(['staging', 'production'])('%s builds refuse plain http and local hosts', (appEnv) => {
    const issues = issuesOf({ ...base, EXPO_PUBLIC_APP_ENV: appEnv });
    expect(issues).toEqual([
      `${appEnv} builds require an https:// EXPO_PUBLIC_API_URL`,
      `${appEnv} builds cannot point EXPO_PUBLIC_API_URL at a local development host`,
    ]);
    expect(() =>
      parseEnv({ ...base, EXPO_PUBLIC_APP_ENV: appEnv, EXPO_PUBLIC_API_URL: 'https://localhost/api/v1' }),
    ).toThrow(EnvConfigError);
  });

  it('keeps production and development distinct: debug logs are forced off in production', () => {
    const production = parseEnv({
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_API_URL: 'https://crm.example.com/api/v1',
      EXPO_PUBLIC_ENABLE_DEBUG_LOGS: 'true',
    });
    expect(production).toEqual({
      appEnv: 'production',
      apiUrl: 'https://crm.example.com/api/v1',
      debugLogs: false,
    });
    expect(
      parseEnv({
        ...base,
        EXPO_PUBLIC_APP_ENV: 'staging',
        EXPO_PUBLIC_API_URL: 'https://staging.example.com/api/v1',
      }).debugLogs,
    ).toBe(true);
  });

  it('refuses a development configuration inside a release bundle', () => {
    expect(() => parseEnv(base, { releaseBuild: true })).toThrow(
      /Release builds must set EXPO_PUBLIC_APP_ENV/,
    );
    expect(
      parseEnv(
        { ...base, EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_API_URL: 'https://crm.example.com/api/v1' },
        { releaseBuild: true },
      ).appEnv,
    ).toBe('production');
  });

  it('treats an absent debug flag as off', () => {
    expect(parseEnv({ ...base, EXPO_PUBLIC_ENABLE_DEBUG_LOGS: undefined }).debugLogs).toBe(false);
  });
});
