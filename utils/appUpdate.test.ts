import { describe, expect, it } from 'vitest';
import { LATEST_RELEASE_URL, checkForUpdate, evaluateRelease, versionCodeOf } from './appUpdate';

// GitHub's /releases/latest answers, mocked. Nothing here talks to the network.
const DIGEST = 'a'.repeat(64);
const release = (tag: string, overrides: Record<string, unknown> = {}, assetOverrides: Record<string, unknown> = {}) => {
  const version = tag.replace(/^v/, '');
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    body: 'Fixes and improvements.',
    published_at: '2026-10-20T12:00:00Z',
    assets: [
      {
        name: `DeliOrderNYC-${version}.apk`,
        browser_download_url: `https://github.com/Dathaze20/Dei-App/releases/download/${tag}/DeliOrderNYC-${version}.apk`,
        state: 'uploaded',
        size: 5_000_000,
        digest: `sha256:${DIGEST}`,
        ...assetOverrides,
      },
    ],
    ...overrides,
  };
};
const INSTALLED_0_1_0 = 1_000;
const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('version codes (same formula as android/app/build.gradle)', () => {
  it('MAJOR * 1000000 + MINOR * 1000 + PATCH', () => {
    expect(versionCodeOf('0.1.0')).toBe(1_000);
    expect(versionCodeOf('v1.2.3')).toBe(1_002_003);
    expect(versionCodeOf('2.0.0')).toBe(2_000_000);
  });

  it('orders versions numerically, not as text', () => {
    expect(versionCodeOf('0.10.0')!).toBeGreaterThan(versionCodeOf('0.9.9')!);
    expect(versionCodeOf('1.0.0')!).toBeGreaterThan(versionCodeOf('0.999.999')!);
  });

  it('refuses anything that is not MAJOR.MINOR.PATCH', () => {
    for (const bad of ['1.2', '1.2.3.4', 'v1.2.3-beta', '1.2.x', '', 'latest', '1.1000.0']) expect(versionCodeOf(bad)).toBeNull();
  });
});

describe('deciding from a release', () => {
  it('offers a newer release with its notes, size and GitHub digest', () => {
    expect(evaluateRelease(release('v0.2.0'), INSTALLED_0_1_0)).toEqual({
      state: 'available',
      update: {
        version: '0.2.0',
        versionCode: 2_000,
        notes: 'Fixes and improvements.',
        publishedAt: '2026-10-20T12:00:00Z',
        apkUrl: 'https://github.com/Dathaze20/Dei-App/releases/download/v0.2.0/DeliOrderNYC-0.2.0.apk',
        apkSize: 5_000_000,
        sha256: DIGEST,
      },
    });
  });

  it('the same or an older version is up to date', () => {
    expect(evaluateRelease(release('v0.1.0'), INSTALLED_0_1_0)).toEqual({ state: 'up-to-date', latestVersion: '0.1.0' });
    expect(evaluateRelease(release('v0.0.9'), INSTALLED_0_1_0)).toEqual({ state: 'up-to-date', latestVersion: '0.0.9' });
  });

  it('never offers drafts or pre-releases', () => {
    expect(evaluateRelease(release('v9.0.0', { draft: true }), INSTALLED_0_1_0)).toEqual({ state: 'no-release' });
    expect(evaluateRelease(release('v9.0.0', { prerelease: true }), INSTALLED_0_1_0)).toEqual({ state: 'no-release' });
  });

  it('only accepts the APK from this repository and this release', () => {
    const elsewhere = [
      { browser_download_url: 'https://github.com/someone-else/Dei-App/releases/download/v0.2.0/DeliOrderNYC-0.2.0.apk' },
      { browser_download_url: 'https://github.com/Dathaze20/grocery-pricer/releases/download/v0.2.0/DeliOrderNYC-0.2.0.apk' },
      { browser_download_url: 'https://github.com/Dathaze20/Dei-App/releases/download/v0.1.9/DeliOrderNYC-0.2.0.apk' },
      { browser_download_url: 'http://github.com/Dathaze20/Dei-App/releases/download/v0.2.0/DeliOrderNYC-0.2.0.apk' },
      { browser_download_url: 'https://evil.example/Dathaze20/Dei-App/releases/download/v0.2.0/DeliOrderNYC-0.2.0.apk' },
      { name: 'DeliOrderNYC-0.2.0-debug.apk' },
      { state: 'starter' },
    ];
    for (const asset of elsewhere) expect(evaluateRelease(release('v0.2.0', {}, asset), INSTALLED_0_1_0)).toEqual({ state: 'error', reason: 'no-apk' });
    expect(evaluateRelease(release('v0.2.0', { assets: [] }), INSTALLED_0_1_0)).toEqual({ state: 'error', reason: 'no-apk' });
  });

  it('keeps going without a digest (the native side still checks the app ID and signing key)', () => {
    const noDigest = evaluateRelease(release('v0.2.0', {}, { digest: undefined }), INSTALLED_0_1_0);
    expect(noDigest.state === 'available' && noDigest.update.sha256).toBeNull();
    const otherAlgorithm = evaluateRelease(release('v0.2.0', {}, { digest: 'md5:abc' }), INSTALLED_0_1_0);
    expect(otherAlgorithm.state === 'available' && otherAlgorithm.update.sha256).toBeNull();
  });

  it('rejects tags that do not follow vMAJOR.MINOR.PATCH', () => {
    for (const tag of ['0.2.0', 'v0.2', 'release-1', 'v0.2.0-beta']) {
      expect(evaluateRelease(release(tag), INSTALLED_0_1_0)).toEqual({ state: 'error', reason: 'bad-version' });
    }
  });

  it('treats release notes as plain text and limits their length', () => {
    const long = evaluateRelease(release('v0.2.0', { body: `<script>x</script>${'n'.repeat(5000)}` }), INSTALLED_0_1_0);
    expect(long.state === 'available' && long.update.notes.length).toBe(4000);
    const none = evaluateRelease(release('v0.2.0', { body: null }), INSTALLED_0_1_0);
    expect(none.state === 'available' && none.update.notes).toBe('');
  });

  it('a malformed answer is an error, not an update', () => {
    for (const bad of [null, [], 'text', { assets: 'x' }]) expect(evaluateRelease(bad, INSTALLED_0_1_0).state).toBe('error');
  });
});

