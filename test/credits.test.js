import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const credits = read('public/credits.html');
const index = read('public/index.html');
const notices = read('THIRD_PARTY_NOTICES.md');
const sw = read('public/sw.js');

const COLOROSSE = [
  ['Anvil — Crypt Loop', 'anvil-music-loop'],
  ['Prism — Void Loop', 'prism-music-loop'],
  ['Rust — Neon Loop', 'rust-music-loop'],
  ['Timber — Hearth Loop', 'timber-music-loop'],
];
const OFDN_PAGE = 'https://opengameart.org/content/loop-box-1-beats-for-rpg-platformers-visual-novels-adventure-puzzle-games-simulators-menu';

describe('CC-BY attribution', () => {
  test('credits page and notices name every Colorosse loop, author and page URL', () => {
    for (const [title, slug] of COLOROSSE) {
      const url = `https://www.colorosse.com/assets/audio/music/${slug}`;
      for (const [name, doc] of [['credits', credits], ['notices', notices]]) {
        assert.ok(doc.includes(title), `${name}: missing ${title}`);
        assert.ok(doc.includes(url), `${name}: missing ${url}`);
        assert.ok(doc.includes('Oğuzhan Girgin'), `${name}: missing author`);
      }
    }
  });

  test('credits page and notices carry the OFDN attribution line and OGA page', () => {
    for (const doc of [credits, notices]) {
      assert.ok(doc.includes('Music by Of Far Different Nature'));
      assert.ok(doc.includes('https://fardifferent.carrd.co/'));
      assert.ok(doc.includes(OFDN_PAGE));
    }
  });

  test('credits page lists the CC0 sources too', () => {
    for (const name of ['Pulse Open Loops', 'CueHarbor Sound Library', 'Colorosse', 'Zen Maru Gothic']) {
      assert.ok(credits.includes(name), `missing ${name}`);
    }
  });

  test('library footer mentions CC BY and links to /credits', () => {
    assert.match(index, /CC BY 4\.0/);
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
