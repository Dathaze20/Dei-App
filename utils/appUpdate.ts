// utils/appUpdate.ts
//
// "Check for updates" for the Android app. Reads the latest published GitHub Release of
// Dathaze20/Dei-App (drafts and pre-releases are never offered) and decides whether it is newer
// than the installed app. Pure apart from the injected fetch, so every case is unit-tested.
//
// Release rules (enforced by the release workflow, see docs/ANDROID.md):
//   tag              vMAJOR.MINOR.PATCH
//   APK asset        DeliOrderNYC-MAJOR.MINOR.PATCH.apk, uploaded to that release
//   versionCode      MAJOR * 1000000 + MINOR * 1000 + PATCH (same formula as android/app/build.gradle)
// The native side checks again before installing: same repository URL, GitHub's published
// SHA-256 digest, same application ID, expected versionCode, and the same signing key.

export const REPOSITORY = 'Dathaze20/Dei-App';
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
export const RELEASE_ASSET_PREFIX = `https://github.com/${REPOSITORY}/releases/download/`;
const MAX_NOTES = 4000;
const TIMEOUT_MS = 15_000;

/** "1.2.3" or "v1.2.3" → 1002003. Anything else → null. */
export const versionCodeOf = (version: string): number | null => {
  const match = /^v?(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(version.trim());
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
};

export interface AvailableUpdate {
  version: string;
  versionCode: number;
  notes: string;
  publishedAt: string | null;
  apkUrl: string;
  apkSize: number;
  /** Lower-case hex SHA-256 that GitHub published for the asset, when it did. */
  sha256: string | null;
}

export type UpdateCheck =
  | { state: 'up-to-date'; latestVersion: string }
  | { state: 'available'; update: AvailableUpdate }
  | { state: 'no-release' }
  | { state: 'offline' }
  | { state: 'error'; reason: 'rate-limited' | 'bad-response' | 'no-apk' | 'bad-version' };

interface ReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
  state?: unknown;
  size?: unknown;
  digest?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Decides from one release object (as GitHub's API returns it). Exported for tests. */
export const evaluateRelease = (release: unknown, installedVersionCode: number): UpdateCheck => {
  if (!isRecord(release)) return { state: 'error', reason: 'bad-response' };
  if (release.draft === true || release.prerelease === true) return { state: 'no-release' };
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  const versionCode = versionCodeOf(tag);
  if (versionCode === null || !tag.startsWith('v')) return { state: 'error', reason: 'bad-version' };
  const version = tag.slice(1);
  if (versionCode <= installedVersionCode) return { state: 'up-to-date', latestVersion: version };

  const name = `DeliOrderNYC-${version}.apk`;
  const expectedUrl = `${RELEASE_ASSET_PREFIX}${tag}/${name}`;
  const assets: ReleaseAsset[] = Array.isArray(release.assets) ? release.assets.filter(isRecord) : [];
  const apk = assets.find(a => a.name === name && a.browser_download_url === expectedUrl && a.state === 'uploaded');
  if (!apk) return { state: 'error', reason: 'no-apk' };
  const digest = typeof apk.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(apk.digest) : null;

  return {
    state: 'available',
    update: {
      version,
      versionCode,
      notes: (typeof release.body === 'string' ? release.body : '').trim().slice(0, MAX_NOTES),
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
      apkUrl: expectedUrl,
      apkSize: typeof apk.size === 'number' ? apk.size : 0,
      sha256: digest ? digest[1].toLowerCase() : null,
    },
  };
};

/** Asks GitHub for the latest published release. Never downloads or installs anything. */
export const checkForUpdate = async (
  installedVersionCode: number,
  fetchImpl: typeof fetch = fetch,
  online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine,
): Promise<UpdateCheck> => {
  if (!online) return { state: 'offline' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    return { state: 'offline' };
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 404) return { state: 'no-release' };
  if (response.status === 403 || response.status === 429) return { state: 'error', reason: 'rate-limited' };
  if (!response.ok) return { state: 'error', reason: 'bad-response' };
  try {
    return evaluateRelease(await response.json(), installedVersionCode);
  } catch {
    return { state: 'error', reason: 'bad-response' };
  }
};
