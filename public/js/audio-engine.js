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
  // entries replaced by a fresh source while still waiting for their stop time
  const retiring = new Set();

  function requireContext() {
    if (!context) throw new Error('AudioEngine: call resume() first');
    return context;
  }

  function resetTransport() {
    transportOrigin = context ? context.currentTime : null;
  }

  // Loops that still sound or are scheduled to start (cancelled/disposed are removed from `active`).
  function activeCycleDurs(ctx) {
    return [...active.values()]
      .filter((entry) => !entry.stopping || entry.stopTime > ctx.currentTime)
      .map((entry) => entry.loopDuration);
  }

  // Joins and leaves land on the longest active loop cycle; with nothing active, on the next bar.
  function boundaryTime(ctx) {
    const barDur = barDurationSec(bpm);
    const durs = activeCycleDurs(ctx);
    let next = quantizeOnTime({
      currentTime: ctx.currentTime,
      originTime: transportOrigin,
      barDur,
      activeCycleDurs: durs,
    });
    if (next - ctx.currentTime < MIN_LEAD_SEC) {
      next += durs.length > 0 ? Math.max(...durs) : barDur;
    }
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

    // Re-ON while a stop is pending: start exactly where the old source stops
    // so there is no silent bar gap.
    const previous = active.get(padId);
    const next =
      previous && previous.stopping && previous.stopTime > ctx.currentTime
        ? previous.stopTime
        : boundaryTime(ctx);
    const offset = positiveMod(next - transportOrigin, buffer.duration);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(masterGain);

    if (previous) retiring.add(previous);
    const entry = { source, gain, startTime: next, stopTime: null, loopDuration: buffer.duration };
    source.onended = () => disposeEntry(padId, entry);
    source.start(next, offset);
    active.set(padId, entry);
  }

  function stopPad(padId) {
    const ctx = requireContext();
    const entry = active.get(padId);
    if (!entry) return;
    // Start still pending: cancel outright (no sound), regardless of lead time.
    if (entry.startTime > ctx.currentTime) {
      try {
        entry.source.stop();
      } catch {
        // already stopped
      }
      disposeEntry(padId, entry);
      return;
    }
    // Already sounding: stop at the next bar boundary.
    const stopTime = boundaryTime(ctx);
    entry.source.stop(stopTime);
    // Mark as stopping so a later "on" creates a fresh source.
    const stopping = { ...entry, stopping: true, stopTime };
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

  function phaseOf(currentTime, cycleDur) {
    return positiveMod(currentTime - transportOrigin, cycleDur) / cycleDur;
  }

  // Read-only view for UI rings. Pads missing from `active` are reported as 'off'.
  function getTransportSnapshot() {
    const ctx = requireContext();
    const now = ctx.currentTime;
    const sounding = [...active.values()].filter(
      (entry) => entry.startTime <= now && (!entry.stopping || entry.stopTime > now),
    );
    // Waiting pads show the master cycle (longest sounding loop, else one bar).
    const masterCycle = sounding.length > 0
      ? Math.max(...sounding.map((entry) => entry.loopDuration))
      : barDurationSec(bpm);
    const pads = {};
    for (const [padId, buffer] of buffers) {
      const entry = active.get(padId);
      const loopDuration = buffer.duration;
      let state = 'off';
      let phase = 0;
      if (entry && entry.startTime > now) {
        state = 'waiting';
        phase = phaseOf(now, masterCycle);
      } else if (entry && entry.stopping && entry.stopTime > now) {
        state = 'stopping';
        phase = phaseOf(now, loopDuration);
      } else if (entry && !entry.stopping) {
        state = 'playing';
        phase = phaseOf(now, loopDuration);
      }
      pads[padId] = {
        state,
        loopDuration,
        beats: beatsForDuration(loopDuration, bpm),
        startTime: entry ? entry.startTime : null,
        stopTime: entry && entry.stopping ? entry.stopTime : null,
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
