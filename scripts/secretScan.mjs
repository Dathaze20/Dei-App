// Scans a production build for credentials before it can be shipped. Anything in dist/ is public:
// every visitor's browser downloads it, so no API key or private key may ever end up there.
//
// The scan never prints a secret. Findings name the file, the rule and a position only.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Patterns for credential formats that must never appear in browser code. */
export const SECRET_PATTERNS = [
  { name: 'Google API key (Gemini / Google Cloud)', regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'OpenAI-style secret key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'Anthropic API key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub token', regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{30,}/ },
  { name: 'AWS access key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google OAuth client secret', regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
];

/**
 * Environment variables whose values must never be copied into the bundle. If one is set while
 * building (locally from .env, or in CI), its exact value is searched for as well.
 */
export const SECRET_ENV_NAMES = ['GEMINI_API_KEY', 'API_KEY', 'GOOGLE_API_KEY', 'SECRET_SCAN_CANARY'];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.txt', '.svg', '.webmanifest', '.xml']);

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function extensionOf(file) {
  const dot = file.lastIndexOf('.');
  return dot === -1 ? '' : file.slice(dot).toLowerCase();
}

/**
 * @param {string} dir build output directory
 * @param {Record<string, string | undefined>} env environment to take secret values from
 * @returns {{ filesScanned: number, findings: { file: string, rule: string, index: number }[] }}
 */
export function scanDirectory(dir, env = process.env) {
  const secretValues = SECRET_ENV_NAMES.map(name => ({ name, value: env[name] })).filter(
    // Very short values would match by accident and cannot be real keys.
    s => typeof s.value === 'string' && s.value.trim().length >= 8,
  );
  const findings = [];
  let filesScanned = 0;
  for (const file of listFiles(dir)) {
    const ext = extensionOf(file);
    // Binary assets (fonts, images) are still searched for the exact env values, as raw bytes.
    const content = readFileSync(file).toString(TEXT_EXTENSIONS.has(ext) ? 'utf8' : 'latin1');
    filesScanned++;
    const shown = relative(dir, file);
    if (TEXT_EXTENSIONS.has(ext)) {
      for (const { name, regex } of SECRET_PATTERNS) {
        const match = regex.exec(content);
        if (match) findings.push({ file: shown, rule: name, index: match.index });
      }
    }
    for (const { name, value } of secretValues) {
      const index = content.indexOf(value);
      if (index !== -1) findings.push({ file: shown, rule: `value of ${name}`, index });
    }
  }
  return { filesScanned, findings };
}
