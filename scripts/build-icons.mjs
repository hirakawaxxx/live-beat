// Renders design/icon/icon.html to public/icons/*.png with Chrome Headless Shell and copies the favicon.
// Run: node scripts/build-icons.mjs   (set CHROME_PATH to use another Chrome binary)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DESIGN_DIR = join(ROOT, 'design', 'icon');
const ICONS_DIR = join(ROOT, 'public', 'icons');
const FAVICON_PATH = join(ROOT, 'public', 'favicon.svg');
const PLAYWRIGHT_CACHE = join(homedir(), 'Library', 'Caches', 'ms-playwright');
const SUPERSAMPLE = 4;

const TARGETS = Object.freeze([
  { output: 'apple-touch-icon.png', size: 180, variant: 'any' },
  { output: 'icon-192.png', size: 192, variant: 'any' },
  { output: 'icon-512.png', size: 512, variant: 'any' },
  { output: 'icon-maskable-512.png', size: 512, variant: 'maskable' },
]);

export function findChrome() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  const candidates = existsSync(PLAYWRIGHT_CACHE)
    ? readdirSync(PLAYWRIGHT_CACHE)
      .filter((name) => name.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse()
      .flatMap((name) => readdirSync(join(PLAYWRIGHT_CACHE, name))
        .map((platform) => join(PLAYWRIGHT_CACHE, name, platform, 'chrome-headless-shell')))
    : [];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error('Chrome Headless Shell not found. Run `pnpm dlx playwright install chromium` or set CHROME_PATH.');
  }
  return found;
}

export function screenshot(chrome, url, [width, height], output) {
  execFileSync(chrome, [
    '--headless',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=eeede9ff',
    '--allow-file-access-from-files',
    `--window-size=${width},${height}`,
    `--screenshot=${output}`,
    url,
  ], { stdio: 'ignore' });
}

// Draws at SUPERSAMPLE x the target size, then lets Chrome downscale the bitmap for smoother edges.
export function renderIcon(chrome, { variant, size, output }) {
  const workDir = mkdtempSync(join(tmpdir(), 'live-beat-icon-'));
  try {
    const large = join(workDir, 'large.png');
    const largeSize = size * SUPERSAMPLE;
    const source = pathToFileURL(join(DESIGN_DIR, 'icon.html'));
    source.search = new URLSearchParams({ variant, size: String(largeSize), target: String(size) }).toString();
    screenshot(chrome, source.href, [largeSize, largeSize], large);
    const page = join(workDir, 'downscale.html');
    writeFileSync(page, `<!doctype html><body style="margin:0"><img src="${pathToFileURL(large).href}" `
      + `width="${size}" height="${size}" style="display:block"></body>`);
    screenshot(chrome, pathToFileURL(page).href, [size, size], output);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function main() {
  const chrome = findChrome();
  for (const target of TARGETS) {
    renderIcon(chrome, { ...target, output: join(ICONS_DIR, target.output) });
    process.stdout.write(`wrote public/icons/${target.output} (${target.size}px)\n`);
  }
  copyFileSync(join(DESIGN_DIR, 'favicon.svg'), FAVICON_PATH);
  process.stdout.write('wrote public/favicon.svg\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
