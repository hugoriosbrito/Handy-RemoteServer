// Guard: this repo root is the Tauri desktop app, not the Expo mobile app.
// Accidental `eas build` here uploads src-tauri/target and exceeds EAS limits.
throw new Error(
  "EAS deve ser executado em mobile/. Use: cd mobile && npx eas-cli build --platform android --profile preview",
);
