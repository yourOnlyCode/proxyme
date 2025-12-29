const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add CSS support for NativeWind
config.resolver.sourceExts.push('css');

module.exports = config;

