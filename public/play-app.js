import { assertCatalog } from './js/pack-schema.js';
import { createAudioEngine } from './js/audio-engine.js';
import { createRecorder } from './js/recorder.js';
import { createRing, updateRing } from './js/ring.js';
import {
  buildSoundIndex,
  effectivePads,
  loadOverrides,
  saveOverrides,
  soundsForPad,
  withOverride,
  withoutOverride,
} from './js/pad-map.js';
import { createSoundPicker } from './js/sound-picker.js';

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
const pickerEl = document.querySelector('#sound-picker');
const bpmRange = document.querySelector('#bpm-range');
const bpmValue = document.querySelector('#bpm-value');

const MESSAGES = {
  noPack: 'パックが指定されていません。ライブラリから選んでください。',
  notFound: '指定されたパックが見つかりません。',
  catalog: 'パック情報を読み込めませんでした。',
  audio: '音声を開始できませんでした。もう一度タップしてください。',
  loading: '音を読み込み中…',
  partial: '一部の音が読み込めませんでした。',
  recordUnsupported: 'このブラウザでは録音できません',
  recordFailed: '録音に失敗しました。',
  remapFailed: '音を読み込めなかったため、元の音に戻しました。',
};

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_PX = 10;
const CLICK_SUPPRESS_RESET_MS = 100;

const BPM_RANGE = 0.15;
const DEFAULT_RING_BEATS = 16; // placeholder until the loaded buffer reports its beat count

const setStatus = (text) => {
  statusEl.textContent = text;
};

