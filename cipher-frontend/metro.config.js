const path = require("path");
const { resolve } = require("metro-resolver");
const { getDefaultConfig } = require("expo/metro-config");

const baseConfig = getDefaultConfig(__dirname);
const eventTargetShimEs5 = require.resolve("event-target-shim/es5");

let withNativewind = null;
try {
  ({ withNativewind } = require("nativewind/metro"));
} catch {
  withNativewind = null;
}

const config = withNativewind
  ? withNativewind(baseConfig, { input: "./global.css" })
  : baseConfig;

config.resolver = config.resolver ?? {};
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "node_modules/react-native/node_modules"),
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: path.resolve(__dirname, "node_modules/react"),
  "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime"),
  "react-native": path.resolve(__dirname, "node_modules/react-native"),
  "@react-native/virtualized-lists": path.resolve(
    __dirname,
    "node_modules/react-native/node_modules/@react-native/virtualized-lists"
  ),
  "react-native-keyboard-controller": path.resolve(
    __dirname,
    "shims/react-native-keyboard-controller"
  ),
  devlop: path.resolve(__dirname, "node_modules/devlop"),
};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react") {
    return resolve(context, path.resolve(__dirname, "node_modules/react"), platform);
  }

  if (
    moduleName === "event-target-shim" ||
    moduleName === "event-target-shim/index" ||
    moduleName === "event-target-shim/index.js" ||
    moduleName === "event-target-shim/index.mjs"
  ) {
    return {
      type: "sourceFile",
      filePath: eventTargetShimEs5,
    };
  }

  if (moduleName === "react/jsx-runtime") {
    return resolve(context, path.resolve(__dirname, "node_modules/react/jsx-runtime"), platform);
  }

  if (moduleName === "react-native") {
    return resolve(context, path.resolve(__dirname, "node_modules/react-native"), platform);
  }

  if (moduleName === "react-native-keyboard-controller") {
    return resolve(
      context,
      path.resolve(__dirname, "shims/react-native-keyboard-controller/index.js"),
      platform
    );
  }

  if ((moduleName === "stream-chat-react" || moduleName.startsWith("stream-chat-react/")) && platform !== "web") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "shims/stream-chat-react/index.js"),
    };
  }

  if (moduleName === "devlop") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "node_modules/devlop/lib/default.js"),
    };
  }

  if (moduleName === "unist-util-visit-parents/do-not-use-color") {
    return {
      type: "sourceFile",
      filePath: require.resolve("unist-util-visit-parents/do-not-use-color"),
    };
  }

  if (moduleName === "#minpath") {
    const target =
      platform === "web"
        ? path.resolve(__dirname, "node_modules/vfile/lib/minpath.browser.js")
        : path.resolve(__dirname, "node_modules/vfile/lib/minpath.js");
    return { type: "sourceFile", filePath: target };
  }

  if (moduleName === "#minproc") {
    const target =
      platform === "web"
        ? path.resolve(__dirname, "node_modules/vfile/lib/minproc.browser.js")
        : path.resolve(__dirname, "node_modules/vfile/lib/minproc.js");
    return { type: "sourceFile", filePath: target };
  }

  if (moduleName === "#minurl") {
    const target =
      platform === "web"
        ? path.resolve(__dirname, "node_modules/vfile/lib/minurl.browser.js")
        : path.resolve(__dirname, "node_modules/vfile/lib/minurl.js");
    return { type: "sourceFile", filePath: target };
  }

  if (typeof originalResolveRequest === "function") {
    return originalResolveRequest(context, moduleName, platform);
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
