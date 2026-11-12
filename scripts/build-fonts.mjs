// Subsets Zen Maru Gothic to the characters the app displays and writes public/fonts/*.woff2.
// Run: node scripts/build-fonts.mjs   (needs uv; test/fonts.test.js fails until this is run after text changes)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = join(ROOT_DIR, 'public');
export const SOURCE_DIR = join(ROOT_DIR, 'design', 'fonts');
export const OUTPUT_DIR = join(PUBLIC_DIR, 'fonts');
export const GLYPHS_PATH = join(SOURCE_DIR, 'glyphs.txt');

const SOURCE_BASE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/';
const LICENSE_FILE = 'OFL.txt';

// Zen Maru Gothic ships 300/400/500/700/900; only the weights the tokens use are built.
export const FONT_FACES = [
  { weight: 500, source: 'ZenMaruGothic-Medium.ttf', output: 'zen-maru-gothic-500.woff2' },
  { weight: 700, source: 'ZenMaruGothic-Bold.ttf', output: 'zen-maru-gothic-700.woff2' },
];

const FIRST_PRINTABLE_ASCII = 0x20;
const LAST_PRINTABLE_ASCII = 0x7e;
const WHOLE_TEXT_EXTENSIONS = new Set(['.html', '.js', '.json']);
// Text drawn with the app font outside public/ (share cards rendered by build-og.mjs and build-instagram.mjs).
const EXTRA_SOURCES = [join(ROOT_DIR, 'design', 'og', 'og.html')];
const CSS_CONTENT_PATTERN = /\bcontent\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/g;
const NON_PRINTING_PATTERN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

const textOf = (path) => {
  const extension = extname(path);
  if (WHOLE_TEXT_EXTENSIONS.has(extension)) {
    return readFileSync(path, 'utf8');
  }
  if (extension === '.css') {
    return [...readFileSync(path, 'utf8').matchAll(CSS_CONTENT_PATTERN)].map(([, , value]) => value).join('');
  }
  return '';
};

const printableAscii = () =>
  Array.from({ length: LAST_PRINTABLE_ASCII - FIRST_PRINTABLE_ASCII + 1 }, (_, index) =>
    String.fromCodePoint(FIRST_PRINTABLE_ASCII + index));

// Every character in public/ HTML, JS and JSON (including message strings and pad labels), CSS
// `content` values, the extra sources, and printable ASCII, so digits and symbols rendered at
// runtime are covered.
export function extractGlyphs(publicDir = PUBLIC_DIR, extraSources = publicDir === PUBLIC_DIR ? EXTRA_SOURCES : []) {
  const text = [...listFiles(publicDir), ...extraSources].map(textOf).join('');
  const characters = new Set([...printableAscii(), ...text]);
  return [...characters]
    .filter((character) => !NON_PRINTING_PATTERN.test(character))
    .sort((a, b) => a.codePointAt(0) - b.codePointAt(0))
    .join('');
}

async function download(file, destination) {
  const response = await fetch(new URL(file, SOURCE_BASE_URL));
  if (!response.ok) {
    throw new Error(`Download failed for ${file}: ${response.status}`);
  }
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  process.stdout.write(`downloaded ${file}\n`);
}

async function ensureSource(file) {
  const path = join(SOURCE_DIR, file);
  if (!existsSync(path)) {
    await download(file, path);
  }
  return path;
}

function subset(sourcePath, outputPath) {
  execFileSync('uv', [
    'run', '--with', 'fonttools', '--with', 'brotli', 'pyftsubset', sourcePath,
    `--text-file=${GLYPHS_PATH}`,
    '--flavor=woff2',
    '--layout-features=*',
    '--name-IDs=*',
    `--output-file=${outputPath}`,
  ], { stdio: 'inherit' });
}

async function main() {
  mkdirSync(SOURCE_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const glyphs = extractGlyphs();
  writeFileSync(GLYPHS_PATH, glyphs);
  for (const face of FONT_FACES) {
    const outputPath = join(OUTPUT_DIR, face.output);
    subset(await ensureSource(face.source), outputPath);
    process.stdout.write(`wrote ${outputPath} (${readFileSync(outputPath).length} bytes)\n`);
  }
  writeFileSync(join(OUTPUT_DIR, LICENSE_FILE), readFileSync(await ensureSource(LICENSE_FILE)));
  process.stdout.write(`${[...glyphs].length} glyphs\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
