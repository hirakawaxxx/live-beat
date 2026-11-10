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

  const pads = pack.sides.A;
  const buttons = new Map(pads.map((pad) => [pad.id, createPadButton(pad)]));
  gridEl.replaceChildren(...buttons.values());

  sideABtn.setAttribute('aria-pressed', 'true');
  sideBBtn.disabled = true; // Task 8
  recordBtn.disabled = true; // Task 9

  const active = new Set();
  const failed = new Set();
  let readyPromise = null;

  const loadAllPads = async () => {
    await engine.resume();
    const results = await Promise.allSettled(pads.map((pad) => engine.loadPad(pad.id, pad.src)));
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') return;
      console.error(result.reason);
      const pad = pads[i];
      failed.add(pad.id);
      const btn = buttons.get(pad.id);
      btn.disabled = true;
      btn.setAttribute('aria-pressed', 'false');
    });
    setStatus(failed.size > 0 ? MESSAGES.partial : '');
  };

  // First user gesture: resume the context, then load every pad (once).
  const ensureReady = () => {
    if (!readyPromise) {
      setStatus(MESSAGES.loading);
      readyPromise = loadAllPads().catch((err) => {
        readyPromise = null; // allow retry on next tap
        throw err;
      });
    }
    return readyPromise;
  };

  const renderPressed = (padId) => {
    buttons.get(padId).setAttribute('aria-pressed', String(active.has(padId)));
  };

  const onPadClick = async (padId) => {
    try {
      await ensureReady();
    } catch (err) {
      console.error(err);
      setStatus(MESSAGES.audio);
      return;
    }
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

  gridEl.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-pad-id]');
    if (!btn || btn.disabled) return;
    void onPadClick(btn.dataset.padId);
  });

  stopBtn.addEventListener('click', () => {
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
