'use strict';
// Making artwork on the canvas (remake option B, docs/ui-reference/making-2026-11): the rail's Text,
// Number and Shape buttons open a flyout of templates; a template then waits for the sheet. Drag to
// draw a shape at the size you want, click to drop text or numbers there, or press Enter to add it
// in free space. Text is typed straight onto the sheet with a small text bar above it.
const MakeTools = (() => {
  const BASIC = [
    ['rect', 'Rectangle'],
    ['ellipse', 'Circle'],
    ['triangle', 'Triangle'],
    ['line', 'Line'],
    ['stripe', 'Double stripe']
  ];
  // Text styles: what each one sets on a new text decal.
  const TEXT = {
    plain: ['Plain', { text: 'Text', font: 'Arial', bold: false, italic: false, fill: '#111827' }],
    bold: ['Bold', { text: 'TEXT', font: 'Arial', bold: true, italic: false, fill: '#111827' }],
    sponsor: ['Sponsor', { text: 'SPONSOR', font: 'Arial', bold: true, italic: true, fill: '#d92b2b' }],
    outlined: [
      'Outlined',
      {
        text: 'CUP',
        font: 'Arial',
        bold: true,
        italic: true,
        fill: '#ffffff',
        stroke: '#111111',
        strokeWidth: 0.3
      }
    ],
    arched: [
      'Arched',
      { text: 'CLUB RACING', font: 'Arial', bold: true, italic: false, fill: '#1d3f8f', curve: 120 }
    ],
    number: ['Number', { text: '27', font: 'Arial', bold: true, italic: false, fill: '#111827' }]
  };
  let open = null, // which flyout is showing
    textStyle = 'plain';
  const box = () => $('#make-flyout');
  const thumb = art => `<img src="${E(Art.url(Art.standalone(art, activeFonts())))}" alt="">`;

  function basicItem(kind, w, h) {
    const sizes = { line: [40, 1], stripe: [55, 5], ellipse: [22, 22] }[kind] || [22, 16];
    const i = DM.item(kind, {
      w: w ?? sizes[0],
      h: kind === 'line' || kind === 'stripe' ? sizes[1] : (h ?? sizes[1])
    });
    if (kind === 'ellipse' && w == null) i.h = i.w;
    return i;
  }
  function shapeItem(type, w, h) {
    if (BASIC.some(b => b[0] === type)) return basicItem(type, w, h);
    const defaults = ShapeTools.create(type).shapeOptions;
    if (type === 'checkerboard') return ShapeTools.create(type, defaults);
    if (type === 'stripes') return ShapeTools.create(type, { ...defaults, w: w ?? defaults.w });
    return ShapeTools.create(type, { ...defaults, w: w ?? defaults.w, h: h ?? defaults.h });
  }
  function textItem(style, size = 6) {
    const [, s] = TEXT[style] || TEXT.plain,
      i = DM.item('text', { h: size, spacing: 0, strokeWidth: 0, stroke: '#111111', ...s });
    delete i.curve;
    remeasureText(i);
    if (s.curve) Art.bendText(i, s.curve);
    i.name = s.text === 'Text' ? 'Text' : (TEXT[style]?.[0] || 'Text') + ' text';
    return i;
  }

  // ---- flyouts
  function show(kind, anchor) {
    try {
      CanvasTools.resolve();
    } catch (e) {
      fail(e);
      return;
    }
    if (open === kind && !box().hidden) return close();
    open = kind;
    const el = box();
    el.hidden = false;
    el.dataset.kind = kind;
    const a = (anchor || $(`.tool-rail [data-flyout="${kind}"]`))?.getBoundingClientRect(),
      body = $('.wb-body').getBoundingClientRect();
    el.style.top = Math.max(8, Math.min((a?.top ?? 120) - body.top - 8, body.height - 560)) + 'px';
    if (kind === 'shape') {
      const tiles = [
        ...BASIC.map(([k, name]) => [k, name, basicItem(k)]),
        ...Object.entries(ShapeTools.presets).map(([k, name]) => [k, name, ShapeTools.create(k)])
      ];
      el.innerHTML = `<header>${icon('shape')}<h3>Shapes &amp; stripes</h3><span class="spacer"></span><button class="ghost icon-only" data-fly-close aria-label="Close">${icon('x')}</button></header><div class="fly-grid">${tiles
        .map(
          ([k, name, art]) =>
            `<button class="fly-cell" data-place="${k}" title="${E(name)}">${thumb(art)}<span>${E(name)}</span></button>`
        )
        .join(
          ''
        )}</div><footer><span class="hint">Pick one, then drag on the sheet. Shift keeps its proportions; Enter adds it in free space.</span><button data-action="number-template">${icon('hash')}Racing numbers</button></footer>`;
      for (const b of el.querySelectorAll('[data-place]'))
        b.onclick = () => {
          for (const x of el.querySelectorAll('[data-place]'))
            x.setAttribute('aria-pressed', String(x === b));
          placeShape(b.dataset.place, b.querySelector('span').textContent);
        };
    }
    if (kind === 'text') {
      el.innerHTML = `<header>${icon('text')}<h3>Text</h3><span class="spacer"></span><button class="ghost icon-only" data-fly-close aria-label="Close">${icon('x')}</button></header><div class="fly-grid">${Object.entries(
        TEXT
      )
        .map(
          ([k, [name]]) =>
            `<button class="fly-cell" data-text-style="${k}" aria-pressed="${k === textStyle}">${thumb(textItem(k))}<span>${E(name)}</span></button>`
        )
        .join(
          ''
        )}</div><footer><span class="hint">Click on the sheet where the text goes, then type. Enter adds it in free space.</span></footer>`;
      for (const b of el.querySelectorAll('[data-text-style]'))
        b.onclick = () => {
          textStyle = b.dataset.textStyle;
          for (const x of el.querySelectorAll('[data-text-style]'))
            x.setAttribute('aria-pressed', String(x === b));
          placeText();
        };
      placeText();
    }
    if (kind === 'number') {
      el.innerHTML = `<header>${icon('hash')}<h3>Racing numbers</h3><span class="spacer"></span><button class="ghost icon-only" data-fly-close aria-label="Close">${icon('x')}</button></header><div class="fly-body" id="fly-numbers"></div>`;
      CreationUI.numberDialog(
        (art, count) => {
          close();
          numberCommit(art, count);
        },
        $('#fly-numbers'),
        (art, count) => placeNumbers(Array.isArray(art) ? art : [art], count)
      );
    }
    el.querySelector('[data-fly-close]').onclick = () => close();
    railState();
  }
  function close() {
    open = null;
    if (box()) box().hidden = true;
    if (CanvasTools.active?.kind === 'place') CanvasTools.active.cancel();
    railState();
  }
  function railState() {
    for (const b of $$('.tool-rail [data-flyout]'))
      b.setAttribute('aria-pressed', String(open === b.dataset.flyout && !box().hidden));
  }

  // ---- waiting for the sheet: a canvas tool that draws, drops or adds
  function waitForSheet({ name, hint, draw = false, make, after }) {
    CanvasTools.active?.kind === 'place' && CanvasTools.active.cancel(true);
    let start = null,
      end = null,
      pointerId = null;
    const ghost = () => {
      const overlay = canvasToolOverlay(),
        label = $('#place-dims');
      overlay.setAttribute('pointer-events', 'none');
      if (!start || !end) {
        overlay.innerHTML = '';
        label.hidden = true;
        return;
      }
      const r = rect();
      overlay.innerHTML = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#2f8cff22" stroke="#2f8cff" stroke-width=".3" stroke-dasharray="1.2 .8"/>`;
      const p = $('#paper').getBoundingClientRect(),
        panel = $('.editor-panel').getBoundingClientRect(),
        k = p.width / DM.size(project).w;
      label.hidden = false;
      label.textContent = `${fmt(r.w)} × ${fmt(r.h)} mm`;
      label.style.left = p.left - panel.left + (r.x + r.w / 2) * k + 'px';
      label.style.top = p.top - panel.top + (r.y + r.h) * k + 10 + 'px';
    };
    let shift = false;
    const rect = () => {
      let w = Math.abs(end.x - start.x),
        h = Math.abs(end.y - start.y);
      if (shift) {
        const d = make(),
          ratio = d.w / d.h;
        if (w / h > ratio) h = w / ratio;
        else w = h * ratio;
      }
      return {
        x: end.x < start.x ? start.x - w : start.x,
        y: end.y < start.y ? start.y - h : start.y,
        w,
        h
      };
    };
    function done(point, size) {
      const tool = CanvasTools.active;
      CanvasTools.active = null;
      canvasToolOverlay().innerHTML = '';
      $('#place-dims').hidden = true;
      if (tool) close();
      try {
        const i = size ? make(size.w, size.h) : make();
        if (!point) {
          mutate(() => place(i));
        } else {
          const x = size ? point.x : point.x - i.w / 2,
            y = size ? point.y : point.y - i.h / 2;
          mutate(() => place(i, { x, y }));
        }
        after?.(i);
      } catch (e) {
        fail(e);
        render();
      }
    }
    const tool = {
      kind: 'place',
      name,
      mount() {
        $('#inspector').innerHTML =
          `<section id="place-controls" class="canvas-tool-panel"><h2 class="inspector-title">${E(name)}</h2><p class="hint">${hint}</p><div class="canvas-tool-commit"><button id="place-free" class="primary">Add in free space</button><button id="place-cancel">Cancel</button></div></section>`;
        $('#place-free').onclick = () => done(null);
        $('#place-cancel').onclick = () => close();
      },
      draw: ghost,
      pointer(type, e) {
        if (type === 'down') {
          if (e.button !== 0) return;
          e.preventDefault();
          pointerId = e.pointerId;
          start = end = svgPoint(e);
          shift = e.shiftKey;
          $('#sheet-scroll').setPointerCapture(e.pointerId);
          ghost();
        } else if (type === 'move' && start && e.pointerId === pointerId) {
          end = svgPoint(e);
          shift = e.shiftKey;
          if (draw) ghost();
        } else if (type === 'up' && start && e.pointerId === pointerId) {
          const r = rect();
          if ($('#sheet-scroll').hasPointerCapture(e.pointerId))
            $('#sheet-scroll').releasePointerCapture(e.pointerId);
          const p = start;
          start = end = null;
          if (draw && Math.max(r.w, r.h) >= 2)
            done({ x: r.x, y: r.y }, { w: Math.max(r.w, 0.5), h: Math.max(r.h, 0.5) });
          else done(p);
        } else if (type === 'cancel') {
          start = end = null;
          ghost();
        }
      },
      key(e) {
        if (e.target.matches?.('input,textarea,select')) return false;
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return true;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          done(null);
          return true;
        }
        return false;
      },
      cancel(keepFlyout = false) {
        if (CanvasTools.active !== tool) return;
        CanvasTools.active = null;
        canvasToolOverlay().innerHTML = '';
        $('#place-dims').hidden = true;
        if (!keepFlyout) open = null;
        if (!keepFlyout && box()) box().hidden = true;
        railState();
        render();
      }
    };
    CanvasTools.active = tool;
    showTab('right', 'decal', false);
    render();
  }
  function placeShape(type, name) {
    waitForSheet({
      name: 'Draw: ' + name,
      hint: 'Drag on the sheet to draw it at the size you want, or click to drop it at its usual size. Shift keeps its proportions. Esc stops.',
      draw: true,
      make: (w, h) => shapeItem(type, w, h)
    });
  }
  function placeText() {
    waitForSheet({
      name: 'Text: ' + TEXT[textStyle][0],
      hint: 'Click on the sheet where the text goes, then type. Esc stops.',
      make: () => textItem(textStyle),
      after: i => requestAnimationFrame(() => editText(i.id, true))
    });
  }
  function placeNumbers(plates, count) {
    let first = true;
    waitForSheet({
      name: 'Racing numbers',
      hint: `${plates.length * count} ${plates.length * count === 1 ? 'decal goes' : 'decals go'} where you click, in rows from there. Esc stops.`,
      make: () => DM.clone(plates[0]),
      after: () => {}
    });
    // Numbers are many decals: replace the single drop with a row layout from the clicked point.
    const tool = CanvasTools.active,
      pointer = tool.pointer;
    tool.pointer = (type, e) => {
      if (type !== 'up' || !first) return pointer(type, e);
      first = false;
      const p = svgPoint(e);
      if ($('#sheet-scroll').hasPointerCapture(e.pointerId))
        $('#sheet-scroll').releasePointerCapture(e.pointerId);
      CanvasTools.active = null;
      canvasToolOverlay().innerHTML = '';
      $('#place-dims').hidden = true;
      close();
      try {
        numberRows(plates, count, p);
      } catch (err) {
        fail(err);
        render();
      }
    };
    const free = () => {
      CanvasTools.active = null;
      close();
      numberCommit(plates.length === 1 ? plates[0] : plates, count);
    };
    tool.key = e => {
      if (e.key === 'Enter' && !e.target.matches?.('input,textarea,select')) {
        e.preventDefault();
        free();
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    };
    tool.mount = () => {
      $('#inspector').innerHTML =
        `<section id="place-controls" class="canvas-tool-panel"><h2 class="inspector-title">Racing numbers</h2><p class="hint">Click on the sheet where the first one goes. The rest follow in rows.</p><div class="canvas-tool-commit"><button id="place-free" class="primary">Add in free space</button><button id="place-cancel">Cancel</button></div></section>`;
      $('#place-free').onclick = free;
      $('#place-cancel').onclick = () => close();
    };
    render();
  }
  // Numbers in rows from a point; what does not fit there goes into free space, as Add does.
  function numberRows(plates, count, p) {
    const s = DM.size(project),
      gap = project.gap,
      right = s.w - project.margin,
      bottom = s.h - project.margin;
    const decals = plates.flatMap(art => Array.from({ length: count }, () => DM.clone(art)));
    if (project.items.length + decals.length > 2000) throw Error('A project supports up to 2,000 decals.');
    let x = Math.max(project.margin, p.x - decals[0].w / 2),
      y = Math.max(project.margin, p.y - decals[0].h / 2);
    const left = x,
      rest = [];
    let rowH = 0;
    const ids = [];
    mutate(() => {
      for (const art of plates) retainArtworkFonts(art);
      for (const i of decals) {
        if (x + i.w > right) {
          x = left;
          y += rowH + gap;
          rowH = 0;
        }
        if (x + i.w > right || y + i.h > bottom) {
          rest.push(i);
          continue;
        }
        Object.assign(i, { id: DM.uid(), page, x, y });
        project.items.push(i);
        ids.push(i.id);
        x += i.w + gap;
        rowH = Math.max(rowH, i.h);
      }
      selected = new Set(ids);
    });
    if (rest.length) addNumberBatch(rest, 1);
    else
      toast(
        `Added ${decals.length} racing number ${decals.length === 1 ? 'decal' : 'decals'}. Each stays editable.`
      );
  }

  // ---- typing on the sheet
  let editing = null;
  function editText(id, fresh = false) {
    finishText();
    const i = project.items.find(x => x.id === id);
    if (!i || i.kind !== 'text' || i.locked) return;
    selected = new Set([id]);
    render();
    const input = document.createElement('input'),
      bar = $('#text-bar');
    input.id = 'text-inline';
    input.value = i.text;
    input.setAttribute('aria-label', 'Text on the sheet');
    $('.editor-panel').append(input);
    editing = { id, input, typed: false, fresh };
    const fonts = ['Arial', 'Georgia', 'Verdana', 'Courier New', ...activeFonts().map(f => f.family)];
    bar.innerHTML = `<select id="text-bar-font" aria-label="Typeface">${[...new Set(fonts)].map(f => `<option value="${E(f)}" ${f === i.font ? 'selected' : ''}>${E(activeFonts().find(x => x.family === f)?.name || f)}</option>`).join('')}</select><button id="text-bar-bold" class="${i.bold ? 'active' : ''}" aria-pressed="${!!i.bold}" title="Bold"><b>B</b></button><button id="text-bar-italic" class="${i.italic ? 'active' : ''}" aria-pressed="${!!i.italic}" title="Italic"><i>I</i></button><span class="text-bar-sep"></span><label>Bend<input id="text-bar-bend" type="range" min="-300" max="300" step="5" value="${i.curve || 0}"></label><label>Spacing<input id="text-bar-spacing" type="number" min="-10" max="50" step=".5" value="${i.spacing || 0}"></label><span class="text-bar-sep"></span><input id="text-bar-fill" type="color" value="${i.fill === 'none' ? '#111111' : i.fill}" aria-label="Text colour"><button id="text-bar-done" class="primary">Done</button>`;
    bar.hidden = false;
    const change = (fn, coalesce = true) => {
      const live = project.items.find(x => x.id === id);
      if (!live) return finishText();
      mutate(() => fn(project.items.find(x => x.id === id)), coalesce && editing.typed);
      editing.typed = true;
      position();
    };
    input.oninput = () =>
      change(t => {
        t.text = input.value.slice(0, 500) || ' ';
        remeasureText(t);
        if (t.curve) Art.bendText(t, t.curve);
      });
    input.onkeydown = e => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishText();
      }
    };
    input.onblur = () =>
      setTimeout(() => {
        if (
          editing?.input === input &&
          !bar.contains(document.activeElement) &&
          document.activeElement !== input
        )
          finishText();
      }, 0);
    for (const b of bar.querySelectorAll('button')) b.onmousedown = e => e.preventDefault();
    $('#text-bar-bold').onclick = () =>
      change(t => {
        t.bold = !t.bold;
        remeasureText(t);
      }, false);
    $('#text-bar-italic').onclick = () =>
      change(t => {
        t.italic = !t.italic;
        remeasureText(t);
      }, false);
    $('#text-bar-font').onchange = e =>
      change(t => {
        t.font = e.target.value;
        retainArtworkFonts(t);
        remeasureText(t);
      }, false);
    $('#text-bar-bend').oninput = e => change(t => Art.bendText(t, Number(e.target.value)));
    $('#text-bar-spacing').onchange = e =>
      change(t => {
        t.spacing = DM.number(e.target.value, -10, 50, 'Letter spacing');
        remeasureText(t);
      }, false);
    $('#text-bar-fill').onchange = e => change(t => (t.fill = e.target.value), false);
    $('#text-bar-done').onclick = () => finishText();
    position();
    input.focus();
    if (fresh) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }
  // The typing box lies over the text on the sheet; the text bar sits just above it.
  function position() {
    if (!editing) return;
    const node = $(`#paper .sheet-item[data-id="${CSS.escape(editing.id)}"]`),
      i = project.items.find(x => x.id === editing.id);
    if (!node || !i) return;
    const r = node.getBoundingClientRect(),
      panel = $('.editor-panel').getBoundingClientRect(),
      input = editing.input,
      bar = $('#text-bar');
    Object.assign(input.style, {
      left: r.left - panel.left - 4 + 'px',
      top: r.top - panel.top - 2 + 'px',
      width: Math.max(r.width + 8, 80) + 'px',
      height: r.height + 4 + 'px',
      fontFamily: `"${i.font}", Arial, sans-serif`,
      fontSize: Math.max(10, r.height * 0.78) + 'px',
      fontWeight: i.bold ? 700 : 400,
      fontStyle: i.italic ? 'italic' : 'normal'
    });
    const bw = bar.offsetWidth || 520;
    bar.style.left =
      Math.max(8, Math.min(r.left - panel.left + r.width / 2 - bw / 2, panel.width - bw - 8)) + 'px';
    bar.style.top = Math.max(8, r.top - panel.top - bar.offsetHeight - 14) + 'px';
  }
  function finishText() {
    if (!editing) return;
    const { id, input } = editing;
    editing = null;
    input.remove();
    $('#text-bar').hidden = true;
    const i = project.items.find(x => x.id === id);
    if (i && !i.text.trim()) mutate(() => (i.text = 'Text'), true);
    render();
  }
  const isEditing = () => !!editing;
  return { show, close, editText, finishText, position, isEditing, shapeItem, textItem };
})();
// The sheet is redrawn on every change: keep the typing box over its text.
window.addEventListener('resize', () => MakeTools.position());
