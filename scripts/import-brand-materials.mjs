#!/usr/bin/env node
// Imports Kabir's Claude Design print set ("Claude design RGS 2026") into public/brand-materials
// and regenerates src/lib/brand-materials.generated.ts.
// Usage: node scripts/import-brand-materials.mjs <unpacked-project-dir | bundle.json>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/brand-materials');
const GENERATED = path.join(ROOT, 'src/lib/brand-materials.generated.ts');

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/import-brand-materials.mjs <project-dir | bundle.json>');
  process.exit(1);
}

/** Reads a project file from an unpacked dir or a {path: base64} bundle. */
const readSource = (() => {
  if (fs.statSync(src).isDirectory()) {
    return (p) => {
      const f = path.join(src, p);
      return fs.existsSync(f) ? fs.readFileSync(f) : null;
    };
  }
  const bundle = JSON.parse(fs.readFileSync(src, 'utf8'));
  return (p) => (bundle[p] ? Buffer.from(bundle[p], 'base64') : null);
})();

const BRANDS = {
  cleanilo: { dir: '', partnerDir: 'partner/cleanilo/', system: 'CLEANILO Designsystem' },
  htr: { dir: 'htr/', partnerDir: 'partner/htr/', system: 'htr/HTR Designsystem' },
  trl: { dir: 'trl/', partnerDir: 'partner/trl/', system: 'trl/TRL Designsystem' },
};

// [source file, display no, slug, title, format]
const CUSTOMER = [
  ['1 Preisliste A4', '01', 'preisliste-a4', 'Preisliste A4', 'A4'],
  ['2 Flyer A5', '02', 'flyer-a5', 'Flyer A5', 'A5 · 148 × 210 mm'],
  ['3 Visitenkarte', '03', 'visitenkarte', 'Visitenkarte', '85 × 55 mm'],
  ['4 Briefbogen A4', '04', 'briefbogen-a4', 'Briefbogen A4', 'A4'],
  ['5 Angebot Rechnung A4', '05', 'angebot-rechnung', 'Angebot / Rechnung', 'A4'],
  ['6 E-Mail-Signatur', '06', 'e-mail-signatur', 'E-Mail-Signatur', 'HTML'],
  ['7 Tuerhaenger', '07', 'tuerhaenger', 'Türhänger', '105 × 297 mm'],
  ['8 Fahrzeugschild', '08', 'fahrzeugschild', 'Fahrzeugschild', '60 × 40 cm'],
  ['9 Roll-up', '09', 'roll-up', 'Roll-up', '85 × 200 cm'],
  ['10 Bewertungskaertchen', '10', 'bewertungskaertchen', 'Bewertungs-Kärtchen', '85 × 55 mm'],
  ['11 Gutschein A6', '11', 'gutschein-a6', 'Gutschein A6', 'A6 · 148 × 105 mm'],
  ['12 Social Templates', '12', 'social-templates', 'Social-Templates', '1080 × 1080 / 1920 px'],
  ['14 Wartungsvertrag A4', '13', 'wartungsvertrag-a4', 'Wartungsvertrag / Pflege-Abo A4', 'A4'],
];
const TRL_CUSTOMER_OVERRIDE = {
  '1 Preisliste A4': [
    '1 Leistungsuebersicht A4',
    '01',
    'leistungsuebersicht-a4',
    'Leistungs-/Wertübersicht',
    'A4',
  ],
};

const PARTNER = [
  ['0 Co-Branding', '00', 'co-branding', 'Co-Branding', 'Richtlinie'],
  ['1 Partner-Akquise A4', '01', 'partner-akquise-a4', 'Partner-Akquise A4', 'A4'],
  [
    '2 Annahmestellen-Akquise A5',
    '02',
    'annahmestellen-akquise-a5',
    'Annahmestellen-Akquise A5',
    'A5',
  ],
  ['3 Onboarding A4', '03', 'onboarding-a4', 'Onboarding A4', 'A4'],
  ['4 Fensteraufkleber', '04', 'fensteraufkleber', 'Fensteraufkleber', 'Ø 120 mm / 200 × 100 mm'],
  ['5 Theken-Aufsteller', '05', 'theken-aufsteller', 'Theken-Aufsteller', 'A5 Faltaufsteller'],
  ['6 Partner-Ausweis', '06', 'partner-ausweis', 'Partner-Ausweis', '85 × 55 mm'],
  ['7 SOP A4', '07', 'sop-a4', 'SOP A4', 'A4'],
  ['8 Konditionen A4', '08', 'konditionen-a4', 'Konditionen A4', 'A4'],
  ['9 Abholbeleg A5', '09', 'abholbeleg-a5', 'Abholbeleg A5', 'A5'],
  ['10 Magnetschild Co-branded', '10', 'magnetschild', 'Magnetschild co-branded', '60 × 40 cm'],
  ['11 Vereinbarung A4', '11', 'vereinbarung-a4', 'Vereinbarung A4', 'A4'],
  ['12 QR-Plakat A4', '12', 'qr-plakat-a4', 'QR-Plakat A4', 'A4'],
  ['13 Provisionsblatt A4', '13', 'provisionsblatt-a4', 'Provisionsblatt A4', 'A4'],
];

