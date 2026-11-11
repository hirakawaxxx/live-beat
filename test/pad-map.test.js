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
  withOverride,
  withoutOverride,
} from '../public/js/pad-map.js';

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
  test('keeps only same-BPM loops from every pack', () => {
    const srcs = buildSoundIndex(catalog, 120).map((s) => s.src);
    assert.ok(srcs.includes('/c/120/a0.wav'));
    assert.ok(srcs.includes('/p/120/b0.wav'));
    assert.ok(srcs.every((src) => !src.includes('/96/')));
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
  test('returns only sound fields and no match for unknown BPM', () => {
    assert.deepEqual(Object.keys(buildSoundIndex(catalog, 96)[0]).sort(), ['kitSlug', 'label', 'part', 'src']);
    assert.deepEqual(buildSoundIndex(catalog, 77), []);
  });
});

describe('buildSoundIndex with catalog.sounds', () => {
  const sound = (src, part, bpm) => ({ src, label: src, part, kitSlug: 'extra', bpm });
  const withExtra = {
    ...catalog,
    sounds: [
      sound('/x/120/z.wav', 'percussion', 120),
      sound('/x/96/y.wav', 'drums', 96),
      sound('/p/120/a1.wav', 'drums', 120), // already used by a pad
    ],
  };
  test('adds same-BPM on-disk sounds not already in a pack, dropping bpm', () => {
    const index = buildSoundIndex(withExtra, 120);
    assert.equal(index.length, 7);
    const extra = index.find((s) => s.src === '/x/120/z.wav');
    assert.deepEqual(Object.keys(extra).sort(), ['kitSlug', 'label', 'part', 'src']);
    assert.ok(!index.some((s) => s.src === '/x/96/y.wav'));
  });
  test('dedupes against pack pads and keeps part order', () => {
    const srcs = buildSoundIndex(withExtra, 120).map((s) => s.src);
    assert.equal(new Set(srcs).size, srcs.length);
    assert.equal(buildSoundIndex(withExtra, 120).at(-1).part, 'percussion');
  });
  test('a catalog without sounds behaves as before', () => {
    assert.equal(buildSoundIndex(catalog, 120).length, 6);
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
  test('normalizeOverrides drops unknown pads, unknown srcs and non-objects', () => {
    const raw = {
      A: {
        'A-0': { src: target.src, label: 'tampered', part: 'bass', kitSlug: 'x' },
        'A-9': { src: target.src },
        'A-1': { src: '/evil/other-bpm.wav' },
      },
      B: 'nope',
    };
    const result = normalizeOverrides(raw, p120, index);
    assert.deepEqual(result.A, { 'A-0': target });
    assert.deepEqual(result.B, {});
    assert.deepEqual(normalizeOverrides(null, p120, index), emptyOverrides());
  });
});

describe('storage', () => {
  const index = buildSoundIndex(catalog, 120);
  const target = index.find((s) => s.src === '/c/120/b0.wav');

  test('save then load round-trips per pack and keeps other packs', () => {
    const storage = new MemoryStorage();
    const overrides = withOverride(emptyOverrides(), 'B', p120.sides.B[0], index[0]);
    assert.equal(saveOverrides(storage, 'p120', overrides), true);
    assert.equal(saveOverrides(storage, 'other', withOverride(emptyOverrides(), 'A', p120.sides.A[0], target)), true);
    assert.deepEqual(loadOverrides(storage, p120, index).B['B-0'], index[0]);
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
