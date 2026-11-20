'use strict';
// The Decal Library page (remake option A "Decal shelf", docs/ui-reference/library-2026-11).
// Shelves from your tags on the left, the decals as cards or at their printed size in the middle,
// and the chosen decal's details on the right. Sheet copies never change when a decal does.
const Shelf = (() => {
  const PAGE = 48,
    COLOURS = ['#e5484d', '#f0b429', '#3ecf8e', '#79b5ed', '#b28cf5', '#ff8a4c', '#5cc8c0', '#e86fb0'];
  let shelf = 'all',
    view = 'cards',
    selecting = false,
    entries = [],
    total = 0,
    counts = null,
    focus = null, // id of the decal in the details panel
    generation = 0,
    observer = null,
    dragged = [];
  const picked = new Map(); // id → entry
  // Not $(): events can arrive before app.js, which defines it, has run.
  const root = () => document.getElementById('shelf');
  const isOpen = () => !!root() && !root().hidden;
  const sort = () =>
    ['added', 'name', 'name-desc', 'used', 'updated'].includes(settings.shelfSort)
      ? settings.shelfSort
      : 'added';
  const tagsOf = e =>
    String(e?.tags || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  const colourOf = tag => {
    let h = 0;
    for (const c of tag.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return COLOURS[h % COLOURS.length];
  };
  const mm = v => (Math.round(v * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
  // A decal's size at the open sheet's scale: the size it prints at when added now.
  const atScale = (e, scale = project.scale) => ({ w: (e.w * e.scale) / scale, h: (e.h * e.scale) / scale });
  const title = () => {
    if (shelf === 'all') return 'All decals';
    if (shelf === 'favourite') return 'Favourites';
    if (shelf === 'recent') return 'Recently used';
    if (shelf === 'untagged') return 'Untagged';
    if (shelf === 'svg') return 'Vector decals';
    if (shelf === 'image') return 'Images';
    if (shelf === 'group') return 'Groups';
    return shelf.slice(4);
  };

  function show(options = {}) {
    try {
      CanvasTools.resolve();
    } catch (e) {
      fail(e);
      return;
    }
    Workshop.hide();
    CarPage.hide();
    PrintPage.hide();
    SettingsPage.hide();
    closeDialog();
    if (options.focus) focus = options.focus;
    root().hidden = false;
    document.body.classList.add('shelf-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'library');
    Finder.close();
    frame();
    reload();
  }
  function hide() {
    if (!isOpen()) return;
    root().hidden = true;
    observer?.disconnect();
    selecting = false;
    picked.clear();
    document.body.classList.remove('shelf-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'editor');
    renderPaper();
  }

  // The page's fixed parts; the shelves, cards and details fill in as they load.
  function frame() {
    root().innerHTML = `<nav class="sh-shelves" id="shelf-shelves" aria-label="Shelves"></nav><main class="sh-main"><header class="sh-head"><div><h1 id="shelf-title">All decals</h1><p id="shelf-sub" class="sh-sub"></p></div><span class="spacer"></span><button data-shelf-act="export">${icon('up')}Export…</button><button data-action="import-pack">${icon('down')}Import…</button></header><div class="sh-tools"><span class="sh-search">${icon('search')}<input id="shelf-search" type="search" placeholder="Search names, tags or creators" aria-label="Search decals"></span><select id="shelf-sort" aria-label="Order"><option value="added">Newest added</option><option value="used">Recently used</option><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="updated">Recently changed</option></select><span class="spacer"></span><span class="seg" role="group" aria-label="Show as"><button data-shelf-view="cards">${icon('grid')}Cards</button><button data-shelf-view="true">${icon('ruler')}True size</button></span><button id="shelf-select">${icon('check')}Select</button></div><div class="sh-body" id="shelf-body"></div><div class="sh-selbar" id="shelf-selbar" hidden></div></main><aside class="sh-insp" id="shelf-insp" hidden></aside>`;
    $('#shelf-sort').value = sort();
  }
  async function reload() {
    if (!isOpen()) return;
    const request = ++generation;
    entries = [];
    total = 0;
    await Promise.all([loadShelves(request), loadPage(request)]);
    if (focus) inspect(focus);
  }
  async function loadShelves(request = generation) {
    const c = await desktop.libraryShelves();
    if (request !== generation || !isOpen()) return;
    counts = c;
    if (shelf.startsWith('tag:') && !c.tags.some(t => t.tag.toLowerCase() === shelf.slice(4).toLowerCase()))
      shelf = 'all';
    renderShelves();
  }
  function renderShelves() {
    const c = counts || {
      total: 0,
      favourites: 0,
      recent: 0,
      untagged: 0,
      vector: 0,
      image: 0,
      group: 0,
      tags: []
    };
    const b = (key, inner, n, extra = '') =>
      `<button class="sh-shelf" data-shelf="${E(key)}" aria-pressed="${shelf === key}" ${extra}>${inner}<span class="n">${n}</span></button>`;
    $('#shelf-shelves').innerHTML =
      b('all', `${icon('library')}All decals`, c.total) +
      b('favourite', `${icon('star')}Favourites`, c.favourites) +
      b('recent', `${icon('history')}Recently used`, c.recent) +
      `<h4>Tags</h4>` +
      (c.tags.length
        ? c.tags
            .map(t =>
              b(
                'tag:' + t.tag,
                `<i class="sh-dot" style="background:${colourOf(t.tag)}"></i>${E(t.tag)}`,
                t.count,
                `data-drop-tag="${E(t.tag)}"`
              )
            )
            .join('')
        : '<p class="sh-none">Tags you give decals become shelves here.</p>') +
      (c.untagged ? b('untagged', `<i class="sh-dot none"></i>Untagged`, c.untagged) : '') +
      `<h4>Kind</h4>` +
      b('svg', `${icon('shape')}Vector`, c.vector) +
      b('image', `${icon('image')}Images`, c.image) +
      b('group', `${icon('group')}Groups`, c.group) +
      `<label class="sh-drop" id="shelf-drop">${icon('down')}<b>Import a decal pack</b><span>Drop .sfdecal files here, or click to choose</span></label>`;
  }
  async function loadPage(request = generation) {
    const body = $('#shelf-body');
    body.dataset.loading = 'true';
    const result = await Library.query({
      search: $('#shelf-search').value,
      filter: shelf,
      sort: sort(),
      offset: entries.length,
      limit: PAGE
    });
    if (request !== generation || !isOpen()) return;
    entries = entries.concat(result.entries);
    total = result.total;
    body.dataset.loading = 'false';
    renderBody();
  }
  function renderBody() {
    $('#shelf-title').textContent = title();
    const fav = counts?.favourites || 0;
    $('#shelf-sub').textContent = counts?.total
      ? `${total.toLocaleString()} ${total === 1 ? 'decal' : 'decals'}${shelf === 'all' ? ` · ${fav} ${fav === 1 ? 'favourite' : 'favourites'}` : ` of ${counts.total.toLocaleString()}`} · sizes at 1:${project.scale}, the open sheet’s scale`
      : 'Select artwork in the Editor and choose “Save to library” to keep it here.';
    for (const b of $$('[data-shelf-view]'))
      b.setAttribute('aria-pressed', String(b.dataset.shelfView === view));
    $('#shelf-select').setAttribute('aria-pressed', String(selecting));
    const body = $('#shelf-body'),
      more =
        entries.length < total
          ? `<button id="shelf-more" class="sh-more">Show ${Math.min(PAGE, total - entries.length)} more · ${entries.length} of ${total}</button>`
          : '';
    if (!entries.length) {
      body.innerHTML = `<div class="sh-empty"><b>${counts?.total ? 'Nothing on this shelf' : 'Your decal collection'}</b><span>${counts?.total ? ($('#shelf-search').value ? 'Try another search.' : 'Pick another shelf.') : 'Select artwork on a sheet and choose “Save to library”, or import a decal pack.'}</span></div>`;
    } else if (view === 'true') {
      // 96 pixels per inch: on most screens this is close to the decal's real printed size.
      const k = 96 / 25.4;
      body.innerHTML = `<div class="sh-true"><p class="sh-note">${icon('ruler')}<span>Every decal at its printed size for <b>1:${project.scale}</b>, as it comes off the printer. Click one for its details.</span></p><div class="sh-paper">${entries
        .map(e => {
          const s = atScale(e);
          return `<figure class="sh-fig ${e.id === focus ? 'on' : ''} ${picked.has(e.id) ? 'picked' : ''}" data-decal="${E(e.id)}" draggable="true"><img data-decal-thumb="${E(e.id)}" alt="${E(e.name)}" style="width:${(s.w * k).toFixed(1)}px;height:${(s.h * k).toFixed(1)}px"><figcaption>${E(e.name)} · ${mm(s.w)} mm</figcaption></figure>`;
        })
        .join('')}</div>${more}</div>`;
    } else {
      body.innerHTML = `<div class="sh-grid ${selecting ? 'selecting' : ''}">${entries
        .map(e => {
          const s = atScale(e);
          return `<article class="sh-card ${e.id === focus ? 'on' : ''} ${picked.has(e.id) ? 'picked' : ''}" data-decal="${E(e.id)}" draggable="true"><button class="sh-pv" data-open="${E(e.id)}" aria-label="${E(e.name)}: details"><img data-decal-thumb="${E(e.id)}" alt=""></button><span class="sh-tick" aria-hidden="true">${icon('check')}</span><button class="sh-fav" data-fav="${E(e.id)}" aria-pressed="${!!e.favourite}" aria-label="${e.favourite ? 'Remove from favourites' : 'Add to favourites'}" title="${e.favourite ? 'Remove from favourites' : 'Add to favourites'}">${icon('star')}</button><button class="sh-add" data-shelf-add="${E(e.id)}">${icon('plus')}Add to sheet</button><div class="sh-meta"><b title="${E(e.name)}">${E(e.name)}</b><small>${mm(s.w)} × ${mm(s.h)} mm · ${E(e.artworkType)}</small><span class="sh-tags">${tagsOf(
            e
          )
            .map(
              t =>
                `<span class="sh-chip"><i class="sh-dot" style="background:${colourOf(t)}"></i>${E(t)}</span>`
            )
            .join('')}</span></div></article>`;
        })
        .join('')}</div>${more}`;
    }
    thumbs();
    renderSelbar();
  }
  function thumbs() {
    observer?.disconnect();
    const body = $('#shelf-body'),
      request = generation;
    observer = new IntersectionObserver(
      changes => {
        for (const hit of changes) {
          if (!hit.isIntersecting) continue;
          observer.unobserve(hit.target);
          const e = entries.find(d => d.id === hit.target.dataset.decalThumb);
          if (!e) continue;
          Library.preview(e, () => request === generation && hit.target.isConnected)
            .then(src => {
              if (src && hit.target.isConnected) hit.target.src = src;
            })
            .catch(error => {
              if (hit.target.isConnected) hit.target.title = error.message;
            });
        }
      },
      { root: body, rootMargin: '120px' }
    );
    for (const img of body.querySelectorAll('[data-decal-thumb]')) observer.observe(img);
  }
  function renderSelbar() {
    const bar = $('#shelf-selbar');
    bar.hidden = !picked.size;
    if (!picked.size) return;
    bar.innerHTML = `<b id="shelf-picked">${picked.size} selected</b><button data-shelf-act="tag">${icon('library')}Tag…</button><button data-shelf-act="add-picked">${icon('plus')}Add to sheet</button><button data-shelf-act="export-picked">${icon('up')}Export pack</button><button class="danger" data-shelf-act="delete-picked">${icon('trash')}Delete</button><button class="icon-only" data-shelf-act="clear" aria-label="Clear selection" title="Clear selection">${icon('x')}</button>`;
  }

  // The details panel: the decal, its name, tags and creator, its size at other scales and on the
  // car, and the saved sheets that hold a copy.
  async function inspect(id) {
    focus = id;
    for (const el of $$('#shelf [data-decal]')) el.classList.toggle('on', el.dataset.decal === id);
    const panel = $('#shelf-insp');
    if (!id) {
      panel.hidden = true;
      return;
    }
    const request = generation;
    panel.hidden = false;
    panel.innerHTML = '<div class="sh-loading">Loading…</div>';
    let value;
    try {
      value = await desktop.readDecal(id);
    } catch (e) {
      if (focus === id) panel.innerHTML = `<div class="sh-loading">${E(e.message)}</div>`;
      return;
    }
    if (focus !== id || request !== generation || !isOpen()) return;
    const d = value.decal,
      e = value.entry,
      fresh = entries.find(x => x.id === id);
    if (fresh) Object.assign(fresh, e);
    Art.inspectItems([d.art]);
    const scales = [...new Set([24, 32, 43, d.scale, project.scale])].sort((a, b) => a - b),
      s = atScale(e),
      body = carBody(),
      bounds = globalThis.CAR_BOUNDS?.[body]?.side,
      carLength = project.preview.length,
      span = bounds ? bounds.bounds.w / bounds.width : 0.95,
      wPct = Math.min(90, (s.w / carLength) * span * 100);
    panel.innerHTML = `<div class="sh-big checker-bg"><img src="${Art.url(Art.standalone(d.art, value.fonts))}" alt=""></div>
      <section><span class="sh-eye">Decal</span><input id="shelf-name" class="sh-name" value="${E(d.name)}" maxlength="160" aria-label="Decal name"><p class="sh-facts">${E(e.artworkType)} · saved at 1:${d.scale} · added ${E(projectDate(d.added || d.updated))}${d.creator ? ' · by ' + E(d.creator) : ''}</p>
      <div class="sh-taglist">${tagsOf(d)
        .map(
          t =>
            `<span class="sh-chip"><i class="sh-dot" style="background:${colourOf(t)}"></i>${E(t)}<button data-untag="${E(t)}" aria-label="Remove tag ${E(t)}">×</button></span>`
        )
        .join(
          ''
        )}<input id="shelf-tag-add" class="sh-tagin" placeholder="+ Tag" maxlength="60" aria-label="Add a tag" list="shelf-tag-list"><datalist id="shelf-tag-list">${(counts?.tags || []).map(t => `<option value="${E(t.tag)}">`).join('')}</datalist></div>
      <div class="field"><label for="shelf-creator">Creator</label><input id="shelf-creator" value="${E(d.creator || '')}" maxlength="160" placeholder="Who made it"></div></section>
      <section><h3>Size on your car</h3><div class="sh-scales">${scales
        .map(k => {
          const z = atScale(e, k);
          return `<span class="${k === project.scale ? 'on' : ''}">1:${k}</span><span class="${k === project.scale ? 'on' : ''}">${mm(z.w)} × ${mm(z.h)} mm</span><span class="faint">${[k === d.scale ? 'saved' : '', k === project.scale ? 'this sheet' : ''].filter(Boolean).join(' · ')}</span>`;
        })
        .join('')}</div>
      <div class="sh-car" title="${E(DM.CAR_BODIES[body].label)} at 1:${project.scale}"><img class="car" src="${E(carImage(body, 'side'))}" alt=""><img class="decal" src="${Art.url(Art.standalone(d.art, value.fonts))}" alt="" style="width:${wPct.toFixed(2)}%"></div>
      <p class="sh-facts">Next to the ${E(DM.CAR_BODIES[body].label)} of this sheet, at 1:${project.scale}.</p></section>
      <section><h3>On your sheets</h3><div class="sh-used" id="shelf-used"><span class="faint">Looking…</span></div></section>
      <div class="sh-acts"><button class="primary" data-shelf-add="${E(id)}">${icon('plus')}Add to sheet</button><button class="icon-only" data-shelf-act="export-one" title="Export this decal" aria-label="Export this decal">${icon('up')}</button><button class="icon-only danger" data-shelf-act="delete-one" title="Delete from the library" aria-label="Delete from the library">${icon('trash')}</button><span class="sh-error" id="shelf-error" role="alert"></span></div>`;
    desktop
      .decalUsedOn(id)
      .then(list => {
        const host = $('#shelf-used');
        if (!host || focus !== id) return;
        const here = (function walk(items) {
          return items.some(i => i.libraryId === id || walk(i.children || []));
        })(project.items);
        const rows = list.filter(x => x.id !== project.id);
        host.innerHTML =
          (here ? `<div><i></i><b>${E(project.name)}</b><span class="faint">open now</span></div>` : '') +
          rows
            .map(
              x =>
                `<div><i></i>${E(x.name)}<span class="faint">${E(projectDate(x.updated || x.modified))}</span></div>`
            )
            .join('') +
          (here || rows.length
            ? '<p class="faint">Sheet copies stay independent: changing this decal never alters them.</p>'
            : '<span class="faint">Not on any saved sheet yet.</span>');
      })
      .catch(err => {
        if ($('#shelf-used')) $('#shelf-used').textContent = err.message;
      });
  }
  // Name, tags and creator are saved as you go: the decal is read, changed and saved with its stamp.
  async function change(id, fn) {
    const value = await desktop.readDecal(id),
      d = value.decal;
    if (!fn(d)) return;
    await Library.save(d, value.fonts, value.entry.stamp);
  }
  const addTag = (d, tag) => {
    const list = tagsOf(d);
    if (!tag || list.some(t => t.toLowerCase() === tag.toLowerCase())) return false;
    d.tags = [...list, tag].join(', ');
    return true;
  };
  async function refreshAfterEdit(id) {
    await loadShelves();
    const at = entries.findIndex(e => e.id === id);
    if (at >= 0) {
      const r = await Library.query({ id, limit: 1 });
      if (r.entries[0]) entries[at] = r.entries[0];
    }
    renderBody();
    if (focus === id) inspect(id);
  }
  const panelError = e => {
    if ($('#shelf-error')) $('#shelf-error').textContent = e.message;
    else fail(e);
  };
  const pickedEntries = () => [...picked.values()];
  const busy = async fn => {
    const page = root();
    page.inert = true;
    try {
      await fn();
    } finally {
      page.inert = false;
    }
  };
  async function tagMany(list, tag) {
    for (const e of list) await change(e.id, d => addTag(d, tag));
    toast(`Tagged ${list.length} ${list.length === 1 ? 'decal' : 'decals'} “${tag}”.`);
    await reload();
  }
  function tagDialog(list) {
    showDialog(
      'Tag decals',
      `Add a tag to ${list.length} ${list.length === 1 ? 'decal' : 'decals'}. Tags become shelves.`,
      `<div class="field"><label for="shelf-bulk-tag">Tag</label><input id="shelf-bulk-tag" maxlength="60" list="shelf-bulk-list" placeholder="For example Sponsors"><datalist id="shelf-bulk-list">${(counts?.tags || []).map(t => `<option value="${E(t.tag)}">`).join('')}</datalist></div>`,
      '<button data-action="close">Cancel</button><button class="primary" id="shelf-bulk-confirm">Add tag</button>'
    );
    $('#shelf-bulk-tag').focus();
    const go = async () => {
      const tag = $('#shelf-bulk-tag').value.trim();
      if (!tag) return ($('#dialog-error').textContent = 'Enter a tag.');
      $('#dialog-content').inert = true;
      try {
        await tagMany(list, tag);
        closeDialog();
      } catch (e) {
        $('#dialog-error').textContent = e.message;
      } finally {
        $('#dialog-content').inert = false;
      }
    };
    $('#shelf-bulk-confirm').onclick = go;
    $('#shelf-bulk-tag').onkeydown = e => e.key === 'Enter' && go();
  }
  function remove(list) {
    confirmDialog(
      list.length === 1 ? `Delete “${list[0].name}”?` : `Delete ${list.length} decals?`,
      'They leave your library. Sheets that use them keep their own copies.',
      () =>
        busy(async () => {
          for (const e of list) {
            const fresh = (await Library.query({ id: e.id, limit: 1 })).entries[0];
            if (fresh) await Library.remove(fresh);
            picked.delete(e.id);
            if (focus === e.id) focus = null;
          }
          toast(`${list.length === 1 ? 'Decal' : list.length + ' decals'} deleted from the library.`);
          await reload();
          if (!focus) $('#shelf-insp').hidden = true;
        }),
      'Delete',
      'danger'
    );
  }
  async function addToSheet(ids) {
    await busy(async () => {
      for (const id of ids) await addFromLibrary(id);
    });
    hide();
  }

  document.addEventListener('click', ev => {
    if (!isOpen() || !root().contains(ev.target)) return;
    const t = ev.target.closest('button,[data-decal],label#shelf-drop');
    if (!t) return;
    const run = fn => Promise.resolve().then(fn).catch(fail);
    if (t.id === 'shelf-drop') return run(() => $('#pack-file').click());
    if (t.dataset.shelf !== undefined) {
      shelf = t.dataset.shelf;
      generation++;
      renderShelves();
      return run(() => {
        entries = [];
        return loadPage();
      });
    }
    if (t.dataset.shelfView) {
      view = t.dataset.shelfView;
      return renderBody();
    }
    if (t.id === 'shelf-select') {
      selecting = !selecting;
      if (!selecting) picked.clear();
      return renderBody();
    }
    if (t.id === 'shelf-more') return run(() => loadPage());
    if (t.dataset.fav)
      return run(async () => {
        const e = entries.find(x => x.id === t.dataset.fav);
        await desktop.markDecal({ id: e.id, favourite: !e.favourite });
        e.favourite = !e.favourite;
        t.setAttribute('aria-pressed', String(e.favourite));
        Library.invalidate();
        await loadShelves();
        if (shelf === 'favourite') reload();
      });
    if (t.dataset.shelfAdd) return run(() => addToSheet([t.dataset.shelfAdd]));
    if (t.dataset.untag)
      return run(async () => {
        const tag = t.dataset.untag,
          id = focus;
        await change(id, d => {
          d.tags = tagsOf(d)
            .filter(x => x !== tag)
            .join(', ');
          return true;
        });
        await refreshAfterEdit(id);
      }).catch(panelError);
    const act = t.dataset.shelfAct;
    if (act === 'export') return run(() => decalExportDialog(pickedEntries()));
    if (act === 'export-one') return run(() => decalExportDialog(entries.filter(e => e.id === focus)));
    if (act === 'delete-one') return remove(entries.filter(e => e.id === focus));
    if (act === 'tag') return tagDialog(pickedEntries());
    if (act === 'add-picked') return run(() => addToSheet(pickedEntries().map(e => e.id)));
    if (act === 'export-picked') return run(() => decalExportDialog(pickedEntries()));
    if (act === 'delete-picked') return remove(pickedEntries());
    if (act === 'clear') {
      picked.clear();
      selecting = false;
      return renderBody();
    }
    // A card or figure: pick it while selecting (or with Ctrl/Shift), otherwise show its details.
    const card = t.closest('[data-decal]');
    if (card && (t.dataset.open !== undefined || t === card)) {
      const id = card.dataset.decal;
      if (selecting || ev.ctrlKey || ev.metaKey || ev.shiftKey) {
        selecting = true;
        if (picked.has(id)) picked.delete(id);
        else
          picked.set(
            id,
            entries.find(e => e.id === id)
          );
        return renderBody();
      }
      return inspect(id);
    }
  });
  document.addEventListener('dblclick', ev => {
    if (!isOpen()) return;
    const card = ev.target.closest('#shelf [data-decal]');
    if (card && !selecting) addToSheet([card.dataset.decal]).catch(fail);
  });
  document.addEventListener('change', ev => {
    if (!isOpen() || !focus) return;
    const id = focus;
    if (ev.target.id === 'shelf-name')
      change(id, d => {
        const name = ev.target.value.trim();
        if (!name || name === d.name) return false;
        d.name = name;
        return true;
      })
        .then(() => refreshAfterEdit(id))
        .catch(panelError);
    if (ev.target.id === 'shelf-creator')
      change(id, d => {
        if ((d.creator || '') === ev.target.value.trim()) return false;
        d.creator = ev.target.value.trim();
        return true;
      })
        .then(() => refreshAfterEdit(id))
        .catch(panelError);
  });
  document.addEventListener('keydown', ev => {
    if (!isOpen()) return;
    if (ev.target.id === 'shelf-tag-add' && ev.key === 'Enter') {
      const tag = ev.target.value.trim(),
        id = focus;
      if (!tag) return;
      change(id, d => addTag(d, tag))
        .then(() => refreshAfterEdit(id))
        .catch(panelError);
    } else if (ev.target.id === 'shelf-name' && ev.key === 'Enter') ev.target.blur();
    else if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (picked.size || selecting) {
        picked.clear();
        selecting = false;
        renderBody();
      } else if (focus) {
        focus = null;
        inspect(null);
      }
    }
  });
  let searchTimer = 0;
  document.addEventListener('input', ev => {
    if (!isOpen() || ev.target.id !== 'shelf-search') return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      generation++;
      entries = [];
      loadPage().catch(fail);
    }, 180);
  });
  document.addEventListener('change', ev => {
    if (!isOpen() || ev.target.id !== 'shelf-sort') return;
    settings.shelfSort = ev.target.value;
    revision++;
    scheduleSave();
    generation++;
    entries = [];
    loadPage().catch(fail);
  });
  // Drag cards onto a tag shelf to tag them; drop .sfdecal files anywhere on the page to import.
  document.addEventListener('dragstart', ev => {
    const card = isOpen() && ev.target.closest?.('#shelf [data-decal]');
    if (!card) return;
    const id = card.dataset.decal;
    dragged = picked.has(id) ? pickedEntries() : entries.filter(e => e.id === id);
    ev.dataTransfer.setData('application/x-slotforge-decal', id);
    ev.dataTransfer.effectAllowed = 'copy';
  });
  document.addEventListener('dragover', ev => {
    if (!isOpen()) return;
    const target = ev.target.closest?.('#shelf [data-drop-tag]');
    for (const el of $$('#shelf [data-drop-tag]'))
      el.classList.toggle('drop', el === target && !!dragged.length);
    if (target && dragged.length) ev.preventDefault();
    else if (root().contains(ev.target) && [...(ev.dataTransfer?.types || [])].includes('Files')) {
      ev.preventDefault();
      $('#shelf-drop')?.classList.add('drop');
    }
  });
  document.addEventListener('dragend', () => {
    dragged = [];
    for (const el of $$('#shelf .drop')) el.classList.remove('drop');
  });
  document.addEventListener('drop', ev => {
    if (!isOpen() || !root().contains(ev.target)) return;
    const target = ev.target.closest('[data-drop-tag]');
    for (const el of $$('#shelf .drop')) el.classList.remove('drop');
    if (target && dragged.length) {
      ev.preventDefault();
      const list = dragged;
      dragged = [];
      busy(() => tagMany(list, target.dataset.dropTag)).catch(fail);
      return;
    }
    const file = ev.dataTransfer?.files?.[0];
    if (file) {
      ev.preventDefault();
      ev.stopPropagation();
      importPackage(file, 'decals').catch(fail);
    }
  });
  // The library changed elsewhere (a decal pack imported): show it when the page is open.
  let changeTimer = 0;
  function changed() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => isOpen() && reload().catch(fail), 150);
  }
  return {
    show,
    hide,
    isOpen,
    changed,
    inspect,
    get focus() {
      return focus;
    }
  };
})();