// Final print size per template; artboards are matched to these by aspect ratio.
const A4 = '210x297mm';
const PRINT = {
  'preisliste-a4': A4,
  'leistungsuebersicht-a4': A4,
  'flyer-a5': '148x210mm',
  visitenkarte: '85x55mm',
  'briefbogen-a4': A4,
  'angebot-rechnung': A4,
  tuerhaenger: '105x297mm',
  fahrzeugschild: '600x400mm',
  'roll-up': '850x2000mm',
  bewertungskaertchen: '85x55mm',
  'gutschein-a6': '148x105mm',
  'social-templates': '1080x1080px,1080x1920px',
  'wartungsvertrag-a4': A4,
  'partner-akquise-a4': A4,
  'annahmestellen-akquise-a5': '148x210mm',
  'onboarding-a4': A4,
  fensteraufkleber: '120x120mm,200x100mm',
  'partner-ausweis': '85x55mm',
  'sop-a4': A4,
  'konditionen-a4': A4,
  // The slip is shorter than A5: fit to the page width, white below.
  'abholbeleg-a5': '148x210mm:w',
  'theken-aufsteller': '148x210mm',
  magnetschild: '600x400mm',
  'vereinbarung-a4': A4,
  'qr-plakat-a4': A4,
  'provisionsblatt-a4': A4,
};
// Guideline documents: shown as they are, no artboard extraction.
const DOCS = new Set(['co-branding']);

function printSizes(slug) {
  return PRINT[slug]?.split(',').map((spec) => {
    const [, width, height, unit, fit] = spec.match(/^(\d+)x(\d+)(mm|px)(:w)?$/);
    return { width: Number(width), height: Number(height), unit, ...(fit && { fitWidth: true }) };
  });
}

const LOGOS = [
  'cleanilo-logo.svg',
  'cleanilo-logo-white.svg',
  'cleanilo-logo-ink.svg',
  'htr-logo.svg',
  'htr-logo-white.svg',
];

// Fontsource variable packages → plain family names the designs use.
const FONTS = [
  ['urbanist', 'Urbanist'],
  ['cabin', 'Cabin'],
  ['playfair-display', 'Playfair Display'],
  ['inter', 'Inter'],
  ['jetbrains-mono', 'JetBrains Mono'],
  ['lora', 'Lora'],
  ['dm-sans', 'DM Sans'],
];

// HTR as live on hamburg-teppichreinigung.de: DM Sans + Lora and the real wordmark logo.
// The design drew a star emblem + Playfair wordmark that is not the brand's logo.
const HTR_EMBLEM =
  /<svg width="(\d+)" height="\d+" viewBox="0 0 48 48" fill="none"[^>]*>(?:(?!<\/svg>)[\s\S])*?M24 9l3\.5 7\.5(?:(?!<\/svg>)[\s\S])*?<\/svg>/g;
const HTR_WORDMARK = [
  /<div style="display:flex; flex-direction:column;"><span style="[^"]*color:(#[0-9A-Fa-f]{6});">Hamburg<\/span><span [^>]*>Teppichreinigung<\/span><\/div>/,
  /<div style="text-align:center;"><div style="[^"]*color:(#[0-9A-Fa-f]{6});">Hamburg<\/div><div [^>]*>Teppichreinigung<\/div><\/div>/,
  /<span style="[^"]*color:(#[0-9A-Fa-f]{6});">Hamburg Teppichreinigung<\/span>/,
];
const LIGHT_INK = new Set(['#F3DCD2', '#FBF7F2', '#FFFFFF']);

