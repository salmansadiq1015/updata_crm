export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  testMatch: ['<rootDir>/tests/**/*.test.js', '<rootDir>/src/**/__tests__/**/*.test.js'],
  // swissqrbill is ESM-only and unresolvable by Jest's resolver; map it to a
  // manual mock. v4 moved the PDF renderer to the /pdf subpath, which the bare
  // specifier does not cover — the renderer then loaded the real library and
  // its attachTo asked the test's stub document for addPage.
  moduleNameMapper: {
    '^swissqrbill$': '<rootDir>/tests/mocks/swissqrbill.js',
    '^swissqrbill/pdf$': '<rootDir>/tests/mocks/swissqrbill.js',
  },
  setupFiles: ['<rootDir>/tests/envSetup.js'],
  testTimeout: 60000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};
