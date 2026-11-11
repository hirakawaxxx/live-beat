import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FONT_FACES,
  GLYPHS_PATH,
  OUTPUT_DIR,
  PUBLIC_DIR,
  extractGlyphs,
} from '../scripts/build-fonts.mjs';

const WOFF2_SIGNATURE = 'wOF2';
const REBUILD_HINT = 'run `node scripts/build-fonts.mjs`';

const readPublic = (file) => readFileSync(join(PUBLIC_DIR, file), 'utf8');
const fontsCss = readPublic('fonts.css');
const tokensCss = readPublic('tokens.css');

const fontFaceBlocks = [...fontsCss.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => body);
const declaration = (block, property) => block.match(new RegExp(`${property}\\s*:\\s*([^;]+);`))?.[1].trim();

describe('extractGlyphs', () => {
  const withPublicDir = (files, check) => {
    const dir = mkdtempSync(join(tmpdir(), 'glyphs-'));
    try {
      for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(dir, name), text);
      }
      check(extractGlyphs(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test('collects HTML and JS text, CSS content values, and printable ASCII', () => {
    withPublicDir({
      'a.html': '<p>再生</p>',
      'b.js': "const message = '停止中';",
      'c.css': '.x::after { content: "→"; color: 雨; }',
      'd.png': '画',
    }, (glyphs) => {
      for (const character of ['再', '生', '停', '止', '中', '→', ' ', '%', '~', '0']) {
        assert.ok(glyphs.includes(character), `missing ${character}`);
      }
      assert.ok(!glyphs.includes('雨'), 'CSS outside content should be ignored');
      assert.ok(!glyphs.includes('画'), 'non-text files should be ignored');
    });
  });

  test('returns sorted unique characters without control characters', () => {
    withPublicDir({ 'a.html': 'ba\n\tab' }, (glyphs) => {
      const characters = [...glyphs];
      assert.equal(new Set(characters).size, characters.length);
      assert.deepEqual(characters, [...characters].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)));
      assert.ok(!/[\n\t]/.test(glyphs));
    });
  });
});

describe('subset fonts', () => {
  test(`glyph list matches the text in public/ (${REBUILD_HINT})`, () => {
    assert.ok(existsSync(GLYPHS_PATH), `missing ${GLYPHS_PATH}: ${REBUILD_HINT}`);
    const stored = readFileSync(GLYPHS_PATH, 'utf8');
    const current = extractGlyphs();
    const added = [...current].filter((character) => !stored.includes(character)).join('');
    assert.equal(stored, current, `glyph list is stale (new: "${added}"): ${REBUILD_HINT}`);
  });

  for (const face of FONT_FACES) {
    test(`${face.output} is a WOFF2 file`, () => {
      const path = join(OUTPUT_DIR, face.output);
      assert.ok(existsSync(path), `missing ${path}: ${REBUILD_HINT}`);
      assert.equal(readFileSync(path).subarray(0, WOFF2_SIGNATURE.length).toString('latin1'), WOFF2_SIGNATURE);
    });
  }

  test('ships the OFL license next to the fonts', () => {
    assert.match(readFileSync(join(OUTPUT_DIR, 'OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  });
});

describe('fonts.css', () => {
  test('declares one @font-face per built weight', () => {
    const declared = fontFaceBlocks.map((block) => ({
      family: declaration(block, 'font-family'),
      weight: Number(declaration(block, 'font-weight')),
      display: declaration(block, 'font-display'),
      src: declaration(block, 'src'),
    }));
    assert.deepEqual(declared, FONT_FACES.map((face) => ({
      family: '"Zen Maru Gothic"',
      weight: face.weight,
      display: 'swap',
      src: `url("fonts/${face.output}") format("woff2")`,
    })));
  });

  test('tokens only use weights that have an @font-face', () => {
    const built = new Set(FONT_FACES.map((face) => face.weight));
    const used = [...tokensCss.matchAll(/--font-weight-[\w-]+:\s*(\d+);/g)].map(([, weight]) => Number(weight));
    assert.ok(used.length > 0);
    assert.deepEqual(used.filter((weight) => !built.has(weight)), []);
    assert.doesNotMatch(tokensCss, /--font-(?:display|title|heading|body|label|caption):\s*\d/);
  });

  test('tokens put Zen Maru Gothic first', () => {
    assert.match(tokensCss, /--font-sans:\s*"Zen Maru Gothic",/);
  });
});

describe('HTML font loading', () => {
  for (const page of ['index.html', 'play.html', 'credits.html']) {
    test(`${page} preloads the body weight and loads fonts.css before tokens.css`, () => {
      const html = readPublic(page);
      assert.match(html, /<link rel="preload" href="[^"]*zen-maru-gothic-500\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
      const fontsAt = html.search(/href="[^"]*fonts\.css"/);
      const tokensAt = html.search(/href="[^"]*tokens\.css"/);
      assert.ok(fontsAt >= 0 && fontsAt < tokensAt);
    });
  }
});
