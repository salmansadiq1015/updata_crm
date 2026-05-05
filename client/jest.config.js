module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.jsx?$': ['babel-jest', { presets: ['@babel/preset-env', '@babel/preset-react'] }],
  },
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
};
