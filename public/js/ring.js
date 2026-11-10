const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_RADIUS = 44;
const BAR_BEATS = 4;
const SEGMENT_FILL = 0.82; // fraction of a beat slot that is drawn; the rest is the gap

// Index (0..beats-1) of the beat the phase (0..1) currently sits in.
export function beatIndexForPhase(phase, beats) {
  if (!(beats > 0)) return 0;
  const wrapped = ((phase % 1) + 1) % 1;
  return Math.min(beats - 1, Math.floor(wrapped * beats));
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

// Ring of `beats` arc segments. Styling is done in CSS via data-state and segment classes.
export function createRing(beats) {
  const svg = svgEl('svg', { viewBox: '0 0 100 100', focusable: 'false', 'aria-hidden': 'true' });
  svg.setAttribute('class', 'pad-ring');
  const group = svgEl('g', { transform: 'rotate(-90 50 50)' });
  const segments = [];
  for (let i = 0; i < beats; i += 1) {
    const segment = svgEl('circle', {
      cx: 50,
      cy: 50,
      r: RING_RADIUS,
      pathLength: beats,
      'stroke-dasharray': `${SEGMENT_FILL} ${beats - SEGMENT_FILL}`,
      'stroke-dashoffset': -i,
    });
    segment.setAttribute('class', i % BAR_BEATS === 0 ? 'pad-ring__seg is-bar' : 'pad-ring__seg');
    group.append(segment);
    segments.push(segment);
  }
  svg.append(group);
  return { svg, segments, lit: -1, head: -1 };
}

// Lights segments 0..head (playing) or only the head (waiting); returns a new ring state.
// DOM is touched only when the visible beat changes.
export function updateRing(ring, { state, phase, beats }) {
  const head = state === 'off' ? -1 : beatIndexForPhase(phase, beats);
  const lit = state === 'playing' || state === 'stopping' ? head : -1;
  if (head === ring.head && lit === ring.lit) return ring;
  ring.segments.forEach((segment, i) => {
    segment.classList.toggle('is-lit', i <= lit);
    segment.classList.toggle('is-head', i === head);
  });
  return { ...ring, head, lit };
}
