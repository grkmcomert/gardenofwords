module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    // SDK 54 keeps this preset under Expo's own dependency tree in this
    // checkout, so resolve the SDK-provided wrapper instead of relying on a
    // separately hoisted package.
    presets: [require.resolve('expo/internal/babel-preset')],
    plugins: [require.resolve('./scripts/inline-html-import')],
  };
};
