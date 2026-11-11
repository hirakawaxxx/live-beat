// Modal sound picker built on <dialog>. DOM APIs only (strict CSP: no inline script/style).
const PART_LABELS = {
  drums: 'ドラム',
  bass: 'ベース',
  chords: 'コード',
  percussion: 'パーカッション',
};
// A touch release can land on the freshly opened dialog; ignore clicks right after open.
const OPEN_GUARD_MS = 350;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function createSoundPicker(dialog) {
  const title = el('h2', 'ui-text-heading', '音を選ぶ');
  title.id = 'sound-picker-title';
  const subtitle = el('p', 'ui-text-caption');
  const list = el('div', 'sound-picker__list');
  const resetBtn = el('button', 'ui-button', 'パックの初期設定に戻す');
  resetBtn.type = 'button';
  const closeBtn = el('button', 'ui-button', '閉じる');
  closeBtn.type = 'button';
  const actions = el('div', 'sound-picker__actions');
  actions.append(resetBtn, closeBtn);
  const panel = el('div', 'sound-picker__panel');
  panel.append(title, subtitle, list, actions);
  dialog.setAttribute('aria-labelledby', title.id);
  dialog.replaceChildren(panel);

  let session = null; // { sounds, onSelect, onReset, openedAt }

  const close = () => {
    if (!dialog.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  const guarded = () => session !== null && performance.now() - session.openedAt >= OPEN_GUARD_MS;

  const renderList = (sounds, currentSrc) => {
    const groups = new Map();
    sounds.forEach((sound, index) => {
      if (!groups.has(sound.part)) groups.set(sound.part, []);
      groups.get(sound.part).push({ sound, index });
    });
    const sections = [...groups].map(([part, items]) => {
      const section = el('section', 'sound-picker__group');
      section.append(el('h3', 'ui-text-label sound-picker__part', PART_LABELS[part] ?? part));
      const ul = el('ul', 'sound-picker__items');
      for (const { sound, index } of items) {
        const li = el('li');
        const btn = el('button', 'ui-button sound-picker__item', sound.label);
        btn.type = 'button';
        btn.dataset.index = String(index);
        if (sound.src === currentSrc) btn.setAttribute('aria-current', 'true');
        li.append(btn);
        ul.append(li);
      }
      section.append(ul);
      return section;
    });
    list.replaceChildren(...sections);
  };

  list.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-index]');
    if (!btn || !guarded()) return;
    const { sounds, onSelect } = session;
    const sound = sounds[Number(btn.dataset.index)];
    close();
    if (sound) onSelect(sound);
  });

  resetBtn.addEventListener('click', () => {
    if (!guarded()) return;
    const { onReset } = session;
    close();
    onReset();
  });

  closeBtn.addEventListener('click', () => {
    if (guarded()) close();
  });

  // Click on the backdrop (the dialog element itself, outside the panel) dismisses.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && guarded()) close();
  });

  dialog.addEventListener('close', () => {
    session = null;
  });

  return {
    isOpen: () => dialog.open,
    close,
    open({ heading, caption, sounds, currentSrc, isDefault, onSelect, onReset }) {
      if (dialog.open) return;
      title.textContent = heading;
      subtitle.textContent = caption;
      resetBtn.disabled = isDefault;
      renderList(sounds, currentSrc);
      session = { sounds, onSelect, onReset, openedAt: performance.now() };
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
    },
  };
}
