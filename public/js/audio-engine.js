const DEFAULT_BASE_BPM = 120;
const BAR_BEATS = 4;
// Loops may be any whole number of beats (e.g. 8 or 16); warn only when off-grid.
const BEAT_TOLERANCE = 0.1;
const MIN_LEAD_SEC = 0.02;

function positiveMod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

// Every loop file is rendered at `baseBpm` (see scripts/normalize-bpm.py). The master tempo is
// changed by playing all loops at playbackRate = bpm / baseBpm, so pitch moves with tempo.
// The transport is a beat grid: beat = anchorBeat + (time - anchorTime) * bpm / 60.
export function createAudioEngine({ baseBpm = DEFAULT_BASE_BPM } = {}) {
  let context = null;
  let masterGain = null;
  let bpm = baseBpm;
  let anchorTime = null;
  let anchorBeat = 0;
  const buffers = new Map();
  // padId -> { source, gain, startBeat, startTime, loopBeats }
  const active = new Map();

  function requireContext() {
    if (!context) throw new Error('AudioEngine: call resume() first');
    return context;
  }

  const beatAt = (time) => anchorBeat + ((time - anchorTime) * bpm) / 60;
  const timeOfBeat = (beat) => anchorTime + ((beat - anchorBeat) * 60) / bpm;
  const loopBeatsOf = (buffer) => Math.max(1, Math.round((buffer.duration * baseBpm) / 60));

  function resetTransport() {
    anchorTime = context ? context.currentTime : null;
    anchorBeat = 0;
  }

  // ON always lands on the next bar boundary (4 beats), whether or not other pads play.
  function joinBeat(ctx) {
    const next = Math.max(0, Math.ceil(beatAt(ctx.currentTime) / BAR_BEATS - 1e-9)) * BAR_BEATS;
    return timeOfBeat(next) - ctx.currentTime < MIN_LEAD_SEC ? next + BAR_BEATS : next;
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

  function stopEntry(padId, entry) {
    try {
      entry.source.stop();
    } catch {
      // already stopped
    }
    disposeEntry(padId, entry);
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
    const beats = (buffer.duration * baseBpm) / 60;
    if (beats < 1 || Math.abs(beats - Math.round(beats)) > BEAT_TOLERANCE) {
      console.warn(
        `AudioEngine: pad "${padId}" duration ${buffer.duration.toFixed(3)}s is ${beats.toFixed(2)} beats at ${baseBpm} BPM (expected a whole number of beats)`,
      );
    }
    buffers.set(padId, buffer);
  }

  // Schedules the pad's loop to enter at `startBeat`, already in phase with the shared grid.
  function scheduleEntry(padId, startBeat) {
    const ctx = requireContext();
    const buffer = buffers.get(padId);
    if (!buffer) throw new Error(`AudioEngine: pad "${padId}" is not loaded`);
    const loopBeats = loopBeatsOf(buffer);
    const startTime = timeOfBeat(startBeat);
    // Offset is in buffer time (baseBpm), independent of the current playback rate.
    const offset = (positiveMod(startBeat, loopBeats) * 60) / baseBpm;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = bpm / baseBpm;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(masterGain);

    const entry = { source, gain, startBeat, startTime, loopBeats };
    source.onended = () => disposeEntry(padId, entry);
    source.start(startTime, offset);
    active.set(padId, entry);
  }

  // Safe while pads play: sounding loops change rate together at the same instant and the beat
  // grid is re-anchored there, so every loop (and any later join) stays in phase.
  function setBpm(nextBpm) {
    if (!Number.isFinite(nextBpm) || nextBpm <= 0) {
      throw new Error('AudioEngine: bpm must be a positive number');
    }
    if (!context) {
      bpm = nextBpm;
      return;
    }
    const now = context.currentTime;
    anchorBeat = active.size === 0 ? 0 : beatAt(now);
    anchorTime = now;
    bpm = nextBpm;
    for (const [padId, entry] of [...active]) {
      if (entry.startTime > now) {
        // Not sounding yet: its start time moved with the grid, so schedule it again.
        stopEntry(padId, entry);
        scheduleEntry(padId, Math.max(entry.startBeat, joinBeat(context)));
      } else {
        entry.source.playbackRate.setValueAtTime(bpm / baseBpm, now);
      }
    }
  }

  // OFF is immediate: a pending start is cancelled and a sounding loop is cut now.
  function stopPad(padId) {
    requireContext();
    const entry = active.get(padId);
    if (entry) stopEntry(padId, entry);
  }

  function togglePad(padId, on) {
    const ctx = requireContext();
    const current = active.get(padId);
    if (on) {
      if (current) return;
      scheduleEntry(padId, joinBeat(ctx));
    } else {
      if (!current) return;
      stopPad(padId);
    }
  }

  function stopAll() {
    for (const [padId, entry] of [...active]) stopEntry(padId, entry);
    active.clear();
    if (context) resetTransport();
  }

  // Read-only view for UI rings. Pads missing from `active` are reported as 'off'.
  function getTransportSnapshot() {
    const ctx = requireContext();
    const now = ctx.currentTime;
    const beatNow = beatAt(now);
    const pads = {};
    for (const [padId, buffer] of buffers) {
      const entry = active.get(padId);
      const beats = loopBeatsOf(buffer);
      let state = 'off';
      let phase = 0;
      if (entry && entry.startTime > now) {
        // Waiting pads count down toward the next bar boundary they will join on.
        state = 'waiting';
        phase = positiveMod(beatNow, BAR_BEATS) / BAR_BEATS;
      } else if (entry) {
        state = 'playing';
        phase = positiveMod(beatNow, beats) / beats;
      }
      pads[padId] = {
        state,
        loopDuration: (beats * 60) / bpm,
        beats,
        startTime: entry ? entry.startTime : null,
        phase,
      };
    }
    return { currentTime: now, bpm, baseBpm, pads };
  }

  return {
    resume,
    loadPad,
    setBpm,
    getBpm: () => bpm,
    togglePad,
    stopAll,
    getTransportSnapshot,
    getMasterGain: () => requireContext() && masterGain,
    getContext: () => requireContext(),
  };
}
