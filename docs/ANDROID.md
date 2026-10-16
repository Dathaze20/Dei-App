# DeliOrderNYC for Android

The Android app is the same React app packaged with [Capacitor](https://capacitorjs.com/) 8.
- **Bundled.** All code, styles and fonts are inside the APK. Nothing is loaded from GitHub Pages or any other web address.
- **No services.** There is no backend, no account and no paid service.

## Identity (permanent; never change after the first signed release)

| What | Value | Why it must not change |
|---|---|---|
| Application ID | `io.github.dathaze20.deliordernyc` | Android installs an update over the old app only when the ID is the same. A new ID means a separate app with empty data. It uses the reverse-domain form of `dathaze20.github.io`, an address the owner controls. |
| Signing key | the owner's release key (below) | Android refuses an update signed with a different key. Losing the key means future versions cannot update the installed app. |
| WebView origin | `https://localhost` (`androidScheme: 'https'`, `hostname: 'localhost'` in `capacitor.config.ts`) | All saved data (`localStorage`, and the IndexedDB safety snapshots) belongs to this origin. Changing it would make products, orders and counts look empty after an update. |
| Display name | `DeliOrderNYC` | |

These are checked automatically by `npm run check:android` and by every CI and release build.

## Versions
- **One version number:** `version` in `package.json` (`MAJOR.MINOR.PATCH`, each 0–999). It starts at `0.1.0`.
- **Android versionCode:** `MAJOR × 1,000,000 + MINOR × 1,000 + PATCH`, computed by `android/app/build.gradle`. The in-app updater computes the same number from the release tag.
- **Releases:**
  - Each release raises the version in a reviewed pull request first.
  - The tag is always `v` + the version (for example `v0.2.0`).
  - The APK asset is `DeliOrderNYC-<version>.apk`.

## Data across updates
- **Updates keep data.** Updating with the same ID, key and origin keeps the app's private storage: products, suppliers, orders, verified stock counts and safety snapshots.
- **Uninstalling deletes data.** Uninstalling deletes all of it. Always **Export** before uninstalling or changing phones.
- **No automatic backup.** `android:allowBackup="false"` plus `data_extraction_rules.xml`: Android does not copy the data to Google's cloud or to another phone on its own. **Manage → Backup → Export** is the backup.
- **Saving a backup file.** In the app, Export opens Android's "Save to…" screen (choose *Downloads*). Restore uses Android's file picker. Undo and safety snapshots work as on the web.

## Permissions
- `INTERNET`: Check for updates and download an approved update.
- `REQUEST_INSTALL_PACKAGES`: hand a downloaded update to Android's installer. Android still asks you to allow "Install unknown apps" for DeliOrderNYC once, and to confirm every installation.
- `CAMERA`: the existing barcode scanner. It is only requested when the scanner opens.

## Check for updates
**Manage → App updates → Check for updates.** The panel appears only in the Android app; the web version is unchanged.
1. **Check.** The app reads `https://api.github.com/repos/Dathaze20/Dei-App/releases/latest`.
   - Drafts and pre-releases are never offered.
   - Offline, no release yet, GitHub busy and errors each get their own plain message.
2. **Compare.** If the release's versionCode is higher than the installed one, the version and release notes are shown with **Download & install**.
3. **Download and verify.** The download is accepted only if all of these hold:
   - the URL starts with `https://github.com/Dathaze20/Dei-App/releases/download/`;
   - every redirect stays on GitHub's hosts;
   - the file matches the SHA-256 digest GitHub published for the asset (when GitHub provides one);
   - it is the same application ID, with exactly the expected, newer versionCode;
   - it is signed with the same certificate as the installed app.
4. **Install.** Android's own installer opens and you confirm. Silent installation is not possible, and the app never tries it.

## Release signing key: one-time setup by the owner (phone + GitHub only)
The key is created **on your phone** and stored in only two places: your own backups and GitHub's encrypted Actions secrets. It is never committed to the repository, and no one else creates it.

1. **Install Termux** from F-Droid (`f-droid.org/packages/com.termux`) or from Termux's GitHub releases. The Play Store version is outdated.
2. **Install Java** in Termux: `pkg update && pkg install openjdk-21`, then `termux-setup-storage` (tap Allow).
3. **Create the key.** Pick a strong password of 16 or more characters, and write it on paper first.
   ```
   keytool -genkeypair -v -storetype PKCS12 -keystore deliordernyc-release.p12 -alias deliordernyc -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=DeliOrderNYC, O=Dathaze20"
   ```
   Enter the same password when asked.
4. **Read the fingerprint.** Copy the `SHA256:` line:
   ```
   keytool -list -v -keystore deliordernyc-release.p12 -alias deliordernyc | grep SHA256
   ```
5. **Prepare the files:**
   ```
   base64 -w0 deliordernyc-release.p12 > ~/storage/downloads/deliordernyc-key-base64.txt
   cp deliordernyc-release.p12 ~/storage/downloads/
   ```
6. **Back up** `deliordernyc-release.p12` in **two** places you control, for example your Google Drive and an email to yourself. Keep the password separately: a password manager and the paper copy. **Without this key and password, future updates cannot be installed over the app.**
7. **Add the secrets on GitHub.** In Chrome, open `github.com/Dathaze20/Dei-App`, then menu ⋮ → *Desktop site* → **Settings → Secrets and variables → Actions**:
   - **New repository secret** `ANDROID_KEYSTORE_BASE64`: paste the whole content of `deliordernyc-key-base64.txt` (open it with a text editor or Files app → select all → copy).
   - **New repository secret** `ANDROID_KEYSTORE_PASSWORD`: the password.
   - **Variables** tab → **New repository variable** `ANDROID_SIGNING_CERT_SHA256`: the fingerprint from step 4.
8. **Clean up.** Delete `deliordernyc-key-base64.txt` from Downloads. Keep the `.p12` backups.

## Making a release (owner approval at every step)
1. **Raise the version.** A reviewed PR raises `version` in `package.json` and is merged into `main`.
2. **Build.** Actions → **Android release APK (manual)** → Run workflow on `main`.
   - Without the draft option, it only builds and verifies; download the APK artifact to review it.
   - With **create_draft_release**, the verified APK is attached to a **draft** release. The app cannot see drafts.
3. **Publish.** You review the draft on GitHub and press **Publish release**. From then on, Check for updates offers it.

The first install is done by hand: download the APK from the release on the phone, open it, and allow the install. Every later update goes through Check for updates.

## Checks
- **CI on every pull request** (job *Android build check*):
  - identity and version check;
  - web build and secret scan;
  - `cap sync`, then Gradle `assembleRelease` + `lintRelease` (unsigned; it cannot be installed);
  - APK badging: application ID, versionCode, versionName;
  - confirms `index.html`, CSS and fonts are bundled and no remote `server.url` is set.
- **Release workflow** runs the same checks, plus `apksigner verify` against the registered certificate fingerprint.

## GitHub Pages
The manual Pages workflow (`docs/GITHUB_PAGES.md`) stays in the repository for a future iPhone web version. It is not enabled and is not used by the Android app.
