// Adds (or replaces, by id) the CC-BY catalog packs in public/packs/catalog.json:
//   colorosse-{anvil-62,prism-52,rust-108,timber-84} and oga-ofdn-{140,130}.
// Colorosse packs repeat one kit as six kit slugs (A-F) per side, like the CC0 Colorosse packs.
// OFDN packs cycle their full-mix loops over the 24 pads (every pad is part "chords").
// Run after the fetch scripts, then run scripts/index-kits.mjs:  node scripts/add-ccby-packs.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { OFDN_LOOPS } from './fetch-ofdn.mjs';

const PADS_PER_SIDE = 24;
const VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F'];
const catalogPath = fileURLToPath(new URL('../public/packs/catalog.json', import.meta.url));

const COLOROSSE_LICENSE = 'Colorosse (Oğuzhan Girgin) / CC-BY-4.0';
const OFDN_LICENSE = 'Of Far Different Nature / CC-BY-4.0';

// part -> { file: stem file stored in the kit folder, label: what the stem really is }
const colorosseKits = [
  { name: 'Anvil', bpm: 62, parts: { drums: ['drums', 'drums'], bass: ['bass', 'bass'], chords: ['chords', 'chords'], percussion: ['percussion', 'lead'] } },
  { name: 'Prism', bpm: 52, parts: { drums: ['drums', 'texture'], bass: ['bass', 'bass'], chords: ['chords', 'chords'], percussion: ['percussion', 'bells'] } },
  { name: 'Rust', bpm: 108, parts: { drums: ['drums', 'drums'], bass: ['bass', 'bass'], chords: ['chords', 'chords'], percussion: ['percussion', 'lead'] } },
  // Timber has no drums stem: the drums slot plays the bass stem (same file as bass).
  { name: 'Timber', bpm: 84, parts: { drums: ['bass', 'bass (drums slot)'], bass: ['bass', 'bass'], chords: ['chords', 'chords'], percussion: ['percussion', 'lead'] } },
];
const PART_ORDER = ['drums', 'bass', 'chords', 'percussion'];

const sidePads = (side, padSpec) =>
  Array.from({ length: PADS_PER_SIDE }, (_, i) => ({ id: `${side}-${i}`, ...padSpec(i) }));

function colorossePack({ name, bpm, parts }) {
  const slug = name.toLowerCase();
  const folder = `${slug}-kit`;
  const padSpec = (i) => {
    const variant = VARIANTS[Math.floor(i / 4)];
    const part = PART_ORDER[i % 4];
    const [file, stemLabel] = parts[part];
    return {
      label: `${name} ${variant} ${stemLabel}`,
      part,
      kitSlug: variant === 'A' ? folder : `${folder}-${variant.toLowerCase()}`,
      src: `/packs/colorosse/${bpm}/${folder}/${file}.wav`,
    };
  };
  return {
    id: `colorosse-${slug}-${bpm}`,
    title: `Colorosse ${name} ${bpm}`,
    bpm,
    license: COLOROSSE_LICENSE,
    sides: { A: sidePads('A', padSpec), B: sidePads('B', padSpec) },
  };
}

function ofdnPack(bpm, loops) {
  const padSpec = (i) => {
    const loop = loops[i % loops.length];
    return {
      label: `OFDN ${loop.title}`,
      part: 'chords',
      kitSlug: `${loop.slug}-kit`,
      src: `/packs/oga-ofdn/${bpm}/${loop.slug}-kit/chords.wav`,
    };
  };
  return {
    id: `oga-ofdn-${bpm}`,
    title: `OFDN Loop Box ${bpm}`,
    bpm,
    license: OFDN_LICENSE,
    sides: { A: sidePads('A', padSpec), B: sidePads('B', padSpec) },
  };
}

export function ccByPacks() {
  const ofdnBpms = [...new Set(OFDN_LOOPS.map((l) => l.bpm))];
  // Only BPMs with at least two loops get a pack; a lone loop stays a remap-only sound (index-kits).
  const ofdn = ofdnBpms
    .map((bpm) => [bpm, OFDN_LOOPS.filter((l) => l.bpm === bpm)])
    .filter(([, loops]) => loops.length >= 2)
    .map(([bpm, loops]) => ofdnPack(bpm, loops));
  return [...colorosseKits.map(colorossePack), ...ofdn];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const added = ccByPacks();
  const ids = new Set(added.map((p) => p.id));
  const packs = [...catalog.packs.filter((p) => !ids.has(p.id)), ...added];
  await writeFile(catalogPath, `${JSON.stringify({ ...catalog, packs }, null, 2)}\n`);
  console.log(`catalog packs: ${packs.map((p) => p.id).join(', ')}`);
}
