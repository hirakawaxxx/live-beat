// Downloads "LOOP BOX #1" by Of Far Different Nature (OpenGameArt, CC-BY 4.0), converts a subset of the
// OGG loops to 16-bit WAV with ffmpeg and lays them out as
// public/packs/oga-ofdn/{bpm}/{slug}-kit/chords.wav (full-mix loops use the "chords" part).
// The ZIP carries no BPM metadata. Each BPM below is derived from the loop length: the length is a
// whole number of beats at that BPM (e.g. 6.857143 s = 16 beats at 140), which is what the engine needs.
// Loops with no clean fit or no same-BPM pack (Dream Factory, Evil Trap, Ganxta, Sheherazade, ...) are skipped.
// Page: https://opengameart.org/content/loop-box-1-beats-for-rpg-platformers-visual-novels-adventure-puzzle-games-simulators-menu
// Run: node scripts/fetch-ofdn.mjs   (needs ffmpeg and unzip)
import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OFDN_LOOPS = [
  { title: 'Just Do It', slug: 'just-do-it', bpm: 140, beats: 16 },
  { title: 'Nature Loop', slug: 'nature-loop', bpm: 140, beats: 16 },
  { title: 'Friendly Trap', slug: 'friendly-trap', bpm: 140, beats: 96 },
  { title: 'Timed', slug: 'timed', bpm: 140, beats: 72 },
  { title: '8-Bit Hero Quest', slug: 'hero-quest', bpm: 130, beats: 64 },
  { title: 'Act and Contemplate', slug: 'act-and-contemplate', bpm: 130, beats: 64 },
  { title: 'Choppin', slug: 'choppin', bpm: 128, beats: 16 },
];

const ZIP_URL = 'https://opengameart.org/sites/default/files/of_far_different_nature_-_loop_box_1_cc-by_-_ogg_files.zip';
const PAGE_URL = 'https://opengameart.org/content/loop-box-1-beats-for-rpg-platformers-visual-novels-adventure-puzzle-games-simulators-menu';
const LICENSE_TEXT = `LOOP BOX #1 — Of Far Different Nature
======================================

License: Creative Commons Attribution 4.0 (CC-BY-4.0)
Full terms: https://creativecommons.org/licenses/by/4.0/legalcode

ATTRIBUTION REQUIRED (text requested by the author on OpenGameArt):

  Music by Of Far Different Nature (https://fardifferent.carrd.co/)

Source: ${PAGE_URL}

Changes made: the OGG loops were converted to 16-bit PCM WAV (no other
processing). Only a subset of the 15 tracks is included.
`;

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (path) => access(path).then(() => true, () => false);

async function download(url, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 && res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(2000 * (i + 1));
  }
  throw new Error(`${url}: retries exhausted`);
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} failed`);
};

const destOf = ({ bpm, slug }) => join(root, 'public', 'packs', 'oga-ofdn', String(bpm), `${slug}-kit`, 'chords.wav');

async function main() {
  const missing = [];
  for (const loop of OFDN_LOOPS) if (!(await exists(destOf(loop)))) missing.push(loop);
  const licenseDir = join(root, 'public', 'packs', 'licenses');
  await mkdir(licenseDir, { recursive: true });
  await writeFile(join(licenseDir, 'oga-ofdn-loop-box-1.txt'), LICENSE_TEXT);
  if (missing.length === 0) return console.log('OFDN loops ready');

  const tmp = await mkdtemp(join(tmpdir(), 'ofdn-'));
  try {
    const zipPath = join(tmp, 'box.zip');
    await writeFile(zipPath, await download(ZIP_URL));
    run('unzip', ['-o', '-q', zipPath, '-d', join(tmp, 'x')]);
    for (const loop of missing) {
      const src = join(tmp, 'x', `Of Far Different Nature - ${loop.title} (CC-BY).ogg`);
      const dest = destOf(loop);
      await mkdir(join(dest, '..'), { recursive: true });
      run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', dest]);
      console.log(`converted ${loop.title} (${loop.bpm} BPM)`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  console.log('OFDN loops ready');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
