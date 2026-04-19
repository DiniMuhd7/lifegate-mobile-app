const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// SVG support
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  // Stub out react-native-web-webview on web (used by react-native-youtube-iframe).
  // YoutubePlayer is never rendered on web — we show a gradient fallback instead.
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    'react-native-web-webview': path.resolve(__dirname, 'react-native-web-webview-stub.js'),
  },
};


module.exports = withNativeWind(config, { input: './global.css' });
