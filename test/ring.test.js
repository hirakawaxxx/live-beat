import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { beatIndexForPhase } from '../public/js/ring.js';

describe('beatIndexForPhase', () => {
  test('maps phase to a beat index', () => {
    assert.equal(beatIndexForPhase(0, 16), 0);
    assert.equal(beatIndexForPhase(0.5, 16), 8);
    assert.equal(beatIndexForPhase(0.999, 16), 15);
  });
  test('wraps and clamps', () => {
    assert.equal(beatIndexForPhase(1, 16), 0);
    assert.equal(beatIndexForPhase(-0.01, 16), 15);
  });
  test('invalid beat count yields 0', () => {
    assert.equal(beatIndexForPhase(0.5, 0), 0);
  });
});
