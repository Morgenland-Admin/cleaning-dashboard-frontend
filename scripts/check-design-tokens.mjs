#!/usr/bin/env node
/**
 * Design-token guard.
 *
 * The audit that introduced this found 241 one-off `text-[Npx]` classes across
 * 37 files and ~50 raw Tailwind palette colours sitting next to the semantic
 * tokens that were meant to replace them. Both are the kind of drift that never
 * arrives in one reviewable diff — it arrives one hurried line at a time — so it
 * is checked mechanically instead of by eye.
 *
 * Run: `pnpm run check:tokens` (part of `pnpm run check`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Walk `dir` for .ts/.tsx, repo-relative. `fs.globSync` would need Node 22. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(relative(process.cwd(), full));
  }
  return out;
}

const RULES = [
  {
    id: 'arbitrary-font-size',
    // `text-[13px]`, `text-[0.8125rem]` — the scale lives in tailwind.config.js.
    pattern: /\btext-\[[\d.]+(px|rem|em)\]/g,
    message:
      'Arbitrary font size. Use the scale: text-3xs/2xs/xs/2sm/sm/base/… (tailwind.config.js).',
  },
  {
    id: 'raw-palette-colour',
    pattern:
      /\b(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|shadow|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    message:
      'Raw Tailwind palette colour. Use a semantic token: success/warning/info/destructive/rust/muted/…',
  },
  {
    id: 'hsl-literal',
    pattern: /\[hsl\(/g,
    message:
      'Hard-coded hsl() literal. Add a CSS variable in index.css and a Tailwind colour for it.',
  },
];

// Deliberate, documented exceptions. Keep this list short and always say why.
const ALLOW = [
  {
    file: 'src/pages/blog-detail.tsx',
    rule: 'raw-palette-colour',
    why: 'SERP preview deliberately mimics Google result colours, not our palette.',
  },
  {
    file: 'src/pages/blog-detail.tsx',
    rule: 'arbitrary-font-size',
    why: 'same SERP preview',
  },
  {
    file: 'src/contexts/project-context.tsx',
    rule: 'raw-palette-colour',
    why: 'Brand identity gradients. Categorical colour whose whole job is to be distinguishable per company, so it is deliberately outside the warm palette. This file is the single source — do not restate a gradient elsewhere.',
  },
  {
    file: 'src/pages/orders.tsx',
    rule: 'raw-palette-colour',
    why: 'STATUS_ACCENT: an 11-step ramp across the order pipeline. A progression, not a success/warning semantic, and already one map rather than scattered classes.',
  },
];

const files = sourceFiles(join(process.cwd(), 'src')).sort();
let failures = 0;

for (const rel of files) {
  const source = readFileSync(join(process.cwd(), rel), 'utf8');
  const lines = source.split('\n');

  for (const rule of RULES) {
    if (ALLOW.some((a) => a.file === rel && a.rule === rule.id)) continue;

    lines.forEach((line, i) => {
      for (const match of line.matchAll(rule.pattern)) {
        failures += 1;
        console.error(`${rel}:${i + 1}  ${match[0]}\n    ${rule.message}`);
      }
    });
  }
}

if (failures > 0) {
  console.error(`\n✖ ${failures} design-token violation${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}

console.log(`✓ design tokens clean (${files.length} files)`);
