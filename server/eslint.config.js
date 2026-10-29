import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        structuredClone: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        File: 'readonly',
        fetch: 'readonly',
        // Standard on Node 18 and later, and used to post audio to the
        // transcription gateway. Missing here, they read as three undefined
        // globals and made `npm run lint` fail on correct code.
        FormData: 'readonly',
        Blob: 'readonly',
        AbortSignal: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**'],
  },
];