const createPadButton = (pad) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ui-button pad pad--${pad.part}`;
  btn.dataset.padId = pad.id;
  btn.dataset.state = 'off';
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', pad.label);
  btn.setAttribute('aria-describedby', 'pad-hint');
  const ring = createRing(DEFAULT_RING_BEATS);
  const label = document.createElement('span');
  label.className = 'pad__label';
  label.textContent = pad.label;
  btn.append(ring.svg, label);
  return { btn, ring };
};

const loadCatalogPack = async (packId) => {
  const res = await fetch('/packs/catalog.json');
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const catalog = assertCatalog(await res.json());
  return { catalog, pack: catalog.packs.find((p) => p.id === packId) ?? null };
};

const getStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked (privacy mode / disabled storage): remapping stays in memory
  }
};

const init = async () => {
  const packId = new URLSearchParams(location.search).get('pack');
  if (!packId) {
    setStatus(MESSAGES.noPack);
    return;
  }

  let pack;
  let catalog;
  try {
    ({ catalog, pack } = await loadCatalogPack(packId));
  } catch (err) {
    console.error(err);
    setStatus(MESSAGES.catalog);
    return;
  }
  if (!pack) {
    setStatus(MESSAGES.notFound);
    return;
  }

  titleEl.textContent = pack.title;
  document.title = `${pack.title} — live-beat`;

  // The pack's loops are rendered at pack.bpm and sound at their true pitch there. The slider
  // is a fine adjustment (+-15%): it changes playback speed, so pitch follows tempo.
  const baseBpm = pack.bpm;
  bpmRange.min = String(Math.round(baseBpm * (1 - BPM_RANGE)));
  bpmRange.max = String(Math.round(baseBpm * (1 + BPM_RANGE)));
  const engine = createAudioEngine({ baseBpm });
  const showBpm = (bpm) => {
    bpmRange.value = String(bpm);
    bpmValue.textContent = String(bpm);
  };
  showBpm(baseBpm);
  bpmRange.addEventListener('input', () => {
    const bpm = Number(bpmRange.value);
    engine.setBpm(bpm);
    bpmValue.textContent = String(bpm);
  });

  const storage = getStorage();
  const soundIndex = buildSoundIndex(catalog, baseBpm); // loops rendered at this pack's tempo
  const picker = createSoundPicker(pickerEl);
  let overrides = loadOverrides(storage, pack, soundIndex);

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
  let rings = new Map(); // padId -> ring state (see js/ring.js)
  let audioReady = false; // the AudioContext exists once a tap loaded a side
  // Bumped by STOP and side switches; stale in-flight taps compare against it.
  let generation = 0;

  const loadedSrc = new Map(); // padId -> src currently decoded in the engine
  const remapping = new Set(); // padIds whose new sound is still loading
  let remapChain = Promise.resolve(); // serializes remap loads so a stale decode never wins
  let press = null; // active touch/pen press: { padId, timer, x, y }
  let touchDown = false;
  let suppressClick = false; // a long-press just opened the picker; swallow its click

  const sidePads = (side) => effectivePads(pack, overrides, side);
  const defaultPad = (side, padId) => pack.sides[side].find((pad) => pad.id === padId);
  const currentPad = (side, padId) => sidePads(side).find((pad) => pad.id === padId);

  const renderPads = (side) => {
    const built = sidePads(side).map((pad) => {
      const { btn, ring } = createPadButton(pad);
      if (failed.has(pad.id)) btn.disabled = true;
      if (remapping.has(pad.id)) btn.setAttribute('aria-busy', 'true');
      return { id: pad.id, btn, ring };
    });
    buttons = new Map(built.map(({ id, btn }) => [id, btn]));
    rings = new Map(built.map(({ id, ring }) => [id, ring]));
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
      if (result.status === 'fulfilled') {
        loadedSrc.set(pads[i].id, pads[i].src);
        return;
      }
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

  // Ring/state view of the engine transport; called every animation frame.
  const renderRings = () => {
    if (audioReady) {
      const snapshot = engine.getTransportSnapshot();
      buttons.forEach((btn, padId) => {
        const info = snapshot.pads[padId];
        const state = !info || info.state === 'off' ? 'off' : info.state === 'waiting' ? 'waiting' : 'playing';
        if (btn.dataset.state !== state) btn.dataset.state = state;
        let ring = rings.get(padId);
        if (info && info.beats !== ring.segments.length) {
          // Loop length differs from the default: rebuild the ring with the real beat count.
          const fresh = createRing(info.beats);
          ring.svg.replaceWith(fresh.svg);
          ring = fresh;
        }
        rings.set(padId, updateRing(ring, { state, phase: info ? info.phase : 0, beats: ring.segments.length }));
      });
    }
    requestAnimationFrame(renderRings);
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
    audioReady = true;
    enableRecording();
    // STOP or a side switch happened while loading: drop this tap.
    if (gen !== generation) return;
    setStatus(sideStatus(side));
    if (failed.has(padId) || remapping.has(padId)) return;
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

  // Remapping ------------------------------------------------------------

  const refreshPadButton = (padId, pad) => {
    const btn = buttons.get(padId);
    if (!btn) return;
    btn.className = `ui-button pad pad--${pad.part}`;
    btn.setAttribute('aria-label', pad.label);
    btn.querySelector('.pad__label').textContent = pad.label;
  };

  const setBusy = (padId, busy) => {
    const btn = buttons.get(padId);
    if (!btn) return;
    if (busy) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  };

  const setOverrides = (next) => {
    overrides = next;
    saveOverrides(storage, pack.id, overrides);
  };

  // OFF is immediate (also cancels a pending start) before the new buffer is loaded.
  const stopPadNow = (padId) => {
    if (!active.has(padId)) return;
    try {
      engine.togglePad(padId, false);
    } catch (err) {
      console.error(err);
    }
    active.delete(padId);
    renderPressed(padId);
  };

  const loadRemapped = async (side, padId, src, previous) => {
    const isCurrent = () => currentPad(side, padId)?.src === src;
    try {
      await ensureReady(side); // picker selection is a user gesture; starts audio if needed
      audioReady = true;
      enableRecording();
      if (!isCurrent()) return; // superseded by a later remap
      if (loadedSrc.get(padId) !== src) {
        await engine.loadPad(padId, src);
        loadedSrc.set(padId, src);
      }
      if (!isCurrent()) return;
      failed.delete(padId);
      const btn = buttons.get(padId);
      if (btn) btn.disabled = false;
      if (statusEl.textContent === MESSAGES.loading) setStatus(sideStatus(side));
    } catch (err) {
      console.error(err);
      if (!isCurrent()) return;
      // The engine keeps the previous buffer on a failed load, so go back to the previous sound.
      setOverrides(previous
        ? withOverride(overrides, side, defaultPad(side, padId), previous)
        : withoutOverride(overrides, side, padId));
      if (side === currentSide) refreshPadButton(padId, currentPad(side, padId));
      setStatus(MESSAGES.remapFailed);
    } finally {
      remapping.delete(padId);
      if (side === currentSide) setBusy(padId, false);
    }
  };

  const applyRemap = (side, padId, nextOverrides) => {
    const previous = overrides[side][padId];
    stopPadNow(padId);
    setOverrides(nextOverrides);
    const pad = currentPad(side, padId);
    refreshPadButton(padId, pad);
    remapping.add(padId);
    setBusy(padId, true);
    setStatus(`${pad.label} に変更しました`);
    // Ring beats are rebuilt by renderRings once the new buffer reports its length.
    remapChain = remapChain.then(() => loadRemapped(side, padId, pad.src, previous));
  };

  const openPicker = (padId) => {
    if (picker.isOpen() || !buttons.has(padId)) return;
    const side = currentSide;
    const pad = currentPad(side, padId);
    const def = defaultPad(side, padId);
    picker.open({
      heading: '音を選ぶ',
      caption: pad.label,
      sounds: soundsForPad(soundIndex, def),
      currentSrc: pad.src,
      isDefault: pad.src === def.src,
      onSelect: (sound) => {
        if (sound.src === pad.src) return;
        applyRemap(side, padId, withOverride(overrides, side, def, sound));
      },
      onReset: () => {
        if (pad.src === def.src) return;
        applyRemap(side, padId, withoutOverride(overrides, side, padId));
      },
    });
  };

  const cancelPress = () => {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
  };

  // Click that follows a long-press must not toggle play; clear the flag once it has passed.
  const endTouch = () => {
    touchDown = false;
    cancelPress();
    if (suppressClick) setTimeout(() => { suppressClick = false; }, CLICK_SUPPRESS_RESET_MS);
  };

  const onPointerDown = (event) => {
    const btn = event.target.closest('button[data-pad-id]');
    suppressClick = false;
    if (!btn || btn.disabled || event.pointerType === 'mouse' || !event.isPrimary) return;
    touchDown = true;
    cancelPress();
    const padId = btn.dataset.padId;
    press = {
      padId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        press = null;
        suppressClick = true;
        openPicker(padId);
      }, LONG_PRESS_MS),
    };
  };

  const onPointerMove = (event) => {
    if (!press) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_MOVE_PX) cancelPress();
  };

  const onContextMenu = (event) => {
    const btn = event.target.closest('button[data-pad-id]');
    if (!btn) return;
    event.preventDefault();
    if (btn.disabled) return;
    if (touchDown) suppressClick = true; // touch long-press surfaced as a context menu
    cancelPress();
    openPicker(btn.dataset.padId);
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
    audioReady = true;
    enableRecording();
    if (gen !== generation) return;
    // Pads that failed while this side was not displayed are disabled on render only.
    renderPads(next);
    setStatus(sideStatus(next));
  };

  if (pack.layout) gridEl.dataset.layout = pack.layout;
  renderPads(currentSide);
  updateSideButtons();
  setStatus(sideStatus(currentSide));
  requestAnimationFrame(renderRings);

  gridEl.addEventListener('pointerdown', onPointerDown);
  gridEl.addEventListener('pointermove', onPointerMove);
  gridEl.addEventListener('pointerup', endTouch);
  gridEl.addEventListener('pointercancel', endTouch);
  gridEl.addEventListener('contextmenu', onContextMenu);

  gridEl.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
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