describe('asking GitHub', () => {
  it('asks only the latest release of Dathaze20/Dei-App', async () => {
    const urls: string[] = [];
    await checkForUpdate(INSTALLED_0_1_0, (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(release('v0.2.0')), { status: 200 });
    }) as typeof fetch, true);
    expect(urls).toEqual([LATEST_RELEASE_URL]);
    expect(LATEST_RELEASE_URL).toBe('https://api.github.com/repos/Dathaze20/Dei-App/releases/latest');
  });

  it('offline: does not even try', async () => {
    let called = false;
    const result = await checkForUpdate(INSTALLED_0_1_0, (async () => ((called = true), new Response('{}'))) as typeof fetch, false);
    expect(result).toEqual({ state: 'offline' });
    expect(called).toBe(false);
  });

  it('a network failure reads as offline', async () => {
    const fail = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await checkForUpdate(INSTALLED_0_1_0, fail, true)).toEqual({ state: 'offline' });
  });

  it('no release published yet (404)', async () => {
    expect(await checkForUpdate(INSTALLED_0_1_0, respond(404, { message: 'Not Found' }) as typeof fetch, true)).toEqual({ state: 'no-release' });
  });

  it('GitHub rate limit', async () => {
    expect(await checkForUpdate(INSTALLED_0_1_0, respond(403, {}) as typeof fetch, true)).toEqual({ state: 'error', reason: 'rate-limited' });
    expect(await checkForUpdate(INSTALLED_0_1_0, respond(429, {}) as typeof fetch, true)).toEqual({ state: 'error', reason: 'rate-limited' });
  });

  it('server error or broken JSON', async () => {
    expect(await checkForUpdate(INSTALLED_0_1_0, respond(500, {}) as typeof fetch, true)).toEqual({ state: 'error', reason: 'bad-response' });
    const broken = (async () => new Response('not json', { status: 200 })) as typeof fetch;
    expect(await checkForUpdate(INSTALLED_0_1_0, broken, true)).toEqual({ state: 'error', reason: 'bad-response' });
  });

  it('a newer release', async () => {
    const result = await checkForUpdate(INSTALLED_0_1_0, respond(200, release('v0.3.1')) as typeof fetch, true);
    expect(result.state === 'available' && result.update.versionCode).toBe(3_001);
  });
});
