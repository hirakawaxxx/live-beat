import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR } from '../scripts/sw-revision.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const OG_PNG = join(PUBLIC_DIR, 'og.png');
const SITE_ORIGIN = 'https://beat.app.hirakawaxxx.com';

const indexHtml = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');

const readPngSize = (path) => {
  const bytes = readFileSync(path);
  assert.ok(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), `${path} is not a PNG`);
  return {
    width: bytes.readUInt32BE(IHDR_WIDTH_OFFSET),
    height: bytes.readUInt32BE(IHDR_HEIGHT_OFFSET),
  };
};

const metaContent = (html, attr, key) => {
  const pattern = new RegExp(
    `<meta\\s+${attr}="${key}"\\s+content="([^"]*)"\\s*/?>`,
    'i',
  );
  const match = html.match(pattern);
  return match?.[1] ?? null;
};

describe('Open Graph image', () => {
  test('public/og.png exists at 1200×630', () => {
    assert.ok(existsSync(OG_PNG), 'missing public/og.png — run `node ../design-kit/bin/design-kit.mjs og`');
    const { width, height } = readPngSize(OG_PNG);
    assert.deepEqual([width, height], [1200, 630]);
  });
});

describe('Open Graph / Twitter meta in index.html', () => {
  const required = [
    ['property', 'og:type', 'website'],
    ['property', 'og:url', `${SITE_ORIGIN}/`],
    ['property', 'og:title', 'live-beat'],
    ['property', 'og:description', 'パッドをタップしてループを重ねるだけ。ブラウザでビートをつくって録音できます。'],
    ['property', 'og:image', `${SITE_ORIGIN}/og.png`],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:locale', 'ja_JP'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', 'live-beat'],
    ['name', 'twitter:description', 'パッドをタップしてループを重ねるだけ。ブラウザでビートをつくって録音できます。'],
    ['name', 'twitter:image', `${SITE_ORIGIN}/og.png`],
  ];

  for (const [attr, key, expected] of required) {
    test(`${attr} ${key}`, () => {
      assert.equal(metaContent(indexHtml, attr, key), expected);
    });
  }

  test('og:image and twitter:image are absolute https URLs', () => {
    for (const key of ['og:image', 'twitter:image']) {
      const attr = key.startsWith('og:') ? 'property' : 'name';
      const value = metaContent(indexHtml, attr, key);
      assert.match(value, /^https:\/\//);
      assert.ok(URL.canParse(value), `${key} is not a valid URL`);
    }
  });
});
