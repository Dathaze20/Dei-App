#!/usr/bin/env node
// Copies a build and makes it load Inter from Google Fonts (as main did) instead of the bundled
// files. Comparing main with this copy shows which differences come only from the font files.
//   node visual/googlefonts-variant.mjs dist dist-googlefonts
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const [from = 'dist', to = 'dist-googlefonts'] = process.argv.slice(2);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
for (const file of readdirSync(`${to}/assets`).filter(f => f.endsWith('.css'))) {
  const path = `${to}/assets/${file}`;
  // Rename the bundled @font-face family so only the Google Fonts faces match "Inter".
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('font-family:Inter;', 'font-family:InterBundled;'));
}
const html = `${to}/index.html`;
writeFileSync(
  html,
  readFileSync(html, 'utf8').replace(
    '</title>',
    '</title>\n    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
  ),
);
console.log(`${to}: ${from} with Inter from Google Fonts`);
