// Downloads Colorosse music-loop ZIPs (CC0: arcade, vellum; CC-BY-4.0: anvil, prism, rust, timber)
// and lays out the stems as public/packs/colorosse/{bpm}/{kit}/{part}.wav.
// stem-lead.wav is stored as percussion.wav (the catalog part set has no "lead").
// Per-loop STEMS override the default mapping: Prism has no drums/lead (texture -> drums,
// bells -> percussion); Timber has no drums, so only bass/chords/percussion(lead) are stored and
// the catalog points its drums slot at bass.wav (see scripts/add-ccby-packs.mjs).
// ZIP URL: https://cdn.colorosse.com/downloads/{name}-music-loop/{name}-music-loop.zip
// Each kit LICENSE goes to public/packs/licenses/colorosse-{name}-{bpm}.txt.
// Run: node scripts/fetch-colorosse.mjs
import { mkdir, writeFile, access, mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// catalog part -> stem file in the ZIP
const DEFAULT_STEMS = { drums: 'stem-drums', bass: 'stem-bass', chords: 'stem-chords', percussion: 'stem-lead' };
const LOOPS = [
  { name: 'arcade', bpm: 152, kit: 'arcade-kit' },
  { name: 'vellum', bpm: 128, kit: 'vellum-kit' },
  { name: 'anvil', bpm: 62, kit: 'anvil-kit' },
  { name: 'prism', bpm: 52, kit: 'prism-kit', stems: { ...DEFAULT_STEMS, drums: 'stem-texture', percussion: 'stem-bells' } },
  { name: 'rust', bpm: 108, kit: 'rust-kit' },
  { name: 'timber', bpm: 84, kit: 'timber-kit', stems: { bass: 'stem-bass', chords: 'stem-chords', percussion: 'stem-lead' } },
];

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

async function fetchWithRetry(url, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 && res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep((Number(res.headers.get('retry-after')) || 2 * (i + 1)) * 1000);
  }
  throw new Error(`${url}: retries exhausted`);
}

async function fetchLoop({ name, bpm, kit, stems = DEFAULT_STEMS }) {
  const dir = join(root, 'public', 'packs', 'colorosse', String(bpm), kit);
  const licenseDir = join(root, 'public', 'packs', 'licenses');
  const dests = Object.keys(stems).map((part) => join(dir, `${part}.wav`));
  if ((await Promise.all(dests.map(exists))).every(Boolean)) return;

  const url = `https://cdn.colorosse.com/downloads/${name}-music-loop/${name}-music-loop.zip`;
  const tmp = await mkdtemp(join(tmpdir(), `colorosse-${name}-`));
  try {
    const zipPath = join(tmp, 'loop.zip');
    const extractDir = join(tmp, 'x');
    await writeFile(zipPath, await fetchWithRetry(url));
    const unzip = spawnSync('unzip', ['-o', '-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
    if (unzip.status !== 0) throw new Error(`unzip failed for ${name}`);

    const files = await listFiles(extractDir);
    await mkdir(dir, { recursive: true });
    await mkdir(licenseDir, { recursive: true });
    for (const [part, stem] of Object.entries(stems)) {
      const found = files.find((f) => f.includes('/wav/') && basename(f).toLowerCase() === `${stem}.wav`);
      if (!found) throw new Error(`${stem}.wav not found in ${name} ZIP`);
      await copyFile(found, join(dir, `${part}.wav`));
    }
    const license = files.find((f) => basename(f).toLowerCase() === 'license.txt');
    if (license) await copyFile(license, join(licenseDir, `colorosse-${name}-${bpm}.txt`));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  console.log(`fetched colorosse ${name} (${bpm} BPM)`);
}

for (const loop of LOOPS) {
  await fetchLoop(loop);
}
console.log('Colorosse loops ready');
