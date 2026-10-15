import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanDirectory } from './secretScan.mjs';

// Built from parts so this test file itself never contains a credential-shaped string.
const fakeGoogleKey = 'AIza' + 'Sy' + 'X'.repeat(33);
const canary = 'deliordernyc-canary-' + 'q7k2m9';

let dir: string;
function build(files: Record<string, string | Buffer>) {
  dir = mkdtempSync(join(tmpdir(), 'secret-scan-'));
  mkdirSync(join(dir, 'assets'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('build secret scan', () => {
  it('passes a clean build', () => {
    const result = scanDirectory(build({ 'index.html': '<html></html>', 'assets/a.js': 'const x = 1;' }), {});
    expect(result.filesScanned).toBe(2);
    expect(result.findings).toEqual([]);
  });

  it('finds a Google (Gemini) API key in JavaScript', () => {
    const result = scanDirectory(build({ 'assets/a.js': `const k=${JSON.stringify(fakeGoogleKey)};` }), {});
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toMatch(/Google API key/);
    expect(result.findings[0].file).toBe(join('assets', 'a.js'));
  });

  it('finds a private key block', () => {
    const result = scanDirectory(build({ 'assets/a.js': '"-----BEGIN RSA PRIVATE KEY-----"' }), {});
    expect(result.findings.map(f => f.rule)).toContain('Private key block');
  });

  it('finds the exact value of a secret environment variable, even in any format', () => {
    const result = scanDirectory(build({ 'assets/a.js': `x="${canary}"` }), { GEMINI_API_KEY: canary });
    expect(result.findings).toEqual([{ file: join('assets', 'a.js'), rule: 'value of GEMINI_API_KEY', index: 3 }]);
  });

  it('checks binary assets for secret values too', () => {
    const result = scanDirectory(build({ 'assets/f.woff2': Buffer.from(`\u0000\u0001${canary}`, 'latin1') }), {
      SECRET_SCAN_CANARY: canary,
    });
    expect(result.findings).toHaveLength(1);
  });

  it('never reports the secret itself', () => {
    const result = scanDirectory(build({ 'assets/a.js': `${canary} ${fakeGoogleKey}` }), { API_KEY: canary });
    const report = JSON.stringify(result);
    expect(report).not.toContain(canary);
    expect(report).not.toContain(fakeGoogleKey);
  });

  it('ignores empty or very short environment values', () => {
    const result = scanDirectory(build({ 'assets/a.js': 'const a = "abc";' }), { API_KEY: 'abc', GEMINI_API_KEY: '' });
    expect(result.findings).toEqual([]);
  });
});
