// Scans public/packs/**/{bpm}/{kit}/{part}.wav and writes catalog.json "sounds": every on-disk loop
// that no pack pad uses, so same-BPM remap can offer it. The pack/pad layout stays hand-authored.
// Folder layout: public/packs/{bpm}/{kit}/ and public/packs/{vendor}/{bpm}/{kit}/ (vendor = cueharbor, colorosse, ...)
// Run: node scripts/index-kits.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARTS = ['drums', 'bass', 'chords', 'percussion'];
const packsDir = fileURLToPath(new URL('../public/packs/', import.meta.url));
const catalogPath = join(packsDir, 'catalog.json');

const subdirs = async (dir) =>
  (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();

const isBpm = (name) => /^\d+$/.test(name);
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

export async function scanKits() {
  const found = [];
  for (const top of await subdirs(packsDir)) {
    // `{bpm}` directly under packs/, or `{vendor}/{bpm}`.
    const bpmDirs = isBpm(top)
      ? [[top, join(packsDir, top)]]
      : (await subdirs(join(packsDir, top))).filter(isBpm).map((b) => [b, join(packsDir, top, b)]);
    const prefix = isBpm(top) ? '' : `${top}/`;
    for (const [bpm, bpmDir] of bpmDirs) {
      for (const kit of await subdirs(bpmDir)) {
        const files = new Set(await readdir(join(bpmDir, kit)));
        for (const part of PARTS) {
          if (!files.has(`${part}.wav`)) continue;
          found.push({
            src: `/packs/${prefix}${bpm}/${kit}/${part}.wav`,
            label: `${capitalize(kit.split('-')[0])} ${part}`,
            part,
            kitSlug: kit,
            bpm: Number(bpm),
          });
        }
      }
    }
  }
  return found;
}

export function unusedSounds(catalog, scanned) {
  const used = new Set(catalog.packs.flatMap((p) => [...p.sides.A, ...p.sides.B].map((pad) => pad.src)));
  const packBpms = new Set(catalog.packs.map((p) => p.bpm));
  return scanned.filter((s) => !used.has(s.src) && packBpms.has(s.bpm));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const sounds = unusedSounds(catalog, await scanKits());
  await writeFile(catalogPath, `${JSON.stringify({ ...catalog, sounds }, null, 2)}\n`);
  console.log(`indexed ${sounds.length} on-disk sounds`);
}
