import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR } from '../scripts/sw-revision.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const INSTAGRAM_PNG = join(PUBLIC_DIR, 'instagram.png');

const readPngSize = (path) => {
  const bytes = readFileSync(path);
  assert.ok(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), `${path} is not a PNG`);
  return {
    width: bytes.readUInt32BE(IHDR_WIDTH_OFFSET),
    height: bytes.readUInt32BE(IHDR_HEIGHT_OFFSET),
  };
};

describe('Instagram square post image', () => {
  test('public/instagram.png exists at 1080×1080', () => {
    assert.ok(
      existsSync(INSTAGRAM_PNG),
      'missing public/instagram.png — run `node ../design-kit/bin/design-kit.mjs instagram`',
    );
    const { width, height } = readPngSize(INSTAGRAM_PNG);
    assert.deepEqual([width, height], [1080, 1080]);
  });
});
