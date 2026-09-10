// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Remove the SVG transformer from the config
// We'll handle SVG differently
defaultConfig.resolver = {
  ...defaultConfig.resolver,
  sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
};

module.exports = defaultConfig;