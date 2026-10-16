import type { CapacitorConfig } from '@capacitor/cli';

// Android packaging. See docs/ANDROID.md before changing anything here.
//
// appId is the permanent Android application ID. Every update must use the same ID (and the same
// signing key), or Android treats it as a different app and the saved data stays with the old one.
//
// The WebView origin is fixed at https://localhost. Products, orders, stock counts and safety
// snapshots live in that origin's localStorage and IndexedDB inside the app's private storage, so
// changing androidScheme or hostname would make all saved data look empty after an update.
const config: CapacitorConfig = {
  appId: 'io.github.dathaze20.deliordernyc',
  appName: 'DeliOrderNYC',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
  android: {
    // Never load the app from a web address: everything is bundled inside the APK.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
