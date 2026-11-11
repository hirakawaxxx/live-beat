import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PADS_PER_SIDE, assertCatalog } from '../public/js/pack-schema.js';

const PARTS = ['drums', 'bass', 'chords', 'percussion'];

const minimalPad = (i, side) => ({
  id: `${side}-${i}`,
  label: `Pad ${i}`,
  part: PARTS[i % 4],
  kitSlug: 'copper-step',
  src: `/packs/120/copper-step/drums.wav`,
});

const pads = (side) => Array.from({ length: PADS_PER_SIDE }, (_, i) => minimalPad(i, side));

const validCatalog = () => ({
  packs: [{
    id: 'pulse-120',
    title: 'Pulse 120',
    bpm: 120,
    license: 'Pulse Open Loops / CC0',
    sides: { A: pads('A'), B: pads('B') },
  }],
});

const withSides = (sides) => ({ packs: [{ ...validCatalog().packs[0], sides }] });

describe('assertCatalog', () => {
  test('accepts a valid catalog shape', () => {
    assert.equal(assertCatalog(validCatalog()).packs.length, 1);
  });

  test('PADS_PER_SIDE is 24 (4 columns x 6 rows)', () => {
    assert.equal(PADS_PER_SIDE, 24);
  });

  test('rejects a legacy 12-pad side', () => {
    const twelve = (side) => Array.from({ length: 12 }, (_, i) => minimalPad(i, side));
    assert.throws(() => assertCatalog(withSides({ A: twelve('A'), B: twelve('B') })), /24 pads/);
  });

  test('rejects a side that is not 24 pads', () => {
    assert.throws(() => assertCatalog({
      packs: [{
        id: 'x', title: 'x', bpm: 120, license: 'CC0',
        sides: { A: [minimalPad(0, 'A')], B: Array.from({ length: PADS_PER_SIDE }, (_, i) => minimalPad(i, 'B')) },
      }],
    }));
  });

  test('rejects non-object input and missing packs', () => {
    assert.throws(() => assertCatalog(null));
    assert.throws(() => assertCatalog({}));
    assert.throws(() => assertCatalog({ packs: [] }));
  });

  test('rejects an unknown part', () => {
    const a = pads('A');
    a[0] = { ...a[0], part: 'vocals' };
    assert.throws(() => assertCatalog(withSides({ A: a, B: pads('B') })));
  });

  test('rejects an empty or non-string src', () => {
    const a = pads('A');
    a[3] = { ...a[3], src: '' };
    assert.throws(() => assertCatalog(withSides({ A: a, B: pads('B') })));
    const b = pads('B');
    b[5] = { ...b[5], src: 42 };
    assert.throws(() => assertCatalog(withSides({ A: pads('A'), B: b })));
  });

  test('rejects duplicate pad ids within a pack (across sides too)', () => {
    const a = pads('A');
    a[1] = { ...a[1], id: a[0].id };
    assert.throws(() => assertCatalog(withSides({ A: a, B: pads('B') })));
    assert.throws(() => assertCatalog(withSides({ A: pads('A'), B: pads('A') })));
  });

  test('rejects invalid pack fields', () => {
    const base = validCatalog().packs[0];
    assert.throws(() => assertCatalog({ packs: [{ ...base, bpm: 0 }] }));
    assert.throws(() => assertCatalog({ packs: [{ ...base, id: '' }] }));
    assert.throws(() => assertCatalog({ packs: [{ ...base, license: '' }] }));
  });
});

describe('shipped catalog.json', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/packs/catalog.json', import.meta.url), 'utf8'));
  const publicFile = (src) => new URL(`../public${src}`, import.meta.url);

  test('lists the four self-made packs, 24 pads per side', () => {
    const parsed = assertCatalog(catalog);
    assert.deepEqual(parsed.packs.map((p) => p.id), ['originals-am', 'hiphop-dm', 'lofi-c', 'dance-fm']);
    assert.deepEqual(Object.keys(catalog), ['packs']);
    for (const pack of parsed.packs) {
      assert.equal(pack.sides.A.length, PADS_PER_SIDE);
      assert.equal(pack.sides.B.length, PADS_PER_SIDE);
    }
  });

  for (const packId of ['originals-am', 'hiphop-dm', 'lofi-c', 'dance-fm']) test(`self-made pack ${packId}: six parts in 2x2 blocks, eight loops each, under its own tempo folder`, () => {
    const parsed = assertCatalog(catalog);
    const pack = parsed.packs.find((p) => p.id === packId);
    assert.equal(pack.layout, 'blocks');
    const pads = [...pack.sides.A, ...pack.sides.B];
    assert.equal(new Set(pads.map((pad) => pad.src)).size, 48);
    const perPart = Object.groupBy(pads, (pad) => pad.part);
    assert.deepEqual(Object.keys(perPart).sort(), ['bass', 'chords', 'drums', 'melody', 'percussion', 'voice']);
    for (const list of Object.values(perPart)) assert.equal(list.length, 8);
    for (const pad of pads) {
      assert.equal(pad.src, `/packs/originals/${pack.bpm}/${pad.kitSlug}/${pad.part}.flac`);
    }
    for (const side of ['A', 'B']) {
      pack.sides[side].forEach((pad, i) => {
        assert.equal(pad.id, `${side}-${i}`);
        const blockFirst = Math.floor(i / 8) * 8 + Math.floor((i % 4) / 2) * 2; // top-left pad of its 2x2 block
        assert.equal(pad.part, pack.sides[side][blockFirst].part, `${pad.id} is not in a single-part block`);
      });
    }
    assert.match(readFileSync(publicFile('/packs/licenses/musescore-general.txt'), 'utf8'), /MIT/);
  });

  test('every catalog src exists on disk', () => {
    for (const pack of assertCatalog(catalog).packs) {
      for (const pad of [...pack.sides.A, ...pack.sides.B]) {
        assert.ok(existsSync(publicFile(pad.src)), `${pack.id} ${pad.id}: missing ${pad.src}`);
      }
    }
  });

  test('ships no audio or license files other than the self-made packs', () => {
    assert.deepEqual(readdirSync(publicFile('/packs')).sort(), ['catalog.json', 'licenses', 'originals']);
    assert.deepEqual(readdirSync(publicFile('/packs/licenses')), ['musescore-general.txt']);
  });
});
