export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  testMatch: ['<rootDir>/tests/**/*.test.js', '<rootDir>/src/**/__tests__/**/*.test.js'],
  // swissqrbill is ESM-only and unresolvable by Jest's resolver; map it to a manual mock.
  moduleNameMapper: {
    '^swissqrbill$': '<rootDir>/tests/mocks/swissqrbill.js',
  },
  setupFiles: ['<rootDir>/tests/envSetup.js'],
  testTimeout: 60000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};
