/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  setupFiles: ['./src/test/setupEnv.ts'],
  setupFilesAfterEnv: ['./src/test/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // The react-native export condition resolves to .mjs, which Jest does not transform.
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  // ESM-only packages that ship untranspiled sources.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|nativewind|react-native-css-interop|sonner-native|zustand))',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/locales/**', '!src/test/**'],
};
