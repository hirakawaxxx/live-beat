import { assertCatalog } from './js/pack-schema.js';
import { createAudioEngine } from './js/audio-engine.js';

const gridEl = document.querySelector('#pad-grid');
const statusEl = document.querySelector('#status');
const titleEl = document.querySelector('#pack-title');
const stopBtn = document.querySelector('#btn-stop');
const sideABtn = document.querySelector('#btn-side-a');
const sideBBtn = document.querySelector('#btn-side-b');
const recordBtn = document.querySelector('#btn-record');

const MESSAGES = {
  noPack: 'パックが指定されていません。ライブラリから選んでください。',
  notFound: '指定されたパックが見つかりません。',
  catalog: 'パック情報を読み込めませんでした。',
  audio: '音声を開始できませんでした。もう一度タップしてください。',
  loading: '音を読み込み中…',
  partial: '一部の音が読み込めませんでした。',
};

const setStatus = (text) => {
  statusEl.textContent = text;
};

const createPadButton = (pad) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ui-button pad pad--${pad.part}`;
  btn.dataset.padId = pad.id;
  btn.setAttribute('aria-pressed', 'false');
  btn.textContent = pad.label;
  return btn;
};

const loadCatalogPack = async (packId) => {
  const res = await fetch('/packs/catalog.json');
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const catalog = assertCatalog(await res.json());
  return catalog.packs.find((p) => p.id === packId) ?? null;
};

const init = async () => {
  const packId = new URLSearchParams(location.search).get('pack');
  if (!packId) {
    setStatus(MESSAGES.noPack);
    return;
  }

  let pack;
  try {
    pack = await loadCatalogPack(packId);
  } catch (err) {
    console.error(err);
    setStatus(MESSAGES.catalog);
    return;
  }
  if (!pack) {
    setStatus(MESSAGES.notFound);
    return;
  }

  titleEl.textContent = `${pack.title} · ${pack.bpm} BPM`;
  document.title = `${pack.title} — live-beat`;

  // BPM must be set before any loadPad (duration check) and never while pads play.
  const engine = createAudioEngine();
  engine.setBpm(pack.bpm);

  const sideButtons = { A: sideABtn, B: sideBBtn };
  recordBtn.disabled = true; // Task 9

  const active = new Set();
  const failed = new Set(); // pad ids are unique across sides
  const sideLoads = new Map(); // side -> in-flight/finished load promise
  let currentSide = 'A';
  let buttons = new Map();
  // Bumped by STOP and side switches; stale in-flight taps compare against it.
  let generation = 0;

  const sidePads = (side) => pack.sides[side];

  const renderPads = (side) => {
    buttons = new Map(
      sidePads(side).map((pad) => {
        const btn = createPadButton(pad);
        if (failed.has(pad.id)) btn.disabled = true;
        return [pad.id, btn];
      }),
    );
    gridEl.replaceChildren(...buttons.values());
  };

  const updateSideButtons = () => {
    Object.entries(sideButtons).forEach(([side, btn]) => {
      btn.setAttribute('aria-pressed', String(side === currentSide));
    });
  };

  const sideStatus = (side) => {
    const hasFailed = sidePads(side).some((pad) => failed.has(pad.id));
    return hasFailed ? `Side ${side} · ${MESSAGES.partial}` : `Side ${side}`;
  };

  const loadSide = async (side) => {
    await engine.resume();
    const pads = sidePads(side);
    const results = await Promise.allSettled(pads.map((pad) => engine.loadPad(pad.id, pad.src)));
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') return;
      console.error(result.reason);
      failed.add(pads[i].id);
      const btn = side === currentSide ? buttons.get(pads[i].id) : null;
      if (!btn) return;
      btn.disabled = true;
      btn.setAttribute('aria-pressed', 'false');
    });
  };

  // User gesture: resume the context, then load every pad of the side (once per side).
  const ensureReady = (side) => {
    if (!sideLoads.has(side)) {
      if (side === currentSide) setStatus(MESSAGES.loading);
      const promise = loadSide(side).catch((err) => {
        sideLoads.delete(side); // allow retry on next tap
        throw err;
      });
      sideLoads.set(side, promise);
    }
    return sideLoads.get(side);
  };

  const renderPressed = (padId) => {
    buttons.get(padId)?.setAttribute('aria-pressed', String(active.has(padId)));
  };

  const onPadClick = async (padId) => {
    const side = currentSide;
    const gen = generation;
    try {
      await ensureReady(side);
    } catch (err) {
      console.error(err);
      if (gen === generation) setStatus(MESSAGES.audio);
      return;
    }
    // STOP or a side switch happened while loading: drop this tap.
    if (gen !== generation) return;
    setStatus(sideStatus(side));
    if (failed.has(padId)) return;
    const on = !active.has(padId);
    try {
      engine.togglePad(padId, on);
    } catch (err) {
      console.error(err);
      setStatus(MESSAGES.audio);
      return;
    }
    if (on) active.add(padId);
    else active.delete(padId);
    renderPressed(padId);
  };

  const switchSide = async (next) => {
    if (next === currentSide) return;
    generation += 1;
    const gen = generation;
    engine.stopAll();
    active.clear();
    currentSide = next;
    renderPads(next);
    updateSideButtons();
    try {
      await ensureReady(next); // click is a user gesture; also preloads the new side
    } catch (err) {
      console.error(err);
      if (gen === generation) setStatus(MESSAGES.audio);
      return;
    }
    if (gen !== generation) return;
    // Pads that failed while this side was not displayed are disabled on render only.
    renderPads(next);
    setStatus(sideStatus(next));
  };

  renderPads(currentSide);
  updateSideButtons();
  setStatus(sideStatus(currentSide));

  gridEl.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-pad-id]');
    if (!btn || btn.disabled) return;
    void onPadClick(btn.dataset.padId);
  });

  Object.entries(sideButtons).forEach(([side, btn]) => {
    btn.addEventListener('click', () => void switchSide(side));
  });

  stopBtn.addEventListener('click', () => {
    generation += 1;
    engine.stopAll();
    const ids = [...active];
    active.clear();
    ids.forEach(renderPressed);
  });
};

init().catch((err) => {
  console.error(err);
  setStatus(MESSAGES.catalog);
});
