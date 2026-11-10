import { assertCatalog } from './js/pack-schema.js';
import { createAudioEngine } from './js/audio-engine.js';
import { createRecorder } from './js/recorder.js';

const gridEl = document.querySelector('#pad-grid');
const statusEl = document.querySelector('#status');
const titleEl = document.querySelector('#pack-title');
const stopBtn = document.querySelector('#btn-stop');
const sideABtn = document.querySelector('#btn-side-a');
const sideBBtn = document.querySelector('#btn-side-b');
const recordBtn = document.querySelector('#btn-record');
const recordingResult = document.querySelector('#recording-result');
const recordingAudio = document.querySelector('#recording-audio');
const recordingDownload = document.querySelector('#recording-download');

const MESSAGES = {
  noPack: 'パックが指定されていません。ライブラリから選んでください。',
  notFound: '指定されたパックが見つかりません。',
  catalog: 'パック情報を読み込めませんでした。',
  audio: '音声を開始できませんでした。もう一度タップしてください。',
  loading: '音を読み込み中…',
  partial: '一部の音が読み込めませんでした。',
  recordUnsupported: 'このブラウザでは録音できません',
  recordFailed: '録音に失敗しました。',
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
  recordBtn.disabled = true; // enabled once audio is ready and MediaRecorder exists
  recordBtn.setAttribute('aria-pressed', 'false');

  const recordSupported = typeof MediaRecorder !== 'undefined';
  let recorder = null;
  let recording = false;
  let recordingUrl = null;

  const extensionFor = (mime) => {
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'm4a';
    return 'webm';
  };

  const showRecording = (blob) => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = URL.createObjectURL(blob);
    recordingAudio.src = recordingUrl;
    recordingDownload.href = recordingUrl;
    recordingDownload.download = `${pack.id}-${Date.now()}.${extensionFor(blob.type)}`;
    recordingResult.hidden = false;
  };

  const renderRecordButton = () => {
    recordBtn.textContent = recording ? '録音停止' : '録音';
    recordBtn.setAttribute('aria-pressed', String(recording));
  };

  // Called after the first successful user-gesture audio start (context exists).
  const enableRecording = () => {
    if (!recordSupported || recorder) return;
    recorder = createRecorder(engine.getContext(), engine.getMasterGain());
    recordBtn.disabled = false;
  };

  const toggleRecording = async () => {
    if (!recorder) return;
    recordBtn.disabled = true;
    try {
      if (!recording) {
        recorder.start();
        recording = true;
      } else {
        const blob = await recorder.stop();
        recording = false;
        showRecording(blob);
      }
    } catch (err) {
      console.error(err);
      recording = false;
      recorder.clear();
      setStatus(MESSAGES.recordFailed);
    } finally {
      renderRecordButton();
      recordBtn.disabled = false;
    }
  };

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
    const parts = [`Side ${side}`];
    if (hasFailed) parts.push(MESSAGES.partial);
    if (!recordSupported) parts.push(MESSAGES.recordUnsupported);
    return parts.join(' · ');
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
    enableRecording();
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
    enableRecording();
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

  recordBtn.addEventListener('click', () => void toggleRecording());

  stopBtn.addEventListener('click', () => {
    generation += 1;
    engine.stopAll();
    const ids = [...active];
    active.clear();
    ids.forEach(renderPressed);
    // Drop a stale "loading" message when STOP cancels an in-flight load.
    if (statusEl.textContent === MESSAGES.loading) setStatus(sideStatus(currentSide));
  });
};

init().catch((err) => {
  console.error(err);
  setStatus(MESSAGES.catalog);
});
