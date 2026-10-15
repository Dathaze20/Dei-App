#!/usr/bin/env node
// Fails (exit 1) if the production build in dist/ contains anything that looks like a credential,
// or the value of a secret environment variable. Run automatically by `npm run build`.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanDirectory } from './secretScan.mjs';

const dir = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dir)) {
  console.error(`Secret scan: ${dir} does not exist. Build first.`);
  process.exit(2);
}
const { filesScanned, findings } = scanDirectory(dir);
if (findings.length > 0) {
  console.error(`Secret scan FAILED: ${findings.length} possible credential(s) in the build. Do not deploy it.`);
  for (const f of findings) console.error(`  - ${f.file} (character ${f.index}): ${f.rule}`);
  console.error('Remove the key from the browser code; keys must stay on a server, never in the app bundle.');
  process.exit(1);
}
console.log(`Secret scan passed: ${filesScanned} build files, no credentials found.`);
