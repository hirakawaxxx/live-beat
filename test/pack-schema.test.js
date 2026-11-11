import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

  test('rejects malformed catalog.sounds', () => {
    const base = validCatalog();
    const ok = { src: '/p/x.wav', label: 'X', part: 'drums', kitSlug: 'k', bpm: 120 };
    assert.doesNotThrow(() => assertCatalog({ ...base, sounds: [ok] }));
    assert.throws(() => assertCatalog({ ...base, sounds: 'nope' }));
    assert.throws(() => assertCatalog({ ...base, sounds: [{ ...ok, part: 'lead' }] }));
    assert.throws(() => assertCatalog({ ...base, sounds: [{ ...ok, bpm: 0 }] }));
    assert.throws(() => assertCatalog({ ...base, sounds: [{ ...ok, src: '' }] }));
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

  test('validates and lists pulse, CueHarbor, Colorosse and CC-BY packs', () => {
    const parsed = assertCatalog(catalog);
    assert.deepEqual(
      parsed.packs.map((p) => p.id).sort(),
      [
        'colorosse-128', 'colorosse-152', 'colorosse-anvil-62', 'colorosse-prism-52', 'colorosse-rust-108',
        'colorosse-timber-84', 'cueharbor-100', 'cueharbor-120', 'cueharbor-90', 'cueharbor-96',
        'oga-ofdn-130', 'oga-ofdn-140', 'pulse-120', 'pulse-140', 'pulse-96',
      ],
    );
    for (const pack of parsed.packs) {
      assert.equal(pack.sides.A.length, PADS_PER_SIDE);
      assert.equal(pack.sides.B.length, PADS_PER_SIDE);
    }
  });

  test('pulse packs: A has six distinct kits, B reuses four of them, same src convention', () => {
    const kits = {
      A: ['copper-step', 'ember-weave', 'glass-orbit', 'ion-bloom', 'lunar-relay', 'prism-current'],
      B: ['rust-arc', 'velvet-grid', 'copper-step', 'ember-weave', 'glass-orbit', 'ion-bloom'],
    };
    for (const pack of assertCatalog(catalog).packs.filter((p) => p.id.startsWith('pulse-'))) {
      for (const side of ['A', 'B']) {
        assert.equal(new Set(pack.sides[side].map((pad) => pad.src)).size, PADS_PER_SIDE);
        pack.sides[side].forEach((pad, i) => {
          assert.equal(pad.kitSlug, kits[side][Math.floor(i / 4)]);
          assert.equal(pad.part, PARTS[i % 4]);
          assert.equal(pad.src, `/packs/${pack.bpm}/${pad.kitSlug}/${pad.part}.wav`);
          assert.equal(pad.id, `${side}-${i}`);
        });
      }
    }
  });

  test('CueHarbor packs repeat three kits twice per side (six kit rows) with the cueharbor src convention', () => {
    const base = {
      'cueharbor-120': ['rock-kit', 'top-kit', 'arcade-kit'],
      'cueharbor-100': ['funk-kit', 'latin-kit', 'groove-kit'],
      'cueharbor-90': ['rock-kit', 'arcade-kit', 'keys-kit'],
      'cueharbor-96': ['shuffle-kit', 'cajon-kit', 'nylon-kit'],
    };
    const packs = assertCatalog(catalog).packs.filter((p) => p.id.startsWith('cueharbor-'));
    assert.equal(packs.length, 4);
    for (const pack of packs) {
      const rows = [...base[pack.id], ...base[pack.id]];
      for (const side of ['A', 'B']) {
        pack.sides[side].forEach((pad, i) => {
          assert.equal(pad.kitSlug, rows[Math.floor(i / 4)]);
          assert.equal(pad.part, PARTS[i % 4]);
          assert.equal(pad.src, `/packs/cueharbor/${pack.bpm}/${pad.kitSlug}/${pad.part}.wav`);
          assert.equal(pad.id, `${side}-${i}`);
        });
      }
    }
  });

  test('Colorosse packs use six kit slugs per side sharing one kit folder', () => {
    const folders = { 'colorosse-152': 'arcade-kit', 'colorosse-128': 'vellum-kit' };
    for (const pack of assertCatalog(catalog).packs.filter((p) => p.id in folders)) {
      for (const side of ['A', 'B']) {
        assert.equal(new Set(pack.sides[side].map((pad) => pad.kitSlug)).size, 6);
        pack.sides[side].forEach((pad, i) => {
          assert.equal(pad.part, PARTS[i % 4]);
          assert.equal(pad.src, `/packs/colorosse/${pack.bpm}/${folders[pack.id]}/${pad.part}.wav`);
          assert.equal(pad.id, `${side}-${i}`);
        });
      }
    }
  });

  test('CC-BY Colorosse packs: six kit slugs per side, stems mapped honestly, license says CC-BY-4.0', () => {
    // part -> stem file; Timber has no drums stem, so its drums slot plays bass.wav
    const stems = {
      'colorosse-anvil-62': { folder: 'anvil-kit', files: ['drums', 'bass', 'chords', 'percussion'] },
      'colorosse-prism-52': { folder: 'prism-kit', files: ['drums', 'bass', 'chords', 'percussion'] },
      'colorosse-rust-108': { folder: 'rust-kit', files: ['drums', 'bass', 'chords', 'percussion'] },
      'colorosse-timber-84': { folder: 'timber-kit', files: ['bass', 'bass', 'chords', 'percussion'] },
    };
    const packs = assertCatalog(catalog).packs.filter((p) => p.id in stems);
    assert.equal(packs.length, 4);
    for (const pack of packs) {
      const { folder, files } = stems[pack.id];
      assert.match(pack.license, /CC-BY-4\.0/);
      for (const side of ['A', 'B']) {
        assert.equal(new Set(pack.sides[side].map((pad) => pad.kitSlug)).size, 6);
        pack.sides[side].forEach((pad, i) => {
          assert.equal(pad.part, PARTS[i % 4]);
          assert.equal(pad.src, `/packs/colorosse/${pack.bpm}/${folder}/${files[i % 4]}.wav`);
        });
      }
    }
    assert.deepEqual(packs.map((p) => p.bpm).sort((a, b) => a - b), [52, 62, 84, 108]);
  });

  test('OFDN packs: CC-BY-4.0 license, full-mix loops under oga-ofdn/{bpm}', () => {
    const packs = assertCatalog(catalog).packs.filter((p) => p.id.startsWith('oga-ofdn-'));
    assert.deepEqual(packs.map((p) => p.bpm).sort(), [130, 140]);
    for (const pack of packs) {
      assert.match(pack.license, /CC-BY-4\.0/);
      for (const pad of [...pack.sides.A, ...pack.sides.B]) {
        assert.match(pad.src, new RegExp(`^/packs/oga-ofdn/${pack.bpm}/[a-z0-9-]+-kit/chords\\.wav$`));
      }
    }
  });

  test('every CC-BY pack has a license file for its source loop', () => {
    const licenses = ['colorosse-anvil-62', 'colorosse-prism-52', 'colorosse-rust-108', 'colorosse-timber-84', 'oga-ofdn-loop-box-1'];
    for (const name of licenses) {
      const url = new URL(`../public/packs/licenses/${name}.txt`, import.meta.url);
      assert.match(readFileSync(url, 'utf8'), /CC-BY-4\.0|Attribution 4\.0/);
    }
  });

  test('every indexed on-disk sound exists, matches a pack BPM and is unused by pads', () => {
    const parsed = assertCatalog(catalog);
    const padSrcs = new Set(parsed.packs.flatMap((p) => [...p.sides.A, ...p.sides.B].map((pad) => pad.src)));
    assert.ok(Array.isArray(parsed.sounds));
    for (const sound of parsed.sounds) {
      assert.ok(existsSync(publicFile(sound.src)), `missing ${sound.src}`);
      assert.ok(parsed.packs.some((p) => p.bpm === sound.bpm), `no pack at ${sound.bpm} BPM`);
      assert.ok(!padSrcs.has(sound.src), `${sound.src} already used by a pad`);
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
