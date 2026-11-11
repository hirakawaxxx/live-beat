export function barDurationSec(bpm) {
  return (60 / bpm) * 4;
}

export function nextBarTime(currentTime, originTime, barDur) {
  if (barDur <= 0) throw new Error('barDur must be positive');
  const elapsed = currentTime - originTime;
  const bars = Math.ceil(elapsed / barDur - 1e-9);
  const n = Math.max(0, bars);
  return originTime + n * barDur;
}

export function beatDurationSec(bpm) {
  return 60 / bpm;
}

export function beatsForDuration(durationSec, bpm) {
  return Math.round(durationSec / beatDurationSec(bpm));
}

// Same grid math as nextBarTime, for an arbitrary cycle length.
export function nextCycleTime(currentTime, originTime, cycleDur) {
  return nextBarTime(currentTime, originTime, cycleDur);
}

// Nothing active: next bar. Otherwise: next boundary of this pad's own loop cycle
// on the shared grid (not the longest active cycle).
export function quantizeOnTime({ currentTime, originTime, barDur, padCycleDur, hasActive }) {
  if (!hasActive) return nextBarTime(currentTime, originTime, barDur);
  return nextCycleTime(currentTime, originTime, padCycleDur);
}
