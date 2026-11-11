import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const credits = read('public/credits.html');
const index = read('public/index.html');
const notices = read('THIRD_PARTY_NOTICES.md');
const sw = read('public/sw.js');

describe('credits', () => {
  test('credits page and notices name the SoundFont, its license and authors', () => {
    for (const [name, doc] of [['credits', credits], ['notices', notices]]) {
      assert.ok(doc.includes('MuseScore_General'), `${name}: missing SoundFont name`);
      assert.match(doc, /MIT/, `${name}: missing license`);
      assert.ok(doc.includes('Frank Wen'), `${name}: missing author`);
    }
    assert.ok(credits.includes('Zen Maru Gothic'));
  });

  test('no fetched-loop sources are credited any more', () => {
    for (const doc of [credits, notices, index]) {
      assert.doesNotMatch(doc, /Pulse Open Loops|CueHarbor|Colorosse|Of Far Different Nature|CC BY/);
    }
  });

  test('library footer links to /credits', () => {
    assert.match(index, /<a href="\/credits">/);
  });

  test('credits page is static (no scripts, no inline handlers or styles) and links back', () => {
    assert.doesNotMatch(credits, /<script/i);
    assert.doesNotMatch(credits, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(credits, /style\s*=/i);
    assert.match(credits, /href="\/"/);
  });

  test('every external link on the credits page uses rel="noopener noreferrer"', () => {
    const externals = credits.match(/<a [^>]*href="https?:[^>]*>/g) ?? [];
    assert.ok(externals.length > 0);
    for (const tag of externals) assert.match(tag, /rel="noopener noreferrer"/, tag);
  });

  test('credits page is precached', () => {
    assert.match(sw, /'\/credits',/);
  });
});
