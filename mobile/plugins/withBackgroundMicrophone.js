const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

// react-native-background-actions contributes this service, but its manifest
// declares no foregroundServiceType. Android 14+ (targetSdk 34+) refuses to start
// a microphone foreground service unless the *manifest* declares the type, so we
// patch the merged app manifest to add android:foregroundServiceType="microphone".
const SERVICE_NAME = "com.asterinet.react.bgactions.RNBackgroundActionsTask";

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = function withBackgroundMicrophone(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    app.service = app.service || [];

    let service = app.service.find(
      (s) => s.$ && s.$["android:name"] === SERVICE_NAME,
    );
    if (!service) {
      service = { $: { "android:name": SERVICE_NAME } };
      app.service.push(service);
    }

    // Manifest merger combines these attributes with the library's <service>.
    service.$["android:foregroundServiceType"] = "microphone";
    service.$["android:exported"] = "false";

    return cfg;
  });
};
