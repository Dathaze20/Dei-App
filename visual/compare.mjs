#!/usr/bin/env node
// Compares visual-output/before/*.png with visual-output/after/*.png. For each screen it writes
// visual-output/compare/<name>.png (before | after | differences in red) and a Markdown table of
// how many pixels changed. It reports; it does not fail the build, because some difference is
// expected (font files from a different source) and a person reviews the images.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = process.argv[2] ?? 'visual-output';
const out = `${root}/compare`;
mkdirSync(out, { recursive: true });

const load = file => PNG.sync.read(readFileSync(file));
/** Copies `img` onto a white canvas of the given size, so screenshots of different heights line up. */
const pad = (img, width, height) => {
  const canvas = new PNG({ width, height });
  canvas.data.fill(255);
  PNG.bitblt(img, canvas, 0, 0, img.width, img.height, 0, 0);
  return canvas;
};

const names = readdirSync(`${root}/after`).filter(f => f.endsWith('.png')).sort();
const rows = [];
for (const name of names) {
  const beforeFile = `${root}/before/${name}`;
  if (!existsSync(beforeFile)) {
    rows.push({ name, changed: null, note: 'no before screenshot' });
    continue;
  }
  const rawBefore = load(beforeFile);
  const rawAfter = load(`${root}/after/${name}`);
  const width = Math.max(rawBefore.width, rawAfter.width);
  const height = Math.max(rawBefore.height, rawAfter.height);
  const before = pad(rawBefore, width, height);
  const after = pad(rawAfter, width, height);
  const diff = new PNG({ width, height });
  const changed = pixelmatch(before.data, after.data, diff.data, width, height, { threshold: 0.1, alpha: 0.35 });
  const gap = 24;
  const sheet = new PNG({ width: width * 3 + gap * 2, height });
  sheet.data.fill(255);
  PNG.bitblt(before, sheet, 0, 0, width, height, 0, 0);
  PNG.bitblt(after, sheet, 0, 0, width, height, width + gap, 0);
  PNG.bitblt(diff, sheet, 0, 0, width, height, (width + gap) * 2, 0);
  writeFileSync(`${out}/${name}`, PNG.sync.write(sheet));
  rows.push({ name, changed: (changed / (width * height)) * 100, note: rawBefore.height !== rawAfter.height ? 'different heights' : '' });
}

const table = [
  '| Screen | Pixels changed | Note |',
  '| --- | ---: | --- |',
  ...rows.map(r => `| ${r.name.replace(/\.png$/, '')} | ${r.changed === null ? '-' : r.changed.toFixed(2) + '%'} | ${r.note} |`),
].join('\n');
const report = `## Visual comparison: main (before) vs this branch (after)\n\nGalaxy A17 viewport 412×915 at 2.625×, fixed clock, placeholder images replaced by grey in both.\nSide-by-side images (before | after | changed pixels in red) are in the \`visual-comparison\` artifact.\n\n${table}\n`;
writeFileSync(`${out}/summary.md`, report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
console.log(report);
