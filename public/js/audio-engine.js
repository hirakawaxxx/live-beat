import { barDurationSec, beatDurationSec, beatsForDuration, quantizeOnTime } from './timing.js';

const DEFAULT_BPM = 120;
// Loops may be any whole number of beats (e.g. 8 or 16); warn only when off-grid.
const BEAT_TOLERANCE = 0.1;
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

  function requireContext() {
    if (!context) throw new Error('AudioEngine: call resume() first');
    return context;
  }

  function resetTransport() {
    transportOrigin = context ? context.currentTime : null;
  }

  // ON always lands on the next bar boundary (4 beats), whether or not other pads play.
  function joinTime(ctx) {
    const barDur = barDurationSec(bpm);
    const next = quantizeOnTime({
      currentTime: ctx.currentTime,
      originTime: transportOrigin,
      barDur,
    });
    if (next - ctx.currentTime < MIN_LEAD_SEC) return next + barDur;
    return next;
  }

  function disposeEntry(padId, entry) {
    entry.source.onended = null;
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
    const beats = buffer.duration / beatDurationSec(bpm);
    if (beats < 1 || Math.abs(beats - Math.round(beats)) > BEAT_TOLERANCE) {
      console.warn(
        `AudioEngine: pad "${padId}" duration ${buffer.duration.toFixed(3)}s is ${beats.toFixed(2)} beats at ${bpm} BPM (expected a whole number of beats)`,
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

    const next = joinTime(ctx);
    const offset = positiveMod(next - transportOrigin, buffer.duration);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(masterGain);

    const entry = { source, gain, startTime: next, loopDuration: buffer.duration };
    source.onended = () => disposeEntry(padId, entry);
    source.start(next, offset);
    active.set(padId, entry);
  }

  // OFF is immediate: a pending start is cancelled and a sounding loop is cut now.
  function stopPad(padId) {
    requireContext();
    const entry = active.get(padId);
    if (!entry) return;
    try {
      entry.source.stop();
    } catch {
      // already stopped
    }
    disposeEntry(padId, entry);
  }

  function togglePad(padId, on) {
    requireContext();
    const current = active.get(padId);
    if (on) {
      if (current) return;
      startPad(padId);
    } else {
      if (!current) return;
      stopPad(padId);
    }
  }

  function stopAll() {
    for (const [padId, entry] of [...active]) {
      try {
        entry.source.stop();
      } catch {
        // already stopped
      }
      disposeEntry(padId, entry);
    }
    active.clear();
    if (context) resetTransport();
  }

  function phaseOf(currentTime, cycleDur) {
    return positiveMod(currentTime - transportOrigin, cycleDur) / cycleDur;
  }

  // Read-only view for UI rings. Pads missing from `active` are reported as 'off'.
  function getTransportSnapshot() {
    const ctx = requireContext();
    const now = ctx.currentTime;
    const pads = {};
    for (const [padId, buffer] of buffers) {
      const entry = active.get(padId);
      const loopDuration = buffer.duration;
      let state = 'off';
      let phase = 0;
      if (entry && entry.startTime > now) {
        // Waiting pads count down toward the next bar boundary they will join on.
        state = 'waiting';
        phase = phaseOf(now, barDurationSec(bpm));
      } else if (entry) {
        state = 'playing';
        phase = phaseOf(now, loopDuration);
      }
      pads[padId] = {
        state,
        loopDuration,
        beats: beatsForDuration(loopDuration, bpm),
        startTime: entry ? entry.startTime : null,
        phase,
      };
    }
    return { currentTime: now, originTime: transportOrigin, bpm, pads };
  }

  return {
    resume,
    loadPad,
    setBpm,
    togglePad,
    stopAll,
    getTransportSnapshot,
    getMasterGain: () => requireContext() && masterGain,
    getContext: () => requireContext(),
  };
}