function htrFixes(html, title) {
  const wordmarks = HTR_WORDMARK.map((w) => w.source).join('|');
  const lockup = new RegExp(`${HTR_EMBLEM.source}\\s*(?:${wordmarks})`, 'g');
  let out = html.replace(lockup, (_m, size, ...colors) => {
    const ink = colors.slice(0, HTR_WORDMARK.length).find(Boolean)?.toUpperCase();
    const file = LIGHT_INK.has(ink) ? 'htr-logo-white.svg' : 'htr-logo.svg';
    const height = Math.round(Number(size) * 1.05);
    return `<img src="../../assets/${file}" alt="Hamburg Teppichreinigung" style="display:block; height:${height}px; width:auto;">`;
  });
  // Emblems left without a wordmark are decoration only.
  out = out.replace(HTR_EMBLEM, '');
  out = out
    .replace(/'Playfair Display'/g, "'Lora'")
    .replace(/\bPlayfair Display\b/g, 'Lora')
    .replace(/\bPlayfair\b/g, 'Lora')
    .replace(/'Inter'/g, "'DM Sans'")
    .replace(/\bInter\b/g, 'DM Sans');
  if (/M24 9l3\.5 7\.5|Playfair|'Inter'/.test(out))
    throw new Error(`HTR fix incomplete in ${title}`);
  return out;
}

function write(rel, data) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function previewSize(html) {
  const m = html.match(/data-props="([^"]*)"/);
  if (!m) return { width: 1000, height: 1000 };
  try {
    const props = JSON.parse(m[1].replace(/&quot;/g, '"'));
    return { width: props.$preview?.width ?? 1000, height: props.$preview?.height ?? 1000 };
  } catch {
    return { width: 1000, height: 1000 };
  }
}

// What each QR code on a template is for; the console turns the purpose into a link.
const QR_PURPOSE = {
  bewertungskaertchen: 'review',
  'flyer-a5': { cleanilo: 'booking', htr: 'inquiry', trl: 'inquiry' },
  'gutschein-a6': 'voucher',
  'roll-up': 'booking',
  tuerhaenger: 'booking',
  'abholbeleg-a5': 'order',
  'annahmestellen-akquise-a5': 'partner',
  fensteraufkleber: 'booking',
  'partner-akquise-a4': 'partner',
  'partner-ausweis': 'verify',
  'qr-plakat-a4': 'booking',
  'theken-aufsteller': 'booking',
};
// The designs draw QR codes as fake SVGs that all share these finder squares.
const FAKE_QR =
  /<svg(?=[^>]*viewBox="0 0 100 100")([^>]*)>(?=(?:(?!<\/svg>)[\s\S])*?M0 0h28v28H0V0Z)/g;

function tagQrCodes(html, brand, slug) {
  const entry = QR_PURPOSE[slug];
  const purpose = typeof entry === 'object' ? entry[brand] : entry;
  let count = 0;
  const out = html.replace(FAKE_QR, (_m, attrs) => {
    count += 1;
    return `<svg${attrs} data-rp-qr="${purpose ?? 'website'}">`;
  });
  if (count && !purpose) throw new Error(`no QR purpose for ${slug}`);
  return out;
}

const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 10);
let runtimeVersion = '';

