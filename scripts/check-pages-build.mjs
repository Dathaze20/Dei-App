#!/usr/bin/env node
// Checks a build made for GitHub Pages (`vite build --base=/Dei-App/`): every script, stylesheet
// and font must be requested under /Dei-App/, never from the site root, or the page would load
// unstyled or blank at https://dathaze20.github.io/Dei-App/. Exits 1 on any problem.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const base = process.argv[3] ?? '/Dei-App/';
const problems = [];

const html = readFileSync(join(dir, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(ref => !ref.startsWith('data:'));
if (refs.length === 0) problems.push('index.html references no assets.');
for (const ref of refs) {
  if (!ref.startsWith(`${base}assets/`)) problems.push(`index.html: "${ref}" is not under ${base}assets/`);
  else if (!existsSync(join(dir, ref.slice(base.length)))) problems.push(`index.html: "${ref}" does not exist in ${dir}`);
}

for (const file of readdirSync(join(dir, 'assets')).filter(f => f.endsWith('.css'))) {
  const css = readFileSync(join(dir, 'assets', file), 'utf8');
  for (const [, raw] of css.matchAll(/url\(([^)]+)\)/g)) {
    const url = raw.replace(/^["']|["']$/g, '');
    if (url.startsWith('data:')) continue;
    if (url.startsWith('/') && !url.startsWith(base)) problems.push(`${file}: "${url}" points outside ${base}`);
    if (/^https?:/.test(url)) problems.push(`${file}: "${url}" loads from another site`);
  }
}

if (problems.length) {
  console.error(`Pages build check FAILED:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`Pages build check passed: ${refs.length} asset references under ${base}.`);
