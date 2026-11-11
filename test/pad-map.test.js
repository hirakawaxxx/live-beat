import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  buildSoundIndex,
  effectivePads,
  emptyOverrides,
  loadOverrides,
  normalizeOverrides,
  saveOverrides,
  soundsForPad,
  withOverride,
  withoutOverride,
} from '../public/js/pad-map.js';
import { readFileSync } from 'node:fs';
import { PADS_PER_SIDE, assertCatalog } from '../public/js/pack-schema.js';

const pad = (id, part, src, label = id) => ({ id, label, part, kitSlug: 'kit', src });
const makePack = (id, bpm, prefix) => ({
  id,
  title: id,
  bpm,
  license: 'CC0',
  sides: {
    A: [pad('A-0', 'bass', `${prefix}/a0.wav`, 'a0'), pad('A-1', 'drums', `${prefix}/a1.wav`, 'a1')],
    B: [pad('B-0', 'chords', `${prefix}/b0.wav`, 'b0')],
  },
});

const p120 = makePack('p120', 120, '/p/120');
const c120 = makePack('c120', 120, '/c/120');
const p96 = makePack('p96', 96, '/p/96');
const dup = { ...makePack('dup', 120, '/p/120'), sides: { A: [pad('A-0', 'drums', '/p/120/a1.wav')], B: [] } };
const catalog = { packs: [p120, p96, c120, dup] };

class MemoryStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, value);
  }
}

describe('buildSoundIndex', () => {
  test('keeps only loops from packs rendered at the requested tempo', () => {
    const srcs = buildSoundIndex(catalog, 120).map((s) => s.src);
    assert.ok(srcs.includes('/c/120/a0.wav'));
    assert.ok(srcs.includes('/p/120/b0.wav'));
    assert.ok(srcs.every((src) => !src.includes('/96/')));
    assert.deepEqual(buildSoundIndex(catalog, 96).map((s) => s.src).sort(), ['/p/96/a0.wav', '/p/96/a1.wav', '/p/96/b0.wav']);
    assert.deepEqual(buildSoundIndex(catalog, 77), []);
  });
  test('dedupes by src', () => {
    const srcs = buildSoundIndex(catalog, 120).map((s) => s.src);
    assert.equal(new Set(srcs).size, srcs.length);
    assert.equal(srcs.length, 6);
  });
  test('groups by part order, drums first', () => {
    const parts = buildSoundIndex(catalog, 120).map((s) => s.part);
    assert.deepEqual(parts, ['drums', 'drums', 'bass', 'bass', 'chords', 'chords']);
  });
  test('returns only sound fields', () => {
    assert.deepEqual(Object.keys(buildSoundIndex(catalog, 120)[0]).sort(), ['kitSlug', 'label', 'part', 'src']);
  });
});

describe('overrides', () => {
  const index = buildSoundIndex(catalog, 120);
  const target = index.find((s) => s.src === '/c/120/b0.wav');

  test('effectivePads applies an override without mutating the pack', () => {
    const next = withOverride(emptyOverrides(), 'A', p120.sides.A[0], target);
    const pads = effectivePads(p120, next, 'A');
    assert.equal(pads[0].src, target.src);
    assert.equal(pads[0].part, 'chords');
    assert.equal(pads[0].id, 'A-0');
    assert.equal(pads[1].src, '/p/120/a1.wav');
    assert.equal(p120.sides.A[0].src, '/p/120/a0.wav');
    assert.deepEqual(effectivePads(p120, next, 'B').map((p) => p.src), ['/p/120/b0.wav']);
  });
  test('withOverride is immutable and picking the default clears the override', () => {
    const base = emptyOverrides();
    const next = withOverride(base, 'A', p120.sides.A[0], target);
    assert.deepEqual(base, { A: {}, B: {} });
    const back = withOverride(next, 'A', p120.sides.A[0], index.find((s) => s.src === '/p/120/a0.wav'));
    assert.deepEqual(back.A, {});
  });
  test('withoutOverride resets one pad only', () => {
    let next = withOverride(emptyOverrides(), 'A', p120.sides.A[0], target);
    next = withOverride(next, 'A', p120.sides.A[1], target);
    const reset = withoutOverride(next, 'A', 'A-0');
    assert.deepEqual(Object.keys(reset.A), ['A-1']);
    assert.deepEqual(Object.keys(next.A), ['A-0', 'A-1']);
  });
  test('normalizeOverrides drops unknown pads, unknown srcs, other parts and non-objects', () => {
    const raw = {
      A: {
        'A-0': { src: target.src }, // chords sound on a bass pad
        'A-9': { src: target.src },
        'A-1': { src: '/evil/unknown.wav' },
      },
      B: { 'B-0': { src: target.src, label: 'tampered', part: 'bass', kitSlug: 'x' } },
    };
    const result = normalizeOverrides(raw, p120, index);
    assert.deepEqual(result.A, {});
    assert.deepEqual(result.B, { 'B-0': target });
    assert.deepEqual(normalizeOverrides({ A: {}, B: 'nope' }, p120, index), emptyOverrides());
    assert.deepEqual(normalizeOverrides(null, p120, index), emptyOverrides());
  });
  test('soundsForPad offers only sounds of the pad\'s own part', () => {
    const offered = soundsForPad(index, p120.sides.A[1]);
    assert.ok(offered.length > 0);
    assert.ok(offered.every((s) => s.part === 'drums'));
  });
});