/** Strips the Claude Design editor hooks, swaps Google Fonts for the vendored copies, fixes paths. */
function transform(html, title, brand, mode, slug) {
  let out = tagQrCodes(brand === 'htr' ? htrFixes(html, title) : html, brand, slug)
    .replace(/<style data-omelette-injected>[\s\S]*?<\/style>/g, '')
    .replace(/<script data-omelette-injected>[\s\S]*?<\/script>/g, '')
    .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
    .replace(
      /<link href="https:\/\/fonts\.googleapis\.com[^"]*" rel="stylesheet">/g,
      `<link rel="stylesheet" href="../../fonts/fonts.css?v=${runtimeVersion}">`,
    )
    .replace(
      /<script src="\.\/support\.js"><\/script>/,
      `<script src="../../runtime/support.js?v=${runtimeVersion}"></script>\n` +
        `<script src="../../runtime/sheet.js?v=${runtimeVersion}"></script>`,
    )
    .replace('<html>', mode === 'doc' ? '<html lang="de" data-rp-mode="doc">' : '<html lang="de">')
    .replace(/(src|href)="(?:\.\.\/)*assets\//g, '$1="../../assets/')
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<title>${title}</title>`);
  if (/fonts\.googleapis|omelette-injected/.test(out))
    throw new Error(`unhandled markup in ${title}`);
  return out;
}

fs.rmSync(OUT, { recursive: true, force: true });

const support = readSource('support.js')?.toString('utf8');
if (!support) throw new Error('support.js missing');
// The runtime pulls React 18.3.1 UMD from unpkg; serve the identical files (same SRI) ourselves.
const REACT_UMD = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js': 'react/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js':
    'react-dom/umd/react-dom.production.min.js',
};
let runtime = support;
for (const [url, file] of Object.entries(REACT_UMD)) {
  if (!runtime.includes(url)) throw new Error(`support.js no longer references ${url}`);
  const name = path.basename(file);
  fs.mkdirSync(path.join(OUT, 'runtime'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'node_modules', file), path.join(OUT, 'runtime', name));
  runtime = runtime.replace(url, `/brand-materials/runtime/${name}`);
}
write('runtime/support.js', runtime);
fs.copyFileSync(
  path.join(ROOT, 'scripts/brand-materials-sheet.js'),
  path.join(OUT, 'runtime/sheet.js'),
);

for (const logo of LOGOS) {
  const data = readSource(`assets/${logo}`);
  if (!data) throw new Error(`missing assets/${logo}`);
  write(`assets/${logo}`, data);
}

let css = '';
for (const [pkg, family] of FONTS) {
  const dir = path.join(ROOT, 'node_modules/@fontsource-variable', pkg);
  const sheet = fs.readFileSync(path.join(dir, 'wght.css'), 'utf8');
  for (const block of sheet.match(/\/\* [\w-]+ \*\/\s*@font-face\s*{[^}]*}/g) ?? []) {
    const name = block.match(/\/\* ([\w-]+) \*\//)[1];
    if (name !== `${pkg}-latin-wght-normal` && name !== `${pkg}-latin-ext-wght-normal`) continue;
    const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
    fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
    fs.copyFileSync(path.join(dir, 'files', file), path.join(OUT, 'fonts', file));
    css +=
      block
        .replace(/font-family: '[^']+'/, `font-family: '${family}'`)
        .replace(/url\(\.\/files\//, 'url(./') + '\n';
  }
}
write('fonts/fonts.css', css);
// Template and runtime URLs carry a content hash: a deploy can never be served from a stale cache.
runtimeVersion = hash(
  ['runtime/support.js', 'runtime/sheet.js', 'fonts/fonts.css']
    .map((f) => fs.readFileSync(path.join(OUT, f)))
    .join(''),
);

const items = [];
const systems = {};
for (const [brand, cfg] of Object.entries(BRANDS)) {
  const sets = [
    ['kunden', cfg.dir, CUSTOMER],
    ['partner', cfg.partnerDir, PARTNER],
  ];
  for (const [set, dir, list] of sets) {
    for (const entry of list) {
      const [file, no, slug, title, format] =
        brand === 'trl' && set === 'kunden' ? (TRL_CUSTOMER_OVERRIDE[entry[0]] ?? entry) : entry;
      const raw = readSource(`${dir}${file}.dc.html`);
      if (!raw) throw new Error(`missing ${dir}${file}.dc.html`);
      const html = raw.toString('utf8');
      const rel = `${brand}/${set}/${slug}.html`;
      const page = transform(
        html,
        `${title} · ${brand.toUpperCase()}`,
        brand,
        DOCS.has(slug) ? 'doc' : 'sheet',
        slug,
      );
      write(rel, page);
      const variants = /"docType":\{"editor":"enum"/.test(html.replace(/&quot;/g, '"'))
        ? ['Angebot', 'Rechnung']
        : undefined;
      items.push({
        brand,
        set,
        no,
        slug,
        title,
        format,
        path: rel,
        version: hash(page),
        ...previewSize(html),
        print: printSizes(slug),
        variants,
      });
    }
  }
  const raw = readSource(`${cfg.system}.dc.html`);
  if (!raw) throw new Error(`missing ${cfg.system}`);
  const html = raw.toString('utf8');
  const page = transform(
    html,
    `Designsystem · ${brand.toUpperCase()}`,
    brand,
    'doc',
    'designsystem',
  );
  write(`${brand}/system/designsystem.html`, page);
  systems[brand] = {
    path: `${brand}/system/designsystem.html`,
    version: hash(page),
    ...previewSize(html),
  };
}

const ts = `// GENERATED by scripts/import-brand-materials.mjs — do not edit.
import type { MaterialItem, MaterialBrand, MaterialDoc } from './brand-materials';

export const MATERIAL_ITEMS: MaterialItem[] = ${JSON.stringify(items, null, 2)};

export const MATERIAL_SYSTEMS: Record<MaterialBrand, MaterialDoc> = ${JSON.stringify(systems, null, 2)};
`;
fs.writeFileSync(GENERATED, ts);
execFileSync(path.join(ROOT, 'node_modules/.bin/prettier'), ['--write', GENERATED]);
console.log(`imported ${items.length} materials + ${Object.keys(systems).length} design systems`);
