// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'coverage/*', '.expo/*', 'modules/*/android/build/*'],
  },
  {
    rules: { 'no-console': 'warn', 'react-hooks/exhaustive-deps': 'error' },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // jest.mock factories are hoisted above imports and must load modules with require().
    files: ['src/test/**', '**/__tests__/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Screens and components reach the network only through feature `api/` modules.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/services/**', 'src/test/**', 'src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'axios', message: 'Use the shared api client (src/services/api).' }] },
      ],
    },
  },
]);