describe('storage', () => {
  const index = buildSoundIndex(catalog, 120);
  const target = index.find((s) => s.src === '/c/120/b0.wav');

  test('save then load round-trips per pack and keeps other packs', () => {
    const storage = new MemoryStorage();
    const overrides = withOverride(emptyOverrides(), 'B', p120.sides.B[0], target);
    assert.equal(saveOverrides(storage, 'p120', overrides), true);
    assert.equal(saveOverrides(storage, 'other', withOverride(emptyOverrides(), 'A', p120.sides.A[0], target)), true);
    assert.deepEqual(loadOverrides(storage, p120, index).B['B-0'], target);
    assert.ok('other' in JSON.parse(storage.getItem(STORAGE_KEY)));
  });
  test('saving empty overrides removes the pack entry', () => {
    const storage = new MemoryStorage();
    saveOverrides(storage, 'p120', withOverride(emptyOverrides(), 'A', p120.sides.A[0], target));
    saveOverrides(storage, 'p120', emptyOverrides());
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), {});
  });
  test('corrupt JSON and missing storage fall back to defaults', () => {
    assert.deepEqual(loadOverrides(new MemoryStorage({ [STORAGE_KEY]: '{oops' }), p120, index), emptyOverrides());
    assert.deepEqual(loadOverrides(null, p120, index), emptyOverrides());
    assert.equal(saveOverrides(null, 'p120', emptyOverrides()), false);
  });
  test('setItem failure returns false', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    assert.equal(saveOverrides(storage, 'p120', withOverride(emptyOverrides(), 'A', p120.sides.A[0], target)), false);
  });
});

describe('24-pad packs (shipped catalog)', () => {
  const shipped = assertCatalog(JSON.parse(readFileSync(new URL('../public/packs/catalog.json', import.meta.url), 'utf8')));
  const pack = shipped.packs.find((p) => p.id === 'lofi-c');
  const index = buildSoundIndex(shipped, pack.bpm);

  test('effectivePads yields 24 pads per side with ids 0..23', () => {
    for (const side of ['A', 'B']) {
      const pads = effectivePads(pack, emptyOverrides(), side);
      assert.deepEqual(pads.map((p) => p.id), Array.from({ length: PADS_PER_SIDE }, (_, i) => `${side}-${i}`));
    }
  });

  test('the picker index holds only this pack\'s 48 loops (other packs are in other tempos and keys)', () => {
    assert.equal(index.length, 48);
    assert.ok(index.every((s) => s.src.startsWith(`/packs/originals/${pack.bpm}/`)));
  });

  test('stored overrides apply to pads of the same part and survive a reload', () => {
    const other = (i) => index.find((s) => s.src !== pack.sides.A[i].src && s.part === pack.sides.A[i].part);
    const storage = new MemoryStorage({
      [STORAGE_KEY]: JSON.stringify({ [pack.id]: { A: { 'A-0': { src: other(0).src }, 'A-11': { src: other(11).src } }, B: {} } }),
    });
    const overrides = loadOverrides(storage, pack, index);
    assert.deepEqual(Object.keys(overrides.A).sort(), ['A-0', 'A-11']);
    const pads = effectivePads(pack, overrides, 'A');
    assert.equal(pads[0].src, other(0).src);
    assert.equal(pads[11].src, other(11).src);
    for (let i = 12; i < PADS_PER_SIDE; i += 1) assert.equal(pads[i].src, pack.sides.A[i].src);
  });

  test('overrides can target the last pad', () => {
    const target = index.find((s) => s.src !== pack.sides.A[23].src && s.part === pack.sides.A[23].part);
    const next = withOverride(emptyOverrides(), 'A', pack.sides.A[23], target);
    assert.equal(effectivePads(pack, next, 'A')[23].src, target.src);
    assert.deepEqual(loadOverrides(new MemoryStorage({ [STORAGE_KEY]: JSON.stringify({ [pack.id]: next }) }), pack, index).A['A-23'], target);
  });
});
