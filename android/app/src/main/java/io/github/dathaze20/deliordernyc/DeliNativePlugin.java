package io.github.dathaze20.deliordernyc;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The few things the web app cannot do by itself inside the Android WebView:
 * - report the installed version (for "Check for updates");
 * - download an approved update APK from this repository's GitHub Releases, verify it, and hand it
 *   to Android's own installer (the person always confirms; nothing installs silently);
 * - save a backup file through Android's "Save to…" screen (WebView has no browser downloads).
 */
@CapacitorPlugin(name = "DeliNative")
public class DeliNativePlugin extends Plugin {

    /** Only release assets of this repository are ever downloaded. Keep in sync with utils/appUpdate.ts. */
    static final String RELEASE_PREFIX = "https://github.com/Dathaze20/Dei-App/releases/download/";

    /** Hosts GitHub uses to serve release assets (after a redirect from github.com). */
    private static final Set<String> DOWNLOAD_HOSTS = new HashSet<>(
        Arrays.asList("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")
    );

    private static final long MAX_APK_BYTES = 150L * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private File verifiedUpdate;
    private String pendingSaveText;

    // --- Installed version --------------------------------------------------------------------

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo info = installedPackage(0);
            JSObject result = new JSObject();
            result.put("packageName", info.packageName);
            result.put("versionName", info.versionName);
            result.put("versionCode", PackageInfoCompat.getLongVersionCode(info));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read the installed version.", e);
        }
    }

    // --- Install permission -------------------------------------------------------------------

    @PluginMethod
    public void canInstallUpdates(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", canInstall());
        call.resolve(result);
    }

    /** Opens Android's "Install unknown apps" setting for this app. The person decides. */
    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    // --- Download and verify ------------------------------------------------------------------

    /**
     * Downloads the update and verifies it before anything is offered to the installer:
     * the URL is a release asset of this repository; every redirect stays on GitHub's hosts;
     * the SHA-256 matches the digest GitHub published for the asset (when one is given);
     * the APK is this app (same application ID), has the expected, newer versionCode, and is
     * signed with the same certificate as the installed app.
     */
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        String expectedSha256 = call.getString("sha256");
        Integer expectedVersionCode = call.getInt("versionCode");
        if (url == null || !url.startsWith(RELEASE_PREFIX) || expectedVersionCode == null) {
            call.reject("This download is not an approved DeliOrderNYC release.", "not-approved");
            return;
        }
        executor.execute(() -> {
            File target = new File(new File(getContext().getCacheDir(), "updates"), "update.apk");
            try {
                verifiedUpdate = null;
                File dir = target.getParentFile();
                if (dir != null && !dir.exists() && !dir.mkdirs()) throw new UpdateError("download-failed", "Could not prepare storage.");
                if (target.exists() && !target.delete()) throw new UpdateError("download-failed", "Could not replace an earlier download.");

                String sha256 = download(url, target);
                if (expectedSha256 != null && !expectedSha256.isEmpty() && !expectedSha256.equalsIgnoreCase(sha256)) {
                    throw new UpdateError("checksum-mismatch", "The download does not match the published release.");
                }
                verifyApk(target, expectedVersionCode);

                verifiedUpdate = target;
                JSObject result = new JSObject();
                result.put("sha256", sha256);
                result.put("verifiedDigest", expectedSha256 != null && !expectedSha256.isEmpty());
                call.resolve(result);
            } catch (UpdateError e) {
                target.delete();
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                target.delete();
                call.reject("The download failed. Check the internet connection and try again.", "download-failed", e);
            }
        });
    }

    private String download(String startUrl, File target) throws Exception {
        String current = startUrl;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            URL url = new URL(current);
            if (!"https".equals(url.getProtocol()) || !DOWNLOAD_HOSTS.contains(url.getHost().toLowerCase(Locale.ROOT))) {
                throw new UpdateError("not-approved", "The download left GitHub. It was stopped.");
            }
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("Accept", "application/octet-stream");
            try {
                int status = conn.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = conn.getHeaderField("Location");
                    if (location == null) throw new UpdateError("download-failed", "GitHub sent an incomplete answer.");
                    current = new URL(url, location).toString();
                    continue;
                }
                if (status != 200) throw new UpdateError("download-failed", "GitHub answered " + status + ".");
                long total = conn.getContentLengthLong();
                if (total > MAX_APK_BYTES) throw new UpdateError("download-failed", "The file is unexpectedly large.");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long received = 0;
                long lastReported = -1;
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        received += read;
                        if (received > MAX_APK_BYTES) throw new UpdateError("download-failed", "The file is unexpectedly large.");
                        digest.update(buffer, 0, read);
                        out.write(buffer, 0, read);
                        long percent = total > 0 ? (received * 100) / total : -1;
                        if (percent != lastReported) {
                            lastReported = percent;
                            JSObject progress = new JSObject();
                            progress.put("received", received);
                            progress.put("total", total);
                            notifyListeners("updateProgress", progress);
                        }
                    }
                }
                if (total > 0 && received != total) throw new UpdateError("download-failed", "The download was interrupted.");
                return toHex(digest.digest());
            } finally {
                conn.disconnect();
            }
        }
        throw new UpdateError("download-failed", "Too many redirects.");
    }

    private void verifyApk(File apk, int expectedVersionCode) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo update = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (update == null) throw new UpdateError("invalid-apk", "The downloaded file is not a valid app.");
        PackageInfo installed = installedPackage(flags);
        if (!installed.packageName.equals(update.packageName)) {
            throw new UpdateError("invalid-apk", "The downloaded app is not DeliOrderNYC.");
        }
        long updateCode = PackageInfoCompat.getLongVersionCode(update);
        if (updateCode != expectedVersionCode) throw new UpdateError("invalid-apk", "The downloaded version does not match the release.");
        if (updateCode <= PackageInfoCompat.getLongVersionCode(installed)) {
            throw new UpdateError("not-newer", "The downloaded version is not newer than this one.");
        }
        if (!signers(installed).equals(signers(update))) {
            throw new UpdateError("signature-mismatch", "The update is not signed with this app's key. It was not installed.");
        }
    }

    private static Set<String> signers(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new HashSet<>();
            signatures = info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        Set<String> result = new HashSet<>();
        if (signatures == null) return result;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : signatures) result.add(toHex(md.digest(s.toByteArray())));
        return result;
    }

    // --- Install --------------------------------------------------------------------------------

    /** Opens Android's installer for the verified download. Android asks the person to confirm. */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        File apk = verifiedUpdate;
        if (apk == null || !apk.exists()) {
            call.reject("Download the update first.", "not-downloaded");
            return;
        }
        if (!canInstall()) {
            call.reject("Android needs your permission to install updates from DeliOrderNYC.", "needs-permission");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // --- Save a backup file -----------------------------------------------------------------

    /** Shows Android's "Save to…" screen and writes the text to the chosen file. */
    @PluginMethod
    public void saveTextFile(PluginCall call) {
        String fileName = call.getString("fileName");
        String text = call.getString("text");
        if (fileName == null || text == null) {
            call.reject("Nothing to save.");
            return;
        }
        pendingSaveText = text;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "onSaveTextFile");
    }

    @ActivityCallback
    private void onSaveTextFile(PluginCall call, ActivityResult result) {
        String text = pendingSaveText;
        pendingSaveText = null;
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null || text == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("saved", false);
            call.resolve(cancelled);
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
            if (out == null) throw new IllegalStateException("No file to write to.");
            out.write(text.getBytes(StandardCharsets.UTF_8));
            JSObject saved = new JSObject();
            saved.put("saved", true);
            call.resolve(saved);
        } catch (Exception e) {
            call.reject("The file could not be saved.", e);
        }
    }

    // --- Helpers --------------------------------------------------------------------------------

    @SuppressWarnings("deprecation")
    private PackageInfo installedPackage(int flags) throws PackageManager.NameNotFoundException {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), flags);
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    private static final class UpdateError extends Exception {
        final String code;

        UpdateError(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}
