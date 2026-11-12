// Renders design/instagram/instagram.html to public/instagram.png (1080×1080) with Chrome Headless Shell.
// Run: node scripts/build-instagram.mjs   (set CHROME_PATH to use another Chrome binary)
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './build-icons.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_DIR = join(ROOT, 'design', 'instagram');
const OUTPUT = join(ROOT, 'public', 'instagram.png');
const WIDTH = 1080;
const HEIGHT = 1080;
const FONT_WAIT_MS = 3000;

function captureInstagram(chrome, url, output) {
  execFileSync(chrome, [
    '--headless',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=eeede9ff',
    '--allow-file-access-from-files',
    `--virtual-time-budget=${FONT_WAIT_MS}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${output}`,
    url,
  ], { stdio: 'ignore' });
}

function main() {
  const chrome = findChrome();
  const source = pathToFileURL(join(DESIGN_DIR, 'instagram.html')).href;
  captureInstagram(chrome, source, OUTPUT);
  process.stdout.write(`wrote public/instagram.png (${WIDTH}×${HEIGHT})\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
