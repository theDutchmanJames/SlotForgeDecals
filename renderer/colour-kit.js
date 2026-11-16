/* SlotForge Decals — colour helpers added to every colour field: an eyedropper (pick any
   colour on screen) and quick swatches for recently used colours and colours on the sheet. */
'use strict';
const ColourKit = (() => {
  const MAX_SWATCHES = 8;
  let provider = { recent: () => [], sheet: () => [], remember: () => {} };
  const normal = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

  // Most-used first; ignores transparent fills and non-hex values.
  function sheetColours(items) {
    const counts = new Map();
    const visit = i => {
      for (const key of ['fill', 'stroke', 'fill2']) {
        if (key === 'stroke' && !(i.strokeWidth > 0)) continue;
        const c = normal(i[key]);
        if (c) counts.set(c, (counts.get(c) || 0) + 1);
      }
      (i.children || []).forEach(visit);
    };
    items.forEach(visit);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }
  function addRecent(list, colour, max = 12) {
    const c = normal(colour);
    if (!c) return list;
    return [c, ...list.filter(x => x !== c)].slice(0, max);
  }
  function palette() {
    const recent = provider.recent().map(normal).filter(Boolean);
    return [...new Set([...recent, ...provider.sheet().map(normal).filter(Boolean)])].slice(0, MAX_SWATCHES);
  }
  function apply(input, colour) {
    if (input.disabled) return;
    input.value = colour;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function strip(input) {
    const box = document.createElement('div');
    box.className = 'colour-kit';
    const dropper =
      typeof EyeDropper === 'function'
        ? '<button type="button" class="colour-dropper" title="Pick a colour from the screen" aria-label="Pick a colour from the screen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4l6 6 M17 3l4 4-3 3-4-4z M15 9L6 18l-3 3v-3l9-9"/></svg></button>'
        : '';
    box.innerHTML =
      dropper +
      palette()
        .map(
          c =>
            `<button type="button" class="swatch" data-colour="${c}" style="background:${c}" title="${c}" aria-label="Use colour ${c}"></button>`
        )
        .join('');
    box.onclick = async e => {
      const button = e.target.closest('button');
      if (!button || input.disabled) return;
      if (button.dataset.colour) return apply(input, button.dataset.colour);
      try {
        const { sRGBHex } = await new EyeDropper().open();
        const c = normal(sRGBHex);
        if (c) apply(input, c);
      } catch {
        /* The user cancelled the eyedropper with Escape. */
      }
    };
    for (const b of box.querySelectorAll('button')) b.disabled = input.disabled;
    return box;
  }
  function enhance(root = document) {
    for (const input of root.querySelectorAll('input[type="color"]:not([data-colour-kit])')) {
      input.dataset.colourKit = '';
      input.after(strip(input));
    }
  }
  function configure(next) {
    provider = { ...provider, ...next };
  }
  if (typeof document !== 'undefined') {
    new MutationObserver(() => enhance()).observe(document.body, { childList: true, subtree: true });
    document.addEventListener(
      'change',
      e => {
        if (e.target.matches?.('input[type="color"]')) provider.remember(normal(e.target.value));
      },
      true
    );
    enhance();
  }
  return { configure, enhance, sheetColours, addRecent, normal };
})();
if (typeof module === 'object') module.exports = ColourKit;
