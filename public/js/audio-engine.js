import { barDurationSec, nextBarTime } from './timing.js';

const DEFAULT_BPM = 120;
const LOOP_BARS = 4;
const DURATION_TOLERANCE_SEC = 0.1;
const MIN_LEAD_SEC = 0.02;

function positiveMod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

export function createAudioEngine() {
  let context = null;
  let masterGain = null;
  let bpm = DEFAULT_BPM;
  let transportOrigin = null;
  const buffers = new Map();
  // padId -> { source, gain }
  const active = new Map();
  // entries replaced by a fresh source while still waiting for their stop time
  const retiring = new Set();

  function requireContext() {
    if (!context) throw new Error('AudioEngine: call resume() first');
    return context;
  }

  function resetTransport() {
    transportOrigin = context ? context.currentTime : null;
  }

  function boundaryTime(ctx) {
    const barDur = barDurationSec(bpm);
    let next = nextBarTime(ctx.currentTime, transportOrigin, barDur);
    if (next - ctx.currentTime < MIN_LEAD_SEC) next += barDur;
    return next;
  }

  function disposeEntry(padId, entry) {
    entry.source.onended = null;
    retiring.delete(entry);
    try {
      entry.source.disconnect();
      entry.gain.disconnect();
    } catch {
      // already disconnected
    }
    if (active.get(padId) === entry) active.delete(padId);
  }

  async function resume() {
    if (!context) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) throw new Error('AudioEngine: Web Audio is not supported');
      context = new Ctor();
      masterGain = context.createGain();
      masterGain.connect(context.destination);
      resetTransport();
    }
    if (context.state !== 'running') await context.resume();
  }

  async function loadPad(padId, url) {
    const ctx = requireContext();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`AudioEngine: failed to fetch ${url} (${response.status})`);
    }
    const data = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(data);
    const expected = barDurationSec(bpm) * LOOP_BARS;
    if (Math.abs(buffer.duration - expected) > DURATION_TOLERANCE_SEC) {
      console.warn(
        `AudioEngine: pad "${padId}" duration ${buffer.duration.toFixed(3)}s differs from expected ${expected.toFixed(3)}s at ${bpm} BPM`,
      );
    }
    buffers.set(padId, buffer);
  }

  function setBpm(nextBpm) {
    if (!Number.isFinite(nextBpm) || nextBpm <= 0) {
      throw new Error('AudioEngine: bpm must be a positive number');
    }
    bpm = nextBpm;
    // Re-anchor the grid only when nothing is playing, so phase stays coherent.
    if (context && active.size === 0) resetTransport();
  }

  function startPad(padId) {
    const ctx = requireContext();
    const buffer = buffers.get(padId);
    if (!buffer) throw new Error(`AudioEngine: pad "${padId}" is not loaded`);

    const next = boundaryTime(ctx);
    const offset = positiveMod(next - transportOrigin, buffer.duration);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(masterGain);

    const previous = active.get(padId);
    if (previous) retiring.add(previous);
    const entry = { source, gain };
    source.onended = () => disposeEntry(padId, entry);
    source.start(next, offset);
    active.set(padId, entry);
  }

  function stopPad(padId) {
    const ctx = requireContext();
    const entry = active.get(padId);
    if (!entry) return;
    // Stop at the next bar boundary; if it has not started yet, this cancels it.
    entry.source.stop(boundaryTime(ctx));
    // Mark as stopping so a later "on" creates a fresh source.
    const stopping = { ...entry, stopping: true };
    stopping.source.onended = () => disposeEntry(padId, stopping);
    active.set(padId, stopping);
  }

  function togglePad(padId, on) {
    requireContext();
    const current = active.get(padId);
    if (on) {
      if (current && !current.stopping) return;
      startPad(padId);
    } else {
      if (!current || current.stopping) return;
      stopPad(padId);
    }
  }

  function stopAll() {
    const entries = [...active];
    for (const entry of retiring) entries.push([null, entry]);
    for (const [padId, entry] of entries) {
      try {
        entry.source.stop();
      } catch {
        // already stopped
      }
      disposeEntry(padId, entry);
    }
    active.clear();
    retiring.clear();
    if (context) resetTransport();
  }

  return {
    resume,
    loadPad,
    setBpm,
    togglePad,
    stopAll,
    getMasterGain: () => requireContext() && masterGain,
    getContext: () => requireContext(),
  };
}
