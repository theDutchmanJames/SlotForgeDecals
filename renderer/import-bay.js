'use strict';
// The import bay (remake option A, docs/ui-reference/artwork-2026-11): one window for adding artwork,
// in steps down the left: Choose pages (PDF or EPS with several pages), Clean up (bitmaps), Image or
// vector (bitmaps), Size & place. Every step but the last is optional. The Decal tab's Clean up and
// Trace tools open the same window on an existing decal, at that step.
const ImportBay = (() => {
  const STEPS = {
    pages: ['Choose pages', 'From a PDF or EPS'],
    clean: ['Clean up', 'Crop and remove the background'],
    trace: ['Image or vector', 'Keep pixels or trace to shapes'],
    size: ['Size & place', 'Millimetres, checked on the car']
  };
  // Typical decal widths as a share of the car's length (a 140 mm 1:32 GT: 18, 26, 34 and 60 mm).
  const PICKS = [
    ['door', 'Door number', 0.13],
    ['bonnet', 'Bonnet', 0.19],
    ['side', 'Side logo', 0.24],
    ['screen', 'Windscreen', 0.43]
  ];
  let session = null;
  const half = n => Math.max(0.5, Math.round(n * 2) / 2);
  const fmt = n => String(Number(n.toFixed(1)));

  function frame(title, subtitle, steps, info) {
    showDialog(
      title,
      subtitle,
      `<div class="bay"><nav class="bay-steps" aria-label="Steps">${steps
        .map(
          ([id, off], n) =>
            `<button class="bay-step" data-bay-step="${id}" ${off ? `disabled title="${E(off)}"` : ''}><span class="bay-n">${n + 1}</span><span><b>${STEPS[id][0]}</b><small>${off ? E(off) : STEPS[id][1]}</small></span></button>`
        )
        .join('')}<div class="bay-file">${info}</div></nav><div class="bay-host" id="bay-host"></div></div>`,
      '<span class="bay-foot-slot"></span>',
      true
    );
    $('#dialog').classList.add('bay-dialog');
  }
  function railState(current) {
    const order = session.steps.map(s => s[0]);
    for (const b of $$('[data-bay-step]')) {
      const n = order.indexOf(b.dataset.bayStep);
      b.classList.toggle('on', b.dataset.bayStep === current);
      b.classList.toggle('done', session.visited.has(b.dataset.bayStep) && b.dataset.bayStep !== current);
      b.querySelector('.bay-n').textContent =
        session.visited.has(b.dataset.bayStep) && b.dataset.bayStep !== current ? '✓' : n + 1;
    }
  }
  const foot = html => {
    $('#dialog .dialog-foot').innerHTML = html;
  };
  const failure = text => {
    const el = $('#bay-host .bay-error') || $('#dialog-error');
    if (el) el.textContent = text;
  };

  // Leaving a step keeps what it made: the cleaned-up bitmap, or the vector.
  function leave() {
    const s = session;
    if (s.step === 'clean' && s.prep) {
      const r = s.prep.result();
      if (r && JSON.stringify(r.imageEdits) !== JSON.stringify(s.image.imageEdits)) {
        s.image = r;
        s.vector = null;
      }
    }
    if (s.step === 'trace' && s.trace) s.vector = s.trace.vector();
    s.prep?.dispose();
    s.trace?.dispose();
    s.prep = s.trace = null;
  }
  async function go(step) {
    const s = session;
    if (!s) return;
    if (s.step) {
      try {
        leave();
      } catch (e) {
        failure(e.message);
        return;
      }
      s.visited.add(s.step);
    }
    s.step = step;
    railState(step);
    const host = $('#bay-host');
    host.className = 'bay-host step-' + step;
    if (step === 'pages') return pagesStep(host);
    if (step === 'clean') return cleanStep(host);
    if (step === 'trace') return traceStep(host);
    if (step === 'size') return sizeStep(host);
  }
  const next = () => session.steps[session.steps.findIndex(x => x[0] === session.step) + 1]?.[0];
  const back = () => session.steps[session.steps.findIndex(x => x[0] === session.step) - 1]?.[0];
  // Import: Back · Skip · Next, then Add to sheet. Editing a decal: Cancel · Add as copy · Apply.
  function navFoot(ready, ids = {}) {
    const n = next(),
      b = back();
    if (session.mode === 'edit')
      foot(
        `<button data-action="close">Cancel</button><span class="spacer"></span>${n ? `<button data-bay-go="${n}">${STEPS[n][0]} →</button>` : ''}<button id="${ids.copy}" ${ready ? '' : 'disabled'}>Add as copy</button><button class="primary" id="${ids.apply}" ${ready ? '' : 'disabled'}>Apply to decal</button>`
      );
    else
      foot(
        `${b && !session.steps.find(x => x[0] === b)[1] ? `<button data-bay-go="${b}">← ${STEPS[b][0]}</button>` : '<button id="cancel-import">Cancel</button>'}<span class="spacer"></span><span class="hint">You can come back to these steps later from the Decal tab.</span>${n ? `<button class="ghost" data-bay-go="size">Skip to size</button><button class="primary" data-bay-go="${n}" ${ready ? '' : 'disabled'}>${STEPS[n][0]} →</button>` : ''}`
      );
    if (session.mode === 'edit') {
      $('#' + ids.apply).onclick = () => apply(false);
      $('#' + ids.copy).onclick = () => apply(true);
    }
  }

  // ---- Choose pages: thumbnails of every page; each chosen page becomes its own decal.
  function pagesStep(host) {
    const s = session;
    host.innerHTML = `<div class="bay-stage"><div class="bay-tb"><span class="eyebrow">${s.pageCount} pages</span><span class="spacer"></span><button id="bay-pages-all">Select all</button><button id="bay-pages-none" class="ghost">Clear</button></div><div class="bay-view bay-pages">${Array.from(
      { length: s.pageCount },
      (_, n) =>
        `<button class="bay-page" data-bay-page="${n + 1}" aria-pressed="${s.chosen.has(n + 1)}"><span class="bay-page-shot"><img alt="" data-bay-thumb="${n + 1}"><span class="hint">Page ${n + 1}</span></span>Page ${n + 1}</button>`
    ).join(
      ''
    )}</div></div><aside class="bay-side"><h3>Which pages?</h3><p class="hint">Each chosen page becomes its own decal.</p><div class="bay-choices"><button class="bay-choice" data-page-crop="art" aria-pressed="${s.cropPages}"><span class="bay-radio"></span><span><b>Crop to the artwork</b><small>Page margins are left out</small></span></button><button class="bay-choice" data-page-crop="page" aria-pressed="${!s.cropPages}"><span class="bay-radio"></span><span><b>Keep the whole page</b><small>For a page that is already a decal sheet</small></span></button></div><p id="bay-pages-note" class="bay-quality"></p><p class="dialog-error bay-error" role="alert"></p></aside>`;
    const note = () => {
      $('#bay-pages-note').textContent = s.chosen.size
        ? `${s.chosen.size} ${s.chosen.size === 1 ? 'page' : 'pages'} chosen · vector, sharp at any size`
        : 'Choose at least one page.';
      for (const b of $$('[data-bay-page]'))
        b.setAttribute('aria-pressed', String(s.chosen.has(+b.dataset.bayPage)));
      navFoot(s.chosen.size > 0);
      const go = $(`#dialog .dialog-foot [data-bay-go="size"].primary`);
      if (go) go.textContent = `Size the ${s.chosen.size === 1 ? 'decal' : s.chosen.size + ' decals'} →`;
    };
    host.onclick = e => {
      const b = e.target.closest('[data-bay-page]'),
        crop = e.target.closest('[data-page-crop]');
      if (b) {
        const n = +b.dataset.bayPage;
        s.chosen.has(n) ? s.chosen.delete(n) : s.chosen.add(n);
        s.arts = null;
        note();
      }
      if (crop) {
        s.cropPages = crop.dataset.pageCrop === 'art';
        s.arts = null;
        for (const x of $$('[data-page-crop]'))
          x.setAttribute('aria-pressed', String(x.dataset.pageCrop === crop.dataset.pageCrop));
      }
      if (e.target.closest('#bay-pages-all')) {
        for (let n = 1; n <= Math.min(s.pageCount, 50); n++) s.chosen.add(n);
        s.arts = null;
        note();
      }
      if (e.target.closest('#bay-pages-none')) {
        s.chosen.clear();
        s.arts = null;
        note();
      }
    };
    note();
    const seen = new IntersectionObserver(
      hits => {
        for (const hit of hits) {
          if (!hit.isIntersecting) continue;
          seen.unobserve(hit.target);
          // The frame is watched: a picture without a source is hidden, and hidden things never show.
          const img = hit.target.querySelector('[data-bay-thumb]'),
            n = +img.dataset.bayThumb;
          pageArt(n)
            .then(p => {
              if (img.isConnected) {
                img.src = Art.url(p.svg);
                img.nextElementSibling.hidden = true;
              }
            })
            .catch(() => {});
        }
      },
      { root: host.querySelector('.bay-view'), rootMargin: '120px' }
    );
    for (const shot of host.querySelectorAll('.bay-page-shot')) seen.observe(shot);
  }
  // One page, converted once and kept for the thumbnail and the decal.
  function pageArt(n) {
    const s = session;
    s.pageCache[n] ??= (async () => {
      const result = await desktop.convert({ ...s.payload, page: n });
      const art = Art.sanitize(result.svg);
      return {
        svg: art.svg,
        viewBox: art.viewBox,
        mixed: art.mixed,
        widthMm: result.widthMm,
        heightMm: result.heightMm
      };
    })();
    s.pageCache[n].catch(() => delete s.pageCache[n]);
    return s.pageCache[n];
  }
  // The artwork's own extent inside the page, measured by the browser.
  function cropToArt(page) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-20000px;top:0;width:800px;height:800px;visibility:hidden';
    box.innerHTML = page.svg;
    document.body.append(box);
    try {
      const el = box.querySelector('svg'),
        b = el.getBBox(),
        [vx, vy, vw, vh] = page.viewBox;
      if (!b.width || !b.height || (b.width >= vw * 0.98 && b.height >= vh * 0.98)) return page;
      const pad = Math.max(b.width, b.height) * 0.01,
        x = Math.max(vx, b.x - pad),
        y = Math.max(vy, b.y - pad),
        w = Math.min(vx + vw, b.x + b.width + pad) - x,
        h = Math.min(vy + vh, b.y + b.height + pad) - y,
        widthMm = (page.widthMm || vw) * (w / vw),
        heightMm = (page.heightMm || vh) * (h / vh);
      el.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      el.setAttribute('width', widthMm + 'mm');
      el.setAttribute('height', heightMm + 'mm');
      const art = Art.sanitize(el.outerHTML);
      return { ...page, svg: art.svg, viewBox: art.viewBox, widthMm, heightMm };
    } finally {
      box.remove();
    }
  }
  async function chosenPages() {
    const s = session,
      arts = [];
    for (const n of [...s.chosen].sort((a, b) => a - b)) {
      let page = await pageArt(n);
      if (s.cropPages) page = cropToArt(page);
      const art = DM.item('svg', {
        svg: page.svg,
        ratio: page.viewBox[2] / page.viewBox[3],
        mixed: page.mixed
      });
      art.name = (s.name + ' · page ' + n).slice(0, 160);
      art.w = page.widthMm && page.widthMm <= 1000 ? page.widthMm : 25;
      art.h = art.w / art.ratio;
      arts.push(art);
    }
    return arts;
  }

  // ---- Clean up (bitmaps).
  function cleanStep(host) {
    const s = session;
    try {
      s.prep = ImagePrepUI.mount(host, DM.clone(s.image), {
        change: result => {
          if (s.step !== 'clean') return;
          if (s.mode === 'edit') {
            for (const b of $$('#prep-apply, #prep-copy')) b.disabled = !result;
          } else {
            const go = $('#dialog .dialog-foot .primary');
            if (go) go.disabled = !result;
          }
        }
      });
    } catch (e) {
      host.innerHTML = `<div class="bay-stage"><div class="bay-view"><p class="notice">${E(e.message)}</p></div></div><aside class="bay-side"><h3>Clean up</h3><p class="hint">This image can still be traced or placed as it is.</p></aside>`;
      navFoot(true, { apply: 'prep-apply', copy: 'prep-copy' });
      return;
    }
    navFoot(false, { apply: 'prep-apply', copy: 'prep-copy' });
  }
  // ---- Image or vector (bitmaps).
  function traceStep(host) {
    const s = session,
      item = DM.clone(s.vector || s.image);
    s.trace = TraceUI.mount(
      host,
      item,
      {
        change: ready => {
          if (s.step !== 'trace') return;
          if (s.mode === 'edit') {
            for (const b of $$('#trace-apply, #trace-copy')) b.disabled = !ready;
          } else {
            const go = $('#dialog .dialog-foot .primary');
            if (go) go.disabled = !ready;
          }
        }
      },
      { keepImage: s.mode === 'import' && !s.vector }
    );
    // A traced decal may be ready at once: ask the step again once its buttons exist.
    navFoot(s.mode === 'import', { apply: 'trace-apply', copy: 'trace-copy' });
    s.trace.refresh();
  }

  // ---- Size & place: the decal on the car at its printed size while the millimetres change.
  async function sizeStep(host) {
    const s = session;
    if (s.pageCount && !s.arts) {
      host.innerHTML =
        '<div class="bay-stage"><div class="bay-view"><p class="hint">Preparing the chosen pages…</p></div></div>';
      try {
        s.arts = await chosenPages();
      } catch (e) {
        host.innerHTML = `<div class="bay-stage"><div class="bay-view"><p class="notice">${E(e.message)}</p></div></div>`;
        return;
      }
      if (session !== s || s.step !== 'size') return;
    }
    const arts = s.arts || [s.vector || s.image || s.art],
      first = arts[0],
      ratio = first.w / first.h,
      targets = [24, 32, 43, 64, project.scale].filter((n, i, a) => a.indexOf(n) === i);
    s.width ??= first.w;
    s.target ??= project.scale;
    s.copies ??= 1;
    await loadCar(carBody()).catch(() => {});
    if (session !== s || s.step !== 'size') return;
    const raster = DM.rasters(first);
    host.innerHTML = `<div class="bay-stage"><div class="bay-tb"><span class="eyebrow" id="bay-car-label"></span><span class="spacer"></span><div class="seg" role="group" aria-label="Car view"><button data-bay-view="side">Side</button><button data-bay-view="top">Top</button></div></div><div class="bay-view"><div class="bay-car" id="bay-car"></div><div class="bay-ruler"><i></i><span id="bay-ruler"></span><i></i></div></div></div>
<aside class="bay-side"><h3>How big?</h3><div class="field"><label for="import-width">Printed width</label><div class="bay-big"><button id="bay-minus" aria-label="0.5 mm smaller">${icon('minus')}</button><span class="bay-big-input"><input id="import-width" type="number" min=".1" max="1000" step=".1" value="${s.width.toFixed(2)}"><span>mm</span></span><button id="bay-plus" aria-label="0.5 mm larger">${icon('plus')}</button></div><span id="import-size-info" class="bay-dims"></span></div>
<div class="field"><label>Or pick where it goes</label><div class="bay-picks" id="bay-picks"></div></div>
<div id="original-scale-fields" class="fields2" hidden><div class="field"><label for="original-width">Width on the other model (mm)</label><input id="original-width" type="number" min=".1" max="10000" step=".1" value="${s.width.toFixed(1)}"></div><div class="field"><label for="original-scale">That model's scale 1:</label><input id="original-scale" type="number" min="1" max="200" step="1" value="1"></div></div>
<div class="fields2"><div class="field"><label for="import-target">Model scale</label><select id="import-target">${targets.map(n => `<option value="${n}" ${n === s.target ? 'selected' : ''}>1:${n}</option>`).join('')}</select></div><div class="field"><label>Copies to place</label><div class="seg" role="group" aria-label="Copies to place">${[
      [1, '1'],
      [2, '2 · both sides'],
      [4, '4']
    ]
      .map(([n, label]) => `<button data-copies="${n}" aria-pressed="${n === s.copies}">${label}</button>`)
      .join('')}</div></div></div>
<p id="bay-quality" class="bay-quality"></p>${arts.length > 1 ? `<p class="hint">${arts.length} decals are sized together: each keeps its size relative to the first.</p>` : ''}${s.warning ? `<p class="notice">${E(s.warning)}</p>` : ''}<p class="hint">The model scale becomes the car preview's scale; decals already on the sheet keep their printed sizes.</p><p class="dialog-error bay-error" role="alert"></p></aside>`;
    const q = sel => host.querySelector(sel);
    const carLength = () => (project.preview.length * project.scale) / s.target;
    let pick = s.pick || null;
    function picks() {
      const L = carLength();
      q('#bay-picks').innerHTML =
        PICKS.map(
          ([id, label, share]) =>
            `<button data-size-pick="${id}" aria-pressed="${pick === id}"><b>${label}</b><small>≈ ${fmt(half(L * share))} mm</small></button>`
        ).join('') +
        `<button data-size-pick="source" aria-pressed="${pick === 'source'}" ${s.sourceW ? '' : 'disabled'}><b>File's own size</b><small>${s.sourceW ? fmt(s.sourceW) + ' mm' : 'none in this file'}</small></button><button data-size-pick="scale" aria-pressed="${pick === 'scale'}"><b>From another scale</b><small>a full-size car or a model</small></button>`;
    }
    function draw() {
      const w = Number(q('#import-width').value) || first.w,
        h = w / ratio;
      s.width = w;
      q('#import-size-info').textContent = `Printed size: ${w.toFixed(2)} × ${h.toFixed(2)} mm`;
      const view = project.preview.view,
        body = carBody(),
        src = project.preview[view] || carData[body]?.[view],
        L = carLength(),
        Hc = (view === 'top' ? project.preview.width : project.preview.height) * (project.scale / s.target);
      for (const b of host.querySelectorAll('[data-bay-view]'))
        b.setAttribute('aria-pressed', String(b.dataset.bayView === view));
      q('#bay-car-label').textContent =
        `On your car · ${DM.CAR_BODIES[body]?.label || 'Car'} · 1:${s.target}`;
      q('#bay-ruler').textContent = `${fmt(L)} mm car · decal ${fmt(w)} mm`;
      if (src) {
        const b = src.bounds || { x: 0, y: 0, w: src.width, h: src.height },
          art = { ...first, w, h, x: L * 0.49 - w / 2, y: Hc * 0.58 - h / 2 };
        q('#bay-car').innerHTML =
          `<svg viewBox="0 0 ${L} ${Hc}" aria-label="The decal on the car at its printed size"><svg width="${L}" height="${Hc}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="none"><image href="${E(src.src)}" width="${src.width}" height="${src.height}"/></svg>${Art.element(art, 'bay', 'all')}<rect x="${art.x}" y="${art.y}" width="${w}" height="${h}" fill="none" stroke="#2f8cff" stroke-width="${L / 400}" stroke-dasharray="${L / 140} ${L / 220}"/></svg>`;
      }
      const ppi = raster.length ? Math.round(Math.min(...raster.map(x => x.ppi)) * (first.w / w)) : 0;
      q('#bay-quality').className = 'bay-quality' + (ppi && ppi < 300 ? ' warn' : '');
      q('#bay-quality').textContent = raster.length
        ? `${ppi} PPI at this size · ${ppi >= 300 ? 'fine for printing' : 'may print soft: make it smaller or trace it'}`
        : 'Vector · sharp at any size';
      const place = $('#place-import');
      if (place)
        place.textContent = `Add ${arts.length * s.copies === 1 ? 'to sheet' : arts.length * s.copies + ' decals'}`;
    }
    const setWidth = w => {
      q('#import-width').value = Math.max(0.1, Math.min(1000, w)).toFixed(2);
      draw();
    };
    host.onclick = e => {
      const p = e.target.closest('[data-size-pick]'),
        c = e.target.closest('[data-copies]'),
        v = e.target.closest('[data-bay-view]');
      if (p && !p.disabled) {
        pick = s.pick = p.dataset.sizePick;
        q('#original-scale-fields').hidden = pick !== 'scale';
        q('#import-width').disabled = pick === 'scale';
        const share = PICKS.find(x => x[0] === pick)?.[2];
        if (share) setWidth(half(carLength() * share));
        if (pick === 'source') setWidth(s.sourceW);
        if (pick === 'scale') scaled();
        picks();
      }
      if (c) {
        s.copies = +c.dataset.copies;
        for (const b of host.querySelectorAll('[data-copies]'))
          b.setAttribute('aria-pressed', String(b === c));
        draw();
      }
      if (v) {
        project.preview.view = v.dataset.bayView;
        draw();
      }
    };
    const scaled = () =>
      setWidth((Number(q('#original-width').value) * Number(q('#original-scale').value)) / s.target);
    q('#original-width').oninput = q('#original-scale').oninput = scaled;
    q('#import-width').oninput = () => {
      if (pick && pick !== 'scale') {
        pick = s.pick = null;
        picks();
      }
      draw();
    };
    q('#bay-minus').onclick = () => setWidth(half((Number(q('#import-width').value) || 1) - 0.5));
    q('#bay-plus').onclick = () => setWidth(half((Number(q('#import-width').value) || 0) + 0.5));
    q('#import-target').oninput = () => {
      s.target = Number(q('#import-target').value);
      if (pick === 'scale') scaled();
      picks();
      draw();
    };
    picks();
    if (pick === 'scale') {
      q('#original-scale-fields').hidden = false;
      q('#import-width').disabled = true;
    }
    foot(
      `${back() && !s.steps.find(x => x[0] === back())[1] ? `<button data-bay-go="${back()}">← ${STEPS[back()][0]}</button>` : ''}<button id="cancel-import">Cancel</button><span class="spacer"></span><button class="primary" id="place-import">${icon('check')}Add to sheet</button>`
    );
    $('#place-import').onclick = () => {
      try {
        const w = DM.number(q('#import-width').value, 0.1, 1000, 'Width'),
          k = w / first.w;
        const placed = arts.map(a => {
          const out = DM.clone(a);
          out.w = DM.number(a.w * k, 0.1, 1000, 'Width');
          out.h = DM.number(out.w / (a.w / a.h), 0.1, 1000, 'Height');
          return out;
        });
        finish({ arts: placed, referenceScale: s.target, copies: s.copies });
      } catch (e) {
        failure(e.message);
      }
    };
    draw();
    q('#import-width').focus();
    q('#import-width').select();
  }

  // ---- Finishing: import resolves with what to place; editing hands the result to the sheet.
  function finish(value) {
    const s = session;
    session = null;
    s.prep?.dispose();
    s.trace?.dispose();
    $('#dialog').removeEventListener('close', s.cancel);
    closeDialog();
    s.resolve(value);
  }
  function apply(copy) {
    const s = session;
    try {
      leave();
    } catch (e) {
      failure(e.message);
      return;
    }
    const art = s.vector || s.image;
    if (JSON.stringify(art) === JSON.stringify(s.original)) {
      failure('Nothing has changed yet.');
      return;
    }
    finish({ art, copy, traced: !!s.vector && !s.original.traceSource });
  }
  function start(state, first) {
    return new Promise(resolve => {
      session = { ...state, resolve, visited: new Set(), step: null };
      session.cancel = () => {
        const s = session;
        if (!s) return;
        session = null;
        s.prep?.dispose();
        s.trace?.dispose();
        resolve(null);
      };
      $('#dialog').addEventListener('close', session.cancel, { once: true });
      $('#dialog .dialog-body').onclick = null;
      go(first);
    });
  }
  document.addEventListener('click', e => {
    if (!session) return;
    const b = e.target.closest('[data-bay-go],[data-bay-step]');
    if (b && !b.disabled && b.closest('#dialog')) go(b.dataset.bayGo || b.dataset.bayStep);
    if (e.target.closest('#cancel-import')) closeDialog();
  });

  const fileInfo = (name, lines) => `<b>${E(name)}</b>${lines.map(E).join('<br>')}`;
  // Imports one file. Resolves with { arts, referenceScale, copies }, or null when cancelled.
  function importArt({ art, name, sourceW, warning, pages, payload }) {
    const raster = art?.kind === 'image';
    const steps = pages
      ? [
          ['pages', ''],
          ['size', '']
        ]
      : [
          ['clean', raster ? '' : 'Vector artwork needs no clean-up'],
          ['trace', raster ? '' : 'Already vector'],
          ['size', '']
        ];
    const info = pages
      ? fileInfo(name, [`${pages} pages · vector`, 'Pages stay sharp at any size.'])
      : raster
        ? fileInfo(name, [
            `${art.pixelsW} × ${art.pixelsH} px · bitmap`,
            `At ${fmt(art.w)} mm wide: ${Math.round((art.pixelsW / art.w) * 25.4)} PPI`
          ])
        : fileInfo(name, [
            'Vector · sharp at any size',
            sourceW ? `Its own size: ${fmt(sourceW)} mm wide` : ''
          ]);
    frame('Add artwork', name, steps, info);
    return start(
      {
        mode: 'import',
        steps,
        name,
        art,
        image: raster ? art : null,
        vector: null,
        sourceW,
        warning,
        pageCount: pages || 0,
        payload,
        chosen: new Set([1]),
        cropPages: true,
        pageCache: {}
      },
      pages ? 'pages' : raster ? 'clean' : 'size'
    );
  }
  // Opens an existing decal at Clean up or Image or vector. Resolves with { art, copy } or null.
  function edit(item, step) {
    const image = item.kind === 'image' ? item : null,
      steps = [
        ['clean', image ? '' : 'Only for bitmaps; restore the image first'],
        ['trace', '']
      ];
    frame(
      step === 'clean' ? 'Clean up' : 'Image or vector',
      `${item.name} · ${fmt(item.w)} × ${fmt(item.h)} mm`,
      steps,
      fileInfo(item.name, [
        image ? `${item.pixelsW} × ${item.pixelsH} px · bitmap` : 'Traced vector',
        'The original is kept on the decal.'
      ])
    );
    return start(
      { mode: 'edit', steps, image: image || item, vector: image ? null : item, original: DM.clone(item) },
      step
    );
  }
  return { importArt, edit };
})();
