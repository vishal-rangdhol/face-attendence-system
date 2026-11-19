const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Enable bundling of TensorFlow Lite model binaries
config.resolver.assetExts.push("tflite");

module.exports = config;
