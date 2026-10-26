process.env.NODE_ENV = 'development';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test-placeholder';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long';
process.env.SESSION_SECRET = 'test-session-secret-16ch';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.MONGOMS_VERSION = '6.0.16';
// Hermetic: never pick up a developer's real LiveKit project from server/.env
// (dotenv does not override keys that are already set). Voice tests mock the provider.
process.env.LIVEKIT_URL = '';
process.env.LIVEKIT_API_KEY = '';
process.env.LIVEKIT_API_SECRET = '';
