const BASE_SIZE = 180;
const DETAIL_REFERENCE_SIZE = 120;
const MAX_DETAIL_SCALE = 2.5;
const VARIANTS = new Set(['any', 'maskable']);

const params = new URLSearchParams(window.location.search);
const icon = document.getElementById('icon');
const variant = params.get('variant');
const size = Number(params.get('size'));
const target = Number(params.get('target')) || size;

if (VARIANTS.has(variant)) {
  icon.dataset.variant = variant;
}
if (Number.isFinite(size) && size > 0) {
  icon.style.zoom = String(size / BASE_SIZE);
}
if (Number.isFinite(target) && target > 0) {
  const detailScale = Math.min(MAX_DETAIL_SCALE, Math.max(1, DETAIL_REFERENCE_SIZE / target));
  icon.style.setProperty('--k', String(detailScale));
}
