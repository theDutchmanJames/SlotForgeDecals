'use strict';
// The Layout tab (remake option B, docs/ui-reference/layout-2026-11): every layout tool in one
// panel next to Decal and Sheet & paper. Align & space, Repeat, Pages and Auto-arrange, each with
// exact numbers and a preview before anything changes. Changes go through mutate(), one undo step each.
const LayoutTab = (() => {
  const SECTIONS = ['align', 'repeat', 'pages', 'pack'];
  const state = {
    to: 'selection',
    axis: 'x',
    gap: null, // spacing between decals; starts at the sheet's cutting gap
    rows: 2,
    columns: 2,
    gapX: null,
    gapY: null,
    scope: 'all',
    order: 'largest',
    pairs: true
  };
  let fillCache = { key: '', count: 0 },
    packCache = { key: '', result: null, error: '' };
  const host = () => document.getElementById('layout-tab');
  const isShown = () => settings.rightTab === 'layout' && !!host();
  // The open section; 'none' when the user closed them all.
  const open = () =>
    settings.layoutSection === 'none'
      ? ''
      : SECTIONS.includes(settings.layoutSection)
        ? settings.layoutSection
        : 'align';
  const list = () => project.items.filter(i => selected.has(i.id));
  const mm = v => (Math.round(v * 10) / 10).toFixed(1);
  const n = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);
  const sectionKey = () => JSON.stringify([page, project.pages, [...selected].sort(), open()]);
  let builtKey = '';

  function show(section) {
    if (section) settings.layoutSection = section;
    revision++;
    scheduleSave();
    if (settings.rightTab !== 'layout') showTab('right', 'layout');
    builtKey = '';
    render();
    host()?.querySelector(`[data-layout-sec="${open()}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  // Small page picture: the decals as grey blocks, optionally highlighted.
  function pageThumb(p, pageNo, width, mark = new Set(), colour = '#9aa3ad') {
    const s = DM.size(p);
    return `<svg viewBox="0 0 ${s.w} ${s.h}" width="${width}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="${s.w}" height="${s.h}" fill="#fff"/>${p.items
      .filter(i => i.page === pageNo)
      .map(i => {
        const b = DM.bounds(i);
        return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1" fill="${mark.has(i.id) ? '#e5484d' : colour}"/>`;
      })
      .join('')}</svg>`;
  }
  const head = (key, title, small) =>
    `<button class="lt-head" data-layout-open="${key}" aria-expanded="${open() === key}"><h3>${title}</h3><small>${small}</small>${icon('chev')}</button>`;

  function alignBody(sel, locked) {
    const b = sel.length ? DM.union(sel) : null,
      min = state.to === 'selection' ? 2 : 1,
      off = need => (locked || sel.length < need ? 'disabled' : ''),
      gap = n(state.gap, project.gap);
    const op = (operation, iconName, title, need) =>
      `<button data-layout-operation="${operation}" title="${title}" aria-label="${title}" ${off(need)}>${icon(iconName)}</button>`;
    return `<div class="field"><span class="lt-label">Align to</span><div class="seg lt-seg" role="group" aria-label="Align to">${[
      ['selection', 'Selection'],
      ['page', 'Page'],
      ['margins', 'Margins']
    ]
      .map(([k, l]) => `<button data-align-to="${k}" aria-pressed="${state.to === k}">${l}</button>`)
      .join('')}</div></div>
      <div class="lt-alignrow"><div class="lt-pad">${op('align-x-start', 'align-left', 'Align left edges', min)}${op('align-x-center', 'align-hcenter', 'Centre horizontally', min)}${op('align-x-end', 'align-right', 'Align right edges', min)}${op('align-y-start', 'align-top', 'Align top edges', min)}${op('align-y-center', 'align-vcenter', 'Centre vertically', min)}${op('align-y-end', 'align-bottom', 'Align bottom edges', min)}${op('distribute-x', 'distribute-x', 'Distribute across: equal gaps between the outer two', 3)}${op('distribute-y', 'distribute-y', 'Distribute down: equal gaps between the outer two', 3)}${op('mirror-x', 'mirror', 'Mirror left / right in place', 1)}</div>
      <div class="lt-read">${
        b
          ? `<div class="lt-kv"><span>Position</span><b>${mm(b.x)}, ${mm(b.y)}</b><span>Size</span><b>${mm(b.w)} × ${mm(b.h)}</b></div>`
          : ''
      }<p>Row 1 aligns, row 2 centres; row 3 distributes across and down, and mirrors.</p></div></div>
      <div class="field"><span class="lt-label">Exact space between them</span><div class="lt-line"><div class="seg lt-seg sm" role="group" aria-label="Direction"><button data-space-axis="x" aria-pressed="${state.axis === 'x'}">Across</button><button data-space-axis="y" aria-pressed="${state.axis === 'y'}">Down</button></div><span class="lt-num"><input id="space-gap" type="number" min="0" max="200" step=".5" value="${gap}" aria-label="Space in millimetres"><span>mm</span></span><button id="space-apply" ${off(2)}>Apply</button></div></div>
      <p class="lt-sum ${gap < project.gap ? 'warn' : ''}" id="space-note">${
        gap < project.gap
          ? `Closer than the sheet’s ${mm(project.gap)} mm cutting gap: hard to cut apart.`
          : `At least the sheet’s ${mm(project.gap)} mm cutting gap: safe to cut.`
      }</p>
      <div class="field"><span class="lt-label">Other side of the car</span><div class="lt-line"><button data-alias="mirror-pair" ${sel.length ? '' : 'disabled'}>${icon('mirror')}Add mirrored copies</button><button data-layout-operation="mirror-y" ${off(1)}>${icon('mirror')}Flip top / bottom</button></div></div>
      ${locked ? '<p class="lt-sum warn">Unlock the selected decals to align, space, mirror or move them. Repeat still works.</p>' : ''}
      ${sel.length ? '' : '<p class="lt-empty">Select decals on the sheet to align and space them.</p>'}`;
  }
  // The repeat summary, with a warning when copies would land on decals already on the sheet.
  function repeatSummary(p) {
    const ids = new Set(p.sources.map(i => i.id)),
      others = project.items.filter(i => i.page === p.sources[0].page && !ids.has(i.id)).map(DM.bounds);
    let hits = 0;
    for (let row = 0; row < p.rows; row++)
      for (let col = 0; col < p.columns; col++) {
        if (!row && !col) continue;
        const c = {
          x: p.bounds.x + col * (p.bounds.w + p.gapX),
          y: p.bounds.y + row * (p.bounds.h + p.gapY),
          w: p.bounds.w,
          h: p.bounds.h
        };
        if (others.some(o => DM.overlaps(c, o, 0))) hits++;
      }
    const text = `${p.rows * p.columns} cells · adds ${p.added} ${p.added === 1 ? 'decal' : 'decals'} · ${mm(p.width)} × ${mm(p.height)} mm.`;
    return hits
      ? {
          warn: true,
          text: `${text} ${hits} ${hits === 1 ? 'copy lands' : 'copies land'} on other decals: move the selection or use Fill the free space.`
        }
      : { warn: false, text: `${text} The ghosts on the sheet show where they go.` };
  }
  function plan() {
    const gapX = n(state.gapX, project.gap),
      gapY = n(state.gapY, project.gap);
    return Layout.gridPlan(project, [...selected], { rows: state.rows, columns: state.columns, gapX, gapY });
  }
  function repeatBody(sel) {
    if (!sel.length)
      return '<p class="lt-empty">Select the decal or decals to repeat in rows and columns.</p>';
    const gapX = n(state.gapX, project.gap),
      gapY = n(state.gapY, project.gap);
    let summary,
      ok = true,
      warn = false;
    try {
      ({ text: summary, warn } = repeatSummary(plan()));
    } catch (e) {
      ok = false;
      warn = true;
      summary = e.message;
    }
    const key = JSON.stringify([
      project.items.length,
      [...selected].sort(),
      project.gap,
      project.margin,
      history.length
    ]);
    if (fillCache.key !== key) {
      try {
        fillCache = { key, count: Layout.fill(project, [...selected], 200).copies };
      } catch {
        fillCache = { key, count: 0 };
      }
    }
    const stepper = (id, label, value) =>
      `<div class="field"><label for="${id}">${label}</label><div class="lt-step"><button data-step="${id}" data-by="-1" aria-label="Fewer ${label.toLowerCase()}">−</button><input id="${id}" type="number" min="1" max="100" step="1" value="${value}"><button data-step="${id}" data-by="1" aria-label="More ${label.toLowerCase()}">+</button></div></div>`;
    return `<div class="fields2">${stepper('grid-columns', 'Columns', state.columns)}${stepper('grid-rows', 'Rows', state.rows)}
      <div class="field"><label for="grid-gap-x">Gap across (mm)</label><input id="grid-gap-x" type="number" min="0" max="100" step=".1" value="${gapX}"></div><div class="field"><label for="grid-gap-y">Gap down (mm)</label><input id="grid-gap-y" type="number" min="0" max="100" step=".1" value="${gapY}"></div></div>
      <div class="lt-line"><button id="grid-fill" ${fillCache.count ? '' : 'disabled'} title="Copies go into every free spot on this page, keeping the cutting gap">${icon('grid')}Fill the free space · ${fillCache.count}</button><button id="grid-fill-page" title="As many rows and columns as fit from the selection to the margins">Most that fit</button></div>
      <p class="lt-sum ${warn ? 'warn' : ''}" id="grid-summary" aria-live="polite">${E(summary)}</p>
      <div class="lt-line end"><button id="grid-reset">Reset</button><button class="primary" id="grid-apply" ${ok ? '' : 'disabled'}>${ok ? `Add ${plan().added} ${plan().added === 1 ? 'copy' : 'copies'}` : 'Add copies'}</button></div>`;
  }
  function pagesBody(sel, locked) {
    const from = sel[0]?.page ?? page,
      count = sel.length;
    const cards = Array.from({ length: project.pages }, (_, n) => {
      const items = project.items.filter(i => i.page === n).length,
        free = Math.round(Layout.freeShare(project, n) * 100);
      return `<div class="lt-page ${n === page ? 'current' : ''}"><button class="lt-thumb" data-goto-page="${n}" aria-label="Go to page ${n + 1}">${pageThumb(project, n, 40, selected)}</button><div class="grow"><b>Page ${n + 1}${n === page ? ' · this page' : ''}</b><small>${items} ${items === 1 ? 'decal' : 'decals'} · ${free}% free</small></div>${count && n !== from ? `<button data-move-to="${n}" ${locked ? 'disabled' : ''}>Move ${count} here</button>` : ''}</div>`;
    }).join('');
    return `${cards}<div class="lt-line">${
      count && project.pages < 50
        ? `<button id="move-new" ${locked ? 'disabled' : ''}>${icon('plus')}Move ${count} to a new page</button>`
        : ''
    }</div><p class="lt-note">${count ? 'Decals keep their positions and sizes; you follow them to that page.' : 'Select decals to move them to another page. Click a page to go there.'}</p>`;
  }
  function packPreview() {
    const key = JSON.stringify([history.length, project.items.length, state, page, [...selected].sort()]);
    if (packCache.key === key) return packCache;
    try {
      packCache = {
        key,
        result: Layout.pack(project, {
          scope: state.scope,
          order: state.order,
          pairs: state.pairs,
          page,
          ids: [...selected]
        }),
        error: ''
      };
    } catch (e) {
      packCache = { key, result: null, error: e.message };
    }
    return packCache;
  }
  function packBody() {
    const { result, error } = packPreview(),
      shownPage = state.scope === 'all' ? 0 : page;
    const after = result ? pageThumb(result.project, shownPage, 120, new Set(), '#e5484d') : '';
    const summary = result
      ? `${result.moved} ${result.moved === 1 ? 'decal' : 'decals'} · ${state.scope === 'all' ? `${result.pages} ${result.pages === 1 ? 'page' : 'pages'} · ` : ''}${Math.round(Layout.freeShare(result.project, shownPage) * 100)}% of page ${shownPage + 1} stays free · nothing is resized`
      : error;
    return `<div class="field"><span class="lt-label">Arrange</span><div class="seg lt-seg" role="group" aria-label="Arrange which decals">${[
      ['page', 'This page'],
      ['all', 'All pages'],
      ['selection', 'Selection']
    ]
      .map(([k, l]) => `<button data-pack-scope="${k}" aria-pressed="${state.scope === k}">${l}</button>`)
      .join('')}</div></div>
      <div class="fields2"><div class="field"><label for="pack-order">Order</label><select id="pack-order"><option value="largest">Largest first</option><option value="layers">Layer order</option><option value="name">By name</option></select></div><div class="field"><span class="lt-label">Gap · margin</span><button class="lt-link" data-right-tab-go="sheet" title="Change them under Sheet & paper">${mm(project.gap)} · ${mm(project.margin)} mm</button></div></div>
      <label class="check"><input id="pack-pairs" type="checkbox" ${state.pairs ? 'checked' : ''}>Keep mirrored copies next to their original</label>
      <div class="lt-ba"><figure>${pageThumb(project, shownPage, 120)}<figcaption>Now</figcaption></figure>${icon('chev')}<figure id="pack-after">${after || '<div class="lt-none"></div>'}<figcaption>After${state.scope === 'all' && result ? ` · page 1 of ${result.pages}` : ''}</figcaption></figure></div>
      <p class="lt-sum ${result ? '' : 'warn'}" id="pack-summary">${E(summary)}</p>
      <p class="lt-note">Locked decals stay where they are.</p>
      <div class="lt-line end"><button class="primary" id="pack-apply" ${result ? '' : 'disabled'}>${icon('arrange')}Arrange ${{ page: 'this page', all: 'all pages', selection: 'the selection' }[state.scope]}</button></div>`;
  }
  function render() {
    const el = host();
    if (!el || !isShown()) return drawGhosts();
    // Keep a field being typed in: refresh only the summaries then.
    const typing =
      el.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox])');
    const key = sectionKey();
    if (typing && key === builtKey) {
      refreshSummaries();
      return drawGhosts();
    }
    builtKey = key;
    const sel = list(),
      locked = sel.some(i => i.locked),
      sec = open();
    const small = {
      align: sel.length ? `${sel.length} selected` : 'select decals',
      repeat: 'rows & columns',
      pages: `${project.pages} ${project.pages === 1 ? 'page' : 'pages'}`,
      pack: 'pack at original sizes'
    };
    const body = { align: alignBody, repeat: repeatBody, pages: pagesBody, pack: packBody };
    const titles = { align: 'Align & space', repeat: 'Repeat', pages: 'Pages', pack: 'Auto-arrange' };
    el.innerHTML = SECTIONS.map(
      k =>
        `<section class="lt-sec ${k === sec ? 'open' : ''}" data-layout-sec="${k}">${head(k, titles[k], small[k])}${k === sec ? `<div class="lt-body">${body[k](sel, locked)}</div>` : ''}</section>`
    ).join('');
    if ($('#pack-order')) $('#pack-order').value = state.order;
    drawGhosts();
  }
  function refreshSummaries() {
    const sec = open();
    if (sec === 'align' && $('#space-note')) {
      const gap = n(state.gap, project.gap);
      $('#space-note').classList.toggle('warn', gap < project.gap);
      $('#space-note').textContent =
        gap < project.gap
          ? `Closer than the sheet’s ${mm(project.gap)} mm cutting gap: hard to cut apart.`
          : `At least the sheet’s ${mm(project.gap)} mm cutting gap: safe to cut.`;
    }
    if (sec === 'repeat' && $('#grid-summary')) {
      try {
        const p = plan(),
          sum = repeatSummary(p);
        $('#grid-summary').classList.toggle('warn', sum.warn);
        $('#grid-summary').textContent = sum.text;
        $('#grid-apply').disabled = false;
        $('#grid-apply').textContent = `Add ${p.added} ${p.added === 1 ? 'copy' : 'copies'}`;
      } catch (e) {
        $('#grid-summary').classList.add('warn');
        $('#grid-summary').textContent = e.message;
        $('#grid-apply').disabled = true;
        $('#grid-apply').textContent = 'Add copies';
      }
    }
  }
  // Repeat shows its copies on the sheet as faded ghosts before they are added.
  function drawGhosts() {
    const paper = document.getElementById('paper');
    paper?.querySelector('#layout-ghosts')?.remove();
    if (!paper || !isShown() || open() !== 'repeat' || !selected.size || CanvasTools.active) return;
    let p;
    try {
      p = plan();
    } catch {
      return;
    }
    if (p.sources[0].page !== page) return;
    const cells = [];
    for (let row = 0; row < p.rows; row++)
      for (let col = 0; col < p.columns; col++) {
        if (!row && !col) continue;
        if (cells.length > 120) break;
        const dx = col * (p.bounds.w + p.gapX),
          dy = row * (p.bounds.h + p.gapY);
        cells.push(
          `<g transform="translate(${dx} ${dy})" opacity=".45">${p.sources.map((i, k) => Art.element(i, `ghost-${row}-${col}-${k}`, 'all')).join('')}</g><rect x="${p.bounds.x + dx}" y="${p.bounds.y + dy}" width="${p.bounds.w}" height="${p.bounds.h}" fill="none" stroke="#e5484d" stroke-width=".3" stroke-dasharray="1 .8"/>`
        );
      }
    paper.insertAdjacentHTML(
      'beforeend',
      `<g id="layout-ghosts" pointer-events="none">${cells.join('')}</g>`
    );
  }
  const act = (fn, message) => {
    try {
      fn();
      if (message) toast(message);
    } catch (e) {
      fail(e);
    }
  };
  document.addEventListener('click', ev => {
    const el = host();
    if (!el || !el.contains(ev.target)) return;
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const ids = [...selected];
    if (b.dataset.layoutOpen) {
      settings.layoutSection = open() === b.dataset.layoutOpen ? '' : b.dataset.layoutOpen;
      if (!settings.layoutSection) settings.layoutSection = 'none';
      revision++;
      scheduleSave();
      builtKey = '';
      return render();
    }
    if (b.dataset.alignTo) {
      state.to = b.dataset.alignTo;
      builtKey = '';
      return render();
    }
    if (b.dataset.spaceAxis) {
      state.axis = b.dataset.spaceAxis;
      builtKey = '';
      return render();
    }
    if (b.dataset.packScope) {
      state.scope = b.dataset.packScope;
      builtKey = '';
      return render();
    }
    if (b.dataset.rightTabGo) return showTab('right', b.dataset.rightTabGo);
    if (b.dataset.gotoPage !== undefined) {
      page = Number(b.dataset.gotoPage);
      selected.clear();
      return render();
    }
    if (b.dataset.layoutOperation) {
      const [operation, axis, edge] = b.dataset.layoutOperation.split('-');
      return act(
        () =>
          mutate(() => {
            project =
              operation === 'align'
                ? Layout.align(project, ids, axis, edge, state.to)
                : operation === 'distribute'
                  ? Layout.distribute(project, ids, axis)
                  : Layout.mirror(project, ids, axis);
          }),
        operation === 'mirror' ? 'Mirrored in place. Ctrl+Z undoes it.' : ''
      );
    }
    if (b.id === 'space-apply')
      return act(() =>
        mutate(() => (project = Layout.space(project, ids, state.axis, n(state.gap, project.gap))))
      );
    if (b.dataset.step) {
      const input = $('#' + b.dataset.step),
        key = b.dataset.step === 'grid-rows' ? 'rows' : 'columns';
      state[key] = Math.max(1, Math.min(100, Math.round(n(input.value, 1)) + Number(b.dataset.by)));
      input.value = state[key];
      refreshSummaries();
      return drawGhosts();
    }
    if (b.id === 'grid-reset') {
      Object.assign(state, { rows: 2, columns: 2, gapX: null, gapY: null });
      builtKey = '';
      return render();
    }
    if (b.id === 'grid-fill-page')
      return act(() => {
        const max = Layout.maxGrid(project, ids, n(state.gapX, project.gap), n(state.gapY, project.gap));
        Object.assign(state, max);
        builtKey = '';
        render();
      });
    if (b.id === 'grid-apply')
      return act(() => {
        const result = Layout.grid(project, ids, {
          rows: state.rows,
          columns: state.columns,
          gapX: n(state.gapX, project.gap),
          gapY: n(state.gapY, project.gap)
        });
        mutate(() => {
          project = result.project;
          selected = new Set(result.ids);
        });
        toast(`Added ${result.added} ${result.added === 1 ? 'copy' : 'copies'}. Ctrl+Z undoes it.`);
      });
    if (b.id === 'grid-fill')
      return act(() => {
        const result = Layout.fill(project, ids);
        if (!result.added) throw Error('There is no free space for another copy on this page.');
        mutate(() => (project = result.project));
        toast(
          `Filled the free space with ${result.copies} ${result.copies === 1 ? 'copy' : 'copies'}. Ctrl+Z undoes it.`
        );
      });
    if (b.dataset.moveTo !== undefined || b.id === 'move-new')
      return act(() => {
        const target = b.id === 'move-new' ? project.pages : Number(b.dataset.moveTo),
          next = Layout.movePage(project, ids, target);
        mutate(() => {
          project = next;
          page = target;
        });
        toast(`Moved to page ${target + 1}.`);
      });
    if (b.id === 'pack-apply')
      return act(() => {
        const { result, error } = packPreview();
        if (!result) throw Error(error);
        mutate(() => {
          project = result.project;
          if (state.scope === 'all') page = 0;
          if (state.scope !== 'selection') selected.clear();
        });
        toast('Arranged at original sizes. Locked decals stayed in place.');
      });
  });
  document.addEventListener('input', ev => {
    const el = host();
    if (!el || !el.contains(ev.target)) return;
    const t = ev.target;
    if (t.id === 'space-gap') state.gap = t.value;
    if (t.id === 'grid-rows') state.rows = t.value;
    if (t.id === 'grid-columns') state.columns = t.value;
    if (t.id === 'grid-gap-x') state.gapX = t.value;
    if (t.id === 'grid-gap-y') state.gapY = t.value;
    refreshSummaries();
    drawGhosts();
  });
  document.addEventListener('change', ev => {
    const el = host();
    if (!el || !el.contains(ev.target)) return;
    if (ev.target.id === 'pack-order') state.order = ev.target.value;
    if (ev.target.id === 'pack-pairs') state.pairs = ev.target.checked;
    if (['pack-order', 'pack-pairs'].includes(ev.target.id)) {
      builtKey = '';
      render();
    }
  });
  return { show, render, drawGhosts };
})();
