/* SlotForge Decals — physical dimensions are millimetres throughout. */
'use strict';
const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)],
  E = DM.esc;
const icons = {
  sheet: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h5',
  library: 'M3 5h7l2 2h9v13H3z M7 11h10 M7 15h6',
  share: 'M12 16V3 M7 8l5-5 5 5 M4 13v8h16v-8',
  settings: 'M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  help: 'M9 8a3 3 0 1 1 5 3l-2 2v2 M12 18h.01 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',
  undo: 'M8 4L3 9l5 5 M3 9h10a7 7 0 0 1 0 14',
  redo: 'M16 4l5 5-5 5 M21 9h-10a7 7 0 0 0 0 14',
  save: 'M4 3h13l4 4v14H3V3z M7 3v6h9V3 M7 21v-7h10v7',
  export: 'M12 15V3 M7 8l5-5 5 5 M4 14v7h16v-7',
  import: 'M12 3v13 M7 11l5 5 5-5 M4 16v5h16v-5',
  plus: 'M12 5v14 M5 12h14',
  pointer: 'M5 3l14 10-7 1-4 7z',
  align: 'M4 3v18 M8 6h12 M8 12h8 M8 18h12',
  copy: 'M8 8h13v13H8z M16 8V3H3v13h5',
  trash: 'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  appearance:
    'M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2a4 4 0 0 0 4-4c0-4.1-4-7.4-9-7.4z M7.5 12h.01 M9.5 7.5h.01 M14.5 7.5h.01',
  workspace:
    'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  backup: 'M3 4h18v5H3z M5 9v11h14V9 M10 13h4',
  update: 'M20 11a8 8 0 0 0-14.5-4.5L3 9 M3 4v5h5 M4 13a8 8 0 0 0 14.5 4.5L21 15 M21 20v-5h-5',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5L20 20',
  topic: 'M5 4h14v16H5z M9 9h6 M9 13h6 M9 17h3'
};
function icon(name) {
  if (!icons[name] && document.getElementById('ic-' + name))
    return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.sheet}"/></svg>`;
}
for (const b of $$('[data-icon]')) b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon));
let project = DM.project(),
  settings = { theme: 'dark' },
  selected = new Set(),
  page = 0,
  history = [],
  future = [],
  saveTimer,
  saveSerial = Promise.resolve(),
  revision = 0,
  savedRevision = 0,
  rootPath = '',
  appVersion = '',
  ready = false,
  zoom = 0,
  filter = 'all',
  drag = null,
  carDrag = null,
  busy = false,
  carImportView = 'side';
const carData = {};
// Snapshots share image and font strings (see DM.clone), so a long history stays cheap.
const UNDO_LIMIT = 200;
ColourKit.configure({
  recent: () => settings.recentColours || [],
  sheet: () => ColourKit.sheetColours(project.items),
  remember: colour => {
    if (!colour) return;
    settings.recentColours = ColourKit.addRecent(settings.recentColours || [], colour);
    revision++;
    scheduleSave();
  }
});
const items = () => project.items.filter(i => selected.has(i.id));
const current = () => (items().length === 1 ? items()[0] : null);
const activeFonts = () => project.fonts;
// An autosave during a pointer gesture must not persist a placement the user can still cancel.
const assetsSnapshot = () => ({
  format: 'slotforge-decals-workspace',
  version: DM.fileVersion(drag?.before || carDrag?.before || project),
  project: DM.clone(drag?.before || carDrag?.before || project),
  library: [],
  libraryFonts: [],
  libraryMode: 'external',
  settings: DM.clone(settings)
});
// Notices above the status bar (messages.js). opts: { undo: true } or { action: { label, run } }.
function toast(text, error = false, opts = {}) {
  Messages.notice(text, { ...opts, error });
}
function fail(e) {
  console.error(e);
  toast(e.message || String(e), true);
}
function record() {
  history.push(DM.clone(project));
  if (history.length > UNDO_LIMIT) history.shift();
  future = [];
}
function changed() {
  project.updated = new Date().toISOString();
  revision++;
  $('#save-status').classList.add('saving');
  $('#save-status').innerHTML = '<i></i>Saving…';
  scheduleSave();
}
function mutate(fn, coalesce = false) {
  CanvasTools.resolve();
  const before = DM.clone(project);
  try {
    fn();
    project = DM.validateProject(project);
  } catch (e) {
    project = before;
    throw e;
  }
  if (!coalesce) {
    history.push(before);
    if (history.length > UNDO_LIMIT) history.shift();
  }
  future = [];
  changed();
  render();
}
// Autosave waits for a short pause in your changes, but never longer than SAVE_AT_MOST after the
// first unsaved one: holding an arrow key or dragging a slider for a while still saves as you go.
const SAVE_PAUSE = 550,
  SAVE_AT_MOST = 2500;
let unsavedSince = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  const now = Date.now();
  unsavedSince ??= now;
  saveTimer = setTimeout(
    () => flush().catch(fail),
    Math.max(0, Math.min(SAVE_PAUSE, unsavedSince + SAVE_AT_MOST - now))
  );
}
async function flush() {
  if (!ready) return;
  clearTimeout(saveTimer);
  unsavedSince = null;
  const data = assetsSnapshot(),
    target = revision;
  const job = saveSerial
    .catch(() => {})
    .then(async () => {
      try {
        await desktop.save(data);
        savedRevision = Math.max(savedRevision, target);
        if (savedRevision === revision) {
          $('#save-status').classList.remove('error', 'saving');
          $('#save-status').innerHTML = '<i></i>Saved locally';
        }
      } catch (e) {
        $('#save-status').classList.remove('saving');
        $('#save-status').classList.add('error');
        $('#save-status').innerHTML = '<i></i>Save failed';
        throw e;
      }
    });
  saveSerial = job;
  return job;
}
function showDialog(title, subtitle, body, buttons = '', large = false) {
  const d = $('#dialog');
  d.classList.toggle('large', large);
  d.classList.remove('msg', 'msg-decide', 'msg-progress', 'msg-trouble');
  $('#dialog-content').innerHTML =
    `<div class="dialog-head"><div><h2>${E(title)}</h2><p>${E(subtitle || '')}</p></div><button data-action="close" aria-label="Close dialog">✕</button></div><div class="dialog-body">${body}<p id="dialog-error" class="dialog-error" role="alert"></p></div>${buttons ? `<div class="dialog-foot">${buttons}</div>` : ''}`;
  if (!d.open) d.showModal();
}
// Page Note: what a window is, a few words more, and where you use it.
function closeDialog() {
  $('#dialog').close();
}
// The browser queues close events. Ignore one from a previous dialog after reopening.
$('#dialog').addEventListener(
  'close',
  e => {
    if (e.currentTarget.open) e.stopImmediatePropagation();
  },
  true
);
function nameDialog(title, initial, submit) {
  showDialog(
    title,
    'Choose a name you will recognise.',
    `<div class="field"><label>Name</label><input id="name-input" value="${E(initial)}" maxlength="160"></div>`,
    '<button data-action="close">Cancel</button><button class="primary" id="name-submit">Save</button>'
  );
  const go = async () => {
    try {
      const n = $('#name-input').value.trim();
      if (!n) throw Error('Enter a name.');
      await submit(n);
      closeDialog();
    } catch (e) {
      $('#dialog-error').textContent = e.message;
    }
  };
  $('#name-submit').onclick = go;
  $('#name-input').onkeydown = e => {
    if (e.key === 'Enter') go();
  };
  $('#name-input').focus();
  $('#name-input').select();
}
// kind: 'question', or 'danger' for what cannot be undone; the window shows a matching badge.
// A decision card (messages.js). extra: { sub, will: [], safe: [], keep } says what will happen and
// what stays safe; without it the text is shown as it is.
function confirmDialog(title, text, submit, label = 'Continue', kind = 'question', extra = {}) {
  Messages.decide({
    title,
    text: extra.will || extra.safe ? '' : text,
    submit,
    confirm: label,
    kind,
    ...extra
  });
}
function validateWorkspace(data) {
  const v = DM.validateWorkspace(data);
  Art.inspectItems(v.project.items);
  Art.inspectItems(v.library.map(d => d.art));
  return { p: v.project, entries: v.library, fonts: v.libraryFonts };
}
async function start() {
  document.body.inert = true;
  document.body.setAttribute('aria-busy', 'true');
  try {
    // The default car decodes while the workspace loads instead of after it.
    const car = loadCar('gt');
    car.catch(() => {});
    const loaded = await desktop.load();
    rootPath = loaded.root;
    appVersion = loaded.version || '';
    Library.setCount(loaded.libraryCount);
    if (loaded.data) {
      const v = validateWorkspace(loaded.data);
      project = v.p;
      settings = { ...settings, ...loaded.data.settings };
      await Art.loadFonts(activeFonts());
      if (loaded.recovered) toast('Recovered your last readable backup. The workspace has been preserved.');
    }
    if (loaded.warnings?.length)
      toast(
        loaded.warnings.length +
          ' legacy file(s) could not be migrated. Originals are kept in your workspace folder.',
        true
      );
    await car;
    ready = true;
    applyTheme();
    render();
    $('#save-status').innerHTML = '<i></i>Saved locally';
    // The Workshop is the start page: the welcome on the very first start, the sheets afterwards.
    if (!loaded.data) Workshop.show({ welcome: true });
    else if (loaded.startOnWorkshop && settings.startOnWorkshop !== false) Workshop.show();
    startUpdates();
    SettingsPage.remind();
    // Load the path library once the editor is idle, so the Path Tool opens without a wait.
    requestIdleCallback(() => PathTools.ready().catch(() => {}), { timeout: 4000 });
  } catch (e) {
    document.body.innerHTML = `<div class="error-state"><h1>Your workspace needs attention</h1><p>${E(e.message)}</p><p>No existing data has been overwritten.</p><button id="open-recovery">Open workspace folder</button><button id="restore-complete-recovery">Restore Complete Backup</button></div>`;
    $('#open-recovery').onclick = () => desktop.folder();
    $('#restore-complete-recovery').onclick = async () => {
      try {
        if (await desktop.completeRestore()) desktop.reloadWorkspace();
      } catch (error) {
        document.querySelector('.error-state p').textContent = error.message;
      }
    };
  } finally {
    document.body.inert = false;
    document.body.removeAttribute('aria-busy');
  }
}
// Car images load on demand per body and are cached; the visible outline (alpha bounds)
// defines the car's extent in the preview.
const carLoads = {};
const carBody = () => (Object.hasOwn(DM.CAR_BODIES, project.preview.body) ? project.preview.body : 'gt');
function loadCar(body) {
  carLoads[body] ??= loadCars(body).catch(e => {
    delete carLoads[body];
    throw e;
  });
  return carLoads[body];
}
const carImage = (body, view) =>
  new URL(
    body === 'gt' ? '../assets/car-' + view + '.png' : `../assets/cars/${body}-${view}.webp`,
    location.href
  ).href;
