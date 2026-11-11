const PARTS = ['drums', 'bass', 'chords', 'percussion'];
const SIDES = ['A', 'B'];
export const PADS_PER_SIDE = 24; // visual 4 columns x 6 rows

const fail = (path, message) => {
  throw new Error(`Invalid catalog at ${path}: ${message}`);
};

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

const assertPad = (pad, path, seenIds) => {
  if (!isPlainObject(pad)) fail(path, 'pad must be an object');
  for (const key of ['id', 'label', 'kitSlug', 'src']) {
    if (!isNonEmptyString(pad[key])) fail(`${path}.${key}`, 'must be a non-empty string');
  }
  if (!PARTS.includes(pad.part)) fail(`${path}.part`, `must be one of ${PARTS.join('|')}`);
  if (seenIds.has(pad.id)) fail(`${path}.id`, `duplicate pad id "${pad.id}"`);
  seenIds.add(pad.id);
};

const assertPack = (pack, path) => {
  if (!isPlainObject(pack)) fail(path, 'pack must be an object');
  for (const key of ['id', 'title', 'license']) {
    if (!isNonEmptyString(pack[key])) fail(`${path}.${key}`, 'must be a non-empty string');
  }
  if (!Number.isFinite(pack.bpm) || pack.bpm <= 0) fail(`${path}.bpm`, 'must be a positive number');
  if (!isPlainObject(pack.sides)) fail(`${path}.sides`, 'must be an object');

  const seenIds = new Set();
  for (const side of SIDES) {
    const pads = pack.sides[side];
    const sidePath = `${path}.sides.${side}`;
    if (!Array.isArray(pads)) fail(sidePath, 'must be an array');
    if (pads.length !== PADS_PER_SIDE) fail(sidePath, `must have ${PADS_PER_SIDE} pads (got ${pads.length})`);
    pads.forEach((pad, i) => assertPad(pad, `${sidePath}[${i}]`, seenIds));
  }
};

// Optional flat list of extra same-BPM loops that remap can offer (not mapped to any pad).
const assertSound = (sound, path) => {
  if (!isPlainObject(sound)) fail(path, 'sound must be an object');
  for (const key of ['label', 'kitSlug', 'src']) {
    if (!isNonEmptyString(sound[key])) fail(`${path}.${key}`, 'must be a non-empty string');
  }
  if (!PARTS.includes(sound.part)) fail(`${path}.part`, `must be one of ${PARTS.join('|')}`);
  if (!Number.isFinite(sound.bpm) || sound.bpm <= 0) fail(`${path}.bpm`, 'must be a positive number');
};

export function assertCatalog(catalog) {
  if (!isPlainObject(catalog)) fail('$', 'catalog must be an object');
  if (!Array.isArray(catalog.packs) || catalog.packs.length === 0) {
    fail('$.packs', 'must be a non-empty array');
  }
  catalog.packs.forEach((pack, i) => assertPack(pack, `$.packs[${i}]`));
  if (catalog.sounds !== undefined) {
    if (!Array.isArray(catalog.sounds)) fail('$.sounds', 'must be an array');
    catalog.sounds.forEach((sound, i) => assertSound(sound, `$.sounds[${i}]`));
  }
  return catalog;
}
