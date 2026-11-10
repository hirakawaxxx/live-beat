// Rewrites PRECACHE_REVISION in public/sw.js from the contents of the precached files.
// Run: node scripts/sw-revision.mjs   (test/pwa.test.js fails until this is run after a precached file changes)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const SW_PATH = join(PUBLIC_DIR, 'sw.js');

const REVISION_LENGTH = 12;
const REVISION_PATTERN = /const PRECACHE_REVISION = '([0-9a-f]+)';/;
const PRECACHE_PATTERN = /const PRECACHE_URLS = \[([\s\S]*?)\];/;
const STRING_PATTERN = /'([^']+)'/g;

export function readPrecacheUrls(swSource) {
  const match = swSource.match(PRECACHE_PATTERN);
  if (!match) {
    throw new Error('PRECACHE_URLS array not found in sw.js');
  }
  return [...match[1].matchAll(STRING_PATTERN)].map(([, url]) => url);
}

export function readRevision(swSource) {
  const match = swSource.match(REVISION_PATTERN);
  if (!match) {
    throw new Error('PRECACHE_REVISION not found in sw.js');
  }
  return match[1];
}

export function urlToFile(url) {
  // The asset host serves "/" as index.html and "/play" as play.html (no redirect).
  const lastSegment = url.split('/').pop();
  const pathname = url.endsWith('/')
    ? `${url}index.html`
    : lastSegment.includes('.') ? url : `${url}.html`;
  return join(PUBLIC_DIR, ...pathname.split('/').filter(Boolean));
}

export function computeRevision(urls) {
  const hash = createHash('sha256');
  for (const url of urls) {
    hash.update(url);
    hash.update(readFileSync(urlToFile(url)));
  }
  return hash.digest('hex').slice(0, REVISION_LENGTH);
}

function main() {
  const source = readFileSync(SW_PATH, 'utf8');
  const revision = computeRevision(readPrecacheUrls(source));
  if (revision === readRevision(source)) {
    process.stdout.write(`PRECACHE_REVISION is up to date (${revision})\n`);
    return;
  }
  writeFileSync(SW_PATH, source.replace(REVISION_PATTERN, `const PRECACHE_REVISION = '${revision}';`));
  process.stdout.write(`PRECACHE_REVISION updated to ${revision}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
