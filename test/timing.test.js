import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { barDurationSec, nextBarTime } from '../public/js/timing.js';

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