async function loadCars(body = 'gt') {
  carData[body] = {};
  // Built-in cars have their size and outline precomputed (renderer/car-bounds.js), so nothing has
  // to be decoded before the editor opens; the preview loads the picture itself.
  const known = globalThis.CAR_BOUNDS?.[body];
  if (known?.side && known?.top) {
    for (const view of ['side', 'top']) carData[body][view] = { src: carImage(body, view), ...known[view] };
    return;
  }
  const views = ['side', 'top'].map(view => {
    const img = new Image();
    img.src = carImage(body, view);
    const decoded = img.decode();
    decoded.catch(() => {}); // awaited below; avoids an unhandled rejection if the other view fails first
    return { view, img, decoded };
  });
  for (const { view, img, decoded } of views) {
    await decoded;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width,
      y0 = c.height,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (rgba[(y * c.width + x) * 4 + 3] > 100) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    carData[body][view] = {
      src: img.src,
      width: c.width,
      height: c.height,
      bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
    };
  }
}
function applyTheme() {
  const theme = settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const toggle = $('#theme-toggle'),
    other = theme === 'dark' ? 'light' : 'dark';
  if (toggle) {
    toggle.dataset.action = 'theme-' + other;
    toggle.title = other === 'light' ? 'Light theme' : 'Dark theme';
    toggle.setAttribute('aria-label', 'Switch to the ' + other + ' theme');
  }
  const picker = $('#theme-setting');
  if (picker) picker.value = theme;
}
function setTheme(theme) {
  settings.theme = theme === 'light' ? 'light' : 'dark';
  applyTheme();
  revision++;
  scheduleSave();
}
function render() {
  if (!ready) return;
  Art.pinFonts(project.fonts);
  $('#project-name').textContent = project.name;
  $('#project-name').setAttribute('aria-label', 'Sheet name: ' + project.name + '. Click to rename.');
  $('#sheet-size-select').value = project.pageSize || 'a4';
  $('#sheet-size-select option[value="custom"]').textContent =
    project.pageSize === 'custom' ? DM.pageFormat(project).label : 'Custom size…';
  $('#sheet-size-select option[value="custom-edit"]').hidden = project.pageSize !== 'custom';
  $('#paper').setAttribute('aria-label', DM.pageFormat(project).label + ' decal sheet');
  $('#scale-badge').textContent = '1:' + project.scale;
  $('#sheet-facts').textContent = [
    DM.pageFormat(project).label.split(' · ')[0],
    project.orientation,
    '1:' + project.scale,
    project.pages + (project.pages === 1 ? ' page' : ' pages')
  ].join(' · ');
  $('#undo').disabled = !history.length;
  $('#redo').disabled = !future.length;
  page = Math.min(page, project.pages - 1);
  selected = new Set([...selected].filter(id => project.items.some(i => i.id === id && i.page === page)));
  renderTabs();
  renderLibrary();
  renderPaper();
  renderInspector();
  LayoutTab.render();
  renderCar();
  renderLayers();
  $('#orientation').value = project.orientation;
  $('#margin').value = project.margin;
  $('#gap').value = project.gap;
  $('#paper-type').value = project.paper;
  $('#white-ink').checked = project.whiteInk;
  $('#spot-name').value = project.spotName;
  $('#spot-name').disabled = !project.whiteInk;
  const cut = DM.cutSettings(project.cut);
  $('#cut-mode').value = cut.mode;
  $('#cut-offset').value = cut.offset;
  $('#cut-preview').checked = cut.preview;
  $('#cut-pdf').checked = cut.pdfLines;
  renderChecks();
  selectionStatus();
  renderPages();
}
// Print notes: the status bar says how many, the Export menu lists them.
function renderChecks() {
  const warnings = DM.warnings(project),
    n = warnings.length;
  $('#checks').classList.toggle('warn', !!n);
  $('#checks').innerHTML =
    `<span class="dot"></span>${n ? `${n} print ${n === 1 ? 'note' : 'notes'}` : 'Ready to print'}`;
  $('#print-ready').classList.toggle('warn', !!n);
  $('#print-ready').innerHTML = n
    ? `<b>${icon('warn')}${n} print ${n === 1 ? 'note' : 'notes'} to look at</b><ul>${warnings
        .slice(0, 4)
        .map(w => `<li>${E(w.text)}</li>`)
        .join('')}${n > 4 ? `<li>…and ${n - 4} more</li>` : ''}</ul>`
    : `<b>${icon('check')}Ready to print</b><p>No margin, gap or sharpness problems on ${project.pages === 1 ? 'this page' : `these ${project.pages} pages`}.</p>`;
}
// Pages: numbered thumbnails under the sheet and cards in the Pages tab.
function renderPages() {
  const s = DM.size(project),
    ratio = s.h / s.w;
  $('#pages').innerHTML = Array.from(
    { length: project.pages },
    (_, n) =>
      `<button data-page="${n}" class="${n === page ? 'active' : ''}" style="--ratio:${ratio}" title="Page ${n + 1}" aria-label="Page ${n + 1}"><span>${n + 1}</span></button>`
  ).join('');
  $('#pages-count').textContent = project.pages;
  if (!$('[data-left-pane="pages"]').hidden)
    $('#page-cards').innerHTML = Array.from({ length: project.pages }, (_, n) => {
      const list = project.items.filter(i => i.page === n);
      return `<button class="page-card ${n === page ? 'active' : ''}" data-page-card="${n}"><svg class="page-thumb" viewBox="0 0 ${s.w} ${s.h}" style="--ratio:${ratio}"><rect width="${s.w}" height="${s.h}" fill="white"/>${list.map((i, k) => `<g transform="${itemTransform(i)}" opacity="${i.opacity}">${Art.body(i, 'page' + n + '-' + k)}</g>`).join('')}</svg><span><b>Page ${n + 1}</b><small>${list.length ? list.length + (list.length === 1 ? ' decal' : ' decals') : 'Empty'}</small></span></button>`;
    }).join('');
  for (const b of $$('[data-page],[data-page-card]'))
    b.onclick = () => {
      page = +(b.dataset.page ?? b.dataset.pageCard);
      selected.clear();
      render();
    };
}
// Side panels: Library, Layers and Pages on the left; Decal and Sheet & paper on the right.
function renderTabs() {
  const left = ['library', 'layers', 'pages'].includes(settings.leftTab) ? settings.leftTab : 'library',
    right = ['sheet', 'layout'].includes(settings.rightTab) ? settings.rightTab : 'decal';
  for (const b of $$('[data-left-tab]')) b.setAttribute('aria-selected', String(b.dataset.leftTab === left));
  for (const p of $$('[data-left-pane]')) p.hidden = p.dataset.leftPane !== left;
  for (const b of $$('[data-right-tab]'))
    b.setAttribute('aria-selected', String(b.dataset.rightTab === right));
  for (const p of $$('[data-right-pane]')) p.hidden = p.dataset.rightPane !== right;
  $('#car-folder').classList.toggle('closed', settings.fitCheckOpen === false);
  for (const b of $$('[data-action="fitcheck-toggle"]'))
    b.setAttribute('aria-expanded', String(settings.fitCheckOpen !== false));
}
function showTab(side, tab, remember = true) {
  const key = side === 'left' ? 'leftTab' : 'rightTab';
  if (settings[key] === tab) return;
  settings[key] = tab;
  if (remember) {
    revision++;
    scheduleSave();
  }
  renderTabs();
  if (side === 'right') LayoutTab.render();
  if (side === 'left') {
    if (tab === 'library') renderLibrary();
    if (tab === 'pages') renderPages();
    if (tab === 'layers') renderLayers();
  }
}
for (const b of $$('[data-left-tab]')) b.onclick = () => showTab('left', b.dataset.leftTab);
for (const b of $$('[data-right-tab]')) b.onclick = () => showTab('right', b.dataset.rightTab);
function renderLibrary() {
  Library.renderSidebar();
}
// Toolbar buttons that act on the selection are greyed out until they can do something.
const SELECTION_TOOLS = {
  'arrange-selection': ['Select one or more decals to arrange them.', list => list.length > 0],
  group: ['Select two or more decals to group them.', list => list.length > 1],
  ungroup: ['Select a grouped decal to ungroup it.', list => list.length === 1 && list[0].kind === 'group'],
  duplicate: ['Select a decal to duplicate it.', list => list.length > 0],
  delete: ['Select a decal to delete it.', list => list.length > 0],
  'mirror-pair': ['Select a decal to add a mirrored copy.', list => list.length > 0],
  'grid-copies': ['Select a decal to repeat it.', list => list.length > 0]
};
function selectionStatus() {
  const list = items();
  for (const [action, [hint, ready]] of Object.entries(SELECTION_TOOLS)) {
    const button = $(`.ctx-bar :is([data-action="${action}"], [data-alias="${action}"])`);
    if (!button) continue;
    button.dataset.tip ??= button.title || '';
    button.disabled = !ready(list);
    button.title = button.disabled ? hint : button.dataset.tip;
  }
  $('.ctx-bar [data-action="group"]').hidden = list.length < 2;
  $('.ctx-bar [data-action="ungroup"]').hidden = !(list.length === 1 && list[0].kind === 'group');
  const one = list.length === 1 ? list[0] : null,
    box = list.length ? DM.union(list) : null;
  $('#ctx-size').textContent = one
    ? `${fmt(one.w)} × ${fmt(one.h)} mm${one.rotation ? ` · ${fmt(one.rotation)}°` : ''}`
    : box
      ? `${list.length} decals · ${fmt(box.w)} × ${fmt(box.h)} mm`
      : '';
  placeContextBar();
  $('#selection-status').textContent = selected.size
    ? `${selected.size} selected · Drag to move together · Shift-click to add or remove · Arrow keys nudge 1 mm`
    : `${project.items.filter(i => i.page === page).length} decals on page ${page + 1} · Drag on empty paper to select several · Ctrl+K finds anything`;
}
const fmt = n => String(Number(n.toFixed(1)));
// The bar with the selection tools floats just above the selected decals (below them near the top).
function placeContextBar() {
  const bar = $('#ctx-bar'),
    nodes = [...selected].map(id => $(`#paper .sheet-item[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
  bar.hidden = !nodes.length || !!CanvasTools.active || drag?.kind === 'select' || MakeTools.isEditing();
  if (bar.hidden) return;
  const panel = $('.editor-panel').getBoundingClientRect(),
    view = $('#sheet-scroll').getBoundingClientRect(),
    r = nodes
      .map(n => n.getBoundingClientRect())
      .reduce((a, b) => ({
        left: Math.min(a.left, b.left),
        top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right),
        bottom: Math.max(a.bottom, b.bottom)
      }));
  const w = bar.offsetWidth,
    h = bar.offsetHeight;
  let top = r.top - h - 12;
  if (top < view.top + 6) top = r.bottom + 12;
  top = Math.max(view.top + 6, Math.min(top, view.bottom - h - 6));
  const left = Math.max(view.left + 6, Math.min((r.left + r.right) / 2 - w / 2, view.right - w - 6));
  bar.style.left = left - panel.left + 'px';
  bar.style.top = top - panel.top + 'px';
}
$('#sheet-scroll').addEventListener('scroll', () => placeContextBar(), { passive: true });
function renderSelection() {
  renderPaper();
  renderInspector();
  LayoutTab.render();
  renderCar();
  renderLayers();
  selectionStatus();
}
// Picking a decal on the sheet or in Layers, or adding one, brings the Decal tab forward.
function revealDecal() {
  if (settings.rightTab === 'sheet') showTab('right', 'decal');
}
// Back / Forward: swap with the nearest decal on the same page (decals on other pages do not
// overlap it, so swapping with them changed nothing you could see).
function restack(direction) {
  const i = current();
  if (i?.locked) throw Error('Unlock this decal before editing.');
  if (!i) return;
  const n = project.items.indexOf(i);
  let j = n + direction;
  while (j >= 0 && j < project.items.length && project.items[j].page !== i.page) j += direction;
  if (j < 0 || j >= project.items.length) return;
  mutate(() => {
    [project.items[j], project.items[n]] = [project.items[n], project.items[j]];
  });
}
function commitGesture(before) {
  try {
    project = DM.validateProject(project);
  } catch (e) {
    project = before;
    fail(e);
    return;
  }
  history.push(before);
  if (history.length > UNDO_LIMIT) history.shift();
  future = [];
  changed();
}
function selectionBox(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y)
  };
}
function marqueeMarkup() {
  if (drag?.kind !== 'select' || !drag.moved) return '';
  const b = selectionBox(drag.start, drag.end);
  return `<rect class="selection-marquee" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
}
// Screen pixels per millimetre at 100%.
const MM_PX = 96 / 25.4;
function fitScale() {
  const area = $('#sheet-scroll'),
    s = DM.size(project);
  return Math.max(0.5, Math.min((area.clientWidth - 95) / s.w, (area.clientHeight - 70) / s.h));
}
// Keep the sheet point under the cursor stationary when scroll bounds allow it.
function zoomSheet(factor, clientX, clientY) {
  const area = $('#sheet-scroll'),
    viewport = area.getBoundingClientRect(),
    paper = $('#paper'),
    before = paper.getBoundingClientRect(),
    old = zoom || fitScale();
  clientX ??= viewport.left + area.clientWidth / 2;
  clientY ??= viewport.top + area.clientHeight / 2;
  const x = (clientX - before.left) / old,
    y = (clientY - before.top) / old,
    next = Math.max(0.5, Math.min(12, old * factor));
  if (next === old) return;
  zoom = next;
  sizePaper();
  CanvasTools.draw();
  placeContextBar();
  const after = paper.getBoundingClientRect();
  area.scrollLeft += after.left + x * next - clientX;
  area.scrollTop += after.top + y * next - clientY;
}
$('#sheet-scroll').addEventListener(
  'wheel',
  e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (!ready || busy || projectTask || drag || carDrag || $('#dialog').open || !e.deltaY) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? $('#sheet-scroll').clientHeight : 1;
    const delta = Math.max(-120, Math.min(120, e.deltaY * unit));
    zoomSheet(Math.exp((-delta * Math.log(1.2)) / 100), e.clientX, e.clientY);
  },
  { passive: false }
);
const itemTransform = i =>
  `translate(${i.x + i.w / 2} ${i.y + i.h / 2}) rotate(${i.rotation}) translate(${-i.w / 2} ${-i.h / 2})`;
function itemMarkup(i, n) {
  return `<g class="sheet-item ${i.locked ? 'locked' : ''}" data-id="${E(i.id)}"><g transform="${itemTransform(i)}" opacity="${i.opacity}">${Art.body(i, 'sheet' + n)}<rect class="item-hit" width="${i.w}" height="${i.h}"/>${selected.has(i.id) ? `<rect class="selection" width="${i.w}" height="${i.h}"/>${!i.locked && selected.size === 1 ? `<rect class="handle" data-handle="${E(i.id)}" x="${i.w - 1}" y="${i.h - 1}" width="2" height="2"/>` : ''}` : ''}</g></g>`;
}
// While dragging, the screen is updated at most once per frame and only where needed: a move shifts
// the dragged decals, a resize redraws that one decal, a box selection redraws the selection. The
// full redraw follows when the drag ends (finishSheetDrag).
let dragFrame = 0;
function scheduleDragFrame() {
  dragFrame ||= requestAnimationFrame(() => {
    dragFrame = 0;
    if (!drag) return;
    const onPage = project.items.filter(i => i.page === page);
    if (drag.kind === 'select') {
      // Redraw only decals whose selection mark changed; the panels follow when the drag ends.
      onPage.forEach((i, n) => {
        const node = $('#paper').querySelector(`.sheet-item[data-id="${CSS.escape(i.id)}"]`);
        if (!node) return;
        const shown = node.querySelector('[data-handle]') ? 2 : node.querySelector('.selection') ? 1 : 0,
          wanted = selected.has(i.id) ? (selected.size === 1 && !i.locked ? 2 : 1) : 0;
        if (shown !== wanted) node.outerHTML = itemMarkup(i, n);
      });
      $('#paper .selection-marquee')?.remove();
      $('#paper').insertAdjacentHTML('beforeend', marqueeMarkup());
      selectionStatus();
      return;
    }
    for (const old of drag.initial) {
      const n = onPage.findIndex(i => i.id === old.id),
        node = $('#paper').querySelector(`.sheet-item[data-id="${CSS.escape(old.id)}"]`);
      if (n < 0 || !node) return renderPaper();
      if (drag.handle) node.outerHTML = itemMarkup(onPage[n], n);
      else node.firstElementChild.setAttribute('transform', itemTransform(onPage[n]));
    }
    if (drag.handle) {
      $('#cut-preview-layer')?.remove(); // redrawn for the new size when the drag ends
      renderCar();
    } else drawCutPreview();
  });
}
// Sheet size on screen, zoom label and rulers. Zooming only needs this: the artwork scales with the
// viewBox, so it is not redrawn.
function sizePaper() {
  const s = DM.size(project),
    scale = zoom || fitScale();
  $('#paper-wrap').style.width = s.w * scale + 'px';
  $('#paper').style.width = s.w * scale + 'px';
  $('#paper').style.height = s.h * scale + 'px';
  $('#paper').setAttribute('viewBox', `0 0 ${s.w} ${s.h}`);
  $('#sheet-size').textContent = `${s.w} × ${s.h} mm`;
  $('#zoom').textContent = Math.round((scale / MM_PX) * 100) + '%';
  $('#ruler-x').innerHTML = Array.from(
    { length: Math.floor(s.w / 5) + 1 },
    (_, n) =>
      `<i class="tick-x ${n % 10 === 0 ? 'major' : ''}" style="left:${n * 5 * scale}px">${n % 10 === 0 ? `<span>${n * 5}</span>` : ''}</i>`
  ).join('');
  $('#ruler-y').innerHTML = Array.from(
    { length: Math.floor(s.h / 5) + 1 },
    (_, n) =>
      `<i class="tick-y ${n % 10 === 0 ? 'major' : ''}" style="top:${n * 5 * scale}px">${n % 10 === 0 ? `<span>${n * 5}</span>` : ''}</i>`
  ).join('');
}
function renderPaper() {
  const s = DM.size(project);
  sizePaper();
  const art = project.items
    .filter(i => i.page === page)
    .map(itemMarkup)
    .join('');
  $('#paper').innerHTML =
    `<rect width="${s.w}" height="${s.h}" fill="white"/><rect x="${project.margin}" y="${project.margin}" width="${s.w - 2 * project.margin}" height="${s.h - 2 * project.margin}" fill="none" stroke="#b7c1cf" stroke-width=".15" stroke-dasharray="1.5 1" pointer-events="none"/>${art}${marqueeMarkup()}`;
  CanvasTools.draw();
  drawCutPreview();
  placeContextBar();
  MakeTools.position();
  LayoutTab.drawGhosts();
}
// Dashed cut lines drawn over the sheet. Contours are traced asynchronously and cached,
// so a newer render simply replaces an older, unfinished one.
let cutPreviewRun = 0;
async function drawCutPreview() {
  const run = ++cutPreviewRun,
    settings = DM.cutSettings(project.cut);
  if (!settings.preview) return;
  try {
    const shapes = await Cutlines.forPage(project, page, { pxPerMm: 8 });
    if (run !== cutPreviewRun) return;
    $('#cut-preview-layer')?.remove();
    const d = shapes.map(s => Cutlines.pathData(s.polygons)).join(' ');
    if (d.trim())
      $('#paper').insertAdjacentHTML(
        'beforeend',
        `<path id="cut-preview-layer" d="${d}" fill="none" stroke="#d6249f" stroke-width=".2" stroke-dasharray="1.2 .7" pointer-events="none"/>`
      );
  } catch (e) {
    console.warn('Cut line preview failed', e);
  }
}
function prop(label, key, value, min = -10000, max = 10000, step = 0.1) {
  return `<div class="field"><label for="prop-${key}">${label}</label><input id="prop-${key}" data-prop="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${Number(value.toFixed(2))}"></div>`;
}
// Decal tab: one decal's size, colour, print settings and tools; the selection's tools for several.
const tile = (action, iconName, label, extra = '') =>
  `<button class="ins-tile" data-action="${action}" ${extra}>${icon(iconName)}<span>${label}</span></button>`;
// Shortcut tiles for actions that already have a button elsewhere (the tool rail).
const alias = (action, iconName, label) =>
  `<button class="ins-tile" data-alias="${action}">${icon(iconName)}<span>${label}</span></button>`;
function renderInspector() {
  if (CanvasTools.active) {
    showTab('right', 'decal', false);
    CanvasTools.mount();
    return;
  }
  const i = current(),
    list = items();
  if (!i) {
    $('#inspector').innerHTML = list.length
      ? `<div class="ins-head"><div class="ins-thumb many">${list.length}</div><div><b class="ins-title">${list.length} decals selected</b><small class="hint">Drag any of them to move them together</small></div></div><section class="ins-sec"><h3>Selection</h3><div class="ins-tiles">${tile('group', 'group', 'Group')}${tile('combine-shapes', 'merge', 'Merge / Cut Shapes')}${tile('arrange-selection', 'arrange', 'Align & arrange…')}${tile('mirror-pair', 'mirror', 'Add mirrored copy (other side)', 'title="Mirrored copy for directional graphics such as arrows, stripes and slanted shapes. Editable text stays readable; lettering inside imported logos is mirrored too."')}${tile('recolour', 'brush', 'Recolour…')}${tile('save-decal', 'star', 'Save to library')}${alias('grid-copies', 'grid', 'Repeat…')}${alias('move-page', 'move', 'Move to page…')}</div></section>${recolourSection(list)}<div class="ins-foot"><button data-action="duplicate">${icon('copy')}Duplicate</button><span class="spacer"></span><button data-action="delete" class="danger">${icon('trash')}Delete</button></div>`
      : `<div class="no-selection"><strong>No decal selected</strong><p>Click a decal on the sheet to change it here, or drag on empty paper to select several.</p><div class="ins-tiles">${alias('import', 'image', 'Import an image')}${alias('text', 'text', 'Add text')}${alias('number-template', 'hash', 'Racing numbers')}${alias('shapes', 'shape', 'Shapes & patterns')}</div><p class="hint">Sheet-wide settings such as paper, white ink and cut lines are under Sheet &amp; paper.</p></div>`;
    return;
  }
  const canPaint = !['svg', 'image', 'group', 'slice'].includes(i.kind),
    canOutline = canPaint && !['line', 'stripe'].includes(i.kind);
  const raster = DM.rasters(i),
    artworkType = DM.artworkType(i);
  const quality = raster.length
    ? `${Math.round(Math.min(...raster.map(x => x.ppi)))} PPI at this size`
    : artworkType === 'Mixed raster / vector'
      ? 'Contains embedded raster images'
      : i.traceSource
        ? 'Traced from an image'
        : 'Sharp at any size';
  const b = DM.bounds(i),
    pad = Math.max(b.w, b.h) * 0.08,
    thumb = `<svg viewBox="${b.x - pad} ${b.y - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}"><g transform="${itemTransform(i)}" opacity="${i.opacity}">${Art.body(i, 'inspector')}</g></svg>`;
  const off = i.locked ? 'disabled' : '';
  const tools = [
    i.kind === 'svg' && tile('edit-vector', 'path', 'Edit Vector Artwork', off),
    i.kind === 'path' && tile('edit-path', 'path', 'Edit Points & Curves', off),
    (i.kind === 'stripe' || (i.shapeOptions && Object.hasOwn(ShapeTools.presets, i.shapeOptions.type))) &&
      tile(
        'edit-shape',
        'shape',
        i.kind === 'stripe' ? 'Stripe Count & Spacing' : 'Adjust Shape / Pattern',
        off
      ),
    i.kind === 'group' && !i.artOutline && tile('edit-group', 'group', 'Edit group', off),
    i.kind === 'image' &&
      tile(
        'prepare-image',
        'slice',
        i.imageSource ? 'Adjust crop & background' : 'Crop & remove background',
        off
      ),
    i.kind === 'image' && i.imageSource && tile('restore-prepared', 'undo', 'Restore original image', off),
    (i.kind === 'image' || i.traceSource) &&
      tile('trace', 'trace', i.traceSource ? 'Refine traced vector' : 'Trace image to vector', off),
    i.traceSource && tile('restore-image', 'undo', 'Restore image', off),
    i.traceSource && tile('export-svg', 'share', 'Export SVG'),
    (i.kind === 'svg' || i.kind === 'image' || i.artOutline) &&
      tile('artwork-outline', 'outline', i.artOutline ? 'Adjust outline' : 'Add silhouette outline', off),
    i.artOutline && tile('remove-outline', 'x', 'Remove outline', off),
    tile('recolour', 'brush', 'Recolour…', off),
    tile(
      'mirror-pair',
      'mirror',
      'Add mirrored copy (other side)',
      'title="Mirrored copy for directional graphics such as arrows, stripes and slanted shapes. Editable text stays readable; lettering inside imported logos is mirrored too."'
    ),
    tile('save-decal', 'star', 'Save decal to library')
  ].filter(Boolean);
  const fonts = ['Arial', 'Georgia', 'Verdana', 'Courier New', ...activeFonts().map(f => f.family)];
  $('#inspector').innerHTML =
    `<div class="ins-head"><div class="ins-thumb">${thumb}</div><div class="grow"><input class="inspector-name" id="decal-name" value="${E(i.name)}" aria-label="Decal name"><div class="ins-badges"><span class="artwork-badge" data-artwork-type="${E(artworkType)}">${E(artworkType)}</span><small class="hint">${E(quality)}${i.flipX || i.flipY ? ' · Mirrored' : ''}${i.locked ? ' · Locked' : ''}</small></div></div></div>` +
    `<section class="ins-sec"><h3>Size &amp; place <small>mm</small></h3><div class="ins-wh">${prop('Width', 'w', i.w, 0.1, 1000)}<label class="ins-link" title="Keep proportions"><input id="aspect-lock" type="checkbox" ${settings.aspectLock !== false ? 'checked' : ''} aria-label="Keep proportions">${icon('link')}</label>${prop('Height', 'h', i.h, 0.1, 1000)}</div><div class="fields3">${prop('X', 'x', i.x)}${prop('Y', 'y', i.y)}${prop('Rotate (°)', 'rotation', i.rotation, -3600, 3600, 1)}</div></section>` +
    (i.kind === 'text'
      ? `<section class="ins-sec"><h3>Text</h3><div class="field"><label for="text-value">Text / number</label><input id="text-value" value="${E(i.text)}" maxlength="500"></div><div class="field"><label for="font-select">Typeface</label><select id="font-select">${fonts.map(f => `<option value="${E(f)}" ${f === i.font ? 'selected' : ''}>${E(activeFonts().find(x => x.family === f)?.name || f)}</option>`).join('')}</select></div><div class="text-toolbar"><button data-action="bold" class="${i.bold ? 'active' : ''}" title="Bold"><b>B</b></button><button data-action="italic" class="${i.italic ? 'active' : ''}" title="Italic"><i>I</i></button><button class="installed-fonts-button" data-action="installed-fonts">Installed font…</button><button data-action="font">Import font</button></div><div class="fields2">${prop('Letter spacing', 'spacing', i.spacing || 0, -10, 50, 0.5)}${prop('Text bend (°)', 'curve', i.curve || 0, -300, 300, 5)}</div><p class="hint">Bend: positive arches up, negative curves down. Letter size and centre stay; the overall size changes.</p></section>`
      : '') +
    `<section class="ins-sec"><h3>Colour</h3>${
      canPaint
        ? `<div class="fields2"><div class="field"><label for="fill">Fill colour</label><input type="color" id="fill" value="${i.fill === 'none' ? '#ffffff' : i.fill}"></div>${canOutline ? `<div class="field"><label for="stroke">Outline colour</label><input type="color" id="stroke" value="${i.stroke}"></div>` : ''}</div><label class="check"><input id="no-fill" type="checkbox" ${i.fill === 'none' ? 'checked' : ''}>Transparent fill</label><div class="fields2">${canOutline ? prop('Outline (mm)', 'strokeWidth', i.strokeWidth, 0, 50) : prop(i.kind === 'stripe' ? 'Overall stripe thickness (mm)' : 'Line thickness (mm)', 'thickness', i.h, 0.1, 1000)}${i.kind === 'rect' ? prop('Corner radius (mm)', 'radius', i.radius || 0, 0, 500) : ''}</div>${i.kind === 'stripe' ? `<p class="hint">Total height of both stripes and their gap. Length stays unchanged.</p><div class="field"><label for="fill2">Second stripe colour</label><input id="fill2" type="color" value="${i.fill2 || '#245cc3'}"></div>` : ''}`
        : ''
    }<div class="field"><label for="prop-opacity">Opacity</label><div class="opacity-control"><input id="opacity-range" type="range" min="0" max="100" step="1" value="${Math.round(i.opacity * 100)}" aria-label="Opacity slider"><div class="unit-input"><input id="prop-opacity" type="number" min="0" max="100" step="1" value="${Math.round(i.opacity * 100)}"><span>%</span></div></div></div></section>` +
    (canPaint ? '' : recolourSection([i])) +
    `<section class="ins-sec"><h3>On the paper</h3><div class="field"><label for="ink">Ink</label><select id="ink"><option value="colour">Colour artwork</option><option value="colour-white">Colour + white backing</option><option value="white-only">White ink only</option></select></div><div class="field"><label for="cut-override">Cut line</label><select id="cut-override"><option value="">Sheet setting (${E({ shape: 'follow shape', rect: 'rectangle', none: 'no cut line' }[DM.cutSettings(project.cut).mode])})</option><option value="shape">Follow the decal shape</option><option value="rect">Rectangle</option><option value="none">No cut line</option></select></div></section>` +
    `<section class="ins-sec"><h3>Tools</h3><div class="ins-tiles">${tools.join('')}</div></section>` +
    `<div class="ins-foot"><button data-action="backward" title="Send backward">${icon('dn')}Back</button><button data-action="forward" title="Bring forward">${icon('up')}Forward</button><button data-action="lock">${icon(i.locked ? 'unlock' : 'lock')}${i.locked ? 'Unlock' : 'Lock'}</button><span class="spacer"></span><button class="danger icon-only" data-action="delete" title="Delete from sheet" aria-label="Delete from sheet">${icon('trash')}</button></div>`;
  const change = fn => {
    try {
      mutate(() => {
        const live = project.items.find(x => x.id === i.id);
        if (!live) throw Error('Select a decal first.');
        if (live.locked) throw Error('Unlock this decal before editing.');
        fn(live);
      });
    } catch (e) {
      fail(e);
      render();
    }
  };
  $('#decal-name').onchange = e => change(i => (i.name = e.target.value.trim() || 'Decal'));
  $('#aspect-lock').onchange = e => (settings.aspectLock = e.target.checked);
  for (const input of $$('[data-prop]'))
    input.onchange = () => {
      const key = input.dataset.prop,
        value = Number(input.value);
      change(i => {
        DM.number(value, Number(input.min), Number(input.max), key);
        if (key === 'curve') {
          Art.bendText(i, value);
          return;
        }
        if ((key === 'w' || key === 'h') && settings.aspectLock !== false) {
          const ratio = value / i[key];
          i[key === 'w' ? 'h' : 'w'] *= ratio;
          i.strokeWidth *= ratio;
        }
        if (key === 'thickness') {
          const oldHeight = i.h;
          i.h = value;
          for (const position of Object.values(i.carPositions || {})) position.y += (oldHeight - i.h) / 2;
        } else i[key] = value;
        if (i.kind === 'text' && key === 'spacing') remeasureText(i);
      });
    };
  for (const key of ['fill', 'stroke', 'fill2'])
    if ($('#' + key)) $('#' + key).onchange = e => change(i => (i[key] = e.target.value));
  if ($('#no-fill'))
    $('#no-fill').onchange = e => change(i => (i.fill = e.target.checked ? 'none' : '#e5484d'));
  if (i.kind === 'text') {
    $('#text-value').onchange = e =>
      change(i => {
        i.text = e.target.value;
        remeasureText(i);
      });
    $('#font-select').onchange = e =>
      change(i => {
        i.font = e.target.value;
        retainArtworkFonts(i);
        remeasureText(i);
      });
  }
  // Opacity is edited in percent; the slider previews on the sheet and commits once on release.
  const opacityRange = $('#opacity-range'),
    opacityNumber = $('#prop-opacity');
  const setOpacity = percent => change(i => (i.opacity = DM.number(percent, 0, 100, 'Opacity') / 100));
  opacityRange.oninput = () => {
    opacityNumber.value = opacityRange.value;
    $(`#paper .sheet-item[data-id="${CSS.escape(i.id)}"] > g`)?.setAttribute(
      'opacity',
      opacityRange.value / 100
    );
  };
  opacityRange.onchange = () => setOpacity(opacityRange.value);
  opacityNumber.onchange = () => setOpacity(opacityNumber.value);
  $('#ink').value = i.ink;
  if (i.kind === 'slice') {
    $('#ink').disabled = true;
    $('#ink').title = 'Slices retain the individual ink settings of their original decals.';
  }
  $('#ink').onchange = e => change(i => (i.ink = e.target.value));
  $('#cut-override').value = i.cutMode || '';
  $('#cut-override').onchange = e =>
    change(i => {
      if (e.target.value) i.cutMode = e.target.value;
      else delete i.cutMode;
    });
  if (i.locked) {
    for (const el of $$(
      '#inspector [data-prop],#decal-name,#text-value,#font-select,#fill,#stroke,#fill2,#no-fill,#ink,#opacity-range,#prop-opacity,#cut-override'
    ))
      el.disabled = true;
    for (const b of $$('#inspector [data-action]'))
      if (
        ['backward', 'forward', 'bold', 'italic', 'font', 'installed-fonts', 'delete'].includes(
          b.dataset.action
        )
      )
        b.disabled = true;
  }
}
function remeasureText(i) {
  const b = Art.textBox(i);
  i.textBounds = b;
  i.w = (i.h * b.w) / b.h;
}
function renderLayers() {
  const onPage = project.items.filter(i => i.page === page);
  $('#layers-count').textContent = onPage.length;
  if ($('[data-left-pane="layers"]').hidden) return;
  $('#layers-page').textContent = `Page ${page + 1} · top to bottom`;
  $('#layers').innerHTML =
    onPage
      .map((i, n) => {
        const b = DM.bounds(i),
          pad = Math.max(b.w, b.h) * 0.06;
        return `<div class="layer-row ${selected.has(i.id) ? 'active' : ''} ${i.locked ? 'locked' : ''}"><button class="layer-main" data-layer="${E(i.id)}" title="${E(i.name)} · Shift-click to add to the selection"><span class="layer-thumb"><svg viewBox="${b.x - pad} ${b.y - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}"><g transform="${itemTransform(i)}" opacity="${i.opacity}">${Art.body(i, 'layer' + n)}</g></svg></span><span class="layer-name">${E(i.name)}<small>${E(DM.artworkType(i))} · ${fmt(i.w)} × ${fmt(i.h)} mm</small></span></button><button class="ghost icon-only layer-lock" data-layer-lock="${E(i.id)}" title="${i.locked ? 'Unlock' : 'Lock'}" aria-label="${i.locked ? 'Unlock' : 'Lock'} ${E(i.name)}" aria-pressed="${i.locked}">${icon(i.locked ? 'lock' : 'unlock')}</button></div>`;
      })
      .reverse()
      .join('') || '<p class="hint">Decals on this page appear here, the top one first.</p>';
  for (const b of $$('#layers [data-layer]'))
    b.onclick = e => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        selected.has(b.dataset.layer) ? selected.delete(b.dataset.layer) : selected.add(b.dataset.layer);
      } else selected = new Set([b.dataset.layer]);
      revealDecal();
      render();
    };
  for (const b of $$('#layers [data-layer-lock]'))
    b.onclick = () => {
      const i = project.items.find(x => x.id === b.dataset.layerLock);
      if (i) mutate(() => (i.locked = !i.locked));
    };
}
function carPosition(i, view, list = items()) {
  if (i.carPositions?.[view]) return i.carPositions[view];
  const b = DM.union(list),
    h = view === 'top' ? project.preview.width : project.preview.height;
  return { x: project.preview.length * 0.49 - b.w / 2 + i.x - b.x, y: h * 0.58 - b.h / 2 + i.y - b.y };
}
function carMarkup(prefix = 'car') {
  const v = project.preview.view,
    body = carBody();
  if (!project.preview[v] && !carData[body]?.[v]) {
    loadCar(body)
      .then(() => renderCar())
      .catch(fail);
    if (!carData.gt?.[v]) return '';
  }
  const source = project.preview[v] || carData[body]?.[v] || carData.gt[v];
  const length = project.preview.length,
    h = v === 'top' ? project.preview.width : project.preview.height,
    b = source.bounds || { x: 0, y: 0, w: source.width, h: source.height },
    list = items();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${length} ${h}" data-car-svg="true"><svg width="${length}" height="${h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="none"><image href="${E(source.src)}" width="${source.width}" height="${source.height}"/></svg>${list
    .map((i, n) => {
      const p = carPosition(i, v, list);
      return `<g class="car-decal" data-car-decal="true" data-car-id="${E(i.id)}"><title>${E(i.name)}</title>${Art.element({ ...i, x: p.x, y: p.y }, prefix + n, 'all')}<rect transform="rotate(${i.rotation || 0} ${p.x + i.w / 2} ${p.y + i.h / 2})" x="${p.x}" y="${p.y}" width="${i.w}" height="${i.h}" fill="transparent" stroke="#e5484d" stroke-width=".25" stroke-dasharray="1 1"/></g>`;
    })
    .join('')}</svg>`;
}
function renderCar() {
  const s = $('#car-scale');
  s.value = ['24', '32', '43', '64'].includes(String(project.scale)) ? String(project.scale) : 'custom';
  $('#car-side').classList.toggle('active', project.preview.view === 'side');
  $('#car-top').classList.toggle('active', project.preview.view === 'top');
  $('#car-stage').innerHTML = carMarkup();
  $('#car-body').value = carBody();
  const one = current();
  $('#car-dimension').textContent = one
    ? `${fmt(one.w)} / ${fmt(project.preview.length)} mm`
    : `${fmt(project.preview.length)} mm`;
  $('#car-dimension').title = one
    ? `${one.name} is ${fmt(one.w)} mm wide; the car is ${fmt(project.preview.length)} mm long`
    : `The car is ${fmt(project.preview.length)} mm long`;
  bindCar($('#car-stage'));
  CarPage.render();
  PrintPage.render();
  if (SettingsPage.tab === 'fonts') SettingsPage.render();
}
function finishCarDrag(cancel = false) {
  if (!carDrag) return;
  const d = carDrag;
  carDrag = null;
  if (cancel) project = d.before;
  else if (d.moved) commitGesture(d.before);
  if (d.container.hasPointerCapture(d.pointerId)) d.container.releasePointerCapture(d.pointerId);
  render();
}
function bindCar(container) {
  container.onpointerdown = e => {
    const hit = e.target.closest('[data-car-id]');
    if (e.button !== 0 || !hit || carDrag) return;
    const i = items().find(i => i.id === hit.dataset.carId);
    if (!i || i.locked) return;
    e.preventDefault();
    const svg = container.querySelector('svg');
    carDrag = {
      container,
      pointerId: e.pointerId,
      id: i.id,
      svg,
      start: svgPoint(e, svg),
      view: project.preview.view,
      initial: DM.clone(carPosition(i, project.preview.view)),
      before: DM.clone(project),
      moved: false,
      hit
    };
    container.setPointerCapture(e.pointerId);
  };
  container.onpointermove = e => {
    const d = carDrag;
    if (!d || d.container !== container || e.pointerId !== d.pointerId) return;
    const p = svgPoint(e, d.svg),
      dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 0.25) return;
    d.moved = true;
    const i = project.items.find(i => i.id === d.id);
    i.carPositions = { ...i.carPositions, [d.view]: { x: d.initial.x + dx, y: d.initial.y + dy } };
    d.hit.setAttribute('transform', `translate(${dx} ${dy})`);
  };
  container.onpointerup = e => {
    if (carDrag?.pointerId === e.pointerId) finishCarDrag();
  };
  container.onpointercancel = container.onlostpointercapture = e => {
    if (carDrag?.pointerId === e.pointerId) finishCarDrag(true);
  };
}
function svgPoint(event, svg = $('#paper')) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
}
const sheetSurface = $('#sheet-scroll');
function finishSheetDrag(cancel = false) {
  if (!drag) return;
  const d = drag;
  drag = null;
  cancelAnimationFrame(dragFrame);
  dragFrame = 0;
  if (cancel) {
    selected = d.beforeSelected;
    if (d.before) project = d.before;
  } else if (d.kind === 'move' && d.moved) commitGesture(d.before);
  if (sheetSurface.hasPointerCapture(d.pointerId)) sheetSurface.releasePointerCapture(d.pointerId);
  render();
}
let lastPress = {};
sheetSurface.onpointerdown = e => {
  if (e.button !== 0 || drag) return;
  // Leave native scrollbars available.
  if (e.target === sheetSurface) {
    const r = sheetSurface.getBoundingClientRect();
    if (
      e.clientX >= r.left + sheetSurface.clientLeft + sheetSurface.clientWidth ||
      e.clientY >= r.top + sheetSurface.clientTop + sheetSurface.clientHeight
    )
      return;
  }
  if (CanvasTools.pointer('down', e)) return;
  e.preventDefault();
  const hit = e.target.closest('[data-id]'),
    additive = e.shiftKey || e.ctrlKey || e.metaKey,
    beforeSelected = new Set(selected);
  if (hit) {
    const id = hit.dataset.id,
      i = project.items.find(i => i.id === id);
    // A second press on the same text within a moment types on the sheet. Each press re-renders the
    // sheet, so the browser's own double-click never arrives.
    const again =
      lastPress.id === id &&
      e.timeStamp - lastPress.t < 450 &&
      Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) < 6 &&
      !e.target.closest('[data-handle]');
    lastPress = { id, t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (again && !additive && i.kind === 'text' && !i.locked) {
      lastPress = {};
      MakeTools.editText(id);
      return;
    }
    if (additive) {
      selected.has(id) ? selected.delete(id) : selected.add(id);
      renderSelection();
      return;
    }
    if (!selected.has(id)) selected = new Set([id]);
    revealDecal();
    if (i.locked) {
      renderSelection();
      return;
    }
    drag = {
      kind: 'move',
      pointerId: e.pointerId,
      beforeSelected,
      before: DM.clone(project),
      start: svgPoint(e),
      initial: items().map(DM.clone),
      handle: !!e.target.closest('[data-handle]'),
      moved: false
    };
  } else {
    if (!additive) selected.clear();
    drag = {
      kind: 'select',
      pointerId: e.pointerId,
      beforeSelected,
      additive,
      start: svgPoint(e),
      end: svgPoint(e),
      moved: false
    };
  }
  sheetSurface.setPointerCapture(e.pointerId);
  renderSelection();
};
sheetSurface.onpointermove = e => {
  if (CanvasTools.pointer('move', e)) return;
  if (!drag || e.pointerId !== drag.pointerId) return;
  const p = svgPoint(e),
    dx = p.x - drag.start.x,
    dy = p.y - drag.start.y;
  if (!drag.moved && Math.hypot(dx, dy) < 0.5) return;
  drag.moved = true;
  if (drag.kind === 'select') {
    drag.end = p;
    const box = selectionBox(drag.start, p);
    selected = new Set(drag.additive ? drag.beforeSelected : []);
    for (const i of project.items) if (i.page === page && DM.intersectsSelection(i, box)) selected.add(i.id);
    scheduleDragFrame();
    return;
  }
  const snap = n => ($('#snap').checked && !e.altKey ? Math.round(n) : n);
  if (drag.handle) {
    const old = drag.initial[0],
      i = project.items.find(i => i.id === old.id),
      a = (old.rotation * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    let w = Math.max(0.5, snap(old.w + dx * c + dy * s)),
      h = Math.max(0.5, snap(old.h - dx * s + dy * c));
    if (settings.aspectLock !== false) {
      h = (w * old.h) / old.w;
    }
    const anchor = {
      x: old.x + old.w / 2 - (old.w / 2) * c + (old.h / 2) * s,
      y: old.y + old.h / 2 - (old.w / 2) * s - (old.h / 2) * c
    };
    Object.assign(i, DM.resizeDimensions(old, w, h, settings.aspectLock !== false));
    i.x = anchor.x + (i.w / 2) * c - (i.h / 2) * s - i.w / 2;
    i.y = anchor.y + (i.w / 2) * s + (i.h / 2) * c - i.h / 2;
  } else
    for (const old of drag.initial) {
      if (old.locked) continue;
      const i = project.items.find(i => i.id === old.id);
      i.x = old.x + snap(dx);
      i.y = old.y + snap(dy);
    }
  scheduleDragFrame();
};
sheetSurface.onpointerup = e => {
  if (CanvasTools.pointer('up', e)) return;
  if (drag?.pointerId === e.pointerId) finishSheetDrag();
};
sheetSurface.onpointercancel = sheetSurface.onlostpointercapture = e => {
  if (CanvasTools.pointer('cancel', e)) return;
  if (drag?.pointerId === e.pointerId) finishSheetDrag(true);
};
$('#paper').ondragover = e => e.preventDefault();
$('#paper').ondrop = e => {
  e.preventDefault();
  try {
    CanvasTools.resolve();
  } catch (err) {
    fail(err);
    return;
  }
  const id = e.dataTransfer.getData('application/x-slotforge-decal');
  if (id) {
    const p = svgPoint(e);
    addFromLibrary(id, p).catch(fail);
  } else if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]).catch(fail);
};
function place(i, point) {
  i.id = DM.uid();
  i.page = page;
  if (point) {
    i.x = point.x;
    i.y = point.y;
  } else {
    const onPage = project.items.filter(i => i.page === page),
      spot = DM.freeSpot(i, project, onPage);
    if (spot) Object.assign(i, spot);
    else {
      // The page is full: fall back to a visible cascade near the top-left.
      i.x = project.margin + 8 + (onPage.length % 5) * 5;
      i.y = project.margin + 8 + (onPage.length % 7) * 5;
    }
  }
  Object.assign(i, DM.fitPlacement(i, project));
  project.items.push(i);
  selected = new Set([i.id]);
  revealDecal();
}
function setSidebarView(view) {
  settings.sidebarLibraryView = view;
  revision++;
  scheduleSave();
  renderLibrary();
}
function addShape(kind) {
  mutate(() => {
    const i = DM.item(kind, {
      page,
      w: kind === 'line' ? 40 : kind === 'stripe' ? 55 : kind === 'text' ? 12 : 22,
      h: kind === 'line' ? 1 : kind === 'stripe' ? 5 : kind === 'text' ? 10 : 16
    });
    if (kind === 'text') {
      Object.assign(i, { text: '27', font: 'Arial', bold: true, fill: '#111827' });
      remeasureText(i);
    }
    if (kind === 'ellipse') i.h = i.w;
    place(i);
  });
  if (kind === 'text') $('#text-value')?.focus();
}
function packDialog(ids = null) {
  return decalExportDialog(ids);
}
async function dataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}
async function importFiles(files) {
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) throw Error('Choose artwork smaller than 25 MB.');
    const ext = file.name.split('.').pop().toLowerCase(),
      name = file.name.replace(/\.[^.]+$/, '');
    let art = null,
      widthMm = null,
      warning = '',
      pages = 0,
      payload = null;
    if (ext === 'svg' || ext === 'eps' || ext === 'pdf') {
      let source;
      if (ext === 'svg') source = await file.text();
      else {
        toast('Converting artwork locally…');
        payload = { bytes: new Uint8Array(await file.arrayBuffer()), format: ext };
        const result = await desktop.convert(payload);
        // Several pages: the import bay shows them all to choose from.
        if (!result.svg) pages = result.pages;
        else {
          source = result.svg;
          widthMm = result.widthMm;
        }
      }
      if (!pages) {
        const imported = Art.sanitize(source);
        widthMm = widthMm || imported.widthMm;
        art = DM.item('svg', {
          svg: imported.svg,
          ratio: imported.viewBox[2] / imported.viewBox[3],
          mixed: imported.mixed
        });
        warning = imported.mixed
          ? 'Contains embedded images: those parts remain raster.'
          : imported.complexity > 3500
            ? `${imported.complexity.toLocaleString()} vector objects. Original detail is preserved.`
            : '';
      }
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      const src = await dataURL(file),
        img = new Image();
      img.src = src;
      await img.decode();
      if (
        img.naturalWidth > 20000 ||
        img.naturalHeight > 20000 ||
        img.naturalWidth * img.naturalHeight > 60e6
      )
        throw Error('Image is too large. Use at most 60 megapixels and 20,000 pixels per edge.');
      art = DM.item('image', {
        src,
        pixelsW: img.naturalWidth,
        pixelsH: img.naturalHeight,
        ratio: img.naturalWidth / img.naturalHeight
      });
    } else throw Error('Choose PNG, SVG, EPS, PDF, JPEG or WebP artwork.');
    if (art) {
      art.name = name;
      art.w = widthMm && widthMm <= 1000 ? widthMm : 25;
      art.h = art.w / art.ratio;
    }
    const result = await ImportBay.importArt({ art, name, sourceW: widthMm, warning, pages, payload });
    if (!result) continue;
    mutate(() => {
      const k = project.scale / result.referenceScale;
      for (const key of ['length', 'width', 'height']) project.preview[key] *= k;
      for (const i of project.items)
        for (const pos of Object.values(i.carPositions || {})) {
          pos.x *= k;
          pos.y *= k;
        }
      project.scale = result.referenceScale;
      const ids = [];
      for (const placed of result.arts) {
        place(placed);
        ids.push(placed.id);
      }
      selected = new Set(ids);
    });
    if (result.copies === 2) actions['mirror-pair']();
    if (result.copies === 4) duplicate(3);
  }
}
async function importPackage(file, kind = 'decals') {
  if (file.size > 160e6) throw Error('Package exceeds 160 MB.');
  const raw = JSON.parse(await file.text());
  if (kind === 'sheets') return sheetImportDialog(raw);
  if (kind === 'backup') {
    const v = validateWorkspace(raw);
    confirmDialog(
      'Restore workspace backup?',
      'This replaces the current sheet and decal library. A complete recovery backup is kept first.',
      async () => {
        await flush();
        const restored = await desktop.restoreWorkspace(raw);
        project = DM.validateProject(restored.data.project);
        settings = { ...settings, ...restored.data.settings };
        Library.setCount(restored.libraryCount);
        await Art.loadFonts(project.fonts);
        applyTheme();
        selected.clear();
        history = [];
        future = [];
        page = 0;
        render();
      },
      'Restore backup',
      'danger',
      {
        sub: raw.project?.name ? 'With the sheet “' + raw.project.name + '”' : '',
        will: [
          'The open sheet is replaced by the one in the backup',
          'Your decal library is replaced by the backup’s'
        ],
        safe: [
          'A complete recovery backup of today’s workspace is made first',
          'Every saved sheet in the Workshop'
        ],
        keep: 'Keep my work'
      }
    );
    return;
  }
  if (raw.format !== 'slotforge-decals')
    throw Error('Choose a .sfdecal file. Sheets and workspace backups have their own import options.');
  const pack = DM.readPack(raw);
  Art.inspectItems(pack.decals.map(d => d.art));
  decalImportDialog(pack);
}
function scaleDialog(value) {
  showDialog(
    'Change model scale',
    'Convert selected decals, or set the scale for future library placements.',
    `<div class="fields2"><div class="field"><label>Current scale</label><input value="1:${project.scale}" disabled></div><div class="field"><label>New scale denominator</label><input id="new-scale" type="number" min="1" max="1000" value="${value || project.scale}"></div></div><label class="check"><input id="rescale-art" type="checkbox" ${selected.size ? 'checked' : ''}>Resize ${selected.size ? 'selected' : 'all'} decals proportionally</label><p class="hint">Printed sizes change by old scale ÷ new scale. The car reference dimensions also follow this conversion. The selected sheet size stays unchanged.</p>`,
    '<button data-action="close">Cancel</button><button class="primary" id="apply-scale">Apply scale</button>'
  );
  $('#apply-scale').onclick = () => {
    try {
      const value = DM.number($('#new-scale').value, 1, 1000, 'Scale'),
        resize = $('#rescale-art').checked;
      mutate(() => {
        const factor = project.scale / value;
        if (resize && (selected.size ? items() : project.items).some(i => i.locked))
          throw Error('Unlock the decals before rescaling them.');
        if (resize)
          for (const i of selected.size ? items() : project.items) {
            i.w *= factor;
            i.h *= factor;
            i.strokeWidth *= factor;
          }
        for (const k of ['length', 'width', 'height']) project.preview[k] *= factor;
        for (const i of project.items)
          for (const pos of Object.values(i.carPositions || {})) {
            pos.x *= factor;
            pos.y *= factor;
          }
        project.scale = value;
      });
      closeDialog();
    } catch (e) {
      $('#dialog-error').textContent = e.message;
    }
  };
}
async function exportPDF(proof = false, confirmed = false) {
  CanvasTools.resolve();
  if (busy) return;
  if (!project.items.length) throw Error('Add artwork to your sheet first.');
  // Export PDF goes through the Print step of Print & share, where the PDF is saved.
  if (!proof && !confirmed) return PrintPage.show('print');
  const snapshot = DM.clone(project);
  if (!proof && snapshot.items.some(DM.hasWhite) && !snapshot.whiteInk)
    throw Error('Enable white ink or change the decal ink treatment before exporting.');
  busy = true;
  toast(proof ? 'Preparing your actual-size proof…' : 'Preparing print PDF…');
  try {
    await Art.loadFonts(snapshot.fonts);
    const masks = !proof && snapshot.whiteInk ? await Art.masks(snapshot) : null;
    // Optional printed cut lines: a thin dark hairline for hand cutting and ScanNCut scanning.
    const cut = DM.cutSettings(snapshot.cut),
      extras = [];
    if (!proof && cut.pdfLines)
      for (let n = 0; n < snapshot.pages; n++) {
        const d = (await Cutlines.forPage(snapshot, n, { pxPerMm: 20 }))
          .map(s => Cutlines.pathData(s.polygons))
          .join(' ');
        extras[n] = d.trim()
          ? `<path d="${d}" fill="none" stroke="#3a3a3a" stroke-width=".15" stroke-linejoin="round"/>`
          : '';
      }
    const html = Art.printHTML(snapshot, proof, undefined, extras);
    const file = await desktop.exportPDF({
      html,
      name: snapshot.name + (proof ? '-sizing-proof' : ''),
      pageSize: snapshot.pageSize,
      customPage: snapshot.customPage,
      landscape: snapshot.orientation === 'landscape',
      masks,
      spotName: snapshot.spotName
    });
    if (file)
      toast(
        proof ? 'Sizing proof saved. Print at Actual size / 100%.' : 'PDF saved. Print at Actual size / 100%.'
      );
  } finally {
    busy = false;
  }
}
// The update window and Settings → Updates (update-ui.js, from SlotForge Circuit). Its section is
// made once and moved into Settings each time Settings opens.
let updateCard = null;
function startUpdates() {
  const holder = document.createElement('div');
  UpdateUI.start({
    settings: holder,
    say: (message, isError) => toast(message, isError),
    appName: 'Decals',
    keeps: 'your sheets and decals stay in Documents/SlotForge Decals'
  });
  updateCard = holder.firstElementChild;
  desktop.onUpdateChange?.(updateRail);
}
function updateRail() {
  const el = $('#rail-status-updates');
  if (!el) return;
  desktop
    .updateCheck('status')
    .then(answer => {
      const s = answer?.value;
      if (s && el.isConnected)
        el.textContent = `${s.current} · ${s.latest ? s.latest.version + ' available' : s.enabled && s.automatic ? 'checks at start' : 'manual'}`;
    })
    .catch(() => {});
}
// Help topics: the full text behind the Help tab of the Settings page (settings-page.js), which
// shows them as chips with short how-tos and searches them.
const HELP_TOPICS = [
  [
    'Getting started',
    '<p>The usual workflow: <strong>import or create</strong> artwork, set its <strong>printed size</strong> in millimetres, check it in the <strong>Fit check</strong>, <strong>arrange</strong> the sheet, print a plain-paper <strong>sizing proof</strong>, then <strong>Export PDF</strong> for your decal paper.</p><p>Everything is saved locally and automatically. <strong>Save to Sheets</strong> (Ctrl+S) also keeps a copy among your sheets.</p><p>Decals opens on the <strong>Workshop</strong>: continue the open sheet, start a new one (blank on the paper you pick, from an image, a shared file or the example), or pick any saved sheet. Settings → When Decals opens can open straight into the editor instead.</p>'
  ],
  [
    'The editor',
    '<p>The <strong>top bar</strong> shows the sheet’s name with its saved state and paper; the arrow next to it renames, saves, starts a new sheet or opens a saved one. <strong>Export PDF</strong> is on the right; its arrow lists the cutter file, the sizing proof, sharing the sheet and the print notes.</p><p>The <strong>tools</strong> are down the left edge: Select, Image, Text, Number, Shape, Path, Merge, Slice and Arrange. Snap at the bottom rounds moves to whole millimetres.</p><p>The <strong>left panel</strong> has three tabs: your decal <strong>Library</strong>, the <strong>Layers</strong> of this page (top first, with a lock for each) and the <strong>Pages</strong>. The <strong>right panel</strong> has <strong>Decal</strong> for the selection and <strong>Sheet &amp; paper</strong> for paper size, scale, margins, white ink and cut lines.</p><p>Select decals and a small bar appears above them: size, Duplicate, Other side, Repeat, Arrange…, Group and Delete. The <strong>Fit check</strong> in the corner shows the selection on the car; hide it with its arrow.</p><p><strong>Ctrl+K</strong> finds any tool, decal on the sheet or setting by name.</p>'
  ],
  [
    'Import & prepare artwork<p><strong>Notices</strong> appear above the status bar: after deleting decals, recolouring or repeating, their <strong>Undo</strong> button takes that change back. Questions before something big show what will happen and what stays safe; Esc changes nothing. If something goes wrong, the window says first that your work is safe, then what you can do.</p>',
    '<p>Import PNG, JPEG, WebP, SVG, EPS or PDF artwork with Import an Image, by dropping a file on the sheet, or by pasting (Ctrl+V) a copied image, screenshot or SVG code. New artwork is placed in free space on the page.</p><p>Every import opens the <strong>import bay</strong>, with its steps down the left; every step but the last is optional. <strong>Choose pages</strong> shows each page of a PDF or EPS: each chosen page becomes its own decal, cropped to its artwork unless you keep the whole page. <strong>Clean up</strong> (bitmaps) crops by dragging on the picture and makes the background see-through: choose Pick background and click it, or accept the plain background Decals found. Drag the line under the picture to compare it with the original. <strong>Image or vector</strong> keeps the bitmap or traces it as a logo or with fine detail; replace traced colours or click unwanted shapes away. <strong>Size &amp; place</strong> shows the decal on your car while you set its millimetres, with quick sizes such as Door number or Bonnet, the file’s own size, a size from another scale, and one, two (both sides) or four copies.</p><p>Later, select a decal and choose <strong>Crop &amp; remove background</strong> or <strong>Trace image to vector</strong> to open the same window at that step; apply to the decal or add a copy. The original image is kept for restoration. SVG filters and external resources need preparation in another editor.</p><p><strong>Edit Vector Artwork</strong> removes unwanted shapes, such as white backgrounds, from imported vectors while keeping the original for restoring.</p>'
  ],
  [
    'Text, shapes & paths',
    '<p>New artwork is made on the sheet. <strong>Text</strong>, <strong>Number</strong> and <strong>Shape</strong> on the tool rail open a small flyout next to it: pick a style, then click the sheet where it should go, drag to draw it at the size you want (a label shows the millimetres; Shift keeps proportions), or press <strong>Enter</strong> to add it in free space. Esc stops.</p><p><strong>Text</strong> styles include plain, bold, sponsor, outlined, arched and number lettering. After placing it you type straight on the sheet, with a small bar above it for the font, bold, italic, bend, letter spacing and colour; Enter or Done finishes. Double-click text on the sheet to type in it again. <strong>Installed font…</strong> in the Decal tab opens the Fonts tab of Settings, with your text in every font on this computer; <strong>Import font</strong> adds a font file. Chosen fonts are embedded in the sheet.</p><p>The <strong>Shape</strong> flyout has rectangles, circles, triangles, lines and double stripes, plus diamonds, stars, polygons, arrows, chevrons, trapezoids, shields, checkerboards and 1–12 racing stripes. <strong>Adjust Shape / Pattern</strong> in the Decal tab changes a placed shape or pattern. The <strong>Number</strong> flyout makes roundels, ovals and plates, one decal or a pair for each number. Fill in <strong>More numbers</strong> (for example 1-30, 44, 51) for every car in the field at once: <strong>Place on the sheet</strong> lays them in rows from where you click, <strong>Add in free space</strong> fills free space and adds pages as needed.</p><p><strong>Recolour</strong> is in the Decal tab: it lists every colour in the selected decals, including inside SVG artwork. Click one, then a new colour; the change applies at once and Ctrl+Z undoes it.</p><p><strong>Path Tool</strong> draws lines or closed shapes; edit points and curve handles afterwards. <strong>Merge &amp; Cut</strong> combines filled native shapes on the canvas: union, cut, intersection or excluded overlap. Results remain editable paths; imports and text cannot be combined.</p><p>Colour fields offer an eyedropper and quick swatches of your recent colours and the colours on the sheet. <strong>Add silhouette outline</strong> creates an adjustable vector border around imported artwork. Select a group and choose <strong>Edit group</strong> to change its parts; Apply changes commits them together.</p>'
  ],
  [
    'Size & car preview',
    '<p>Width and height are the <strong>printed dimensions</strong> in millimetres. The link between them keeps proportions. <strong>Model scale</strong> under Sheet &amp; paper changes the scale for the sheet or selected artwork.</p><p>The <strong>Fit check</strong> in the corner of the sheet shows every selected decal on the car at its printed size; drag one over the car to test placement without moving it on the sheet.</p><p>The <strong>Car</strong> page in the top bar shows the whole livery on the side and top views at once. Every decal of the sheet is listed with where it sits: drag one onto the car or press <strong>Place</strong>. On the car, drag a decal to move it and a corner to resize it (that is its printed size on the sheet too); Esc cancels and Ctrl+Z undoes. <strong>Take off</strong> or Delete removes it from the car only.</p><p><strong>Your car</strong> (the car button on the Car page, or the gear in the Fit check) picks one of nine cars (modern and classic GT, touring saloon, rally hatchback, Group C prototype, classic and modern formula car, modern endurance prototype, stock car), sized from the real car’s length at your scale. Type your model’s length and height on the drawing. For your own model, load a straight-on photo, click its nose and tail, and type how long it is. The car is illustrative, not a wrap calculation: confirm the fit with a paper proof.</p>'
  ],
  [
    'Arrange the sheet',
    '<p>Under <strong>Sheet &amp; paper</strong>, choose A4, A5, US Letter, Photo 4×6 in or a <strong>custom size</strong> (50–600 mm) for odd decal paper, and the orientation. All pages share that size; changing paper never rescales decals.</p><p>Drag across empty canvas to select decals; Ctrl/Shift-click toggles individual decals. Drag the selection to move it together. Group a finished design and Lock its placement.</p><p>The <strong>Layout</strong> tab in the right panel holds the layout tools. <strong>Align &amp; space</strong> aligns to the selection, the page or the margins, distributes, and sets an exact space between decals (with a note when it is less than the cutting gap). <strong>Repeat</strong> makes rows and columns of copies, shown as ghosts on the sheet first; <strong>Most that fit</strong> fills up to the margins and <strong>Fill the free space</strong> puts copies everywhere they fit. <strong>Pages</strong> shows how full each page is and moves the selection to another page. <strong>Auto-arrange</strong> packs this page, all pages or the selection at original sizes, with a before/after preview; locked decals stay put. Arrange in the tools, and Repeat and Arrange… above the selection, open these sections.</p><p><strong>Add mirrored copy (other side)</strong> makes a horizontally mirrored copy for directional graphics such as arrows, stripes and slanted shapes; editable text stays readable, but lettering inside imported logos is mirrored too. <strong>Recolour…</strong> lists every colour in the selected decals, including inside SVG artwork, and replaces the ones you change — handy for team variants.</p><p>Margins, cutting gap, decal paper and white ink are under <strong>Sheet &amp; paper</strong>. The print notes (status bar and Export menu) flag artwork outside the margins, too little cutting space and low-resolution images.</p>'
  ],
  [
    'Slice area',
    '<p>Use <strong>Slice</strong> in the tools to draw a rectangle or enter its position and size in millimetres. Clip at its boundary or expand to include whole decals.</p><p>Save a transparent slice to your library, print only that area on the original paper size, or export a cropped PDF. The original sheet stays unchanged. Saved slices move and resize as one decal; edit the original artwork before making a new slice.</p>'
  ],
  [
    'Libraries & sharing',
    '<p><strong>Save decal to library</strong> keeps a reusable design with a name and tags. Copies on sheets stay independent.</p><p><strong>Decal Library</strong> in the top bar is a page of its own. On the left are your shelves: All decals, <strong>Favourites</strong> (the star on a card), <strong>Recently used</strong>, a shelf for every tag, and vector, image and group decals. Click a decal for its details: rename it, add or remove tags (press Enter), set the creator, see its size at 1:24, 1:32 and 1:43 and next to your car, and which saved sheets hold a copy. <strong>Add to sheet</strong> (or a double-click) places it and returns to the editor. <strong>True size</strong> shows the collection at its printed size. <strong>Select</strong> (or Ctrl-click) picks several to tag, add, export or delete together; drag cards onto a tag shelf to tag them. Drop an .sfdecal pack on the page to import it; <strong>Export…</strong> shares saved decals as a pack. The ⋯ on a decal in the editor’s Library tab opens its details there.</p><p>The <strong>Workshop</strong> holds every saved sheet. Click one to see it large with <strong>Open</strong>, <strong>Rename</strong>, <strong>Duplicate</strong>, <strong>Share…</strong>, <strong>Pin</strong> and <strong>Delete</strong>, and its <strong>History</strong>: every earlier save opens as a separate copy. Shift- or Ctrl-click several sheets to share them as one file. <strong>Recover a sheet…</strong> brings back deleted sheets and automatic snapshots. New sheet (the arrow next to the sheet name) saves the outgoing work and starts another. Export selected sheets as one editable .sfsheet; Choose pages… includes only the pages you want. Import Sheet(s) adds independent copies while your current work stays open. Versions and Recover a sheet open earlier work as separate copies.</p><p>Back up everything with <strong>Settings → Backups → Back up now</strong>.</p>'
  ],
  [
    'Print & white ink',
    '<p><strong>Print &amp; share</strong> in the top bar goes step by step, with the printed page in view. <strong>Check the sheet</strong> numbers every problem on the page with a fix (Move inside the margin, Move to free space, Turn on white ink, Trace to vector); Ctrl+Z undoes a fix. <strong>Test print</strong> saves a plain-paper proof: print it at <strong>Actual size / 100%</strong> with Fit to page off and measure the bar. <strong>Print on decal paper</strong> sets clear or white paper, white ink and printed cut lines, then saves the PDF. <strong>Cut out</strong> saves the PDF with cut lines, or a package for Silhouette, Cricut or ScanNCut. <strong>Share &amp; back up</strong> sends sheets and decals, brings files in, and makes the complete backup.</p><div class="notice"><strong>White ink:</strong> enable the printer option, set its required spot name, and choose Colour + white backing or White ink only on a decal. Export uses an alpha-thresholded 600 PPI white mask. Confirm ink order and spot recognition with your print shop; this has not been validated on physical printers. RGB artwork is preserved; PDF/X and colour-proof certification are not provided.</div>'
  ],
  [
    'Print & cut',
    '<p>Under <strong>Sheet &amp; paper → Cut lines</strong>, choose whether cut lines <strong>follow the decal shape</strong> or form a <strong>rectangle</strong>, and how far they sit around the artwork (offset, default 1 mm). Nearby parts such as letters share one cut line; holes are not cut. Dashed lines on the sheet show the result. Override a single decal with <strong>Cut line</strong> under On the paper in its Decal tab.</p><p><strong>Export for cutter…</strong> saves a folder for Silhouette Studio (including the free Basic edition), Cricut Design Space or Brother ScanNCut, with an INSTRUCTIONS.txt. Each decal becomes a 300 DPI PNG with a white border along its cut line: inkjets print white as no ink, while the cutter software traces the border. Sheet files keep the exact layout: a page PNG with DXF cut lines for Silhouette, or an SVG with print and cut layers. The cutter software adds its own registration marks.</p><p>For cutting <strong>by hand</strong> or scanning with a ScanNCut, enable <strong>Print cut lines in the PDF</strong>. Always test on plain paper first.</p>'
  ],
  [
    'Updates',
    '<p>About 5 seconds after it starts, Decals asks GitHub once for the newest published release. Nothing about you or your sheets is sent. When a newer version exists, a window shows it with what is new and the file for your copy of Decals.</p><p><strong>Download</strong> saves that file in your Downloads folder and checks it against the release; <strong>Show in folder</strong> then shows where it is. <strong>Skip this version</strong> hides the window until an even newer version appears; closing it hides it until Decals starts again.</p><p>Decals never opens or installs what it downloads. Close Decals, then install the new version as before; your sheets and decals stay in Documents/SlotForge Decals. <strong>Settings → Updates</strong> shows the versions, has <strong>Check now</strong> and turns the check at start off.</p>'
  ],
  [
    'Keyboard shortcuts',
    '<dl class="help-keys"><dt>Ctrl+C / Ctrl+X / Ctrl+V</dt><dd>Copy, cut and paste decals (also between sheets); paste images, screenshots or SVG code</dd><dt>Ctrl+D</dt><dd>Duplicate</dd><dt>Ctrl+G</dt><dd>Group</dd><dt>Ctrl+A</dt><dd>Select everything on the page</dd><dt>Delete</dt><dd>Remove the selection</dd><dt>Arrow keys</dt><dd>Move 1 mm · with Shift 0.1 mm</dd><dt>Ctrl+Z / Ctrl+Y</dt><dd>Undo and redo, up to 200 steps (Ctrl+Shift+Z also redoes)</dd><dt>Ctrl+S</dt><dd>Save the sheet to Sheets</dd><dt>Ctrl+K</dt><dd>Find a tool, decal or setting</dd><dt>Ctrl+P</dt><dd>Export PDF</dd><dt>V · I · T · N · S · P · M</dt><dd>Select, Image, Text, Number, Shape, Path, Merge</dd><dt>Enter · Esc</dt><dd>While placing new artwork: add it in free space · stop</dd><dt>Ctrl+mousewheel</dt><dd>Zoom the sheet</dd><dt>Alt-drag</dt><dd>Move without snapping</dd><dt>Escape</dt><dd>Clear the selection or cancel a drag</dd></dl><p class="hint">On a Mac, use Cmd instead of Ctrl.</p>'
  ]
];
function svgAsset(name, content, w, h) {
  return DM.item('svg', {
    name,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${content}</svg>`,
    w,
    h
  });
}
async function demo() {
  const round = DM.item('group', {
    name: 'Roundel 27',
    w: 18,
    h: 18,
    baseW: 18,
    baseH: 18,
    children: [
      DM.item('ellipse', { x: 0, y: 0, w: 18, h: 18, fill: '#ffffff', stroke: '#e21e32', strokeWidth: 1.2 }),
      DM.item('text', {
        x: 3.2,
        y: 4.2,
        w: 11.6,
        h: 9.6,
        text: '27',
        font: 'Arial',
        bold: true,
        fill: '#111111',
        textBounds: { x: 0, y: -72, w: 112, h: 72 }
      })
    ]
  });
  const forge = svgAsset(
    'Forge Racing',
    '<path d="M1 7H35L33 9H0Z" fill="#e21e32"/><text x="1" y="6.3" font-family="Arial" font-style="italic" font-weight="900" font-size="8">FORGE</text><text x="8" y="13" font-family="Arial" font-style="italic" font-weight="700" font-size="5">RACING</text>',
    36,
    14
  );
  const dutch = svgAsset(
    'Dutch Motorsport',
    '<text x="0" y="6" font-family="Arial" font-style="italic" font-weight="900" font-size="7">DUTCH</text><path d="M25 2h12v2H25zm0 3h10v2H25z" fill="#ff642b"/><text x="0" y="11" font-family="Arial" font-style="italic" font-weight="700" font-size="4.8">MOTORSPORT</text>',
    38,
    12
  );
  const driver = svgAsset(
    'Driver name',
    '<path d="M0 0h5v1.2H0" fill="#d51e35"/><path d="M0 1.2h5v1.2H0" fill="#fff"/><path d="M0 2.4h5v1.2H0" fill="#19488c"/><text x="7" y="3" font-family="Arial" font-weight="700" font-size="3">J. DE VRIES</text>',
    28,
    4
  );
  const stripe = DM.item('stripe', { name: 'Racing stripe', w: 65, h: 5, fill: '#ff5c35', fill2: '#184a9e' });
  const shield = svgAsset(
    'SF Shield',
    '<path d="M1 1L11 0l10 1v12L11 21 1 13Z" fill="#222831" stroke="#dc2438" stroke-width="1"/><text x="4" y="13" font-family="Arial" font-size="10" font-weight="700" fill="#fff">SF</text>',
    22,
    22
  );
  shield.w = shield.h = 11;
  const entries = [round, forge, dutch, driver, stripe, shield];
  project = DM.project('Club Racing • No. 27');
  project.items = [];
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++) {
      const a = DM.clone(entries[row]);
      a.id = DM.uid();
      a.x = 15 + col * 47;
      a.y = 18 + row * 31;
      project.items.push(a);
    }
  for (let n = 0; n < 2; n++) {
    const a = DM.clone(stripe);
    a.id = DM.uid();
    a.x = 15 + n * 90;
    a.y = 151;
    project.items.push(a);
  }
  for (let n = 0; n < 4; n++) {
    const a = DM.clone(shield);
    a.id = DM.uid();
    a.x = 15 + n * 24;
    a.y = 173;
    project.items.push(a);
  }
  const existing = await Library.query({ search: 'Starter example', limit: 48 });
  const additions = entries
    .filter(a => !existing.entries.some(d => d.name === a.name && d.tags === 'Starter example'))
    .map(a => ({ id: DM.uid(), name: a.name, tags: 'Starter example', scale: 32, art: DM.clone(a) }));
  if (additions.length) await Library.import(additions, []);
  history = [];
  future = [];
  page = 0;
  selected = new Set([project.items[0].id]);
  changed();
  closeDialog();
  render();
}
function duplicate(count = 1) {
  const sources = items();
  if (!sources.length) throw Error('Select a decal first.');
  if (project.items.length + sources.length * count > 2000)
    throw Error('A project supports up to 2,000 decals.');
  mutate(() => {
    const ids = [];
    for (let n = 0; n < count; n++)
      for (const source of sources) {
        const i = DM.clone(source);
        i.id = DM.uid();
        i.x += 4 * (n + 1);
        i.y += 4 * (n + 1);
        i.locked = false;
        project.items.push(i);
        ids.push(i.id);
      }
    selected = new Set(ids);
  });
}
// Clipboard: decals are copied inside the app (with the fonts they need, so they can be
// pasted into another sheet). The system clipboard gets a marker so we can tell whether
// the user copied something else since; pasted images and SVG code are imported.
const CLIPBOARD_TYPE = 'application/x-slotforge-decals';
let clipboard = null;
function copySelection(e) {
  const list = items();
  if (!list.length) return false;
  const token = DM.uid();
  clipboard = {
    token,
    items: list.map(i => DM.clone(i)),
    fonts: DM.fontsFor(list, activeFonts()).map(f => DM.clone(f)),
    project: project.id,
    page,
    pastes: 0
  };
  e.clipboardData.setData(CLIPBOARD_TYPE, token);
  e.clipboardData.setData(
    'text/plain',
    `SlotForge Decals: ${list.length} ${list.length === 1 ? 'decal' : 'decals'} copied (${token})`
  );
  return true;
}
async function pasteDecals() {
  const c = clipboard,
    target = project.id,
    targetPage = page;
  if (project.items.length + c.items.length > 2000) throw Error('A project supports up to 2,000 decals.');
  const merged = () => {
    for (const f of c.fonts) {
      const old = project.fonts.find(x => x.family === f.family);
      if (old && old.data !== f.data)
        throw Error('These decals use a different font with the same internal name as a sheet font.');
    }
    return [...new Map([...project.fonts, ...c.fonts].map(f => [f.family, DM.clone(f)])).values()];
  };
  await Art.loadFonts(merged());
  if (project.id !== target || page !== targetPage) throw Error('The active sheet changed. Paste again.');
  // Repeated pastes on the source page step down-right like Duplicate; elsewhere keep positions.
  const offset = c.project === project.id && c.page === page ? 4 * ++c.pastes : 0;
  mutate(() => {
    project.fonts = merged();
    const ids = [];
    for (const source of c.items) {
      const i = DM.clone(source);
      i.id = DM.uid();
      i.page = page;
      i.x += offset;
      i.y += offset;
      i.locked = false;
      Object.assign(i, DM.fitPlacement(i, project));
      project.items.push(i);
      ids.push(i.id);
    }
    selected = new Set(ids);
  });
  toast(`Pasted ${c.items.length} ${c.items.length === 1 ? 'decal' : 'decals'}.`);
}
function pastedFile(blob, base) {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[
    blob.type
  ];
  return ext ? new File([blob], `${base}.${ext}`, { type: blob.type }) : null;
}
const clipboardBlocked = e =>
  !ready ||
  projectTask ||
  CanvasTools.active ||
  drag ||
  carDrag ||
  $('#dialog').open ||
  e.target.closest?.('input,textarea,select,[contenteditable]');
