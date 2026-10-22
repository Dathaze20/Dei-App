package io.github.dathaze20.deliordernyc;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
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
import org.json.JSONException;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The few things the web app cannot do by itself inside the Android WebView:
 * - report the installed version (for "Check for updates");
 * - download an approved update APK from this repository's GitHub Releases, verify it, and hand it
 *   to Android's own installer (the person always confirms; nothing installs silently);
 * - save a backup file through Android's "Save to…" screen (WebView has no browser downloads);
 * - hand over a product id from a shelf-tag link (deliordernyc://product/<id>);
 * - take shelf photos with the camera into a private inbox that survives Android closing the app
 *   while the camera is open (see takeShelfPhoto);
 * - one spoken command for the assistant, through the phone's own speech screen (listenOnce).
 */
@CapacitorPlugin(name = "DeliNative", permissions = { @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }) })
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
    private final ExecutorService photoExecutor = Executors.newSingleThreadExecutor();
    private File verifiedUpdate;
    private String pendingSaveText;

    // --- Installed version --------------------------------------------------------------------

    // --- Shelf-tag links ----------------------------------------------------------------------

    /** The product id of the shelf-tag link that opened the app, once; null when there is none. */
    @PluginMethod
    public void consumeProductLink(PluginCall call) {
        JSObject result = new JSObject();
        String id = MainActivity.takePendingProductId();
        result.put("productId", id == null ? JSObject.NULL : id);
        call.resolve(result);
    }

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

    // --- Shelf photos ---------------------------------------------------------------------------
    //
    // While the camera app is open, Android may close this app to free memory: the activity, the
    // WebView page or the whole process. A photo handed back through a callback is then lost (the
    // v0.1.5 camera input did exactly that). So the camera writes straight into a private folder
    // (files/shelf-inbox, never shared, never in backups), and the page collects whatever is
    // there every time it starts or comes back (takeShelfPhotos), stores it, then deletes it here
    // (deleteShelfPhotos). Whether the callback arrives or not, the photo is not lost.

    private static final String INBOX = "shelf-inbox";
    private static final String PREFS = "deliordernyc_shelf";
    private static final String PENDING_CAPTURE = "pendingCapture";
    private static final String LAST_CANCELLED = "lastCancelled";
    private static final int SHELF_SIDE = 1280;
    private static final int SHELF_QUALITY = 80;

    private File shelfInbox() {
        File dir = new File(getContext().getFilesDir(), INBOX);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("No room for photos.");
        return dir;
    }

    private SharedPreferences shelfPrefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Opens the camera app; the photo goes into the inbox. Resolves { taken } when it closes. */
    @PluginMethod
    public void takeShelfPhoto(PluginCall call) {
        // The camera permission is declared (for the barcode scanner), so Android requires it for
        // the camera app too. This is Android's own question; nothing is granted by the app.
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "onCameraPermission");
            return;
        }
        openCamera(call);
    }

    @PermissionCallback
    private void onCameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) openCamera(call);
        else call.reject("The camera was not allowed.", "camera-denied");
    }

    private void openCamera(PluginCall call) {
        try {
            File photo = new File(shelfInbox(), "capture-" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", photo);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.setClipData(ClipData.newRawUri("", uri));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            shelfPrefs().edit().putString(PENDING_CAPTURE, photo.getName()).commit();
            startActivityForResult(call, intent, "onShelfPhoto");
        } catch (ActivityNotFoundException e) {
            call.reject("No camera app was found.", "no-camera");
        } catch (Exception e) {
            call.reject("The camera could not be opened.", "camera-failed", e);
        }
    }

    @ActivityCallback
    private void onShelfPhoto(PluginCall call, ActivityResult result) {
        boolean taken = result.getResultCode() == Activity.RESULT_OK;
        String name = shelfPrefs().getString(PENDING_CAPTURE, null);
        shelfPrefs().edit().remove(PENDING_CAPTURE).putBoolean(LAST_CANCELLED, !taken).commit();
        // Cancelled: remove the empty (or unwanted) file. A taken photo stays in the inbox.
        if (!taken && name != null) {
            File file = new File(new File(getContext().getFilesDir(), INBOX), name);
            if (file.exists() && !file.delete()) file.deleteOnExit();
        }
        // After Android recreated the app there may be no page waiting for this answer; the page
        // collects the photo from the inbox anyway.
        if (call == null) return;
        JSObject answer = new JSObject();
        answer.put("taken", taken);
        call.resolve(answer);
    }

    /** Marks the gallery as open in PENDING_CAPTURE (no file is waiting for it). */
    private static final String GALLERY_OPEN = "gallery";

    /**
     * Opens Android's photo picker (several photos). The chosen photos are copied into the inbox,
     * where the page collects them like camera photos, so they are not lost either if Android
     * closes the app while the picker is open. No permission is needed.
     */
    @PluginMethod
    public void chooseShelfPhotos(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= 33) {
                intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
                intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(12, MediaStore.getPickImagesMaxLimit()));
            } else {
                intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            shelfPrefs().edit().putString(PENDING_CAPTURE, GALLERY_OPEN).commit();
            startActivityForResult(call, intent, "onShelfGallery");
        } catch (ActivityNotFoundException e) {
            shelfPrefs().edit().remove(PENDING_CAPTURE).commit();
            call.reject("No photo picker was found.", "no-gallery");
        }
    }

    @ActivityCallback
    private void onShelfGallery(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        java.util.List<Uri> chosen = new java.util.ArrayList<>();
        if (result.getResultCode() == Activity.RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) chosen.add(data.getClipData().getItemAt(i).getUri());
            } else if (data.getData() != null) {
                chosen.add(data.getData());
            }
        }
        // Copied on the photo thread, so a collection that follows always sees whole files.
        photoExecutor.execute(() -> {
            int copied = 0;
            long stamp = System.currentTimeMillis();
            try {
                for (int i = 0; i < chosen.size(); i++) {
                    File partial = new File(shelfInbox(), "capture-" + stamp + i + ".part");
                    try (InputStream in = getContext().getContentResolver().openInputStream(chosen.get(i)); OutputStream out = new FileOutputStream(partial)) {
                        if (in == null) continue;
                        byte[] buffer = new byte[64 * 1024];
                        for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
                    } catch (Exception e) {
                        partial.delete();
                        continue;
                    }
                    if (partial.renameTo(new File(shelfInbox(), "capture-" + stamp + i + ".jpg"))) copied++;
                }
            } catch (RuntimeException e) {
                // No room for the inbox: reported below as nothing chosen.
            }
            shelfPrefs().edit().remove(PENDING_CAPTURE).putBoolean(LAST_CANCELLED, copied == 0).commit();
            if (call == null) return;
            JSObject answer = new JSObject();
            answer.put("taken", copied > 0);
            call.resolve(answer);
        });
    }

    /**
     * Every finished photo in the inbox, made smaller (1280 px, upright, JPEG) as data URLs.
     * Captures still being taken are left alone; unreadable ones are reported and removed.
     */
    @PluginMethod
    public void takeShelfPhotos(PluginCall call) {
        photoExecutor.execute(() -> {
            try {
                File dir = shelfInbox();
                String pending = shelfPrefs().getString(PENDING_CAPTURE, null);
                boolean cancelled = shelfPrefs().getBoolean(LAST_CANCELLED, false);
                shelfPrefs().edit().remove(LAST_CANCELLED).commit();
                int failed = 0;
                File[] captures = dir.listFiles((d, n) -> n.startsWith("capture-") && n.endsWith(".jpg"));
                if (captures != null) {
                    for (File capture : captures) {
                        if (capture.length() == 0) {
                            // Empty: the camera is still open (the pending one), or it was cancelled.
                            if (!capture.getName().equals(pending)) capture.delete();
                            continue;
                        }
                        File ready = new File(dir, "photo-" + capture.getName().substring("capture-".length()));
                        if (shrinkPhoto(capture, ready)) {
                            capture.delete();
                        } else if (!capture.getName().equals(pending)) {
                            failed++;
                            capture.delete();
                        }
                    }
                }
                JSArray photos = new JSArray();
                File[] readyPhotos = dir.listFiles((d, n) -> n.startsWith("photo-") && n.endsWith(".jpg"));
                if (readyPhotos != null) {
                    Arrays.sort(readyPhotos);
                    for (File photo : readyPhotos) {
                        JSObject item = new JSObject();
                        item.put("name", photo.getName());
                        item.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(readAll(photo), Base64.NO_WRAP));
                        photos.put(item);
                    }
                }
                JSObject answer = new JSObject();
                answer.put("photos", photos);
                answer.put("failed", failed);
                answer.put("capturing", pending != null);
                answer.put("cancelled", cancelled);
                call.resolve(answer);
            } catch (Exception | OutOfMemoryError e) {
                call.reject("The photos could not be read.", "photos-failed");
            }
        });
    }

    /** Deletes inbox photos the page has stored. */
    @PluginMethod
    public void deleteShelfPhotos(PluginCall call) {
        JSArray names = call.getArray("names");
        try {
            File dir = shelfInbox();
            for (int i = 0; names != null && i < names.length(); i++) {
                String name = names.getString(i);
                if (!name.matches("photo-[0-9]{1,20}\\.jpg")) continue;
                File file = new File(dir, name);
                if (file.exists() && !file.delete()) throw new IllegalStateException("Not deleted.");
            }
            call.resolve();
        } catch (JSONException | RuntimeException e) {
            call.reject("The photos could not be removed.", "photos-failed");
        }
    }

    /** Writes a smaller, upright JPEG of a camera photo. False when it cannot be read. */
    private static boolean shrinkPhoto(File source, File target) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(source.getAbsolutePath(), bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false;
            // Decode at a fraction of full size (a 50 MP photo would need 200 MB), then scale.
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= SHELF_SIDE) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            Bitmap decoded = BitmapFactory.decodeFile(source.getAbsolutePath(), options);
            if (decoded == null) return false;
            float scale = Math.min(1f, SHELF_SIDE / (float) Math.max(decoded.getWidth(), decoded.getHeight()));
            Matrix matrix = new Matrix();
            matrix.postScale(scale, scale);
            int rotation = rotationOf(source);
            if (rotation != 0) matrix.postRotate(rotation);
            Bitmap upright = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true);
            ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
            upright.compress(Bitmap.CompressFormat.JPEG, SHELF_QUALITY, jpeg);
            if (upright != decoded) upright.recycle();
            decoded.recycle();
            File partial = new File(target.getPath() + ".part");
            try (FileOutputStream out = new FileOutputStream(partial)) {
                jpeg.writeTo(out);
                out.getFD().sync();
            }
            return partial.renameTo(target);
        } catch (Exception | OutOfMemoryError e) {
            return false;
        }
    }

    private static int rotationOf(File photo) {
        try {
            int orientation = new ExifInterface(photo.getAbsolutePath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (Exception ignored) {
            // No orientation: keep the photo as it is.
        }
        return 0;
    }

    private static byte[] readAll(File file) throws java.io.IOException {
        try (InputStream in = new java.io.FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[64 * 1024];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }

    // --- One spoken command (v0.1.7) --------------------------------------------------------------
    //
    // Opens the phone's own speech screen (RecognizerIntent) once, when the person taps the
    // microphone. That screen belongs to the phone's speech service, which holds the microphone
    // permission; this app needs none, never records audio and only receives the text.

    /** Whether the phone has a speech screen to open. */
    @PluginMethod
    public void speechAvailable(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        JSObject result = new JSObject();
        result.put("available", intent.resolveActivity(getContext().getPackageManager()) != null);
        call.resolve(result);
    }

    @PluginMethod
    public void listenOnce(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        String language = call.getString("language");
        if (language != null && language.matches("[a-z]{2}(-[A-Z]{2})?")) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        String prompt = call.getString("prompt");
        if (prompt != null && prompt.length() <= 120) intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
        try {
            startActivityForResult(call, intent, "onSpeech");
        } catch (ActivityNotFoundException e) {
            call.reject("Speech is not available on this phone.", "no-speech");
        }
    }

    @ActivityCallback
    private void onSpeech(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject answer = new JSObject();
        Intent data = result.getData();
        java.util.ArrayList<String> texts = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        answer.put("text", result.getResultCode() == Activity.RESULT_OK && texts != null && !texts.isEmpty() ? texts.get(0) : JSObject.NULL);
        call.resolve(answer);
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
