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
