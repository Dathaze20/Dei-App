#!/usr/bin/env node
// Compares visual-output/before/ with every other run folder (after, after-googlefonts). For each
// screen it writes visual-output/compare-<run>/<name>.png (before | run | differences in red) and
// a Markdown report of changed pixels, where they are, and which computed CSS properties differ.
// It reports; it does not fail the build: a person reviews the images.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = process.argv[2] ?? 'visual-output';

const load = file => PNG.sync.read(readFileSync(file));
/** Copies `img` onto a white canvas of the given size, so screenshots of different heights line up. */
const pad = (img, width, height) => {
  const canvas = new PNG({ width, height });
  canvas.data.fill(255);
  PNG.bitblt(img, canvas, 0, 0, img.width, img.height, 0, 0);
  return canvas;
};

/** Summarises which computed CSS properties differ between the two runs, over all elements. */
const styleDiff = (beforeFile, afterFile) => {
  if (!existsSync(beforeFile) || !existsSync(afterFile)) return null;
  const before = JSON.parse(readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(readFileSync(afterFile, 'utf8'));
  const counts = {};
  const examples = {};
  let onlyOneSide = 0;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!before[key] || !after[key]) {
      onlyOneSide++;
      continue;
    }
    for (const [prop, value] of Object.entries(before[key])) {
      if (after[key][prop] !== value) {
        counts[prop] = (counts[prop] ?? 0) + 1;
        examples[prop] ??= `${value} → ${after[key][prop]}`;
      }
    }
  }
  const props = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { onlyOneSide, props: props.map(([prop, n]) => `${prop} ×${n} (e.g. ${examples[prop].slice(0, 80)})`) };
};

const compareRun = (label) => {
const names = readdirSync(`${root}/${label}`).filter(f => f.endsWith('.png')).sort();
const out = `${root}/compare-${label}`;
mkdirSync(out, { recursive: true });
const rows = [];
const styleNotes = [];
for (const name of names) {
  const beforeFile = `${root}/before/${name}`;
  const styles = styleDiff(beforeFile.replace(/\.png$/, '.styles.json'), `${root}/${label}/${name.replace(/\.png$/, '.styles.json')}`);
  if (styles) {
    styleNotes.push(
      `- **${name.replace(/\.png$/, '')}**: ${styles.props.length ? styles.props.join('; ') : 'no computed-style differences'}` +
        (styles.onlyOneSide ? ` (${styles.onlyOneSide} elements exist on one side only)` : ''),
    );
  }
  if (!existsSync(beforeFile)) {
    rows.push({ name, changed: null, note: 'no before screenshot' });
    continue;
  }
  const rawBefore = load(beforeFile);
  const rawAfter = load(`${root}/${label}/${name}`);
  const width = Math.max(rawBefore.width, rawAfter.width);
  const height = Math.max(rawBefore.height, rawAfter.height);
  const before = pad(rawBefore, width, height);
  const after = pad(rawAfter, width, height);
  const diff = new PNG({ width, height });
  const changed = pixelmatch(before.data, after.data, diff.data, width, height, { threshold: 0.1, alpha: 0.35, diffColor: [255, 0, 0] });
  // Where the changes are: the CSS-pixel row bands (gaps under 8 px merged) containing changed pixels.
  const scale = Number(process.env.VISUAL_SCALE ?? 2.625);
  const changedRows = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) {
        changedRows.push(y);
        break;
      }
    }
  }
  const bands = [];
  for (const y of changedRows) {
    const css = Math.floor(y / scale);
    const last = bands[bands.length - 1];
    if (last && css - last[1] <= 8) last[1] = css;
    else bands.push([css, css]);
  }
  const where = bands.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
  const gap = 24;
  const sheet = new PNG({ width: width * 3 + gap * 2, height });
  sheet.data.fill(255);
  PNG.bitblt(before, sheet, 0, 0, width, height, 0, 0);
  PNG.bitblt(after, sheet, 0, 0, width, height, width + gap, 0);
  PNG.bitblt(diff, sheet, 0, 0, width, height, (width + gap) * 2, 0);
  writeFileSync(`${out}/${name}`, PNG.sync.write(sheet));
  rows.push({ name, changed: (changed / (width * height)) * 100, note: [rawBefore.height !== rawAfter.height ? 'different heights' : '', where ? `changed at y ${where} px` : ''].filter(Boolean).join('; ') });
}

const table = [
  '| Screen | Pixels changed | Note |',
  '| --- | ---: | --- |',
  ...rows.map(r => `| ${r.name.replace(/\.png$/, '')} | ${r.changed === null ? '-' : r.changed.toFixed(2) + '%'} | ${r.note} |`),
].join('\n');
return `### main (before) vs \`${label}\`\n\n${table}\n\nComputed CSS properties that differ (count of elements):\n\n${styleNotes.join('\n')}\n`;
};

const labels = readdirSync(root).filter(d => d !== 'before' && !d.startsWith('compare') && existsSync(`${root}/${d}`) && readdirSync(`${root}/${d}`).some(f => f.endsWith('.png'))).sort();
const report = `## Visual comparison with main\n\nGalaxy A17 viewport 412×915 at 2.625×, fixed date, placeholder images replaced by grey in all runs. "y" ranges are CSS pixels from the top of the 915 px screen. \`after\` is this branch; \`after-googlefonts\` is this branch with Inter loaded from Google Fonts as main does, to separate font-file differences from CSS differences.\nSide-by-side images (before | after | changed pixels in red) are in the \`visual-comparison\` artifact.\n\n${labels.map(compareRun).join('\n')}`;
mkdirSync(`${root}/compare`, { recursive: true });
writeFileSync(`${root}/compare/summary.md`, report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
console.log(report);
