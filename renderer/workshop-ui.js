'use strict';
// The Workshop: the start page of Decals (remake option A, docs/ui-reference/sheets-2026-11).
// It continues the open sheet, starts new ones and holds every saved sheet with its history.
// On the very first start it is the welcome page. Sheets open in the editor; nothing here edits them.
const Workshop = (() => {
  const PAPERS = [
    ['a4', 'A4', 15, 21],
    ['a5', 'A5', 11, 15],
    ['photo4x6', '4×6', 14, 21],
    ['letter', 'Letter', 15, 20],
    ['custom', 'Other', 14, 18]
  ];
  let welcome = false,
    paper = 'a4',
    sort = null,
    chip = 'all',
    limit = 48,
    entries = [],
    total = 0,
    picked = new Set(),
    side = null, // { kind: 'sheet', id } or { kind: 'recover' }
    generation = 0,
    observer = null;
  const root = () => $('#workshop');
  const isOpen = () => !!root() && !root().hidden;
  const pinned = () => new Set(settings.pinnedSheets || []);
  const ago = value => {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return 'a while ago';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(h / 24);
    if (d === 1) return 'yesterday';
    if (d < 7) return d + ' days ago';
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const paperName = e => DM.pageFormat(e).label.split(' · ')[0];
  const qt = (attrs, iconName, title, sub, main = false) =>
    `<button class="ws-qt ${main ? 'main' : ''}" ${attrs}><span class="ws-ic">${icon(iconName)}</span><span><b>${title}</b><small>${sub}</small></span></button>`;

  function show(options = {}) {
    try {
      CanvasTools.resolve();
    } catch (e) {
      fail(e);
      return;
    }
    welcome = !!options.welcome;
    if (options.recover) side = { kind: 'recover' };
    Shelf.hide();
    CarPage.hide();
    PrintPage.hide();
    root().hidden = false;
    document.body.classList.add('workshop-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'projects');
    Finder.close();
    render();
  }
  function hide() {
    if (!isOpen()) return;
    root().hidden = true;
    welcome = false;
    side = null;
    picked.clear();
    document.body.classList.remove('workshop-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'editor');
    renderPaper();
  }
  function render() {
    if (!isOpen()) return;
    if (welcome) {
      root().innerHTML = `<div class="ws-main"><div class="ws-wrap ws-welcome"><div><span class="ws-eye">Welcome to SlotForge Decals</span><h1>Your artwork.<br>Your scale.<br>Your decals.</h1><p>Make decal sheets for your slot cars: bring your own logos and numbers, size them in millimetres against the car, and print them on decal paper. Everything stays on this computer.</p><img class="ws-car" src="../assets/car-side.png" alt=""></div><div class="ws-starts">${qt('data-ws="image"', 'image', 'Start from an image or logo', 'PNG, JPG, SVG, EPS or PDF', true)}${qt('data-ws="blank"', 'plus', 'Blank A4 sheet', 'Add text, numbers and shapes')}${qt('data-action="demo"', 'star', 'Example sheet', 'Starter decals to play with')}${qt('data-action="open-sheet-file"', 'down', 'Open a shared sheet', 'An .sfsheet file')}${qt('data-action="help"', 'help', 'How it works', 'Short topics in Help')}</div></div></div>`;
      return;
    }
    const p = project,
      pages = Math.min(3, p.pages);
    root().innerHTML = `<div class="ws-main"><div class="ws-wrap">
<div class="ws-hero"><section class="ws-cont"><div class="ws-txt"><span class="ws-eye">Continue where you left off</span><h1 id="ws-current-name">${E(p.name)}</h1><div class="ws-facts"><div><b>${p.items.length}</b>${p.items.length === 1 ? 'decal' : 'decals'}</div><div><b>${p.pages}</b>${p.pages === 1 ? 'page' : 'pages'}</div><div><b>${E(paperName(p))}</b>${p.paper === 'white' ? 'white paper' : 'clear paper'}</div><div><b>1:${p.scale}</b>model scale</div></div><span class="ws-when">Edited ${E(ago(p.updated))} · saved</span><div class="row"><button class="primary" data-ws="continue">Open in the editor${icon('arrow')}</button><button data-ws="versions-current">${icon('history')}Versions</button><button data-ws="pdf">${icon('pdf')}Export PDF</button></div></div><div class="ws-pages">${Array.from({ length: pages }, (_, n) => `<img data-ws-page="${n}" alt="Page ${n + 1}">`).join('')}</div></section>
<section class="ws-quick"><h3>Start something new</h3>${qt('data-ws="blank"', 'plus', 'Blank sheet', 'Pick the paper, then start', true)}<div class="ws-papers" role="group" aria-label="Paper for a blank sheet">${PAPERS.map(([id, label, w, h]) => `<button data-ws-paper="${id}" aria-pressed="${id === paper}"><i style="width:${w}px;height:${h}px"></i>${label}</button>`).join('')}</div>${qt('data-ws="image"', 'image', 'From an image or logo', 'PNG, JPG, SVG, EPS or PDF')}${qt('data-action="open-sheet-file"', 'down', 'Open a shared sheet', 'An .sfsheet file from a friend')}${qt('data-action="demo"', 'star', 'Example sheet', 'Starter decals to play with')}</section></div>
<div class="ws-head"><h2>Your sheets</h2><span class="ws-count" id="ws-count"></span><span class="spacer"></span><div class="ws-chips">${[
      ['all', 'All'],
      ['32', '1:32'],
      ['24', '1:24'],
      ['pinned', '★ Pinned']
    ]
      .map(([id, label]) => `<button data-ws-chip="${id}" aria-pressed="${id === chip}">${label}</button>`)
      .join(
        ''
      )}</div><span class="ws-search">${icon('search')}<input id="ws-search" type="search" placeholder="Find a sheet…" aria-label="Find a sheet"></span><select id="ws-sort" aria-label="Order of the sheets"><option value="recent">Last opened</option><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="added">Newest added</option></select></div>
<div class="ws-grid" id="ws-grid" data-loading="true"></div>
<div class="ws-foot"><span id="ws-picked" class="hint">Shift- or Ctrl-click sheets to share several as one file.</span><button id="ws-share-picked" hidden>${icon('share')}Share selected…</button><span class="spacer"></span><button id="ws-more" hidden>Show more</button><button class="ghost" data-ws="recover">${icon('history')}Recover a sheet…</button></div>
</div></div><aside class="ws-side" id="ws-side" hidden></aside>`;
    sort ??= ['recent', 'name', 'name-desc', 'added'].includes(settings.workshopSort)
      ? settings.workshopSort
      : 'recent';
    $('#ws-sort').value = sort;
    $('#ws-sort').onchange = e => {
      sort = settings.workshopSort = e.target.value;
      revision++;
      scheduleSave();
      load();
    };
    let typing;
    $('#ws-search').oninput = () => {
      clearTimeout(typing);
      typing = setTimeout(load, 150);
    };
    for (const n of Array.from({ length: pages }, (_, n) => n))
      Promise.resolve()
        .then(() => Art.url(Art.sheet(DM.validateProject(DM.clone(project)), n)))
        .then(src => {
          const img = root().querySelector(`[data-ws-page="${n}"]`);
          if (img) img.src = src;
        })
        .catch(() => {});
    load();
    renderSide();
  }
  async function load() {
    const run = ++generation,
      grid = $('#ws-grid');
    if (!grid) return;
    grid.dataset.loading = 'true';
    try {
      const search = $('#ws-search')?.value || '',
        rows = [];
      let result;
      do {
        result = await sheetEntries({ search, sort, offset: rows.length, limit: 48 });
        rows.push(...result.entries);
      } while (rows.length < Math.min(limit, result.total) && result.entries.length);
      if (run !== generation || !$('#ws-grid')) return;
      total = result.total;
      entries = rows.slice(0, limit);
      drawGrid();
    } catch (e) {
      fail(e);
    } finally {
      if (run === generation && $('#ws-grid')) $('#ws-grid').dataset.loading = 'false';
    }
  }
  function shown() {
    const pins = pinned();
    let list = entries;
    if (chip === 'pinned') list = list.filter(e => pins.has(e.id));
    else if (chip !== 'all') list = list.filter(e => String(e.scale ?? scaleOf(e)) === chip);
    return list;
  }
  const scaleOf = e => (/1:(\d+)/.exec(e.meta || '') || [])[1];
  function drawGrid() {
    const pins = pinned(),
      list = shown();
    $('#ws-count').textContent = total;
    $('#ws-grid').innerHTML =
      list
        .map(e => {
          const n = entries.indexOf(e);
          return `<button class="ws-card ${side?.kind === 'sheet' && side.id === e.id ? 'on' : ''} ${picked.has(e.id) ? 'picked' : ''}" data-ws-sheet="${n}" title="${E(e.name)} · double-click to open"><span class="ws-shot"><img data-ws-thumb="${n}" alt=""><span class="ws-pgs">${e.pages} ${e.pages === 1 ? 'page' : 'pages'}</span>${e.current ? '<span class="ws-now"><i></i>Open now</span>' : ''}${pins.has(e.id) ? `<span class="ws-pin" title="Pinned">${icon('star')}</span>` : ''}</span><span class="ws-body"><h3>${E(e.name)}</h3><span class="ws-meta">${E(e.meta)}</span><span class="ws-when">Edited ${E(ago(e.updated))}</span></span></button>`;
        })
        .join('') ||
      `<p class="ws-empty">${entries.length ? 'No sheets match. Try another word or chip.' : 'Your saved sheets appear here.'}</p>`;
    $('#ws-more').hidden = entries.length >= total;
    pickedBar();
    // Thumbnails load as cards come near the screen, so a long list stays quick.
    observer?.disconnect();
    observer = new IntersectionObserver(
      seen => {
        for (const hit of seen) {
          if (!hit.isIntersecting) continue;
          observer.unobserve(hit.target);
          const img = hit.target,
            e = entries[+img.dataset.wsThumb];
          if (e)
            sheetPreview(e)
              .then(src => {
                if (src && img.isConnected) img.src = src;
              })
              .catch(() => {});
        }
      },
      { root: root().querySelector('.ws-main'), rootMargin: '200px' }
    );
    for (const img of $$('[data-ws-thumb]')) observer.observe(img);
  }
  function pickedBar() {
    const n = picked.size;
    $('#ws-picked').textContent = n
      ? `${n} ${n === 1 ? 'sheet' : 'sheets'} selected`
      : 'Shift- or Ctrl-click sheets to share several as one file.';
    $('#ws-share-picked').hidden = !n;
  }
  const entryOf = id => entries.find(e => e.id === id);
  async function renderSide() {
    const box = $('#ws-side');
    if (!box) return;
    box.hidden = !side;
    if (!side) return;
    if (side.kind === 'recover') {
      box.innerHTML = `<header><h3>Recover a sheet</h3><span class="spacer"></span><button class="ghost icon-only" data-ws="close-side" aria-label="Close">${icon('x')}</button></header><div class="ws-tl"><p class="hint">Recovering opens a separate copy. Your other sheets and the decal library stay as they are.</p><h4>Deleted sheets</h4><div id="ws-deleted" class="ws-list"><p class="hint">Loading…</p></div><h4>Automatic snapshots</h4><p class="hint">The last few states of whichever sheet was open, kept while you work.</p><div id="ws-snapshots" class="ws-list"><p class="hint">Loading…</p></div></div>`;
      const fill = async (id, scope) => {
        const result = await desktop.queryLibrary({ scope, sort: 'updated', limit: 30 });
        const el = $('#' + id);
        if (!el) return;
        const rows = result.entries.map(e => ({ ...sheetRow(e, e), id: e.scope + ':' + e.file }));
        el.innerHTML =
          rows
            .map(
              (e, n) =>
                `<div class="ws-ver"><img data-ws-rthumb="${scope}-${n}" alt=""><div class="grow"><b>${E(e.name)}</b><small>${E(scope === 'deleted' ? 'Deleted ' + ago(result.entries[n].deleted) : ago(e.updated))} · ${E(e.meta)}</small></div><button data-recover-preview="${scope}-${n}">Preview &amp; recover</button></div>`
            )
            .join('') ||
          `<p class="hint">${scope === 'deleted' ? 'No deleted sheets.' : 'No snapshots yet.'}</p>`;
        rows.forEach((e, n) => {
          sheetPreview(e)
            .then(src => {
              const img = el.querySelector(`[data-ws-rthumb="${scope}-${n}"]`);
              if (img && src) img.src = src;
            })
            .catch(() => {});
          el.querySelector(`[data-recover-preview="${scope}-${n}"]`).onclick = () =>
            recoveryPreview(e).catch(fail);
        });
      };
      await Promise.all([fill('ws-deleted', 'deleted'), fill('ws-snapshots', 'workspace')]).catch(fail);
      return;
    }
    const e = entryOf(side.id);
    if (!e) {
      side = null;
      box.hidden = true;
      return;
    }
    const pin = pinned().has(e.id);
    box.innerHTML = `<header><h3>${E(e.name)}</h3><span class="spacer"></span><button class="ghost icon-only" data-ws="close-side" aria-label="Close">${icon('x')}</button></header><div class="ws-big"><img id="ws-big" alt="${E(e.name)}"></div><div class="ws-acts"><button class="primary" data-ws="open">${e.current ? 'Keep editing' : 'Open in the editor'}</button><button data-ws="rename">${icon('text')}Rename</button><button data-ws="duplicate">${icon('copy')}Duplicate</button><button data-ws="share">${icon('share')}Share…</button><button data-ws="pin" aria-pressed="${pin}">${icon('star')}${pin ? 'Unpin' : 'Pin'}</button><button class="danger" data-ws="delete" ${e.current ? 'disabled title="Open another sheet first to delete this one."' : ''}>${icon('trash')}Delete</button></div><div class="ws-tl"><h4>History</h4><div id="ws-history" class="ws-timeline"><p class="hint">Loading…</p></div><p class="hint">Opening an earlier version makes a separate copy; this sheet stays as it is.</p></div>`;
    sheetPreview(e)
      .then(src => {
        if (src && $('#ws-big')) $('#ws-big').src = src;
      })
      .catch(() => {});
    const result = await desktop.queryLibrary({
      scope: 'history',
      projectId: e.id,
      sort: 'updated',
      limit: 40
    });
    if (!$('#ws-history') || side?.id !== e.id) return;
    const rows = result.entries.map(h => ({ ...sheetRow(h, h), id: h.scope + ':' + h.file }));
    $('#ws-history').innerHTML =
      `<div class="ws-ver now"><i></i><div class="grow"><b>Now</b><small>${E(e.current ? 'Open in the editor' : 'Last saved ' + ago(e.updated))} · ${E(e.meta)}</small></div></div>` +
      rows
        .map(
          (h, n) =>
            `<div class="ws-ver"><i></i><img data-ws-hthumb="${n}" alt=""><div class="grow"><b>Saved</b><small>${E(ago(h.updated))} · ${E(h.meta)}</small></div><button data-recover-preview="${n}">Open a copy</button></div>`
        )
        .join('') +
      (rows.length ? '' : '<p class="hint">No earlier versions yet. Each save keeps the one before.</p>');
    rows.forEach((h, n) => {
      sheetPreview(h)
        .then(src => {
          const img = $(`[data-ws-hthumb="${n}"]`);
          if (img && src) img.src = src;
        })
        .catch(() => {});
      $(`#ws-history [data-recover-preview="${n}"]`).onclick = () => recoveryPreview(h).catch(fail);
    });
  }
  function select(id) {
    side = { kind: 'sheet', id };
    for (const c of $$('.ws-card')) c.classList.toggle('on', entries[+c.dataset.wsSheet]?.id === id);
    renderSide().catch(fail);
  }
  // A blank sheet on the chosen paper. On the very first start the empty sheet is already open.
  async function blank() {
    const size = welcome ? 'a4' : paper;
    if (!project.items.length && project.name === 'Untitled sheet' && project.pages === 1) {
      if (size !== 'custom' && project.pageSize !== size) mutate(() => (project.pageSize = size));
      hide();
    } else {
      const p = DM.project();
      if (size !== 'custom') p.pageSize = size;
      await projectRun(() => switchProject(p));
      hide();
    }
    if (size === 'custom') customPaperDialog();
  }
  async function fromImage() {
    if (project.items.length || project.name !== 'Untitled sheet')
      await projectRun(() => switchProject(DM.project()));
    hide();
    $('#art-file').click();
  }
  async function readEntry(e) {
    return e.current ? DM.clone(project) : DM.validateProject((await desktop.readProject(e)).project);
  }
  async function rename(e) {
    nameDialog('Rename sheet', e.name, async name => {
      if (e.current) mutate(() => (project.name = name));
      else {
        const p = await readEntry(e);
        p.name = name;
        p.updated = new Date().toISOString();
        const thumbnail = await desktop.projectThumbnail(e).catch(() => null);
        await desktop.saveProject({ project: p, thumbnail });
      }
      toast('Renamed to ' + name + '.');
      render();
    });
  }
  async function duplicate(e) {
    const p = await readEntry(e),
      now = new Date().toISOString();
    Object.assign(p, { id: DM.uid(), name: (p.name + ' copy').slice(0, 160), added: now, updated: now });
    await desktop.saveProject({ project: p, thumbnail: await projectThumbnail(p).catch(() => null) });
    toast('Duplicated as ' + p.name + '.');
    side = { kind: 'sheet', id: p.id };
    render();
  }
  function remove(e) {
    confirmDialog(
      'Delete “' + e.name + '”?',
      'It disappears from your sheets. Recover a sheet… in the Workshop can open it again, with its history.',
      async () => {
        await desktop.deleteProject(e);
        if (side?.id === e.id) side = null;
        picked.delete(e.id);
        settings.pinnedSheets = (settings.pinnedSheets || []).filter(id => id !== e.id);
        toast(e.name + ' deleted. Recover a sheet… brings it back.');
        render();
      },
      'Delete',
      'danger'
    );
  }
  function pin(e) {
    const pins = pinned();
    pins.has(e.id) ? pins.delete(e.id) : pins.add(e.id);
    settings.pinnedSheets = [...pins];
    revision++;
    scheduleSave();
    drawGrid();
    renderSide().catch(fail);
  }
  async function act(name, el) {
    const e = side?.kind === 'sheet' ? entryOf(side.id) : null;
    switch (name) {
      case 'continue':
        return hide();
      case 'pdf':
        hide();
        return exportPDF(false);
      case 'versions-current':
        side = { kind: 'sheet', id: project.id };
        return renderSide();
      case 'blank':
        return blank();
      case 'image':
        return fromImage();
      case 'recover':
        side = { kind: 'recover' };
        for (const c of $$('.ws-card')) c.classList.remove('on');
        return renderSide();
      case 'close-side':
        side = null;
        for (const c of $$('.ws-card')) c.classList.remove('on');
        return renderSide();
      case 'open':
        if (!e) return;
        if (e.current) return hide();
        return openProjectEntry(e);
      case 'rename':
        return e && rename(e);
      case 'duplicate':
        return e && duplicate(e);
      case 'share':
        return e && sheetExportDialog([e]);
      case 'pin':
        return e && pin(e);
      case 'delete':
        return e && !e.current && remove(e);
    }
  }
  document.addEventListener('click', ev => {
    if (!isOpen() || !ev.target.closest('#workshop')) return;
    const paperButton = ev.target.closest('[data-ws-paper]');
    if (paperButton) {
      paper = paperButton.dataset.wsPaper;
      for (const b of $$('[data-ws-paper]')) b.setAttribute('aria-pressed', String(b === paperButton));
      return;
    }
    const chipButton = ev.target.closest('[data-ws-chip]');
    if (chipButton) {
      chip = chipButton.dataset.wsChip;
      for (const b of $$('[data-ws-chip]')) b.setAttribute('aria-pressed', String(b === chipButton));
      drawGrid();
      return;
    }
    const card = ev.target.closest('[data-ws-sheet]');
    if (card) {
      const e = entries[+card.dataset.wsSheet];
      if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
        picked.has(e.id) ? picked.delete(e.id) : picked.add(e.id);
        card.classList.toggle('picked', picked.has(e.id));
        pickedBar();
      } else select(e.id);
      return;
    }
    if (ev.target.closest('#ws-more')) {
      limit += 48;
      load();
      return;
    }
    if (ev.target.closest('#ws-share-picked')) {
      sheetExportDialog(entries.filter(e => picked.has(e.id))).catch(fail);
      return;
    }
    const b = ev.target.closest('[data-ws]');
    if (b && !b.disabled)
      Promise.resolve()
        .then(() => act(b.dataset.ws, b))
        .catch(fail);
  });
  document.addEventListener('dblclick', ev => {
    const card = isOpen() && ev.target.closest('[data-ws-sheet]');
    if (!card) return;
    const e = entries[+card.dataset.wsSheet];
    (e.current ? Promise.resolve(hide()) : openProjectEntry(e)).catch(fail);
  });
  return { show, hide, render, isOpen };
})();
