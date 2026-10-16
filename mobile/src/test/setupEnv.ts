// Runs before any module is imported: `src/config/env` validates on import.
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api/v1';
process.env.EXPO_PUBLIC_ENABLE_DEBUG_LOGS = 'false';
