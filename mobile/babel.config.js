module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind compiles `className` through babel-preset-expo's JSX import source.
    // Reanimated/worklets plugin is added automatically by babel-preset-expo.
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
