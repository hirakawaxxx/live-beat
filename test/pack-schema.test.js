import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { assertCatalog } from '../public/js/pack-schema.js';

const PARTS = ['drums', 'bass', 'chords', 'percussion'];

const minimalPad = (i, side) => ({
  id: `${side}-${i}`,
  label: `Pad ${i}`,
  part: PARTS[i % 4],
  kitSlug: 'copper-step',
  src: `/packs/120/copper-step/drums.wav`,
});

const pads = (side) => Array.from({ length: 12 }, (_, i) => minimalPad(i, side));

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

  test('rejects a side that is not 12 pads', () => {
    assert.throws(() => assertCatalog({
      packs: [{
        id: 'x', title: 'x', bpm: 120, license: 'CC0',
        sides: { A: [minimalPad(0, 'A')], B: Array.from({ length: 12 }, (_, i) => minimalPad(i, 'B')) },
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

  test('validates and lists pulse and CueHarbor packs', () => {
    const parsed = assertCatalog(catalog);
    assert.deepEqual(
      parsed.packs.map((p) => p.id).sort(),
      ['cueharbor-100', 'cueharbor-120', 'cueharbor-90', 'cueharbor-96', 'pulse-120', 'pulse-140', 'pulse-96'],
    );
    for (const pack of parsed.packs) {
      assert.equal(pack.sides.A.length, 12);
      assert.equal(pack.sides.B.length, 12);
    }
  });

  test('pulse packs follow kit assignment, part order and src convention', () => {
    const kits = { A: ['copper-step', 'ember-weave', 'glass-orbit'], B: ['ion-bloom', 'rust-arc', 'velvet-grid'] };
    for (const pack of assertCatalog(catalog).packs.filter((p) => p.id.startsWith('pulse-'))) {
      for (const side of ['A', 'B']) {
        pack.sides[side].forEach((pad, i) => {
          assert.equal(pad.kitSlug, kits[side][Math.floor(i / 4)]);
          assert.equal(pad.part, PARTS[i % 4]);
          assert.equal(pad.src, `/packs/${pack.bpm}/${pad.kitSlug}/${pad.part}.wav`);
          assert.equal(pad.id, `${side}-${i}`);
        });
      }
    }
  });

  test('CueHarbor packs use three kits per side and the cueharbor src convention', () => {
    const expected = {
      'cueharbor-120': ['rock-kit', 'top-kit', 'arcade-kit'],
      'cueharbor-100': ['funk-kit', 'latin-kit', 'groove-kit'],
      'cueharbor-90': ['rock-kit', 'arcade-kit', 'keys-kit'],
      'cueharbor-96': ['shuffle-kit', 'cajon-kit', 'nylon-kit'],
    };
    const packs = assertCatalog(catalog).packs.filter((p) => p.id.startsWith('cueharbor-'));
    assert.equal(packs.length, 4);
    for (const pack of packs) {
      for (const side of ['A', 'B']) {
        pack.sides[side].forEach((pad, i) => {
          assert.equal(pad.kitSlug, expected[pack.id][Math.floor(i / 4)]);
          assert.equal(pad.part, PARTS[i % 4]);
          assert.equal(pad.src, `/packs/cueharbor/${pack.bpm}/${pad.kitSlug}/${pad.part}.wav`);
          assert.equal(pad.id, `${side}-${i}`);
        });
      }
    }
  });

  test('every catalog src exists on disk', () => {
    for (const pack of assertCatalog(catalog).packs) {
      for (const pad of [...pack.sides.A, ...pack.sides.B]) {
        assert.ok(existsSync(publicFile(pad.src)), `${pack.id} ${pad.id}: missing ${pad.src}`);
      }
    }
  });
});
