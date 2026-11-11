// Downloads kit ZIPs from pulse.studiosphere.space and extracts WAVs.
// URL pattern: https://pulse.studiosphere.space/open-loops/kits/{slug}-{bpm}/download
// Each ZIP holds drums/bass/chords/percussion .wav plus LICENSE.txt. WAVs are
// placed in public/packs/{bpm}/{slug}/; the kit LICENSE goes to
// public/packs/licenses/{slug}-{bpm}.txt. The ZIP itself is deleted.
import { mkdir, writeFile, access, mkdtemp, readdir, rename, rm, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const BPM_LIST = [96, 120, 140];
const SLUGS = [
  'copper-step', 'ember-weave', 'glass-orbit',
  'ion-bloom', 'lunar-relay', 'prism-current',
  'rust-arc', 'velvet-grid',
];
const PARTS = ['drums', 'bass', 'chords', 'percussion'];

const root = fileURLToPath(new URL('..', import.meta.url));

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The server rate-limits (429); back off and retry, honouring Retry-After.
async function fetchWithRetry(url, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Failed ${url}: ${res.status}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 5000 * (i + 1);
    console.warn(`${res.status} for ${url}; retrying in ${waitMs}ms`);
    await sleep(waitMs);
  }
  throw new Error(`Failed ${url}: retries exhausted`);
}

async function fetchKit(slug, bpm) {
  const dir = join(root, 'public', 'packs', String(bpm), slug);
  const licenseDir = join(root, 'public', 'packs', 'licenses');
  const missing = [];
  for (const part of PARTS) {
    if (!(await exists(join(dir, `${part}.wav`)))) missing.push(part);
  }
  if (missing.length === 0) return;

  const url = `https://pulse.studiosphere.space/open-loops/kits/${slug}-${bpm}/download`;
  const res = await fetchWithRetry(url);

  const tmp = await mkdtemp(join(tmpdir(), `pulse-${slug}-${bpm}-`));
  try {
    const zipPath = join(tmp, 'kit.zip');
    const extractDir = join(tmp, 'x');
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
    const unzip = spawnSync('unzip', ['-o', '-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
    if (unzip.status !== 0) throw new Error(`unzip failed for ${slug}-${bpm}`);

    const files = await listFiles(extractDir);
    await mkdir(dir, { recursive: true });
    await mkdir(licenseDir, { recursive: true });
    for (const part of PARTS) {
      const found = files.find((f) => basename(f).toLowerCase() === `${part}.wav`);
      if (!found) throw new Error(`${part}.wav not found in ${slug}-${bpm}`);
      await rename(found, join(dir, `${part}.wav`)).catch(async () => {
        await copyFile(found, join(dir, `${part}.wav`));
      });
    }
    const license = files.find((f) => basename(f).toLowerCase() === 'license.txt');
    if (license) await copyFile(license, join(licenseDir, `${slug}-${bpm}.txt`));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  console.log(`fetched ${slug}-${bpm}`);
  await sleep(1500);
}

for (const bpm of BPM_LIST) {
  for (const slug of SLUGS) {
    await fetchKit(slug, bpm);
  }
}
console.log('Pulse kits ready');
