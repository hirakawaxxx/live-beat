// Renders design/og/og.html to public/og.png (1200×630) with Chrome Headless Shell.
// Run: node scripts/build-og.mjs   (set CHROME_PATH to use another Chrome binary)
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './build-icons.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_DIR = join(ROOT, 'design', 'og');
const OUTPUT = join(ROOT, 'public', 'og.png');
const WIDTH = 1200;
const HEIGHT = 630;
const FONT_WAIT_MS = 3000;

function captureOg(chrome, url, output) {
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
  const source = pathToFileURL(join(DESIGN_DIR, 'og.html')).href;
  captureOg(chrome, source, OUTPUT);
  process.stdout.write(`wrote public/og.png (${WIDTH}×${HEIGHT})\n`);

}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
