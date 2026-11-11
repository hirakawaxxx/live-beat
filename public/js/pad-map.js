// Pad remapping state: pure helpers (no DOM) plus localStorage load/save.
// Stored shape: { [packId]: { A: { [padId]: {src,label,part,kitSlug} }, B: {...} } }
export const STORAGE_KEY = 'live-beat:pad-map:v1';

const SIDES = ['A', 'B'];
const PART_ORDER = ['drums', 'bass', 'chords', 'percussion'];

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

export const emptyOverrides = () => ({ A: {}, B: {} });

// The four fields a pad takes from a sound (id stays with the pad slot).
export const toSound = ({ src, label, part, kitSlug }) => ({ src, label, part, kitSlug });

const allPads = (pack) => SIDES.flatMap((side) => pack.sides[side]);

// Every distinct loop (deduped by src) with a matching bpm, in part order: pack pads first, then
// catalog.sounds (on-disk kit loops no pack pad uses; see scripts/index-kits.mjs).
export function buildSoundIndex(catalog, bpm) {
  const seen = new Set();
  const sounds = [];
  const add = (sound) => {
    if (seen.has(sound.src)) return;
    seen.add(sound.src);
    sounds.push(toSound(sound));
  };
  for (const pack of catalog.packs) {
    if (pack.bpm !== bpm) continue;
    allPads(pack).forEach(add);
  }
  for (const sound of catalog.sounds ?? []) {
    if (sound.bpm === bpm) add(sound);
  }
  const rank = (part) => {
    const i = PART_ORDER.indexOf(part);
    return i === -1 ? PART_ORDER.length : i;
  };
  // Array#sort is stable, so catalog order is kept within a part.
  return sounds.sort((a, b) => rank(a.part) - rank(b.part));
}

// Keeps only overrides for known pad slots whose src is in the sound index. Sound fields are
// taken from the index (not from storage) so stale or tampered entries cannot inject data.
export function normalizeOverrides(raw, pack, soundIndex) {
  const bySrc = new Map(soundIndex.map((sound) => [sound.src, sound]));
  const result = emptyOverrides();
  if (!isPlainObject(raw)) return result;
  for (const side of SIDES) {
    const sideRaw = raw[side];
    if (!isPlainObject(sideRaw)) continue;
    for (const pad of pack.sides[side]) {
      const entry = sideRaw[pad.id];
      if (!isPlainObject(entry) || typeof entry.src !== 'string') continue;
      const sound = bySrc.get(entry.src);
      if (!sound || sound.src === pad.src) continue;
      result[side][pad.id] = { ...sound };
    }
  }
  return result;
}

// Catalog pads for a side with overrides applied; returns new objects.
export function effectivePads(pack, overrides, side) {
  const sideOverrides = overrides[side] ?? {};
  return pack.sides[side].map((pad) => {
    const override = sideOverrides[pad.id];
    return override ? { ...pad, ...toSound(override) } : { ...pad };
  });
}

export function withoutOverride(overrides, side, padId) {
  const { [padId]: _removed, ...rest } = overrides[side] ?? {};
  return { ...overrides, [side]: rest };
}

// Picking the pad's own default sound clears the override instead of storing it.
export function withOverride(overrides, side, defaultPad, sound) {
  if (sound.src === defaultPad.src) return withoutOverride(overrides, side, defaultPad.id);
  return { ...overrides, [side]: { ...overrides[side], [defaultPad.id]: toSound(sound) } };
}

const isOverridesEmpty = (overrides) => SIDES.every((side) => Object.keys(overrides[side] ?? {}).length === 0);

const readDoc = (storage) => {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const doc = raw ? JSON.parse(raw) : null;
    return isPlainObject(doc) ? doc : {};
  } catch {
    return {};
  }
};

export function loadOverrides(storage, pack, soundIndex) {
  if (!storage) return emptyOverrides();
  return normalizeOverrides(readDoc(storage)[pack.id], pack, soundIndex);
}

// Returns false when storage is unavailable (private mode, quota); the in-memory map still works.
export function saveOverrides(storage, packId, overrides) {
  if (!storage) return false;
  const { [packId]: _old, ...others } = readDoc(storage);
  const doc = isOverridesEmpty(overrides) ? others : { ...others, [packId]: overrides };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
