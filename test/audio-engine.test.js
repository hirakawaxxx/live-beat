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
        connect() {},
        disconnect() {},
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
});