for (const type of ['copy', 'cut'])
  document.addEventListener(type, e => {
    if (clipboardBlocked(e) || !copySelection(e)) return;
    e.preventDefault();
    if (type === 'cut') {
      const locked = items().filter(i => i.locked).length;
      actions.delete();
      if (locked) toast('Locked decals were copied but stay on the sheet.');
    }
  });
document.addEventListener('paste', e => {
  if (clipboardBlocked(e)) return;
  const data = e.clipboardData;
  e.preventDefault();
  const text = data.getData('text/plain'),
    token = data.getData(CLIPBOARD_TYPE) || /\(([0-9a-f-]{36})\)$/.exec(text)?.[1];
  if (clipboard && token === clipboard.token) return pasteDecals().catch(fail);
  const files = [...data.files].map(f => pastedFile(f, 'Pasted image')).filter(Boolean);
  if (files.length) return importFiles(files).catch(fail);
  const svg = text.trim();
  if (/^(<\?xml[\s\S]*?)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(svg))
    return importFiles([new File([svg], 'Pasted artwork.svg', { type: 'image/svg+xml' })]).catch(fail);
  toast('The clipboard has no decals, images or SVG artwork to paste.');
});
// Installed fonts are embedded into the sheet exactly like an imported font file, so PDFs,
// shared sheets and other computers render the same letters.
let installedFontList = null;
async function installedFonts() {
  if (!installedFontList) {
    if (typeof queryLocalFonts !== 'function')
      throw Error('This computer does not let apps list installed fonts. Use Import font instead.');
    const families = new Map();
    for (const face of await queryLocalFonts()) {
      if (!families.has(face.family)) families.set(face.family, []);
      families.get(face.family).push(face);
    }
    installedFontList = [...families]
      .map(([family, faces]) => ({
        family,
        face: faces.find(f => /^(regular|normal|book|roman)$/i.test(f.style)) || faces[0]
      }))
      .sort((a, b) => a.family.localeCompare(b.family));
  }
  return installedFontList;
}
async function fontFromBlob(blob, name) {
  if (blob.size > 10e6) throw Error(`${name} is larger than 10 MB and cannot be embedded.`);
  const tag = String.fromCharCode(...new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
  if (tag === 'ttcf')
    throw Error(
      `${name} is stored as a font collection, which cannot be embedded. Import a single .ttf or .otf file of this font instead.`
    );
  const ext = tag === 'OTTO' ? 'otf' : 'ttf';
  const data = (await dataURL(blob)).replace(/^data:[^;]*;/, `data:font/${ext};`);
  return (
    project.fonts.find(f => f.name === name && f.data === data) || {
      family: 'sf-font-' + DM.uid(),
      name,
      data
    }
  );
}
// Recolour: replace any colour used by the selected decals, e.g. for a team variant.
// Recolour in the Decal tab (remake option B): click a colour of the selection, then a new one. The
// sheet changes at once; Ctrl+Z takes it back.
let recolourFrom = null,
  recolourFor = '';
const RECOLOUR_BASICS = [
  '#d92b2b',
  '#1d3f8f',
  '#ffffff',
  '#111111',
  '#f2711c',
  '#0e7a52',
  '#f5c400',
  '#7a3db8'
];
function recolourSection(list) {
  const key = list.map(i => i.id).join(',');
  if (key !== recolourFor) {
    recolourFor = key;
    recolourFrom = null;
  }
  const colours = ColourKit.coloursIn(list).slice(0, 24);
  if (!colours.length)
    return `<section class="ins-sec" id="recolour-sec"><h3>Colours</h3><p class="hint">Bitmap images keep their colours. Trace them to vector first to change them.</p></section>`;
  if (!colours.includes(recolourFrom)) recolourFrom = null;
  const choices = [
    ...new Set([
      ...(settings.recentColours || []),
      ...ColourKit.sheetColours(project.items),
      ...RECOLOUR_BASICS
    ])
  ]
    .map(c => ColourKit.normal(c))
    .filter(c => c && c !== recolourFrom)
    .slice(0, 14);
  return `<section class="ins-sec" id="recolour-sec"><h3>Colours <small>click one to change it</small></h3><div class="rc-swatches">${colours
    .map(
      c =>
        `<button class="rc-swatch" data-recolour-from="${c}" aria-pressed="${c === recolourFrom}" title="${c}" style="--c:${c}" aria-label="Change ${c}"></button>`
    )
    .join('')}</div>${
    recolourFrom
      ? `<div class="rc-pick"><span class="hint">Change <span class="rc-dot" style="--c:${recolourFrom}"></span> to</span><div class="rc-choices">${choices
          .map(
            c =>
              `<button class="rc-swatch" data-recolour-to="${c}" title="${c}" style="--c:${c}" aria-label="Change to ${c}"></button>`
          )
          .join(
            ''
          )}<label class="rc-other" title="Another colour"><input type="color" id="recolour-other" value="${recolourFrom}" data-colour-kit aria-label="Another colour">Other…</label></div></div>`
      : ''
  }${list.some(i => DM.rasters(i).length) ? '<p class="hint">Bitmap images inside keep their colours.</p>' : ''}</section>`;
}
function recolourTo(to) {
  const list = items();
  if (!list.length || !recolourFrom) return;
  if (list.some(i => i.locked)) throw Error('Unlock the selected decals before recolouring.');
  const from = recolourFrom,
    next = ColourKit.normal(to);
  if (!next || next === from) return;
  const ids = new Set(list.map(i => i.id));
  mutate(() => {
    for (const live of project.items) if (ids.has(live.id)) ColourKit.recolour(live, { [from]: next });
  });
  settings.recentColours = ColourKit.addRecent(settings.recentColours || [], next);
  recolourFrom = next;
  recolourFor = [...ids].join(',');
  render();
  toast(`Changed ${from} to ${next}.`, false, { undo: true });
}
document.addEventListener('click', e => {
  const from = e.target.closest('[data-recolour-from]'),
    to = e.target.closest('[data-recolour-to]');
  if (from) {
    recolourFrom = recolourFrom === from.dataset.recolourFrom ? null : from.dataset.recolourFrom;
    renderInspector();
  }
  if (to)
    try {
      recolourTo(to.dataset.recolourTo);
    } catch (err) {
      fail(err);
    }
});
document.addEventListener('change', e => {
  if (e.target.id === 'recolour-other')
    try {
      recolourTo(e.target.value);
    } catch (err) {
      fail(err);
    }
});
function recolourDialog() {
  showTab('right', 'decal');
  const sec = $('#recolour-sec');
  if (!sec) throw Error('Select a decal first.');
  sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  sec.classList.remove('flash');
  requestAnimationFrame(() => sec.classList.add('flash'));
}
// Clean up or Image or vector on a decal of the sheet: the import bay at that step.
async function editInBay(step) {
  const item = current();
  if (!item) throw Error('Select a decal first.');
  if (step === 'clean' && item.kind !== 'image') throw Error('Select a PNG, JPEG or WebP image.');
  if (step === 'trace' && item.kind !== 'image' && !item.traceSource)
    throw Error('Select an image to trace.');
  if (item.locked) throw Error('Unlock this decal before changing it.');
  const result = await ImportBay.edit(DM.clone(item), step);
  if (!result) return;
  const art = result.art,
    vector = art.kind === 'svg' && !item.traceSource;
  mutate(() => {
    const index = project.items.findIndex(i => i.id === item.id);
    if (index < 0) throw Error('The source decal is no longer on this sheet.');
    if (project.items[index].locked) throw Error('Unlock this decal before changing it.');
    if (result.copy) {
      if (project.items.length >= 2000) throw Error('A project supports up to 2,000 decals.');
      art.id = DM.uid();
      art.name = item.name + (art.kind === 'svg' ? ' · vector' : ' · prepared');
      art.x += 4;
      art.y += 4;
      delete art.carPositions;
      delete art.libraryId;
      project.items.push(art);
    } else project.items[index] = art;
    selected = new Set([art.id]);
  });
  toast(
    result.copy
      ? art.kind === 'svg'
        ? 'Vector copy added. Save it to your library when ready.'
        : 'Prepared copy added. Your source decal is unchanged.'
      : vector || art.kind === 'svg'
        ? 'Vector trace applied. The original image is kept for restoration.'
        : 'Image prepared. The original is retained for restoration.'
  );
}
const prepareSelected = () => editInBay('clean');
function restorePrepared() {
  const item = current();
  if (item?.kind !== 'image' || !item.imageSource) throw Error('Select a prepared image.');
  if (item.locked) throw Error('Unlock this decal first.');
  mutate(() => {
    project.items[project.items.indexOf(item)] = ImagePrep.restore(item);
  });
  toast('Original image restored at the current printed artwork scale.');
}
const traceSelected = () => editInBay('trace');
function restoreImage() {
  const item = current();
  if (!item?.traceSource) throw Error('This decal has no retained original image.');
  if (item.locked) throw Error('Unlock this decal first.');
  mutate(() => {
    const source = item.traceSource;
    Object.assign(item, { kind: 'image', ...source });
    delete item.svg;
    delete item.vectorSource;
    delete item.mixed;
    delete item.traceSource;
    delete item.traceSettings;
  });
  toast('Original image restored at the same printed size.');
}
function retainArtworkFonts(art) {
  const families = new Set();
  const visit = i => {
    if (i.kind === 'text') families.add(i.font);
    if (['group', 'slice'].includes(i.kind)) i.children.forEach(visit);
  };
  visit(art);
  for (const f of activeFonts())
    if (families.has(f.family) && !project.fonts.some(x => x.family === f.family))
      project.fonts.push(DM.clone(f));
}
function editGroup() {
  const source = current();
  if (source?.kind !== 'group') throw Error('Select a grouped decal.');
  if (source.artOutline) throw Error('Use Adjust outline or Remove outline for this decal.');
  CreationUI.groupDialog(source, edited => {
    mutate(() => {
      const n = project.items.findIndex(i => i.id === source.id);
      if (n < 0) throw Error('This decal is no longer on the sheet.');
      if (project.items[n].locked) throw Error('Unlock this group before editing.');
      retainArtworkFonts(edited);
      project.items[n] = edited;
    });
    toast('Group updated. Save to your library to keep a reusable copy.');
  });
}
// Batch of race numbers: every plate (or pair) goes to the first free spot, filling the
// current page first and adding pages as needed.
function addNumberBatch(plates, count) {
  const decals = plates.flatMap(art => Array.from({ length: count }, () => DM.clone(art)));
  if (project.items.length + decals.length > 2000) throw Error('A project supports up to 2,000 decals.');
  mutate(() => {
    const ids = [];
    let target = page;
    for (const art of plates) retainArtworkFonts(art);
    for (const i of decals) {
      let spot = null;
      while (
        !(spot = DM.freeSpot(
          i,
          project,
          project.items.filter(x => x.page === target)
        ))
      ) {
        if (!project.items.some(x => x.page === target))
          throw Error('A number does not fit inside this sheet’s margins. Reduce its size.');
        target++;
        if (target >= project.pages) {
          if (project.pages >= 50) throw Error('The numbers need more than 50 pages. Make them smaller.');
          project.pages++;
        }
      }
      Object.assign(i, spot, { id: DM.uid(), page: target });
      project.items.push(i);
      if (target === page) ids.push(i.id);
    }
    selected = new Set(ids);
  });
  const pagesUsed = new Set(project.items.slice(-decals.length).map(i => i.page)).size;
  toast(
    `Added ${decals.length} racing number decals${pagesUsed > 1 ? ` across ${pagesUsed} pages` : ''}. Each stays editable.`
  );
}
// Racing numbers from the Number flyout, added in free space: one decal, a pair, or a batch.
function numberCommit(art, count) {
  {
    if (Array.isArray(art)) return addNumberBatch(art, count);
    mutate(() => {
      const s = DM.size(project),
        gap = project.gap,
        availableW = s.w - 2 * project.margin,
        availableH = s.h - 2 * project.margin;
      if (art.w > availableW || art.h > availableH)
        throw Error('The decal does not fit inside this sheet’s margins. Reduce its size.');
      const across = count === 2 && art.w * 2 + gap <= availableW,
        down = count === 2 && !across && art.h * 2 + gap <= availableH;
      const needsPage = count === 2 && !across && !down;
      if (needsPage && project.pages >= 50)
        throw Error('The pair needs another page; the project already has 50.');
      retainArtworkFonts(art);
      // Free space for the whole set (a pair side by side or stacked), so nothing lands on top
      // of decals already on the page. A full page falls back to the top-left corner.
      const box = {
          ...art,
          x: 0,
          y: 0,
          w: across ? art.w * 2 + gap : art.w,
          h: down ? art.h * 2 + gap : art.h
        },
        spot = DM.freeSpot(
          box,
          project,
          project.items.filter(i => i.page === page)
        ),
        origin = spot || { x: project.margin, y: project.margin };
      const ids = [];
      for (let n = 0; n < count; n++) {
        const i = DM.clone(art);
        place(i, {
          x: n && needsPage ? project.margin : origin.x + (n && across ? art.w + gap : 0),
          y: n && needsPage ? project.margin : origin.y + (n && down ? art.h + gap : 0)
        });
        if (n && needsPage) {
          i.page = project.pages;
          project.pages++;
        }
        ids.push(i.id);
      }
      selected = new Set(ids);
    });
    toast(
      count === 2
        ? 'Matching pair added. Each decal can be edited independently.'
        : 'Racing number added as an editable group.'
    );
  }
}
function outlineSelected() {
  const i = current();
  if (!i) throw Error('Select one imported decal.');
  OutlineUI.open(DM.clone(i), result => {
    mutate(() => {
      const n = project.items.findIndex(x => x.id === i.id);
      if (n < 0 || project.items[n].locked) throw Error('The artwork is unavailable or locked.');
      project.items[n] = result;
    });
    toast('Outline applied. The original artwork keeps its size and placement.');
  });
}
function removeOutline() {
  const i = current();
  if (!i?.artOutline) throw Error('Select outlined artwork.');
  if (i.locked) throw Error('Unlock this decal first.');
  mutate(() => {
    project.items[project.items.indexOf(i)] = Finishing.source(i);
  });
  toast('Outline removed; original artwork restored.');
}
const actions = {
  'draw-path': async () => (await PathTools.ready(), startPathTool()),
  'edit-path': async () => (await PathTools.ready(), startPathTool(current())),
  'combine-shapes': async () => (await PathTools.ready(), startCombineTool()),
  slice: () => sliceDialog(),
  'artwork-outline': outlineSelected,
  'remove-outline': removeOutline,
  'edit-group': editGroup,
  'number-template': () => MakeTools.show('number'),
  'text-tool': () => MakeTools.show('text'),
  'prepare-image': prepareSelected,
  'restore-prepared': restorePrepared,
  shapes: () => MakeTools.show('shape'),
  'edit-shape': () => ShapeToolsUI.open(current()),
  orientation: () =>
    mutate(() => (project.orientation = project.orientation === 'portrait' ? 'landscape' : 'portrait')),
  'sidebar-grid': () => setSidebarView('grid'),
  'sidebar-list': () => setSidebarView('list'),
  projects: () => {
    closeDialog();
    Workshop.show();
  },
  'recover-workspace': () => {
    closeDialog();
    Workshop.show({ recover: true });
  },
  'open-sheet-file': () => $('#project-file').click(),
  'arrange-selection': () => LayoutTab.show('align'),
  'grid-copies': () => LayoutTab.show('repeat'),
  'move-page': () => LayoutTab.show('pages'),
  'theme-light': () => setTheme('light'),
  'theme-dark': () => setTheme('dark'),
  'edit-vector': editVectorArtwork,
  trace: traceSelected,
  'restore-image': restoreImage,
  'export-svg': async () => {
    const i = current();
    if (!i || i.kind !== 'svg') throw Error('Select vector artwork to export.');
    const svg = Art.standalone(i, activeFonts());
    if (await desktop.exportFile('svg', i.name, svg)) toast('SVG exported at the current printed size.');
  },
  editor: () => {
    closeDialog();
    Workshop.hide();
    Shelf.hide();
    CarPage.hide();
    PrintPage.hide();
    SettingsPage.hide();
  },
  close: closeDialog,
  rename: () => nameDialog('Name your sheet', project.name, n => mutate(() => (project.name = n))),
  import: () => $('#art-file').click(),
  'import-pack': () => $('#pack-file').click(),
  'restore-backup': () => $('#backup-file').click(),
  font: () => $('#font-file').click(),
  'installed-fonts': () => SettingsPage.show('fonts'),
  recolour: recolourDialog,
  'mirror-pair': () => {
    const result = Layout.mirroredPair(project, [...selected]);
    mutate(() => {
      project = result.project;
      selected = new Set(result.ids);
    });
    // Imported artwork (SVG/bitmap) may contain lettering that cannot be flipped back.
    const imported = i => ['svg', 'image'].includes(i.kind) || (i.children || []).some(imported);
    const warning = project.items.some(i => selected.has(i.id) && imported(i))
      ? ' Imported logos are mirrored too: check any lettering in them.'
      : ' Editable text stays readable.';
    toast(
      (result.placed
        ? 'Mirrored copy added for the other side.'
        : 'Mirrored copy added, but this page has no free space: move it or use Auto-arrange.') + warning,
      false
    );
  },
  'cutter-export': () => PrintPage.show('cut'),
  new: newProject,
  demo: () => {
    const open = () =>
      projectRun(async () => {
        await saveCurrentProject();
        await demo();
        Workshop.hide();
      });
    if (project.items.length) {
      confirmDialog(
        'Open example sheet?',
        'Your current sheet is saved in Sheets first. Your library is kept and starter decals are added.',
        open,
        'Open example',
        'question',
        {
          will: ['The example sheet opens', 'Its starter decals are added to your library'],
          safe: ['Your current sheet is saved in Sheets first', 'Everything already in your library'],
          keep: 'Not now'
        }
      );
    } else return open();
  },
  undo: () => {
    if (history.length) {
      future.push(DM.clone(project));
      project = history.pop();
      selected.clear();
      changed();
      render();
    }
  },
  redo: () => {
    if (future.length) {
      history.push(DM.clone(project));
      project = future.pop();
      selected.clear();
      changed();
      render();
    }
  },
  'save-sheet': saveEditableProject,
  'export-sheet': () => exportEditableProject(),
  'complete-backup': async () => {
    CanvasTools.resolve();
    await flush();
    const run = Messages.progress({
      title: 'Backing up everything',
      sub: 'All saved sheets, decals, artwork and history',
      steps: [
        'Saving open changes',
        'Choose where to save the backup',
        'Copying the database and checking the copy'
      ],
      note: 'Nothing changes in your work while this runs.'
    });
    try {
      run.step(1);
      const file = await desktop.completeBackup();
      run.close();
      if (file) {
        toast('Complete backup saved and verified.');
        SettingsPage.backedUp();
      }
    } catch (e) {
      Messages.trouble({
        title: 'The backup could not be made',
        cause: e.message,
        safe: 'Nothing in your workspace changed. Your sheets and library are as they were.',
        todo: [
          'Choose another folder or drive with free space, then try again.',
          'Or keep working: Decals saves your sheet as you go.'
        ],
        details: Messages.detailsOf(e),
        buttons:
          '<button data-action="close">Close</button><button class="primary" data-action="complete-backup">Try again</button>'
      });
    }
  },
  'complete-restore': async () => {
    CanvasTools.resolve();
    await flush();
    const run = Messages.progress({
      title: 'Restoring a complete backup',
      sub: 'Your current workspace is backed up first',
      icon: 'history',
      steps: [
        'Saving open changes',
        'Choose and confirm the backup in the file window',
        'Restoring, after a recovery copy of today’s workspace'
      ],
      note: 'If you cancel in the file window, nothing changes.'
    });
    run.step(1);
    try {
      const loaded = await desktop.completeRestore();
      if (!loaded) {
        closeDialog();
        return;
      }
      run.step(2);
      Library.setCount(loaded.libraryCount);
      const data = loaded.data || {
          format: 'slotforge-decals-workspace',
          version: 1,
          project: DM.project(),
          library: [],
          libraryFonts: [],
          settings: { theme: 'dark' }
        },
        v = validateWorkspace(data);
      project = v.p;
      settings = data.settings || {};
      history = [];
      future = [];
      selected.clear();
      page = 0;
      await Art.loadFonts(activeFonts());
      applyTheme();
      closeDialog();
      render();
      toast('Complete backup restored. The previous workspace is kept in Backups.');
    } catch (e) {
      Messages.trouble({
        title: 'The backup could not be restored',
        cause: e.message,
        safe: 'Your workspace is as it was before. Nothing was replaced.',
        todo: [
          'Check that the file is a complete backup (.sfdbbackup) and not damaged.',
          'Restore another backup, or keep working as you are.'
        ],
        details: Messages.detailsOf(e),
        buttons:
          '<button data-action="close">Close</button><button class="primary" data-action="complete-restore">Choose another backup</button>'
      });
    }
  },
  'rescue-sheet': async () => {
    if (await desktop.exportFile('sfsheet', project.name, SheetFiles.pack([assetsSnapshot().project])))
      toast('Unsaved sheet exported. Your saved library remains in the database.');
  },
  'save-decal': saveDecal,
  'export-pack': packDialog,
  backup: async () => {
    if (await desktop.exportWorkspace(assetsSnapshot())) toast('Workspace backup saved.');
  },
  pdf: () => exportPDF(false),
  proof: () => PrintPage.show('proof'),
  checks: () => PrintPage.show('check'),
  settings: () => SettingsPage.show('settings'),
  sharing: () => PrintPage.show('check'),
  help: () => SettingsPage.show('help'),
  folder: () => desktop.folder(),
  library: () => Shelf.show(),
  duplicate: () => duplicate(),
  delete: () => {
    const n = project.items.filter(i => selected.has(i.id) && !i.locked).length;
    if (!n) return; // nothing to delete: no empty undo step
    mutate(() => {
      project.items = project.items.filter(i => !selected.has(i.id) || i.locked);
      selected.clear();
    });
    if (n) toast(`${n === 1 ? 'Decal' : n + ' decals'} deleted.`, false, { undo: true });
  },
  group: () => {
    const list = items();
    if (list.length < 2) throw Error('Select at least two decals with Shift-click.');
    if (list.some(i => i.locked)) throw Error('Unlock the selected decals before grouping.');
    mutate(() => {
      const g = DM.group(list);
      project.items = project.items.filter(i => !selected.has(i.id));
      project.items.push(g);
      selected = new Set([g.id]);
    });
  },
  ungroup: () => {
    const i = current();
    if (i?.kind !== 'group') throw Error('Select a grouped decal.');
    mutate(() => {
      const children = DM.ungroup(i);
      project.items = project.items.filter(x => x.id !== i.id).concat(children);
      selected = new Set(children.map(x => x.id));
    });
  },
  arrange: () => LayoutTab.show('pack'),
  'align-left': () => {
    const list = items();
    if (list.length < 2) throw Error('Select two or more decals.');
    mutate(() => {
      const x = Math.min(...list.map(i => DM.bounds(i).x));
      for (const i of list) if (!i.locked) i.x += x - DM.bounds(i).x;
    });
  },
  'align-center': () => {
    const list = items();
    if (list.length < 2) throw Error('Select two or more decals.');
    mutate(() => {
      const b = DM.union(list);
      for (const i of list) if (!i.locked) i.x += b.x + b.w / 2 - (DM.bounds(i).x + DM.bounds(i).w / 2);
    });
  },
  backward: () => restack(-1),
  forward: () => restack(1),
  lock: () => {
    const i = current();
    if (i) mutate(() => (i.locked = !i.locked));
  },
  bold: () => {
    const i = current();
    if (i?.locked) throw Error('Unlock this decal before editing.');
    if (i)
      mutate(() => {
        i.bold = !i.bold;
        remeasureText(i);
      });
  },
  italic: () => {
    const i = current();
    if (i?.locked) throw Error('Unlock this decal before editing.');
    if (i)
      mutate(() => {
        i.italic = !i.italic;
        remeasureText(i);
      });
  },
  'add-page': () => {
    if (project.pages >= 50) throw Error('Maximum 50 pages.');
    mutate(() => {
      project.pages++;
      page = project.pages - 1;
      selected.clear();
    });
  },
  'zoom-in': () => zoomSheet(1.2),
  'zoom-out': () => zoomSheet(1 / 1.2),
  fit: () => {
    zoom = 0;
    renderPaper();
  },
  select: () => CanvasTools.resolve(),
  scale: () => scaleDialog(),
  'car-side': () => {
    project.preview.view = 'side';
    changed();
    renderCar();
  },
  'car-top': () => {
    project.preview.view = 'top';
    changed();
    renderCar();
  },
  'car-settings': () => CarPage.show({ garage: true }),
  'expand-car': () => CarPage.show(),
  'car-page': () => CarPage.show(),
  'fitcheck-toggle': () => {
    // In a narrow canvas the fit check is only its title: it opens the large car preview instead.
    if ($('.editor-panel').clientWidth <= 720) return CarPage.show();
    settings.fitCheckOpen = settings.fitCheckOpen === false;
    revision++;
    scheduleSave();
    renderTabs();
    if (settings.fitCheckOpen) renderCar();
  },
  'zoom-actual': () => {
    zoom = MM_PX;
    renderPaper();
  },
  'select-page': () => {
    selected = new Set(project.items.filter(i => i.page === page).map(i => i.id));
    render();
  },
  finder: () => Finder.open()
};
function closeMenus(except) {
  for (const m of $$('.wb-menu'))
    if (m !== except && !m.hidden) {
      m.hidden = true;
      $(`[data-menu="${m.id}"]`)?.setAttribute('aria-expanded', 'false');
    }
}
document.addEventListener('click', e => {
  const opener = e.target.closest('[data-menu]');
  if (opener) {
    const menu = $('#' + opener.dataset.menu);
    closeMenus(menu);
    menu.hidden = !menu.hidden;
    opener.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) {
      if (menu.id === 'print-menu') renderChecks();
      menu.querySelector('button')?.focus();
    }
    return;
  }
  if (!e.target.closest('.wb-menu') || e.target.closest('.wb-menu [data-action]')) closeMenus();
  if (projectTask) return;
  const b = e.target.closest('[data-action]');
  if (b && !b.disabled) {
    e.preventDefault();
    Promise.resolve()
      .then(() => actions[b.dataset.action]?.())
      .catch(fail);
  }
  const shortcut = e.target.closest('[data-alias]');
  if (shortcut)
    Promise.resolve()
      .then(() =>
        shortcut.dataset.alias === 'text' ? MakeTools.show('text') : actions[shortcut.dataset.alias]?.()
      )
      .catch(fail);
  const create = e.target.closest('[data-create]');
  if (create)
    try {
      addShape(create.dataset.create);
    } catch (e) {
      fail(e);
    }
});
$('#library-search').oninput = () => renderLibrary();
// Find (Ctrl+K): every tool, every decal on this sheet and the main settings in one list.
const Finder = (() => {
  const box = $('#finder'),
    input = $('#finder-input'),
    out = $('#finder-results');
  let hits = [],
    active = 0;
  const TOOLS = [
    ['import', 'Import an image', 'Tool · PNG, JPG, SVG, EPS or PDF', 'image picture logo photo'],
    ['text', 'Add text', 'Tool · T', 'letters word name'],
    ['number-template', 'Racing numbers', 'Tool · N', 'number plate roundel digits'],
    ['shapes', 'Shapes & patterns', 'Tool · S', 'rectangle circle stripe checkerboard pattern'],
    ['draw-path', 'Path tool', 'Tool · P', 'pen draw bezier curve freehand'],
    ['combine-shapes', 'Merge & cut shapes', 'Tool · M', 'combine boolean subtract union'],
    ['slice', 'Slice area', 'Tool · save or print a part of the page', 'crop region'],
    ['arrange', 'Auto-arrange the sheet', 'Tool · pack every decal', 'layout pack tidy'],
    ['arrange-selection', 'Align & arrange selection…', 'Selection', 'align distribute mirror'],
    ['grid-copies', 'Repeat in rows & columns…', 'Selection', 'copies grid duplicate'],
    ['mirror-pair', 'Mirrored copy for the other side', 'Selection', 'flip mirror'],
    ['recolour', 'Recolour…', 'Selection', 'colour color swap'],
    ['save-decal', 'Save to Decal Library', 'Selection', 'library keep'],
    ['pdf', 'Export PDF', 'Print · Ctrl+P', 'print export'],
    ['cutter-export', 'Cut out: cutter files', 'Print & share', 'scanncut cricut silhouette svg dxf export'],
    ['proof', 'Test print (sizing proof)', 'Print & share', 'test print ruler proof'],
    ['checks', 'Check the sheet', 'Print & share', 'warnings problems print checks'],
    ['save-sheet', 'Save to Sheets', 'Sheet · Ctrl+S', 'save keep'],
    ['export-sheet', 'Share this sheet…', 'Sheet', 'sfsheet send'],
    ['new', 'New sheet', 'Sheet', 'start blank'],
    ['projects', 'Open a saved sheet…', 'Sheet', 'sheets library'],
    ['rename', 'Rename sheet…', 'Sheet', 'name title'],
    ['add-page', 'Add page', 'Sheet', 'page'],
    ['scale', 'Change model scale…', 'Sheet', '1:32 1:24 1:43 scale conversion'],
    ['orientation', 'Switch portrait / landscape', 'Sheet', 'orientation rotate page'],
    [
      'sheet-tab',
      'Paper, white ink & cut lines',
      'Sheet & paper tab',
      'margins gap paper size white ink spot cut line'
    ],
    ['car-settings', 'Your car: body, scale, measurements', 'Car page', 'car model length photo reference'],
    ['car-page', 'Car page: the whole livery', 'Page', 'car preview livery fit'],
    ['library', 'Decal Library', 'Window', 'decals collection'],
    ['sharing', 'Print & share', 'Page', 'backup share import export'],
    ['settings', 'Settings', 'Page', 'preferences theme updates storage backup fonts help'],
    ['help', 'Help', 'Window', 'guide how'],
    ['import-pack', 'Import decals', 'Library', 'sfdecal'],
    ['export-pack', 'Export decals', 'Library', 'sfdecal']
  ];
  function run(hit) {
    close();
    if (hit.id) {
      page = project.items.find(i => i.id === hit.id)?.page ?? page;
      selected = new Set([hit.id]);
      render();
      return;
    }
    if (hit.action === 'text') return MakeTools.show('text');
    if (hit.action === 'sheet-tab') return showTab('right', 'sheet');
    Promise.resolve()
      .then(() => actions[hit.action]())
      .catch(fail);
  }
  function list() {
    const q = input.value.trim().toLowerCase(),
      words = q.split(/\s+/).filter(Boolean),
      match = text => words.every(w => text.toLowerCase().includes(w));
    const decals = project.items
      .filter(i => words.length && match(i.name + ' ' + i.kind))
      .slice(0, 6)
      .map(i => ({ id: i.id, label: i.name, note: `On the sheet · page ${i.page + 1}` }));
    const tools = TOOLS.filter(([action, label, note, more]) =>
      match(`${label} ${note} ${more} ${action}`)
    ).map(([action, label, note]) => ({ action, label, note }));
    hits = [...decals, ...tools].slice(0, 12);
    active = Math.min(active, Math.max(0, hits.length - 1));
    out.innerHTML =
      hits
        .map(
          (h, n) =>
            `<button role="option" data-hit="${n}" aria-selected="${n === active}">${icon(h.id ? 'layers' : h.note.startsWith('Tool') ? 'pointer' : h.note.startsWith('Print') ? 'pdf' : h.note.startsWith('Sheet') ? 'page' : h.note.startsWith('Window') ? 'expand' : 'star')}<span>${E(h.label)}</span><small>${E(h.note)}</small></button>`
        )
        .join('') || '<p class="hint">Nothing found. Try another word.</p>';
    for (const b of out.querySelectorAll('[data-hit]')) b.onclick = () => run(hits[+b.dataset.hit]);
  }
  function open() {
    try {
      CanvasTools.resolve();
    } catch (e) {
      fail(e);
      return;
    }
    closeMenus();
    box.hidden = false;
    input.value = '';
    active = 0;
    list();
    input.focus();
  }
  function close() {
    box.hidden = true;
  }
  input.oninput = () => {
    active = 0;
    list();
  };
  input.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length);
      list();
      out.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter' && hits[active]) run(hits[active]);
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  box.onpointerdown = e => {
    if (e.target === box) close();
  };
  return { open, close };
})();
for (const b of $$('[data-filter]'))
  b.onclick = () => {
    filter = b.dataset.filter;
    $$('[data-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderLibrary();
  };
// Choosing a body sizes the model from the real car's length at the sheet's scale; width and
// height follow that car's picture, so it is never stretched. One undoable change.
$('#car-body').onchange = e => chooseCarBody(e.target.value);
// Choosing a body (fit check or the Car page) sizes the model from the real car.
async function chooseCarBody(body) {
  try {
    await loadCar(body);
    const side = carData[body].side.bounds,
      top = carData[body].top.bounds,
      length = DM.CAR_BODIES[body].length / project.scale,
      clamp = v => Math.min(1000, Math.max(5, Math.round(v * 10) / 10));
    mutate(() =>
      Object.assign(project.preview, {
        body,
        length: clamp(length),
        height: clamp((length * side.h) / side.w),
        width: clamp((length * top.h) / top.w)
      })
    );
    if (project.preview.side || project.preview.top)
      toast(
        'Your own reference pictures are still shown. Choose the gear in the Fit check → Use included car to see this car.'
      );
  } catch (err) {
    fail(err);
    render();
  }
}
$('#car-scale').onchange = e => scaleDialog(e.target.value === 'custom' ? null : Number(e.target.value));
// Custom paper asks for its size first; cancelling leaves the sheet unchanged.
function customPaperDialog() {
  const current = project.customPage || { w: 210, h: 297 };
  showDialog(
    'Custom paper size',
    'Enter the portrait width and height of your decal paper. Orientation is set separately.',
    `<div class="fields2"><div class="field"><label for="custom-w">Width (mm)</label><input id="custom-w" type="number" min="${DM.CUSTOM_PAGE.min}" max="${DM.CUSTOM_PAGE.max}" step="0.1" value="${current.w}"></div><div class="field"><label for="custom-h">Height (mm)</label><input id="custom-h" type="number" min="${DM.CUSTOM_PAGE.min}" max="${DM.CUSTOM_PAGE.max}" step="0.1" value="${current.h}"></div></div><p class="hint">Between ${DM.CUSTOM_PAGE.min} and ${DM.CUSTOM_PAGE.max} mm. Check that your printer supports this paper size and feeds it correctly.</p>`,
    '<button data-action="close">Cancel</button><button class="primary" id="custom-apply">Use this size</button>'
  );
  $('#custom-apply').onclick = () => {
    try {
      const size = DM.customPage({ w: $('#custom-w').value, h: $('#custom-h').value });
      mutate(() => {
        project.pageSize = 'custom';
        project.customPage = size;
      });
      zoom = 0;
      closeDialog();
      render();
      toast(
        DM.pageFormat(project).label + ' selected. Decal dimensions stay unchanged; review print checks.'
      );
    } catch (err) {
      $('#dialog-error').textContent = err.message;
    }
  };
  $('#dialog').addEventListener('close', () => render(), { once: true });
}
$('#sheet-size-select').onchange = e => {
  if (e.target.value === 'custom' || e.target.value === 'custom-edit') return customPaperDialog();
  try {
    mutate(() => (project.pageSize = e.target.value));
    zoom = 0;
    render();
    toast(DM.pageFormat(project).label + ' selected. Decal dimensions stay unchanged; review print checks.');
  } catch (err) {
    fail(err);
    render();
  }
};
for (const [id, key] of [
  ['orientation', 'orientation'],
  ['margin', 'margin'],
  ['gap', 'gap'],
  ['paper-type', 'paper'],
  ['white-ink', 'whiteInk'],
  ['spot-name', 'spotName']
])
  $('#' + id).onchange = e => {
    try {
      mutate(
        () =>
          (project[key] =
            e.target.type === 'checkbox'
              ? e.target.checked
              : e.target.type === 'number'
                ? Number(e.target.value)
                : e.target.value)
      );
    } catch (err) {
      fail(err);
      render();
    }
  };
// Cut lines (Sheet & paper tab): every change is one undoable sheet edit.
for (const [id, key] of [
  ['cut-mode', 'mode'],
  ['cut-offset', 'offset'],
  ['cut-preview', 'preview'],
  ['cut-pdf', 'pdfLines']
])
  $('#' + id).onchange = e => {
    try {
      const value =
        e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.type === 'number'
            ? DM.number(e.target.value, 0, 5, 'Cut offset')
            : e.target.value;
      mutate(() => (project.cut = { ...DM.cutSettings(project.cut), [key]: value }));
    } catch (err) {
      fail(err);
      render();
    }
  };
$('#art-file').onchange = e => {
  const files = [...e.target.files];
  e.target.value = '';
  importFiles(files).catch(fail);
};
$('#pack-file').onchange = e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importPackage(file, 'decals').catch(fail);
};
$('#project-file').onchange = e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importPackage(file, 'sheets').catch(fail);
};
$('#backup-file').onchange = e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importPackage(file, 'backup').catch(fail);
};
$('#dialog').addEventListener('cancel', e => {
  if (projectTask) e.preventDefault();
});
$('#font-file').onchange = async e => {
  try {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10e6) throw Error('Fonts must be smaller than 10 MB.');
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) throw Error('Choose a TTF, OTF, WOFF or WOFF2 font.');
    const data = (await dataURL(file)).replace(/^data:[^;]*;/, `data:font/${ext};`),
      font = { family: 'sf-font-' + DM.uid(), name: file.name, data };
    await Art.loadFonts([font]);
    mutate(() => {
      project.fonts.push(font);
      const i = current();
      if (i?.kind === 'text' && !i.locked) {
        i.font = font.family;
        remeasureText(i);
      }
    });
    toast('Font imported and embedded in this project.');
  } catch (err) {
    fail(err);
  }
};
$('#car-file').onchange = async e => {
  try {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15e6) throw Error('Use a reference image smaller than 15 MB.');
    const src = await dataURL(file),
      img = new Image();
    img.src = src;
    await img.decode();
    // The Car page measures the photo from two pins before it is used.
    closeDialog();
    CarPage.measurePhoto(carImportView, src, img.naturalWidth, img.naturalHeight);
  } catch (err) {
    fail(err);
  }
};
document.addEventListener('keydown', e => {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === 'k' &&
    !document.querySelector('dialog[open]') &&
    !Workshop.isOpen() &&
    !Shelf.isOpen() &&
    !CarPage.isOpen() &&
    !PrintPage.isOpen() &&
    !SettingsPage.isOpen()
  ) {
    e.preventDefault();
    Finder.open();
    return;
  }
  if (CanvasTools.key(e)) return;
  if (projectTask) {
    e.preventDefault();
    return;
  }
  if (drag || carDrag) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (drag) finishSheetDrag(true);
      if (carDrag) finishCarDrag(true);
    }
    return;
  }
  if (e.key === 'Escape' && $$('.wb-menu').some(m => !m.hidden)) {
    closeMenus();
    return;
  }
  if (
    !$('#finder').hidden ||
    Workshop.isOpen() ||
    Shelf.isOpen() ||
    CarPage.isOpen() ||
    PrintPage.isOpen() ||
    SettingsPage.isOpen()
  )
    return;
  if (e.target.matches('input,textarea,select') || document.querySelector('dialog[open]')) return; // also the update window
  const ctrl = e.ctrlKey || e.metaKey;
  let action;
  if (ctrl && e.key.toLowerCase() === 'k') action = 'finder';
  if (ctrl && e.key.toLowerCase() === 'p') action = 'pdf';
  const tool =
    !ctrl && !e.altKey && !e.shiftKey && !CanvasTools.active && e.key.length === 1 ? e.key.toLowerCase() : '';
  const TOOL_KEYS = {
    v: 'select',
    i: 'import',
    n: 'number-template',
    s: 'shapes',
    p: 'draw-path',
    m: 'combine-shapes'
  };
  if (TOOL_KEYS[tool]) action = TOOL_KEYS[tool];
  if (tool === 't') {
    e.preventDefault();
    MakeTools.show('text');
    return;
  }
  if (ctrl && e.key.toLowerCase() === 'z') action = e.shiftKey ? 'redo' : 'undo';
  if (ctrl && e.key.toLowerCase() === 'y') action = 'redo';
  if (ctrl && e.key.toLowerCase() === 's') action = 'save-sheet';
  if (ctrl && e.key.toLowerCase() === 'd') action = 'duplicate';
  if (ctrl && e.key.toLowerCase() === 'g') action = 'group';
  if (e.key === 'Delete') action = 'delete';
  if (action) {
    e.preventDefault();
    Promise.resolve().then(actions[action]).catch(fail);
  }
  if (e.key === 'Escape') {
    selected.clear();
    render();
  }
  if (ctrl && e.key === 'a') {
    e.preventDefault();
    selected = new Set(project.items.filter(i => i.page === page).map(i => i.id));
    render();
  }
  if (e.key.startsWith('Arrow') && selected.size) {
    e.preventDefault();
    const d = e.shiftKey ? 0.1 : 1;
    mutate(() => {
      for (const i of items()) {
        if (i.locked) continue;
        if (e.key === 'ArrowLeft') i.x -= d;
        if (e.key === 'ArrowRight') i.x += d;
        if (e.key === 'ArrowUp') i.y -= d;
        if (e.key === 'ArrowDown') i.y += d;
      }
      // Holding the key is one move: its repeats join the first press's undo step.
    }, e.repeat);
  }
});
new ResizeObserver(() => {
  if (ready && !zoom) renderPaper();
}).observe($('#sheet-scroll'));
desktop.onClose(async () => {
  try {
    CanvasTools.resolve();
    if (collectionTask) await collectionTask;
    await flush();
    desktop.closeReady();
  } catch (e) {
    Messages.trouble({
      title: 'Your latest changes could not be saved',
      cause: e.message,
      safe: 'Decals is still open with every change on screen. Nothing has been closed.',
      todo: [
        'Export the unsaved sheet as a file, so the changes are kept.',
        'Or make a workspace backup, then try closing again.'
      ],
      details: Messages.detailsOf(e),
      buttons:
        '<button data-action="close">Keep working</button><button data-action="backup">Export workspace backup</button><button class="primary" data-action="rescue-sheet">Export Unsaved Sheet</button>'
    });
  }
});
window.Studio = {
  get project() {
    return project;
  },
  get libraryCount() {
    return Library.count;
  },
  get ready() {
    return ready;
  },
  select(ids) {
    selected = new Set(ids);
    render();
  },
  flush,
  exportPDF,
  // Turns on printed cut lines (an undoable sheet setting) and opens the PDF export review.
  exportWithCutLines() {
    if (!DM.cutSettings(project.cut).pdfLines)
      mutate(() => (project.cut = { ...DM.cutSettings(project.cut), pdfLines: true }));
    return exportPDF(false, true).catch(fail);
  }
};
window.addEventListener('resize', () => placeContextBar());
start();
