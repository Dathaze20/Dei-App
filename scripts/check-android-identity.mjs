// Checks that the Android app's identity and version agree everywhere, so an update can always
// install over the previous APK and the in-app updater compares the right numbers.
//
//   node scripts/check-android-identity.mjs            (CI)
//   node scripts/check-android-identity.mjs v0.2.0     (release: the tag must match package.json)
//   node scripts/check-android-identity.mjs v0.2.0 app-release.apk-badging.txt
//                                                      (also checks `aapt2 dump badging` output)
import { readFileSync } from 'node:fs';

const PERMANENT_APP_ID = 'io.github.dathaze20.deliordernyc';
const APP_NAME = 'DeliOrderNYC';
const ORIGIN = { androidScheme: 'https', hostname: 'localhost' };
const ALLOWED_PERMISSIONS = new Set([
  'android.permission.INTERNET',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.CAMERA',
]);

const problems = [];
const expect = (ok, message) => ok || problems.push(message);
const read = path => readFileSync(path, 'utf8');

const pkg = JSON.parse(read('package.json'));
const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(pkg.version);
expect(match, `package.json version must be MAJOR.MINOR.PATCH (0-999 each), got "${pkg.version}"`);
const versionCode = match ? Number(match[1]) * 1_000_000 + Number(match[2]) * 1_000 + Number(match[3]) : null;

const capConfig = read('capacitor.config.ts');
expect(capConfig.includes(`appId: '${PERMANENT_APP_ID}'`), `capacitor.config.ts appId must stay ${PERMANENT_APP_ID}`);
expect(capConfig.includes(`appName: '${APP_NAME}'`), `capacitor.config.ts appName must be ${APP_NAME}`);
expect(capConfig.includes(`androidScheme: '${ORIGIN.androidScheme}'`), 'WebView scheme must stay https (saved data lives in that origin)');
expect(capConfig.includes(`hostname: '${ORIGIN.hostname}'`), 'WebView hostname must stay localhost (saved data lives in that origin)');
expect(!/\burl\s*:/.test(capConfig), 'capacitor.config.ts must not set server.url: the app is bundled, never loaded from the web');

const gradle = read('android/app/build.gradle');
expect(gradle.includes(`applicationId "${PERMANENT_APP_ID}"`), `build.gradle applicationId must be ${PERMANENT_APP_ID}`);
expect(gradle.includes(`namespace = "${PERMANENT_APP_ID}"`), `build.gradle namespace must be ${PERMANENT_APP_ID}`);
expect(gradle.includes('versionCode appVersionCode') && gradle.includes('versionName appVersion'), 'build.gradle must take its version from package.json');

const strings = read('android/app/src/main/res/values/strings.xml');
expect(strings.includes(`<string name="app_name">${APP_NAME}</string>`), `Android app_name must be ${APP_NAME}`);

const manifest = read('android/app/src/main/AndroidManifest.xml');
for (const [, permission] of manifest.matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)) {
  expect(ALLOWED_PERMISSIONS.has(permission), `Unexpected Android permission ${permission} (see docs/ANDROID.md)`);
}
expect(manifest.includes('android:allowBackup="false"'), 'allowBackup must stay false (data never leaves the phone silently)');

const plugin = read('android/app/src/main/java/io/github/dathaze20/deliordernyc/DeliNativePlugin.java');
const updater = read('utils/appUpdate.ts');
expect(plugin.includes('"https://github.com/Dathaze20/Dei-App/releases/download/"'), 'The native updater must only download this repository’s releases');
expect(updater.includes("REPOSITORY = 'Dathaze20/Dei-App'"), 'The updater must only read this repository’s releases');

const [tag, badgingFile] = process.argv.slice(2);
if (tag) expect(tag === `v${pkg.version}`, `Release tag ${tag} does not match package.json version v${pkg.version}`);
if (badgingFile) {
  const badging = read(badgingFile);
  expect(badging.includes(`name='${PERMANENT_APP_ID}'`), 'The built APK has the wrong application ID');
  expect(badging.includes(`versionCode='${versionCode}'`), `The built APK versionCode is not ${versionCode}`);
  expect(badging.includes(`versionName='${pkg.version}'`), `The built APK versionName is not ${pkg.version}`);
}

if (problems.length) {
  console.error('Android identity check failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Android identity OK: ${PERMANENT_APP_ID} ${pkg.version} (versionCode ${versionCode}), origin https://localhost.`);
