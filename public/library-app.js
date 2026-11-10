import { assertCatalog } from './js/pack-schema.js';

const list = document.querySelector('#pack-list');
const statusEl = document.querySelector('#status');

const createPackCard = (pack) => {
  const title = document.createElement('span');
  title.className = 'ui-text-heading';
  title.textContent = pack.title;

  const bpm = document.createElement('span');
  bpm.className = 'ui-text-label';
  bpm.textContent = `${pack.bpm} BPM`;

  const a = document.createElement('a');
  a.className = 'ui-card ui-card--selectable pack-card';
  a.href = `/play.html?pack=${encodeURIComponent(pack.id)}`;
  a.append(title, bpm);
  return a;
};

try {
  const res = await fetch('/packs/catalog.json');
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const catalog = assertCatalog(await res.json());
  list.replaceChildren(...catalog.packs.map(createPackCard));
  statusEl.textContent = '';
} catch (err) {
  console.error(err);
  statusEl.textContent = 'パック一覧を読み込めませんでした。';
}
