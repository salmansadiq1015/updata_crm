const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// inlineRem: 16 keeps Tailwind spacing identical to the web CRM (1rem = 16px; NativeWind defaults to 14).
module.exports = withNativeWind(config, { input: './src/theme/global.css', inlineRem: 16 });
