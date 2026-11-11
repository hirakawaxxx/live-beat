// Downloads CueHarbor loops (CC0-1.0 / Public Domain melodic) from Hugging Face and
// lays them out as public/packs/cueharbor/{bpm}/{kit}/{part}.wav.
// Source: https://huggingface.co/datasets/cueharbor/sound-library/resolve/main/{path}
// Kits that reuse a loop copy the already-downloaded file (see KITS below).
// Run: node scripts/fetch-cueharbor.mjs
import { mkdir, writeFile, copyFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://huggingface.co/datasets/cueharbor/sound-library/resolve/main/';
const PARTS = ['drums', 'bass', 'chords', 'percussion'];

// Each entry is either a source path under the dataset, or `{ copy: 'kit/part' }`.
const PACKS = {
  90: {
    'rock-kit': {
      drums: 'loops/drums/rock-beat_90bpm.wav',
      bass: 'loops/drums/arcade-game-drum-loop-14_90bpm.wav',
      chords: 'loops/melodic/felt-piano-arpeggio_d-min_90bpm.wav',
      // No 90 BPM percussion loop exists; reuse a drum loop.
      percussion: { copy: 'rock-kit/drums' },
    },
    'arcade-kit': {
      drums: { copy: 'rock-kit/bass' },
      bass: { copy: 'rock-kit/drums' },
      chords: { copy: 'rock-kit/chords' },
      percussion: { copy: 'rock-kit/bass' },
    },
    'keys-kit': {
      drums: { copy: 'rock-kit/drums' },
      bass: { copy: 'rock-kit/bass' },
      chords: { copy: 'rock-kit/chords' },
      percussion: { copy: 'rock-kit/chords' },
    },
  },
  96: {
    'shuffle-kit': {
      drums: 'loops/drums/shuffle_96bpm.wav',
      // No 96 BPM bass loop exists (lofi 95 BPM skipped); reuse the shuffle drums.
      bass: { copy: 'shuffle-kit/drums' },
      chords: 'loops/melodic/nylon-guitar-arpeggio_e-min_96bpm.wav',
      percussion: 'loops/percussion/cajon-groove_96bpm.wav',
    },
    'cajon-kit': {
      drums: { copy: 'shuffle-kit/percussion' },
      bass: { copy: 'shuffle-kit/drums' },
      chords: { copy: 'shuffle-kit/chords' },
      percussion: { copy: 'shuffle-kit/percussion' },
    },
    'nylon-kit': {
      drums: { copy: 'shuffle-kit/drums' },
      bass: { copy: 'shuffle-kit/percussion' },
      chords: { copy: 'shuffle-kit/chords' },
      percussion: { copy: 'shuffle-kit/chords' },
    },
  },
  120: {
    'rock-kit': {
      drums: 'loops/drums/rock-beat_120bpm.wav',
      bass: 'loops/drums/kick-snare_120bpm.wav',
      chords: 'loops/melodic/felt-piano-arpeggio_g-maj_120bpm.wav',
      percussion: 'loops/percussion/cowbell-groove_120bpm.wav',
    },
    'top-kit': {
      drums: 'loops/drums/hats-only_120bpm.wav',
      bass: 'loops/drums/rock-fill_120bpm.wav',
      chords: { copy: 'rock-kit/chords' },
      percussion: { copy: 'rock-kit/percussion' },
    },
    'arcade-kit': {
      drums: 'loops/drums/arcade-game-drum-loop-11_120bpm.wav',
      bass: 'loops/drums/arcade-game-drum-loop-12_120bpm.wav',
      chords: { copy: 'rock-kit/chords' },
      percussion: { copy: 'rock-kit/percussion' },
    },
  },
  100: {
    'funk-kit': {
      drums: 'loops/drums/funk-groove_100bpm.wav',
      bass: 'loops/drums/tom-groove_100bpm.wav',
      chords: 'loops/melodic/nylon-guitar-strum_d-maj_100bpm.wav',
      percussion: 'loops/percussion/shaker-16ths_100bpm.wav',
    },
    'latin-kit': {
      drums: 'loops/percussion/conga-tumbao_100bpm.wav',
      bass: 'loops/percussion/darbuka-maqsum_100bpm.wav',
      chords: { copy: 'funk-kit/chords' },
      percussion: { copy: 'funk-kit/percussion' },
    },
    'groove-kit': {
      drums: { copy: 'funk-kit/drums' },
      bass: { copy: 'latin-kit/drums' },
      chords: { copy: 'funk-kit/chords' },
      percussion: { copy: 'latin-kit/bass' },
    },
  },
};

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

// Hugging Face rate-limits (429); back off and retry, honouring Retry-After.
async function fetchWithRetry(url, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 && res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
    const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * (i + 1);
    await sleep(wait);
  }
  throw new Error(`${url}: gave up after ${attempts} attempts`);
}

async function main() {
  for (const [bpm, kits] of Object.entries(PACKS)) {
    const packDir = join(root, 'public', 'packs', 'cueharbor', bpm);
    // Downloads first so copies always find their source.
    for (const pass of ['download', 'copy']) {
      for (const [kit, parts] of Object.entries(kits)) {
        for (const part of PARTS) {
          const spec = parts[part];
          const dest = join(packDir, kit, `${part}.wav`);
          const isCopy = typeof spec !== 'string';
          if ((pass === 'copy') !== isCopy) continue;
          await mkdir(dirname(dest), { recursive: true });
          if (await exists(dest)) continue;
          if (isCopy) {
            await copyFile(join(packDir, `${spec.copy.split('/')[0]}`, `${spec.copy.split('/')[1]}.wav`), dest);
          } else {
            await writeFile(dest, await fetchWithRetry(BASE + spec));
          }
          console.log(`${bpm}/${kit}/${part}.wav`);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
