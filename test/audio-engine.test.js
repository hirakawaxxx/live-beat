import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioEngine } from '../public/js/audio-engine.js';

// Minimal Web Audio fake: records start/stop calls on each buffer source.
function installFakeAudio({ durations }) {
  const sources = [];
  const ctx = {
    currentTime: 1,
    state: 'running',
    destination: {},
    resume: async () => {},
    createGain: () => ({ connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const source = {
        starts: [],
        stops: [],
        rateChanges: [],
        connect() {},
        disconnect() {},
        playbackRate: {
          value: 1,
          setValueAtTime(value, when) { source.rateChanges.push({ value, when }); },
        },
        start(when, offset) { this.starts.push({ when, offset }); },
        stop(when) { this.stops.push(when); },
      };
      sources.push(source);
      return source;
    },
    decodeAudioData: async (data) => ({ duration: durations[data.id] }),
  };
  globalThis.AudioContext = function FakeAudioContext() { return ctx; };
  globalThis.fetch = async (url) => ({
    ok: true,
    arrayBuffer: async () => ({ id: url }),
  });
  return { ctx, sources };
}

describe('audio engine sync rules (120 BPM, bar = 2s)', () => {
  let ctx;
  let sources;
  let engine;

  beforeEach(async () => {
    ({ ctx, sources } = installFakeAudio({ durations: { short: 4, long: 8 } }));
    engine = createAudioEngine();
    await engine.resume(); // origin = 1
    await engine.loadPad('short', 'short');
    await engine.loadPad('long', 'long');
  });

  test('first pad joins on the next bar', () => {
    ctx.currentTime = 1.5;
    engine.togglePad('short', true);
    assert.equal(sources[0].starts[0].when, 3);
  });

  test('later pads join on the next bar, ignoring their own loop length', () => {
    engine.togglePad('long', true); // active: 8s loop, starts at 3
    ctx.currentTime = 2; // 1s after origin
    engine.togglePad('short', true); // 4s loop still joins the next bar (3), not its cycle (5)
    assert.equal(sources[1].starts[0].when, 3);
    assert.equal(sources[1].starts[0].offset, 2); // (3 - origin) mod 4: phase on the shared grid
  });

  test('long pad joins the next bar with a grid-aligned offset', () => {
    engine.togglePad('short', true); // starts at 3
    ctx.currentTime = 4.5;
    engine.togglePad('long', true); // next bar = 5, offset (5 - 1) mod 8 = 4
    assert.equal(sources[1].starts[0].when, 5);
    assert.equal(sources[1].starts[0].offset, 4);
  });

  test('waiting phase progresses toward the next bar', () => {
    ctx.currentTime = 1.5;
    engine.togglePad('short', true); // starts at 3
    const snap = engine.getTransportSnapshot();
    assert.equal(snap.pads.short.state, 'waiting');
    assert.equal(snap.pads.short.phase, 0.25); // 0.5s into a 2s bar
  });

  test('OFF stops a sounding pad immediately', () => {
    engine.togglePad('short', true);
    ctx.currentTime = 10;
    engine.togglePad('short', false);
    assert.deepEqual(sources[0].stops, [undefined]);
  });

  test('OFF cancels a pending start immediately and allows re-ON', () => {
    engine.togglePad('short', true);
    engine.togglePad('short', false);
    assert.deepEqual(sources[0].stops, [undefined]);
    engine.togglePad('short', true);
    assert.equal(sources.length, 2);
  });

  test('8-beat and 16-beat loops report matching beat counts', () => {
    const snap = engine.getTransportSnapshot();
    assert.equal(snap.pads.short.beats, 8);
    assert.equal(snap.pads.long.beats, 16);
  });

  test('a 96 BPM-source pack still plays on the 120 BPM base grid by default', () => {
    assert.equal(engine.getBpm(), 120);
    engine.togglePad('short', true);
    assert.equal(sources[0].playbackRate.value, 1);
  });
});

describe('audio engine master tempo (loops rendered at 120 BPM)', () => {
  let ctx;
  let sources;
  let engine;

  beforeEach(async () => {
    ({ ctx, sources } = installFakeAudio({ durations: { short: 4, long: 8 } }));
    engine = createAudioEngine({ baseBpm: 120 });
    await engine.resume(); // beat 0 at t = 1
    await engine.loadPad('short', 'short');
    await engine.loadPad('long', 'long');
  });

  test('bpm set before playing changes bar length and playback rate', () => {
    engine.setBpm(60); // bar = 4s
    ctx.currentTime = 1.5;
    engine.togglePad('short', true);
    assert.equal(sources[0].starts[0].when, 5);
    assert.equal(sources[0].playbackRate.value, 0.5);
  });

  test('changing bpm while playing re-rates sounding loops at the same instant', () => {
    engine.togglePad('short', true); // starts at 3
    engine.togglePad('long', true);
    ctx.currentTime = 4;
    engine.setBpm(150);
    assert.deepEqual(sources[0].rateChanges, [{ value: 1.25, when: 4 }]);
    assert.deepEqual(sources[1].rateChanges, [{ value: 1.25, when: 4 }]);
  });

  test('a pad joining after a tempo change lands on the bar with a base-tempo offset', () => {
    engine.togglePad('short', true); // sounding from t = 3 (beat 4)
    ctx.currentTime = 4; // beat 6
    engine.setBpm(60); // 1 beat per second from here
    ctx.currentTime = 4.5; // beat 6.5 -> next bar is beat 8 at t = 6
    engine.togglePad('long', true);
    assert.equal(sources[1].starts[0].when, 6);
    assert.equal(sources[1].starts[0].offset, 4); // beat 8 of a 16-beat loop = 4s of buffer at 120
    assert.equal(sources[1].playbackRate.value, 0.5);
  });

  test('a pad still waiting when the tempo changes is rescheduled on its bar', () => {
    ctx.currentTime = 1.5; // beat 1
    engine.togglePad('short', true); // waiting for beat 4 (t = 3)
    engine.setBpm(60); // beat 4 is now at t = 4.5
    assert.deepEqual(sources[0].stops, [undefined]);
    assert.equal(sources[1].starts[0].when, 4.5);
    assert.equal(sources[1].playbackRate.value, 0.5);
    assert.equal(engine.getTransportSnapshot().pads.short.state, 'waiting');
  });

  test('ring phase follows beats, not seconds, after a tempo change', () => {
    engine.togglePad('short', true); // 8-beat loop, sounding from t = 3
    ctx.currentTime = 5; // beat 8
    engine.setBpm(240); // 4 beats per second
    ctx.currentTime = 5.5; // beat 10 -> 2 beats into the 8-beat loop
    const snap = engine.getTransportSnapshot();
    assert.equal(snap.pads.short.phase, 0.25);
    assert.equal(snap.pads.short.beats, 8);
    assert.equal(snap.bpm, 240);
  });

  test('rejects a non-positive bpm', () => {
    assert.throws(() => engine.setBpm(0));
  });
});
