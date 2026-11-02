const path = require("node:path");

module.exports = {
  preset: "jest-expo",
  // Expo owns this dependency; npm may keep it nested rather than hoisting it.
  moduleNameMapper: {
    "^expo-modules-core$": require.resolve("expo-modules-core", {
      paths: [require.resolve("expo/package.json")],
    }),
    "^expo-modules-core/(.*)$": path.join(path.dirname(require.resolve("expo-modules-core/package.json", {
      paths: [require.resolve("expo/package.json")],
    })), "$1"),
  },
};
