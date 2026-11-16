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
  // Recolouring: colours in native shapes and inside SVG artwork (hex and rgb()).
  const SVG_COLOUR =
    /#[0-9a-f]{6}(?![0-9a-z])|#[0-9a-f]{3}(?![0-9a-z])|rgb\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*\)/gi;
  function toHex(raw) {
    const c = raw.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(c)) return c;
    if (/^#[0-9a-f]{3}$/.test(c)) return '#' + [...c.slice(1)].map(x => x + x).join('');
    const m = /^rgb\(\s*(\d{1,3})(%?)\s*,\s*(\d{1,3})(%?)\s*,\s*(\d{1,3})(%?)\s*\)$/.exec(c);
    if (!m) return null;
    const v = (n, pct) => Math.max(0, Math.min(255, Math.round(pct ? (Number(n) * 255) / 100 : Number(n))));
    return (
      '#' + [v(m[1], m[2]), v(m[3], m[4]), v(m[5], m[6])].map(n => n.toString(16).padStart(2, '0')).join('')
    );
  }
  // Common CSS colour names used in SVG files, as attribute or style values.
  const NAMED = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    yellow: '#ffff00',
    orange: '#ffa500',
    gray: '#808080',
    grey: '#808080',
    silver: '#c0c0c0',
    navy: '#000080',
    maroon: '#800000',
    purple: '#800080',
    lime: '#00ff00',
    aqua: '#00ffff',
    cyan: '#00ffff',
    fuchsia: '#ff00ff',
    magenta: '#ff00ff',
    teal: '#008080',
    olive: '#808000'
  };
  const NAMED_COLOUR = new RegExp(
    `((?:fill|stroke|stop-color|color)\\s*(?:=\\s*["']|:\\s*))(${Object.keys(NAMED).join('|')})(?![\\w-])`,
    'gi'
  );
  // Shapes without their own fill are drawn in black unless an ancestor sets one; a fill on
  // the root <svg> is inherited by them, so default black can be recoloured there.
  const DRAWABLE = /<(path|text|tspan|rect|circle|ellipse|polygon|polyline)\b([^>]*)>/gi;
  function usesDefaultBlack(svg) {
    const root = /<svg\b[^>]*>/i.exec(svg)?.[0] || '';
    if (/\sfill\s*=|fill\s*:/i.test(root)) return false;
    for (const [, , attrs] of svg.matchAll(DRAWABLE)) if (!/\bfill\s*=|fill\s*:/i.test(attrs)) return true;
    return false;
  }
  // Colours used by these decals, most-used first. Raster images are not included.
  function coloursIn(items) {
    const counts = new Map(),
      add = c => c && counts.set(c, (counts.get(c) || 0) + 1);
    const visit = i => {
      if (i.kind === 'svg') {
        const svg = String(i.svg || '');
        for (const m of svg.match(SVG_COLOUR) || []) add(toHex(m));
        for (const m of svg.matchAll(NAMED_COLOUR)) add(NAMED[m[2].toLowerCase()]);
        if (usesDefaultBlack(svg)) add('#000000');
      } else
        for (const key of ['fill', 'stroke', 'fill2']) {
          if (key === 'stroke' && !(i.strokeWidth > 0)) continue;
          add(normal(i[key]));
        }
      (i.children || []).forEach(visit);
    };
    items.forEach(visit);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }
  // Replace colours in place using a map of old hex → new hex. Retained originals
  // (traced or vector-edit sources) are left untouched so they can still be restored.
  function recolour(item, map) {
    const swap = c => map[c] || null;
    if (item.kind === 'svg') {
      let svg = String(item.svg);
      const defaultBlack = swap('#000000') && usesDefaultBlack(svg);
      svg = svg.replace(SVG_COLOUR, m => swap(toHex(m)) || m);
      svg = svg.replace(NAMED_COLOUR, (m, lead, name) =>
        swap(NAMED[name.toLowerCase()]) ? lead + swap(NAMED[name.toLowerCase()]) : m
      );
      if (defaultBlack) svg = svg.replace(/<svg\b/i, `<svg fill="${swap('#000000')}"`);
      item.svg = svg;
    } else
      for (const key of ['fill', 'stroke', 'fill2']) {
        const c = normal(item[key]);
        if (c && swap(c)) item[key] = swap(c);
      }
    (item.children || []).forEach(child => recolour(child, map));
    return item;
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
  return { configure, enhance, sheetColours, addRecent, normal, toHex, coloursIn, recolour };
})();
if (typeof module === 'object') module.exports = ColourKit;
