'use strict';
// The Car page (remake option A, docs/ui-reference/car-2026-11): the whole livery on the side and
// top views at once. Every decal of the sheet is listed with where it sits; drag one onto the car,
// move it there or resize it by its corners (that is its printed size too). "Your car" picks the
// body, scale and measurements, and measures your own photo from two pins.
const CarPage = (() => {
  const VIEWS = ['side', 'top'];
  let mode = 'livery', // 'livery' | 'garage' | 'measure'
    focus = null,
    gesture = null,
    measure = null, // { view, src, width, height, pins: [] }
    editing = false;
  const root = () => document.getElementById('car-page');
  const isOpen = () => !!root() && !root().hidden;
  const view = () => (['side', 'top', 'both'].includes(settings.carPageView) ? settings.carPageView : 'both');
  const decals = () => project.items;
  const item = id => project.items.find(i => i.id === id);
  const heightOf = v => (v === 'top' ? project.preview.width : project.preview.height);
  const source = v => project.preview[v] || carData[carBody()]?.[v];
  const pct = (a, b) => Math.round((a / b) * 100);

  function show(options = {}) {
    try {
      CanvasTools.resolve();
    } catch (e) {
      fail(e);
      return;
    }
    Workshop.hide();
    Shelf.hide();
    PrintPage.hide();
    SettingsPage.hide();
    closeDialog();
    mode = options.garage ? 'garage' : 'livery';
    if (options.focus) focus = options.focus;
    else if (!item(focus)) focus = [...selected][0] || null;
    root().hidden = false;
    document.body.classList.add('carpage-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'car-page');
    Finder.close();
    loadCar(carBody())
      .then(() => render())
      .catch(fail);
    render();
  }
  function hide() {
    if (!isOpen()) return;
    cancelGesture();
    root().hidden = true;
    document.body.classList.remove('carpage-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'editor');
    renderPaper();
  }

  // One view of the car in millimetres: the picture, every decal placed on that view, and the
  // chosen decal's outline and corner handles.
  function viewMarkup(v, widthPx, bare = false) {
    const src = source(v);
    if (!src) return `<div class="cp-loading">Loading the car…</div>`;
    const length = project.preview.length,
      h = heightOf(v),
      b = src.bounds || { x: 0, y: 0, w: src.width, h: src.height },
      k = widthPx / length,
      hs = 9 / k;
    const placed = decals()
      .filter(i => !bare && i.carPositions?.[v])
      .map((i, n) => {
        const p = i.carPositions[v],
          on = i.id === focus,
          rot = `rotate(${i.rotation || 0} ${p.x + i.w / 2} ${p.y + i.h / 2})`;
        return `<g class="cp-decal ${on ? 'on' : ''}" data-cp-id="${E(i.id)}"><title>${E(i.name)}</title>${Art.element({ ...i, x: p.x, y: p.y }, `cp-${v}-${n}`, 'all')}<rect transform="${rot}" x="${p.x}" y="${p.y}" width="${i.w}" height="${i.h}" fill="transparent" ${on ? `stroke="#2f8cff" stroke-width="${1.5 / k}" stroke-dasharray="${4 / k} ${3 / k}"` : ''}/>${
          on && !i.locked
            ? [
                ['nw', p.x, p.y],
                ['ne', p.x + i.w, p.y],
                ['sw', p.x, p.y + i.h],
                ['se', p.x + i.w, p.y + i.h]
              ]
                .map(
                  ([c, x, y]) =>
                    `<rect class="cp-handle" data-cp-handle="${c}" x="${x - hs / 2}" y="${y - hs / 2}" width="${hs}" height="${hs}" rx="${hs / 5}" fill="#fff" stroke="#2f8cff" stroke-width="${1.5 / k}"/>`
                )
                .join('')
            : ''
        }</g>`;
      })
      .join('');
    return `<svg class="cp-svg" data-cp-svg="${v}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${length} ${h}" width="${widthPx}" height="${(widthPx * h) / length}"><svg width="${length}" height="${h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="none"><image href="${E(src.src)}" width="${src.width}" height="${src.height}"/></svg>${placed}</svg>`;
  }
  function thumb(i, n) {
    const b = DM.bounds(i);
    return `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${Art.element(i, 'cpl-' + n, 'all')}</svg>`;
  }
  function list() {
    const items = decals();
    let lastPage = -1;
    const rows = items
      .map((i, n) => {
        const header = project.pages > 1 && i.page !== lastPage ? `<h4>Page ${i.page + 1}</h4>` : '';
        lastPage = i.page;
        return `${header}<button class="cp-item ${i.id === focus ? 'on' : ''}" data-cp-item="${E(i.id)}" draggable="true"><i>${thumb(i, n)}</i><span class="cp-name"><b>${E(i.name)}</b><small>${fmt(i.w)} × ${fmt(i.h)} mm</small></span><span class="cp-st">${VIEWS.map(v => `<span class="${i.carPositions?.[v] ? 'on' : ''}" title="${i.carPositions?.[v] ? 'Placed' : 'Not placed'} on the ${v === 'top' ? 'top view' : 'side view'}">${v === 'top' ? 'TOP' : 'SIDE'}</span>`).join('')}</span></button>`;
      })
      .join('');
    return `<aside class="cp-list" id="cp-list"><h3>On this sheet · ${items.length} ${items.length === 1 ? 'decal' : 'decals'}</h3>${rows || '<p class="cp-hint">Add decals to the sheet in the Editor first.</p>'}<p class="cp-hint">Drag a decal onto the car. Its place there is saved with the sheet; its size is the size it prints.</p></aside>`;
  }
  function inspector() {
    const i = item(focus);
    if (!i)
      return `<aside class="cp-insp" id="cp-insp"><div class="cp-empty"><b>Pick a decal</b><span>Click one in the list or on the car to size and place it.</span></div></aside>`;
    const share = pct(i.w, project.preview.length);
    const where = VIEWS.map(v => {
      const p = i.carPositions?.[v];
      return `<div class="cp-where"><span>${v === 'top' ? 'From above' : 'Side'}</span>${
        p
          ? `<b>${fmt(p.x)} mm from nose</b><button data-cp-off="${v}" title="Take it off this view">Take off</button>`
          : `<b class="faint">not placed</b><button data-cp-place="${v}" ${i.locked ? 'disabled' : ''}>Place</button>`
      }</div>`;
    }).join('');
    return `<aside class="cp-insp" id="cp-insp"><section><span class="cp-eye">On the car</span><h2 class="cp-title">${E(i.name)}</h2>
      <div class="fields2"><div class="field"><label for="cp-w">Width (mm)</label><input id="cp-w" type="number" min=".1" max="1000" step=".1" value="${Number(i.w.toFixed(2))}" ${i.locked ? 'disabled' : ''}></div><div class="field"><label for="cp-h">Height (mm)</label><input id="cp-h" type="number" min=".1" max="1000" step=".1" value="${Number(i.h.toFixed(2))}" ${i.locked ? 'disabled' : ''}></div></div>
      <label class="check"><input id="cp-aspect" type="checkbox" ${settings.aspectLock !== false ? 'checked' : ''}>Keep proportions</label>
      <div class="cp-share"><span>Of the car’s length</span><i><b style="width:${Math.min(100, share)}%"></b></i><strong>${share}%</strong></div>
      <p class="cp-note" id="cp-note">${i.locked ? 'This decal is locked. Unlock it in the Editor to change it.' : 'Resizing here changes the decal on the sheet too: one decal, one size.'}</p><p class="cp-error" id="cp-error" role="alert"></p></section>
      <section><h3>Where it sits</h3>${where}</section>
      <section><button data-cp-sheet>${icon('sheet')}Show it on the sheet</button></section></aside>`;
  }
  function stageBar() {
    const body = carBody(),
      own = project.preview.side || project.preview.top;
    return `<div class="cp-bar"><button class="cp-car" id="cp-car" title="Change the car, scale or measurements"><img src="${E(project.preview.side?.src || carImage(body, 'side'))}" alt=""><span><b>${own ? 'Your own car' : E(DM.CAR_BODIES[body].label)}</b><small>1:${project.scale} · ${fmt(project.preview.length)} mm long</small></span>${icon('chev')}</button><div class="seg" role="group" aria-label="Views">${[
      ['both', 'Side + top'],
      ['side', 'Side'],
      ['top', 'Top']
    ]
      .map(([k, l]) => `<button data-cp-view="${k}" aria-pressed="${view() === k}">${l}</button>`)
      .join(
        ''
      )}</div><span class="spacer"></span><span class="cp-hint inline">Drag to move · corners resize · Esc cancels</span></div>`;
  }
  function stage() {
    const host = root().querySelector('.cp-stage'),
      width = Math.max(320, Math.min(1100, (host?.clientWidth || 900) - 80)),
      views = view() === 'both' ? VIEWS : [view()];
    return `<div class="cp-stage" id="cp-stage">${views.map(v => `<div class="cp-view" data-cp-view-box="${v}"><span class="cp-eye">${v === 'top' ? 'From above' : 'Left side'}</span>${viewMarkup(v, width)}</div>`).join('')}</div>`;
  }

  // Your car: the bodies, the scale, the measurements written on a drawing, and your own photos.
  function garage() {
    const body = carBody(),
      own = !!(project.preview.side || project.preview.top),
      side = source('side');
    const width = 560,
      imgH = side ? (width * project.preview.height) / project.preview.length : 0;
    return `<div class="cp-garage" id="cp-garage"><header class="cp-ghead"><h2>Your car</h2><span class="spacer"></span><span class="muted">For this sheet: the car on this page and in the fit check.</span><button id="cp-back">${icon('car')}Back to the car</button></header>
      <div class="cp-bodies">${Object.entries(DM.CAR_BODIES)
        .map(
          ([k, c]) =>
            `<button class="cp-body" data-cp-body="${k}" aria-pressed="${!own && k === body}"><img src="${E(carImage(k, 'side'))}" alt=""><b>${E(c.label)}</b><small>real car ${c.length.toLocaleString()} mm</small></button>`
        )
        .join('')}</div>
      <div class="cp-grow"><section class="cp-panel cp-drawing"><h3>Your model’s size</h3><p class="muted">Type over the measurements, or pick a scale and the size follows the real car.</p>
        <div class="cp-draw" style="width:${width + 130}px;height:${imgH + 70}px"><div style="width:${width}px">${side ? viewMarkup('side', width, true) : ''}</div>
          <label class="cp-dim h" style="width:${width}px;top:${imgH + 22}px"><input id="cp-length" type="number" min="5" max="1000" step=".1" value="${fmt(project.preview.length)}" aria-label="Length, nose to tail (mm)"><span>mm long</span></label>
          <label class="cp-dim v" style="left:${width + 16}px;height:${imgH}px"><input id="cp-height" type="number" min="5" max="1000" step=".1" value="${fmt(project.preview.height)}" aria-label="Height, side view (mm)"><span>mm high</span></label></div></section>
        <section class="cp-panel cp-side"><div class="field"><span class="cp-label">Model scale</span><div class="seg" role="group" aria-label="Model scale">${[
          24, 32, 43, 64
        ]
          .map(n => `<button data-cp-scale="${n}" aria-pressed="${project.scale === n}">1:${n}</button>`)
          .join(
            ''
          )}<button data-cp-scale="other" aria-pressed="${![24, 32, 43, 64].includes(project.scale)}">Other</button></div></div>
          <div class="field"><label for="cp-width">Width, seen from above (mm)</label><input id="cp-width" type="number" min="5" max="1000" step=".1" value="${fmt(project.preview.width)}"></div>
          <div class="field"><span class="cp-label">Your own model</span><div class="cp-line"><button data-cp-photo="side">${icon('up')}Side photo…</button><button data-cp-photo="top">${icon('up')}Top photo…</button></div><p class="cp-note">A photo straight from the side works best. You then pin its nose and tail and type how long your model is.</p>${own ? '<button id="cp-included">Use the included car again</button>' : ''}</div>
          <p class="cp-error" id="cp-garage-error" role="alert"></p></section></div></div>`;
  }
  // Measure a photo: pin the nose and the tail, type the model's length.
  function measureMarkup() {
    const m = measure,
      w = 720,
      h = (w * m.height) / m.width,
      steps = [
        ['Photo', true],
        ['Nose', m.pins.length > 0],
        ['Tail', m.pins.length > 1],
        ['Length', false]
      ],
      now = Math.min(m.pins.length + 1, 3);
    const pins = m.pins
      .map((x, n) => `<span class="cp-pin" style="left:${(x / m.width) * w}px"><b>${n + 1}</b></span>`)
      .join('');
    const line =
      m.pins.length === 2
        ? `<span class="cp-measure" style="left:${(Math.min(...m.pins) / m.width) * w}px;width:${(Math.abs(m.pins[1] - m.pins[0]) / m.width) * w}px"></span>`
        : '';
    return `<div class="cp-garage" id="cp-measure-page"><header class="cp-ghead"><h2>Measure your photo</h2><span class="spacer"></span><div class="cp-steps">${steps.map(([l, done], n) => `<span class="${done ? 'done' : n + 1 === now ? 'now' : ''}"><i>${done ? '✓' : n + 1}</i>${l}</span>`).join('')}</div></header>
      <div class="cp-grow"><div class="cp-photo" id="cp-photo" style="width:${w}px;height:${h}px"><img src="${E(m.src)}" alt="Your ${m.view === 'top' ? 'top' : 'side'} photo" draggable="false">${pins}${line}</div>
      <section class="cp-panel cp-side"><h3>${m.pins.length < 2 ? (m.pins.length ? 'Now click the very back' : 'Click the very front of the car') : 'How long is your model?'}</h3><p class="muted">Pin 1 on the nose, pin 2 on the tail. Then measure your model from nose to tail with a ruler.</p>
        <div class="field"><label for="cp-measure-length">Nose to tail on your model (mm)</label><input id="cp-measure-length" class="cp-big" type="number" min="5" max="1000" step=".1" value="${fmt(project.preview.length)}"></div>
        <div class="cp-kv" id="cp-measure-facts"></div>
        <p class="cp-error" id="cp-measure-error" role="alert"></p><span class="spacer"></span>
        <div class="cp-line"><button id="cp-measure-reset">Start over</button><button id="cp-measure-whole">Use the whole photo</button><span class="spacer"></span><button class="primary" id="cp-measure-apply" ${m.pins.length === 2 ? '' : 'disabled'}>Use this car</button></div></section></div></div>`;
  }
  function measureFacts() {
    const m = measure,
      host = $('#cp-measure-facts');
    if (!m || !host) return;
    const length = Number($('#cp-measure-length').value);
    if (m.pins.length < 2 || !(length > 0)) return (host.innerHTML = '');
    const span = Math.abs(m.pins[1] - m.pins[0]),
      other = (length * m.height) / span,
      scale = DM.CAR_BODIES[carBody()].length / length;
    host.innerHTML = `<span>Pins</span><b>${Math.round(span).toLocaleString()} px apart</b><span>${m.view === 'top' ? 'Picture width' : 'Picture height'}</span><b>${fmt(other)} mm</b><span>Next to the ${E(DM.CAR_BODIES[carBody()].label)}</span><b>about 1:${fmt(scale)}</b>`;
  }

  function render() {
    if (!isOpen()) return;
    if (focus && !item(focus)) focus = null;
    const keepScroll = root().querySelector('#cp-list')?.scrollTop || 0;
    // While a size or measurement is being typed, keep that field: refresh the list and the car only.
    const typing =
      root().contains(document.activeElement) && document.activeElement.matches('input[type=number]');
    if (typing) {
      root().querySelector('#cp-list')?.replaceWith(document.createRange().createContextualFragment(list()));
      root().querySelector('#cp-list').scrollTop = keepScroll;
      if (mode === 'livery') {
        stageOnly();
        const i = item(focus),
          share = i ? pct(i.w, project.preview.length) : 0,
          bar = root().querySelector('.cp-share');
        if (bar) {
          bar.querySelector('b').style.width = Math.min(100, share) + '%';
          bar.querySelector('strong').textContent = share + '%';
        }
        for (const key of ['w', 'h']) {
          const input = $('#cp-' + key);
          if (i && input && input !== document.activeElement) input.value = Number(i[key].toFixed(2));
        }
      }
      return;
    }
    if (mode === 'measure' && measure)
      root().innerHTML = list() + `<main class="cp-main">${measureMarkup()}</main>`;
    else if (mode === 'garage')
      root().innerHTML = list() + `<main class="cp-main">${stageBar()}${garage()}</main>`;
    else root().innerHTML = list() + `<main class="cp-main">${stageBar()}${stage()}</main>` + inspector();
    if (root().querySelector('#cp-list')) root().querySelector('#cp-list').scrollTop = keepScroll;
    // The stage width is known only after layout: draw the views once more at the right size.
    if (mode === 'livery') {
      const host = root().querySelector('.cp-stage');
      const want = Math.max(320, Math.min(1100, host.clientWidth - 80));
      const svg = host.querySelector('.cp-svg');
      if (svg && Math.abs(Number(svg.getAttribute('width')) - want) > 1) host.outerHTML = stage();
    }
    measureFacts();
  }
  function stageOnly() {
    const host = root()?.querySelector('.cp-stage');
    if (host) host.outerHTML = stage();
  }

  // Dragging decals on the car (move or resize) is one undo step; Esc puts it back.
  const pointIn = (e, svg) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };
  function cancelGesture() {
    if (!gesture) return;
    project = gesture.before;
    gesture = null;
    render();
    renderPaper();
  }
  function startGesture(e, kind) {
    const svg = e.target.closest('[data-cp-svg]'),
      v = svg.dataset.cpSvg,
      g = e.target.closest('[data-cp-id]'),
      i = item(g.dataset.cpId);
    focus = i.id;
    if (i.locked) return render();
    e.preventDefault();
    gesture = {
      kind,
      corner: e.target.dataset.cpHandle,
      view: v,
      id: i.id,
      start: pointIn(e, svg),
      before: DM.clone(project),
      origin: DM.clone({
        w: i.w,
        h: i.h,
        stroke: i.strokeWidth,
        pos: i.carPositions[v],
        positions: i.carPositions
      }),
      moved: false,
      pointer: e.pointerId
    };
    root().setPointerCapture(e.pointerId);
  }
  function moveGesture(e) {
    const d = gesture,
      svg = root().querySelector(`[data-cp-svg="${d.view}"]`);
    if (!svg || e.pointerId !== d.pointer) return;
    const p = pointIn(e, svg),
      dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 0.2) return;
    d.moved = true;
    const i = item(d.id),
      o = d.origin;
    if (d.kind === 'move')
      i.carPositions = { ...i.carPositions, [d.view]: { x: o.pos.x + dx, y: o.pos.y + dy } };
    else {
      // The opposite corner stays where it is.
      const east = d.corner.includes('e'),
        south = d.corner.includes('s'),
        ax = east ? o.pos.x : o.pos.x + o.w,
        ay = south ? o.pos.y : o.pos.y + o.h;
      let w = Math.max(0.5, east ? p.x - ax : ax - p.x),
        h = Math.max(0.5, south ? p.y - ay : ay - p.y);
      if (settings.aspectLock !== false && !e.shiftKey) {
        const k = Math.max(w / o.w, h / o.h);
        w = o.w * k;
        h = o.h * k;
        i.strokeWidth = o.stroke * k;
      }
      i.w = Math.round(w * 100) / 100;
      i.h = Math.round(h * 100) / 100;
      const positions = {};
      for (const v of VIEWS) {
        const q = o.positions[v];
        if (!q) continue;
        positions[v] =
          v === d.view
            ? { x: east ? ax : ax - i.w, y: south ? ay : ay - i.h }
            : { x: q.x + (o.w - i.w) / 2, y: q.y + (o.h - i.h) / 2 };
      }
      i.carPositions = positions;
    }
    stageOnly();
    const tag = root().querySelector('#cp-live');
    if (tag) tag.remove();
    const box = root().querySelector(`[data-cp-view-box="${d.view}"]`);
    box?.insertAdjacentHTML(
      'beforeend',
      `<span class="cp-live" id="cp-live">${fmt(i.w)} × ${fmt(i.h)} mm · ${pct(i.w, project.preview.length)}% of the car</span>`
    );
  }
  function endGesture(e) {
    const d = gesture;
    if (!d || (e && e.pointerId !== d.pointer)) return;
    gesture = null;
    if (root().hasPointerCapture?.(d.pointer)) root().releasePointerCapture(d.pointer);
    if (d.moved) commitGesture(d.before);
    render();
    renderPaper();
  }
  function setSize(key, value) {
    const i = item(focus);
    if (!i || i.locked) return;
    const v = DM.number(value, 0.1, 1000, key === 'w' ? 'Width' : 'Height');
    if (v === i[key]) return;
    mutate(() => {
      const w = i.w,
        h = i.h,
        k = v / i[key];
      if (settings.aspectLock !== false) {
        i[key === 'w' ? 'h' : 'w'] *= k;
        i.strokeWidth *= k;
      }
      i[key] = v;
      for (const p of Object.values(i.carPositions || {})) {
        p.x += (w - i.w) / 2;
        p.y += (h - i.h) / 2;
      }
    }, editing);
    editing = true;
  }

  document.addEventListener('pointerdown', e => {
    if (!isOpen() || e.button !== 0 || gesture) return;
    if (mode === 'measure') {
      const photo = e.target.closest('#cp-photo');
      if (!photo || measure.pins.length >= 2) return;
      const r = photo.getBoundingClientRect();
      measure.pins.push(
        Math.max(0, Math.min(measure.width, ((e.clientX - r.left) / r.width) * measure.width))
      );
      return render();
    }
    if (!e.target.closest('#cp-stage')) return;
    if (e.target.closest('[data-cp-handle]')) return startGesture(e, 'resize');
    if (e.target.closest('[data-cp-id]')) return startGesture(e, 'move');
    if (e.target.closest('[data-cp-svg]') && focus) {
      focus = null;
      render();
    }
  });
  document.addEventListener('pointermove', e => gesture && isOpen() && moveGesture(e));
  document.addEventListener('pointerup', e => gesture && endGesture(e));
  document.addEventListener('pointercancel', e => gesture && endGesture(e));
  document.addEventListener('keydown', e => {
    if (!isOpen() || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      if (gesture) {
        e.preventDefault();
        cancelGesture();
      } else if (mode !== 'livery') {
        mode = 'livery';
        measure = null;
        render();
      }
      return;
    }
    if (e.target.matches('input,textarea,select')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    // Undo while dragging would swap the sheet under the drag: finish the drag first.
    if (gesture && ctrl && 'zy'.includes(e.key.toLowerCase())) return e.preventDefault();
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      actions[e.shiftKey ? 'redo' : 'undo']();
    } else if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      actions.redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && focus) {
      // Takes the decal off the car (every view); the decal stays on the sheet.
      const i = item(focus);
      if (i?.carPositions && !i.locked) {
        e.preventDefault();
        mutate(() => delete i.carPositions);
      }
    }
  });
  document.addEventListener('click', e => {
    if (!isOpen() || !root().contains(e.target)) return;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const run = fn =>
      Promise.resolve()
        .then(fn)
        .catch(err => {
          const host = $('#cp-garage-error') || $('#cp-measure-error') || $('#cp-error');
          if (host) host.textContent = err.message;
          else fail(err);
        });
    if (b.dataset.cpItem) {
      focus = b.dataset.cpItem;
      return render();
    }
    if (b.dataset.cpView) {
      settings.carPageView = b.dataset.cpView;
      revision++;
      scheduleSave();
      return render();
    }
    if (b.id === 'cp-car') {
      mode = 'garage';
      return render();
    }
    if (b.id === 'cp-back') {
      mode = 'livery';
      return render();
    }
    const i = item(focus);
    if (b.dataset.cpPlace && i)
      return run(() =>
        mutate(() => {
          const v = b.dataset.cpPlace;
          i.carPositions = { ...i.carPositions, [v]: DM.clone(carPosition(i, v, [i])) };
        })
      );
    if (b.dataset.cpOff && i)
      return run(() =>
        mutate(() => {
          const rest = { ...i.carPositions };
          delete rest[b.dataset.cpOff];
          if (Object.keys(rest).length) i.carPositions = rest;
          else delete i.carPositions;
        })
      );
    if (b.dataset.cpSheet !== undefined && i) {
      page = i.page;
      selected = new Set([i.id]);
      hide();
      revealDecal();
      return window.render(); // the editor's render, not this page's
    }
    if (b.dataset.cpBody)
      return run(async () => {
        if (project.preview.side || project.preview.top)
          mutate(() => {
            project.preview.side = null;
            project.preview.top = null;
          });
        await chooseCarBody(b.dataset.cpBody);
      });
    if (b.dataset.cpScale)
      return scaleDialog(b.dataset.cpScale === 'other' ? null : Number(b.dataset.cpScale));
    if (b.dataset.cpPhoto) {
      carImportView = b.dataset.cpPhoto;
      return $('#car-file').click();
    }
    if (b.id === 'cp-included')
      // Back to the included car, with its own proportions at this scale.
      return run(async () => {
        mutate(() => {
          project.preview.side = null;
          project.preview.top = null;
        });
        await chooseCarBody(carBody());
      });
    if (b.id === 'cp-measure-reset') {
      measure.pins = [];
      return render();
    }
    if (b.id === 'cp-measure-whole' || b.id === 'cp-measure-apply')
      return run(() => {
        const m = measure,
          length = DM.number($('#cp-measure-length').value, 5, 1000, 'Length'),
          whole = b.id === 'cp-measure-whole',
          x0 = whole ? 0 : Math.min(...m.pins),
          span = whole ? m.width : Math.abs(m.pins[1] - m.pins[0]);
        if (span < 10) throw Error('Put the two pins further apart: on the very front and the very back.');
        const other = (length * m.height) / span;
        mutate(() => {
          project.preview[m.view] = {
            src: m.src,
            width: m.width,
            height: m.height,
            bounds: { x: x0, y: 0, w: span, h: m.height }
          };
          project.preview.length = Math.round(length * 10) / 10;
          project.preview[m.view === 'top' ? 'width' : 'height'] = Math.max(
            5,
            Math.min(1000, Math.round(other * 10) / 10)
          );
          project.preview.view = m.view;
        });
        measure = null;
        mode = 'garage';
        render();
        toast('Your car is set. Decals on it show at their real size.');
      });
  });
  document.addEventListener('input', e => {
    if (!isOpen()) return;
    if (e.target.id === 'cp-measure-length') measureFacts();
    if (e.target.id === 'cp-w' || e.target.id === 'cp-h')
      try {
        setSize(e.target.id === 'cp-w' ? 'w' : 'h', e.target.value);
        e.target.removeAttribute('aria-invalid');
        $('#cp-error').textContent = '';
      } catch (err) {
        e.target.setAttribute('aria-invalid', 'true');
        $('#cp-error').textContent = err.message;
      }
  });
  document.addEventListener('focusin', e => {
    if (isOpen() && (e.target.id === 'cp-w' || e.target.id === 'cp-h')) editing = false;
  });
  document.addEventListener('change', e => {
    if (!isOpen()) return;
    const t = e.target;
    if (t.id === 'cp-aspect') {
      settings.aspectLock = t.checked;
      revision++;
      scheduleSave();
    }
    if (t.id === 'cp-w' || t.id === 'cp-h') {
      // Done typing: show the decal's real size again (an invalid value is dropped).
      editing = false;
      const i = item(focus);
      if (i) t.value = Number(i[t.id === 'cp-w' ? 'w' : 'h'].toFixed(2));
      t.removeAttribute('aria-invalid');
      $('#cp-error').textContent = '';
    }
    if (['cp-length', 'cp-height', 'cp-width'].includes(t.id))
      try {
        const key = { 'cp-length': 'length', 'cp-height': 'height', 'cp-width': 'width' }[t.id],
          v = DM.number(t.value, 5, 1000, 'Model size');
        mutate(() => (project.preview[key] = v));
      } catch (err) {
        $('#cp-garage-error').textContent = err.message;
      }
  });
  // Decals dragged from the list onto a view are placed where they are dropped.
  document.addEventListener('dragstart', e => {
    const row = isOpen() && e.target.closest?.('[data-cp-item]');
    if (!row) return;
    e.dataTransfer.setData('application/x-slotforge-car', row.dataset.cpItem);
    e.dataTransfer.effectAllowed = 'copy';
  });
  document.addEventListener('dragover', e => {
    if (!isOpen() || !e.target.closest?.('[data-cp-svg]')) return;
    if ([...(e.dataTransfer?.types || [])].includes('application/x-slotforge-car')) e.preventDefault();
  });
  document.addEventListener('drop', e => {
    const svg = isOpen() && e.target.closest?.('[data-cp-svg]');
    const id = svg && e.dataTransfer.getData('application/x-slotforge-car');
    if (!id) return;
    e.preventDefault();
    const i = item(id);
    if (!i || i.locked) return;
    const p = pointIn(e, svg),
      v = svg.dataset.cpSvg;
    focus = id;
    mutate(() => (i.carPositions = { ...i.carPositions, [v]: { x: p.x - i.w / 2, y: p.y - i.h / 2 } }));
  });
  // A photo was chosen for "Your own model": measure it next.
  function measurePhoto(view, src, width, height) {
    measure = { view, src, width, height, pins: [] };
    mode = 'measure';
    if (!isOpen()) show();
    render();
  }
  return {
    show,
    hide,
    isOpen,
    render,
    measurePhoto,
    get focus() {
      return focus;
    }
  };
})();
