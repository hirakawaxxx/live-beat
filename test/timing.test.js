import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  barDurationSec,
  beatDurationSec,
  beatsForDuration,
  nextBarTime,
  nextCycleTime,
  quantizeOnTime,
} from '../public/js/timing.js';

describe('barDurationSec', () => {
  test('120 BPM is 2 seconds per bar', () => {
    assert.equal(barDurationSec(120), 2);
  });
  test('60 BPM is 4 seconds per bar', () => {
    assert.equal(barDurationSec(60), 4);
  });
});

describe('nextBarTime', () => {
  test('returns currentTime when already on a boundary', () => {
    assert.equal(nextBarTime(4, 0, 2), 4);
  });
  test('schedules the upcoming boundary', () => {
    assert.equal(nextBarTime(4.1, 0, 2), 6);
  });
  test('respects a non-zero origin', () => {
    assert.equal(nextBarTime(5.5, 1, 2), 7);
  });
});

describe('beatDurationSec', () => {
  test('120 BPM is 0.5 seconds per beat', () => {
    assert.equal(beatDurationSec(120), 0.5);
  });
});

describe('beatsForDuration', () => {
  test('a 4-bar loop at 120 BPM is 16 beats', () => {
    assert.equal(beatsForDuration(8, 120), 16);
  });
  test('rounds slightly off durations', () => {
    assert.equal(beatsForDuration(8.03, 120), 16);
  });
});

describe('nextCycleTime', () => {
  test('matches nextBarTime math for an arbitrary cycle', () => {
    assert.equal(nextCycleTime(9, 0, 8), 16);
    assert.equal(nextCycleTime(16, 0, 8), 16);
    assert.equal(nextCycleTime(9, 1, 8), 9);
    assert.equal(nextCycleTime(9.5, 1, 8), 17);
  });
});

describe('quantizeOnTime', () => {
  test('uses the next bar when nothing is active', () => {
    assert.equal(
      quantizeOnTime({ currentTime: 3, originTime: 0, barDur: 2, activeCycleDurs: [] }),
      4,
    );
  });
  test('uses the longest active cycle when something is active', () => {
    assert.equal(
      quantizeOnTime({ currentTime: 3, originTime: 0, barDur: 2, activeCycleDurs: [4, 8] }),
      8,
    );
  });
  test('respects a non-zero origin with active cycles', () => {
    assert.equal(
      quantizeOnTime({ currentTime: 9.5, originTime: 1, barDur: 2, activeCycleDurs: [8, 4] }),
      17,
    );
  });
});
