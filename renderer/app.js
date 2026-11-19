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
function toast(text, error = false) {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'visible' + (error ? ' error' : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), error ? 6500 : 3500);
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
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch(fail), 550);
}
async function flush() {
  if (!ready) return;
  clearTimeout(saveTimer);
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
  d.classList.remove('flag', 'flag-danger', 'rail-dialog');
  $('#dialog-content').innerHTML =
    `<div class="dialog-head"><div><h2>${E(title)}</h2><p>${E(subtitle || '')}</p></div><button data-action="close" aria-label="Close dialog">✕</button></div><div class="dialog-body">${body}<p id="dialog-error" class="dialog-error" role="alert"></p></div>${buttons ? `<div class="dialog-foot">${buttons}</div>` : ''}`;
  if (!d.open) d.showModal();
}
// Page Note: what a window is, a few words more, and where you use it.
function pageNote(iconName, lead, more, use) {
  return `<div class="sn"><span class="sn-tile">${icon(iconName)}</span><p class="sn-lead">${lead}</p>${more ? `<p class="sn-more">${more}</p>` : ''}${use ? `<p class="sn-use"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14 M13 6l6 6-6 6"/></svg><span>${use}</span></p>` : ''}</div>`;
}
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
function confirmDialog(title, text, submit, label = 'Continue', kind = 'question') {
  showDialog(
    title,
    '',
    `<p>${E(text)}</p>`,
    '<button data-action="close">Cancel</button><button class="primary" id="confirm">' +
      E(label) +
      '</button>'
  );
  $('#dialog').classList.add('flag', ...(kind === 'danger' ? ['flag-danger'] : []));
  $('#confirm').onclick = async () => {
    try {
      await submit();
      closeDialog();
    } catch (e) {
      $('#dialog-error').textContent = e.message;
    }
  };
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
    if (!loaded.data) welcome();
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
  for (const button of $$('[data-theme-choice]'))
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
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
  $('#page-badge').textContent = (project.orientation === 'portrait' ? 'Portrait' : 'Landscape') + ' ↔';
  $('#page-badge').setAttribute('aria-label', 'Orientation: ' + project.orientation + '. Click to switch.');
  $('#paper').setAttribute('aria-label', DM.pageFormat(project).label + ' decal sheet');
  $('#scale-badge').textContent = 'Scale Conversion · 1:' + project.scale;
  $('#undo').disabled = !history.length;
  $('#redo').disabled = !future.length;
  page = Math.min(page, project.pages - 1);
  selected = new Set([...selected].filter(id => project.items.some(i => i.id === id && i.page === page)));
  renderLibrary();
  renderPaper();
  renderInspector();
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
  const warnings = DM.warnings(project);
  $('#checks').classList.toggle('warn', !!warnings.length);
  $('#checks').innerHTML =
    `<span class="dot"></span>${warnings.length ? `${warnings.length} print ${warnings.length === 1 ? 'check' : 'checks'} to review` : 'Print checks passed'}`;
  selectionStatus();
  $('#pages').innerHTML = Array.from(
    { length: project.pages },
    (_, n) =>
      `<button data-page="${n}" class="${n === page ? 'active' : ''}" title="Page ${n + 1}">${n + 1}</button>`
  ).join('');
  $('#pages')
    .querySelectorAll('button')
    .forEach(
      b =>
        (b.onclick = () => {
          page = +b.dataset.page;
          selected.clear();
          render();
        })
    );
}
function renderLibrary() {
  Library.renderSidebar();
}
// Toolbar buttons that act on the selection are greyed out until they can do something.
const SELECTION_TOOLS = {
  'arrange-selection': ['Select one or more decals to arrange them.', list => list.length > 0],
  group: ['Select two or more decals to group them.', list => list.length > 1],
  ungroup: ['Select a grouped decal to ungroup it.', list => list.length === 1 && list[0].kind === 'group'],
  duplicate: ['Select a decal to duplicate it.', list => list.length > 0],
  delete: ['Select a decal to delete it.', list => list.length > 0]
};
function selectionStatus() {
  const list = items();
  for (const [action, [hint, ready]] of Object.entries(SELECTION_TOOLS)) {
    const button = $(`.toolbar [data-action="${action}"]`);
    if (!button) continue;
    button.dataset.tip ??= button.title || '';
    button.disabled = !ready(list);
    button.title = button.disabled ? hint : button.dataset.tip;
  }
  $('#selection-status').textContent = selected.size
    ? `${selected.size} selected · Drag to move together · Ctrl/Shift-click to toggle`
    : `${project.items.length} decals · Drag empty canvas to select · Ctrl/Shift-click to add`;
}
function renderSelection() {
  renderPaper();
  renderInspector();
  renderCar();
  renderLayers();
  selectionStatus();
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
  $('#zoom').textContent = zoom ? Math.round((scale / 3.7795) * 100) + '%' : 'Fit page';
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
function renderInspector() {
  if (CanvasTools.active) {
    CanvasTools.mount();
    return;
  }
  const i = current(),
    list = items();
  if (!i) {
    $('#inspector').innerHTML = list.length
      ? `<h2 class="inspector-title">${list.length} decals selected</h2><div class="folder blue"><h2>Selection</h2><div class="folder-body"><button class="wide" data-action="combine-shapes">Merge / Cut Shapes</button><div class="row"><button data-action="group">Group decals</button><button data-action="save-decal">Save to library</button></div><button class="wide" data-action="mirror-pair" title="Mirrored copy for directional graphics such as arrows, stripes and slanted shapes. Editable text stays readable; lettering inside imported logos is mirrored too.">Add mirrored copy (other side)</button><button class="wide" data-action="recolour">Recolour…</button><div class="row"><button data-action="duplicate">Duplicate</button><button data-action="delete" class="danger">Delete</button></div></div></div>`
      : '<div class="no-selection"><strong>Your decal workshop</strong>Import artwork, add a shape, or drag a saved decal onto the sheet.</div>';
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
        : 'Scalable artwork';
  $('#inspector').innerHTML =
    `<h2 class="inspector-title">Selected decal <span class="artwork-badge" data-artwork-type="${E(artworkType)}">${E(artworkType)}</span><small class="hint">${E(quality)}${i.flipX || i.flipY ? ' · Mirrored' : ''}</small></h2><input class="inspector-name" id="decal-name" value="${E(i.name)}" aria-label="Decal name"><details class="folder blue" open><summary>Size & position</summary><div class="folder-body"><div class="fields2">${prop('Width (mm)', 'w', i.w, 0.1, 1000)}${prop('Height (mm)', 'h', i.h, 0.1, 1000)}</div><label class="check"><input id="aspect-lock" type="checkbox" ${settings.aspectLock !== false ? 'checked' : ''}>Keep proportions</label><div class="fields2" style="margin-top:10px">${prop('X (mm)', 'x', i.x)}${prop('Y (mm)', 'y', i.y)}</div><div class="fields2">${prop('Rotation (°)', 'rotation', i.rotation, -3600, 3600, 1)}<div class="field"><label>Copies to add</label><div class="unit-input"><input id="copies" type="number" value="1" min="1" max="100"><button data-action="copies" title="Add copies">+</button></div></div></div><button class="wide" data-action="save-decal">Save decal to library</button><button class="wide" data-action="mirror-pair" title="Mirrored copy for directional graphics such as arrows, stripes and slanted shapes. Editable text stays readable; lettering inside imported logos is mirrored too.">Add mirrored copy (other side)</button><button class="wide" data-action="recolour">Recolour…</button><div class="layer-actions"><button data-action="backward">Backward</button><button data-action="forward">Forward</button><button data-action="lock">${i.locked ? 'Unlock' : 'Lock'}</button></div></div></details>
 ${i.kind === 'svg' ? `<section class="folder blue"><h2>Vector artwork</h2><div class="folder-body"><button class="wide" data-action="edit-vector" ${i.locked ? 'disabled' : ''}>Edit Vector Artwork</button><p class="hint">Select and remove background shapes. Preview, undo or restore the original.</p></div></section>` : ''}${i.kind === 'path' ? `<section class="folder blue"><h2>Path editing</h2><div class="folder-body"><button class="wide" data-action="edit-path" ${i.locked ? 'disabled' : ''}>Edit Points & Curves</button></div></section>` : ''}${i.kind === 'stripe' || (i.shapeOptions && Object.hasOwn(ShapeTools.presets, i.shapeOptions.type)) ? `<section class="folder blue"><h2>Shape & pattern</h2><div class="folder-body"><button class="wide" data-action="edit-shape" ${i.locked ? 'disabled' : ''}>${i.kind === 'stripe' ? 'Stripe Count & Spacing' : 'Adjust Shape / Pattern'}</button></div></section>` : ''}${i.kind === 'svg' || i.kind === 'image' || i.artOutline ? `<section class="folder blue"><h2>Artwork outline</h2><div class="folder-body"><button class="wide" data-action="artwork-outline" ${i.locked ? 'disabled' : ''}>${i.artOutline ? 'Adjust outline' : 'Add silhouette outline'}</button>${i.artOutline ? `<button class="wide" data-action="remove-outline" ${i.locked ? 'disabled' : ''}>Remove outline</button>` : ''}</div></section>` : ''}${i.kind === 'group' && !i.artOutline ? `<section class="folder purple"><h2>Group contents</h2><div class="folder-body"><button class="wide primary" data-action="edit-group" ${i.locked ? 'disabled' : ''}>Edit group</button><p class="hint">Edit individual text and shapes while keeping this decal together.</p></div></section>` : ''}${i.kind === 'image' ? `<section class="folder blue"><h2>Image preparation</h2><div class="folder-body"><button class="wide" data-action="prepare-image" ${i.locked ? 'disabled' : ''}>${i.imageSource ? 'Adjust crop & background' : 'Crop & remove background'}</button><p class="hint">${i.imageSource ? 'Original retained. Cropping keeps the printed artwork scale.' : 'Crop empty borders and remove plain backgrounds before tracing.'}</p>${i.imageSource ? `<button class="wide" data-action="restore-prepared" ${i.locked ? 'disabled' : ''}>Restore original image</button>` : ''}</div></section>` : ''}${i.kind === 'image' || i.traceSource ? `<section class="folder teal"><h2>Image tracing</h2><div class="folder-body"><button class="wide primary" data-action="trace" ${i.locked ? 'disabled' : ''}>${i.traceSource ? 'Refine traced vector' : 'Trace image to vector'}</button><p class="hint">${i.traceSource ? 'Replace colours, remove shapes and compare details. Original retained.' : 'Turn logos and flat-colour images into scalable SVG paths. Review before applying.'}</p>${i.traceSource ? '<div class="row"><button data-action="restore-image">Restore image</button><button data-action="export-svg">Export SVG</button></div>' : ''}</div></section>` : ''}<details class="folder purple" ${i.kind === 'text' ? 'open' : ''}><summary>Text & appearance</summary><div class="folder-body">${i.kind === 'text' ? `<div class="field"><label>Text / number</label><input id="text-value" value="${E(i.text)}" maxlength="500"></div><div class="field"><label>Typeface</label><select id="font-select">${['Arial', 'Georgia', 'Verdana', 'Courier New', ...activeFonts().map(f => f.family)].map(f => `<option value="${E(f)}" ${f === i.font ? 'selected' : ''}>${E(activeFonts().find(x => x.family === f)?.name || f)}</option>`).join('')}</select><button class="wide installed-fonts-button" data-action="installed-fonts">Choose installed font…</button></div><div class="text-toolbar"><button data-action="bold" class="${i.bold ? 'active' : ''}"><b>B</b></button><button data-action="italic" class="${i.italic ? 'active' : ''}"><i>I</i></button><button data-action="font">Import font</button></div>${prop('Letter spacing', 'spacing', i.spacing || 0, -10, 50, 0.5)}${prop('Text bend (°)', 'curve', i.curve || 0, -300, 300, 5)}<p class="hint">Positive: arch up · Negative: curve down · 0: straight. Bending keeps letter size and centre; the overall dimensions change.</p>` : ''}${canPaint ? `<div class="fields2" style="margin-top:10px"><div class="field"><label>Fill colour</label><input type="color" id="fill" value="${i.fill === 'none' ? '#ffffff' : i.fill}"></div>${canOutline ? `<div class="field"><label>Outline colour</label><input type="color" id="stroke" value="${i.stroke}"></div>` : ''}</div><label class="check"><input id="no-fill" type="checkbox" ${i.fill === 'none' ? 'checked' : ''}>Transparent fill</label>${canOutline ? prop('Outline thickness (mm)', 'strokeWidth', i.strokeWidth, 0, 50) : prop(i.kind === 'stripe' ? 'Overall stripe thickness (mm)' : 'Line thickness (mm)', 'thickness', i.h, 0.1, 1000)}${i.kind === 'stripe' ? '<p class="hint">Total height of both stripes and their gap. Length stays unchanged.</p>' : ''}${i.kind === 'rect' ? prop('Corner radius (mm)', 'radius', i.radius || 0, 0, 500) : ''}${i.kind === 'stripe' ? `<div class="field"><label>Second stripe colour</label><input id="fill2" type="color" value="${i.fill2 || '#245cc3'}"></div>` : ''}` : '<p class="hint">Original artwork is preserved. Resize, rotate or group it with new text and shapes.</p>'}<div class="field"><label for="prop-opacity">Opacity</label><div class="opacity-control"><input id="opacity-range" type="range" min="0" max="100" step="1" value="${Math.round(i.opacity * 100)}" aria-label="Opacity slider"><div class="unit-input"><input id="prop-opacity" type="number" min="0" max="100" step="1" value="${Math.round(i.opacity * 100)}"><span>%</span></div></div></div><div class="field"><label>Ink treatment</label><select id="ink"><option value="colour">Colour artwork</option><option value="colour-white">Colour + white backing</option><option value="white-only">White ink only</option></select></div><div class="field"><label for="cut-override">Cut line</label><select id="cut-override"><option value="">Sheet setting (${E({ shape: 'follow shape', rect: 'rectangle', none: 'no cut line' }[DM.cutSettings(project.cut).mode])})</option><option value="shape">Follow the decal shape</option><option value="rect">Rectangle</option><option value="none">No cut line</option></select></div><button class="wide danger" data-action="delete">Delete from sheet</button></div></details>`;
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
  $('#layers-count').textContent = project.items.filter(i => i.page === page).length;
  $('#layers').innerHTML =
    project.items
      .filter(i => i.page === page)
      .slice()
      .reverse()
      .map(
        i =>
          `<button class="${selected.has(i.id) ? 'active' : ''}" data-layer="${E(i.id)}">${i.locked ? '▣' : '◇'} ${E(i.name)}</button>`
      )
      .join('') || '<span class="hint">Your artwork layers appear here.</span>';
  for (const b of $$('#layers button'))
    b.onclick = e => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        selected.has(b.dataset.layer) ? selected.delete(b.dataset.layer) : selected.add(b.dataset.layer);
      } else selected = new Set([b.dataset.layer]);
      render();
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
  $('#car-dimension').textContent = `Model length: ${Number(project.preview.length.toFixed(1))} mm`;
  bindCar($('#car-stage'));
  const expanded = $('#expanded-car');
  if (expanded) {
    expanded.innerHTML = carMarkup('expanded-car');
    bindCar(expanded);
    syncPreviewSize();
  }
}
function syncPreviewSize() {
  const panel = $('#preview-size-controls');
  if (!panel) return;
  const i = current(),
    disabled = !i || i.locked;
  for (const key of ['w', 'h']) {
    const input = $('#preview-' + key);
    input.disabled = disabled;
    if (document.activeElement !== input) input.value = i ? Number(i[key].toFixed(2)) : '';
  }
  $('#preview-aspect').checked = settings.aspectLock !== false;
  $('#preview-aspect').disabled = disabled;
  $('#preview-size-note').textContent = !i
    ? selected.size > 1
      ? 'Drag each decal to check placement. Select one decal on the sheet to adjust its size.'
      : 'Select one decal on the sheet to adjust its size.'
    : i.locked
      ? 'This decal is locked. Unlock it in the editor to change its size.'
      : 'Changes apply directly to the selected decal on your sheet. Drag it on the car to check placement.';
  $('#preview-selected-name').textContent = i
    ? i.name
    : selected.size
      ? `${selected.size} decals selected`
      : 'No decal selected';
  for (const view of ['side', 'top'])
    $('#preview-view-' + view).classList.toggle('active', project.preview.view === view);
}
function openCarPreview() {
  showDialog(
    'Car preview',
    `1:${project.scale} · selected decals at their printed sizes`,
    '<div class="preview-view-controls"><strong id="preview-selected-name"></strong><div class="spacer"></div><button id="preview-view-side" data-action="car-side">Side</button><button id="preview-view-top" data-action="car-top">Top</button></div><div id="expanded-car" class="car-stage"></div><section id="preview-size-controls" class="preview-size-controls" aria-label="Decal size"><div class="field"><label for="preview-w">Decal width (mm)</label><input id="preview-w" type="number" min="0.1" max="1000" step="0.1"></div><div class="field"><label for="preview-h">Decal height (mm)</label><input id="preview-h" type="number" min="0.1" max="1000" step="0.1"></div><label class="check"><input id="preview-aspect" type="checkbox">Keep proportions</label></section><p id="preview-size-error" class="dialog-error" role="alert"></p><p id="preview-size-note" class="hint"></p>',
    '<button data-action="car-settings">Reference measurements</button><button class="primary" data-action="close">Done</button>',
    true
  );
  for (const key of ['w', 'h']) {
    const input = $('#preview-' + key);
    let editing = false;
    input.onfocus = () => {
      editing = false;
    };
    input.oninput = () => {
      const i = current();
      if (!i || i.locked) return;
      try {
        const value = DM.number(input.value, 0.1, 1000, key === 'w' ? 'Width' : 'Height');
        if (value === i[key]) return;
        mutate(() => {
          const w = i.w,
            h = i.h,
            k = value / i[key];
          if (settings.aspectLock !== false) {
            i[key === 'w' ? 'h' : 'w'] *= k;
            i.strokeWidth *= k;
          }
          i[key] = value;
          for (const position of Object.values(i.carPositions || {})) {
            position.x += (w - i.w) / 2;
            position.y += (h - i.h) / 2;
          }
        }, editing);
        editing = true;
        input.removeAttribute('aria-invalid');
        $('#preview-size-error').textContent = '';
      } catch (error) {
        input.setAttribute('aria-invalid', 'true');
        $('#preview-size-error').textContent = error.message;
      }
    };
    input.onblur = () => {
      editing = false;
      input.removeAttribute('aria-invalid');
      $('#preview-size-error').textContent = '';
      const i = current();
      input.value = i ? Number(i[key].toFixed(2)) : '';
      syncPreviewSize();
    };
    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    };
  }
  $('#preview-aspect').onchange = e => {
    settings.aspectLock = e.target.checked;
    revision++;
    scheduleSave();
    const editorLock = $('#aspect-lock');
    if (editorLock) editorLock.checked = settings.aspectLock;
  };
  renderCar();
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
    if (additive) {
      selected.has(id) ? selected.delete(id) : selected.add(id);
      renderSelection();
      return;
    }
    if (!selected.has(id)) selected = new Set([id]);
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
    const ext = file.name.split('.').pop().toLowerCase();
    let art,
      widthMm = null,
      heightMm = null,
      warning = '';
    if (ext === 'svg' || ext === 'eps' || ext === 'pdf') {
      let source;
      if (ext === 'svg') source = await file.text();
      else {
        toast('Converting artwork locally…');
        const payload = { bytes: new Uint8Array(await file.arrayBuffer()), format: ext };
        let result = await desktop.convert(payload);
        if (!result.svg) {
          const chosen = await askPDFPage(result.pages);
          if (chosen === null) continue;
          result = await desktop.convert({ ...payload, page: chosen });
        }
        source = result.svg;
        widthMm = result.widthMm;
        heightMm = result.heightMm;
      }
      const imported = Art.sanitize(source);
      widthMm = widthMm || imported.widthMm;
      heightMm = heightMm || imported.heightMm;
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
    art.name = file.name.replace(/\.[^.]+$/, '');
    art.w = widthMm && widthMm <= 1000 ? widthMm : 25;
    art.h = art.w / art.ratio;
    const result = await sizingDialog(art, widthMm, heightMm, warning);
    if (result)
      mutate(() => {
        const k = project.scale / result.referenceScale;
        for (const key of ['length', 'width', 'height']) project.preview[key] *= k;
        for (const i of project.items)
          for (const pos of Object.values(i.carPositions || {})) {
            pos.x *= k;
            pos.y *= k;
          }
        project.scale = result.referenceScale;
        place(result);
      });
  }
}
function askPDFPage(count) {
  return new Promise(resolve => {
    showDialog(
      'Choose a PDF page',
      `${count} pages found. Import one page as a decal.`,
      `<div class="field"><label>Page number</label><input id="pdf-page" type="number" min="1" max="${count}" value="1"></div>`,
      '<button id="cancel-page">Cancel</button><button id="choose-page" class="primary">Import page</button>'
    );
    const finish = v => {
      $('#dialog').removeEventListener('close', cancel);
      closeDialog();
      resolve(v);
    };
    const cancel = () => resolve(null);
    $('#dialog').addEventListener('close', cancel, { once: true });
    $('#cancel-page').onclick = () => finish(null);
    $('#choose-page').onclick = () => {
      const n = Number($('#pdf-page').value);
      if (!Number.isInteger(n) || n < 1 || n > count) {
        $('#dialog-error').textContent = 'Choose a valid page.';
        return;
      }
      finish(n);
    };
  });
}
function sizingDialog(art, sourceW, sourceH, warning) {
  return new Promise(resolve => {
    showDialog(
      'Size your decal',
      'Choose its printed width. The car preview helps you review the fit.',
      `<div class="import-preview"><img src="${Art.url(Art.standalone(art))}"></div><div class="fields2"><div class="field"><label>Target scale</label><select id="import-target">${[
        24,
        32,
        43,
        64,
        project.scale
      ]
        .filter((n, i, a) => a.indexOf(n) === i)
        .map(n => `<option value="${n}" ${n === project.scale ? 'selected' : ''}>1:${n}</option>`)
        .join(
          ''
        )}</select></div><div class="field"><label>Printed width (mm)</label><input id="import-width" type="number" min=".1" max="1000" step=".1" value="${art.w.toFixed(2)}"></div></div><div class="field"><label>Sizing method</label><select id="import-method"><option value="width">I will set the printed width</option>${sourceW ? '<option value="source">Use the file’s physical size</option>' : ''}<option value="scale">Convert from another model scale</option></select></div><div id="original-scale-fields" class="fields2" hidden><div class="field"><label>Original scale denominator</label><input id="original-scale" type="number" min="1" max="1000" value="32"></div><div class="field"><label>Width at original scale (mm)</label><input id="original-width" type="number" min=".1" max="1000" value="${art.w.toFixed(2)}"></div></div><p class="hint" id="import-size-info"></p>${warning ? `<div class="notice warn-notice">${E(warning)}</div>` : ''}<p class="hint">${sourceW ? 'Physical width detected: ' + sourceW.toFixed(2) + ' mm.' : 'No confirmed physical dimensions. Scale alone cannot determine a logo’s size.'} The target scale becomes the car preview scale; existing decals keep their printed sizes. You can adjust the fit after placing it.</p>`,
      '<button id="cancel-import">Cancel</button><button class="primary" id="place-import">Add to sheet</button>'
    );
    const update = () => {
      const method = $('#import-method').value;
      $('#original-scale-fields').hidden = method !== 'scale';
      $('#import-width').disabled = method !== 'width';
      if (method === 'source') $('#import-width').value = sourceW.toFixed(2);
      if (method === 'scale')
        $('#import-width').value = (
          (Number($('#original-width').value) * Number($('#original-scale').value)) /
          Number($('#import-target').value)
        ).toFixed(2);
      const w = Number($('#import-width').value);
      $('#import-size-info').textContent = `Printed size: ${w.toFixed(2)} × ${(w / art.ratio).toFixed(2)} mm`;
    };
    for (const id of ['import-method', 'import-target', 'original-scale', 'original-width', 'import-width'])
      $('#' + id).oninput = update;
    update();
    const cancel = () => resolve(null),
      finish = v => {
        $('#dialog').removeEventListener('close', cancel);
        closeDialog();
        resolve(v);
      };
    $('#dialog').addEventListener('close', cancel, { once: true });
    $('#cancel-import').onclick = () => finish(null);
    $('#place-import').onclick = () => {
      try {
        const w = DM.number($('#import-width').value, 0.1, 1000, 'Width'),
          h = DM.number(w / art.ratio, 0.1, 1000, 'Height');
        art.w = w;
        art.h = h;
        art.referenceScale = Number($('#import-target').value);
        finish(art);
      } catch (e) {
        $('#dialog-error').textContent = e.message;
      }
    };
  });
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
      'danger'
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
function carSettings() {
  showDialog(
    'Car reference',
    'Use measurements from your actual model for the closest size comparison.',
    `<div class="fields2"><div class="field"><label>Model length, nose to tail (mm)</label><input id="model-length" type="number" min="5" max="1000" value="${project.preview.length}"></div><div class="field"><label>Model width, top view (mm)</label><input id="model-width" type="number" min="5" max="1000" value="${project.preview.width}"></div></div><div class="field"><label>Model height, side view (mm)</label><input id="model-height" type="number" min="5" max="1000" value="${project.preview.height}"></div><div class="notice">The included car is an illustrative GT reference. For your own model, import a tightly cropped, straight-on side or top image and enter the dimensions represented by that image. A perspective photograph cannot establish an exact fit around curved bodywork.</div><div class="row"><button id="import-side-reference">Import side reference</button><button id="import-top-reference">Import top reference</button><button id="reset-car-reference">Use included car</button></div>`,
    '<button data-action="close">Cancel</button><button class="primary" id="save-car-reference">Save measurements</button>'
  );
  $('#save-car-reference').onclick = () => {
    try {
      const values = {
        length: DM.number($('#model-length').value, 5, 1000, 'Length'),
        width: DM.number($('#model-width').value, 5, 1000, 'Width'),
        height: DM.number($('#model-height').value, 5, 1000, 'Height')
      };
      mutate(() => Object.assign(project.preview, values));
      closeDialog();
    } catch (e) {
      $('#dialog-error').textContent = e.message;
    }
  };
  for (const view of ['side', 'top'])
    $('#import-' + view + '-reference').onclick = () => {
      carImportView = view;
      $('#car-file').click();
    };
  $('#reset-car-reference').onclick = () => {
    mutate(() => {
      project.preview.side = null;
      project.preview.top = null;
    });
    closeDialog();
  };
}
function showChecks() {
  const warnings = DM.warnings(project);
  showDialog(
    'Print checks',
    warnings.length
      ? `${warnings.length} items need review.`
      : 'Your artwork fits the current sheet settings.',
    warnings.length
      ? `<ul class="warning-list">${warnings.map(w => `<li>${E(w.text)}</li>`).join('')}</ul>`
      : '<div class="notice">No margin, cutting-gap or low-resolution issues detected.</div>',
    '<button data-action="proof">Sizing proof</button><button class="primary" data-action="close">Done</button>'
  );
}
async function exportPDF(proof = false, confirmed = false) {
  CanvasTools.resolve();
  if (busy) return;
  if (!project.items.length) throw Error('Add artwork to your sheet first.');
  const warnings = DM.warnings(project);
  if (!proof && !confirmed) {
    showDialog(
      warnings.length ? 'Review before exporting' : 'Export PDF',
      `${DM.pageFormat(project).label} · ${project.pages} ${project.pages === 1 ? 'page' : 'pages'} · Print at Actual size / 100%.`,
      `${PdfReview.markup(project.items, project.whiteInk)}${warnings.length ? `<h3>Print checks</h3><ul class="warning-list">${warnings.map(w => `<li>${E(w.text)}</li>`).join('')}</ul><p class="hint">Artwork outside the page is clipped in the PDF. Export only when you have reviewed these checks.</p>` : ''}`,
      '<button data-action="close">Back to editor</button><button id="export-anyway" class="primary">Save PDF</button>'
    );
    $('#export-anyway').onclick = () => {
      closeDialog();
      exportPDF(false, true).catch(fail);
    };
    return;
  }
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
// App Settings: a side list of the sections next to one scrolling column of slim setting rows.
function settingsRow(name, desc, control, extra = '') {
  return `<div class="ss-row ${extra}"><div class="ss-t"><b>${name}</b>${desc ? `<span class="ss-desc">${desc}</span>` : ''}</div><div class="ss-c">${control}</div></div>`;
}
function settingsSection(id, iconName, title, lead, body) {
  return `<section class="ss-section" id="settings-${id}" aria-labelledby="settings-${id}-title"><header class="ss-head"><span class="ss-headico">${icon(iconName)}</span><div><h3 id="settings-${id}-title">${title}</h3><p>${lead}</p></div></header>${body}</section>`;
}
function settingsDialog() {
  const sections = [
    ['appearance', 'appearance', 'Appearance', 'How Decals looks on this computer.'],
    ['workspace', 'workspace', 'Workspace', 'Where your sheets, decals and artwork are kept.'],
    ['backup', 'backup', 'Backup &amp; Recovery', 'Copies of everything, and ways to get a sheet back.'],
    ['updates', 'update', 'Updates', 'Checks whether a newer Decals has been published.']
  ];
  const bodies = {
    appearance: `<div class="ss-sheet">${settingsRow('Theme', 'Dark or light windows and panels. Sheets always print the same.', `<span class="seg" role="group" aria-label="Theme"><button data-theme-pick="dark">Dark</button><button data-theme-pick="light">Light</button></span><select id="theme-setting" hidden aria-hidden="true" tabindex="-1"><option value="dark">SlotForge Dark</option><option value="light">SlotForge Light</option></select>`)}</div>`,
    workspace: `<div class="ss-sheet">${settingsRow('Workspace folder', `<code class="ss-path">${E(rootPath)}</code>`, '<button data-action="folder">Open folder</button>')}${settingsRow('Database', 'Sheets, decals, artwork and history are stored in decals.sqlite in this folder.', '')}<div class="ss-stats" id="storage-usage" role="status"><span class="hint">Reading storage usage…</span></div></div><p class="ss-note">Installing a new version never replaces this folder. Three previous workspace versions are kept inside the database, and older files stay unchanged as recovery copies.</p>`,
    backup: `<div class="ss-sheet">${settingsRow('Complete backup', 'Every saved sheet with its history, your decal library and all artwork, in one file.', '<button data-action="complete-backup">Export Complete Backup</button>')}${settingsRow('Restore a complete backup', 'Replaces the workspace with the backup. A recovery copy is kept first.', '<button data-action="complete-restore">Restore Complete Backup</button>')}${settingsRow('Recover a sheet', 'Bring back an earlier version of a sheet or a recovered copy.', '<button data-action="recover-workspace">Recover a sheet</button>')}${settingsRow('Sheet Library', 'Every saved sheet, with its versions.', '<button data-action="projects">Open Sheet Library</button>')}</div><h4 class="ss-gh">Only if you need it</h4><details class="settings-advanced ss-sheet" id="legacy-backups"><summary>Older backup format (.sfbackup)</summary>${settingsRow('Workspace backup', 'Only for exchanging with older Decals versions. Contains the current sheet and up to 1,000 library decals, not every saved sheet.', '<button data-action="backup">Export Workspace Backup</button><button data-action="restore-backup">Restore Workspace Backup</button>')}</details>`,
    updates:
      '<div id="update-settings"></div><p class="ss-note">Decal artwork stays on your computer. No account is needed; the internet is only used to check for new versions.</p>'
  };
  showDialog(
    'App settings',
    'Your workspace belongs to you.',
    `<div class="rail-shell settings-shell"><nav class="rail" aria-label="Settings sections">${sections.map(([id, ic, title]) => `<button class="rail-item" data-rail="settings-${id}">${icon(ic)}<span><span class="rail-name">${title}</span><small id="rail-status-${id}"></small></span></button>`).join('')}</nav><div class="rail-canvas">${sections.map(([id, ic, title, lead]) => settingsSection(id, ic, title, lead, bodies[id])).join('')}</div></div>`,
    '<button class="primary" data-action="close">Done</button>',
    true
  );
  $('#dialog').classList.add('rail-dialog');
  railShell($('.settings-shell'));
  const status = (id, text) => {
    const el = $('#rail-status-' + id);
    if (el) el.textContent = text;
  };
  const themeStatus = () => {
    for (const b of $$('[data-theme-pick]'))
      b.setAttribute('aria-pressed', String(b.dataset.themePick === settings.theme));
    status('appearance', settings.theme === 'light' ? 'Light' : 'Dark');
  };
  status('backup', 'Complete backups · recovery');
  desktop
    .storageStats()
    .then(s => {
      const el = $('#storage-usage');
      if (!el) return;
      const mb = (s.bytes / 1024 / 1024).toFixed(1) + ' MB';
      el.innerHTML = [
        ['Database', mb],
        ['Saved decals', s.decals],
        ['Saved sheets', s.sheets],
        ['Artwork assets', s.assets],
        ['Saved versions', s.history]
      ]
        .map(([k, v]) => `<div class="ss-stat"><small>${k}</small><b>${E(String(v))}</b></div>`)
        .join('');
      status('workspace', `${mb} · ${s.sheets} sheets · ${s.decals} decals`);
    })
    .catch(fail);
  UpdateUI.show();
  $('#theme-setting').value = settings.theme;
  $('#theme-setting').onchange = e => {
    setTheme(e.target.value);
    themeStatus();
  };
  for (const b of $$('[data-theme-pick]'))
    b.onclick = () => {
      $('#theme-setting').value = b.dataset.themePick;
      $('#theme-setting').dispatchEvent(new Event('change'));
    };
  themeStatus();
}
// A side list that scrolls its column to a section and marks the section in view.
function railShell(shell) {
  const canvas = shell.querySelector('.rail-canvas'),
    items = [...shell.querySelectorAll('[data-rail]')];
  const target = b => document.getElementById(b.dataset.rail);
  const mark = () => {
    const visible = items.filter(b => !b.hidden && target(b) && !target(b).hidden);
    if (!visible.length) return;
    const top = canvas.getBoundingClientRect().top + 40;
    let current = visible[0];
    for (const b of visible) if (target(b).getBoundingClientRect().top <= top) current = b;
    // At the very end the last short section cannot reach the top: mark it anyway.
    if (canvas.scrollTop > 0 && canvas.scrollTop + canvas.clientHeight >= canvas.scrollHeight - 2)
      current = visible[visible.length - 1];
    for (const b of items) b.setAttribute('aria-current', String(b === current));
  };
  let pending = false;
  canvas.addEventListener(
    'scroll',
    () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        mark();
      });
    },
    { passive: true }
  );
  for (const b of items)
    b.onclick = () => {
      canvas.scrollTo({ top: target(b).offsetTop - canvas.firstElementChild.offsetTop, behavior: 'smooth' });
      for (const x of items) x.setAttribute('aria-current', String(x === b));
    };
  mark();
  return { mark };
}
function sharingDialog() {
  const button = (action, title, description, exporting = false) =>
    '<button data-action="' +
    action +
    '" class="transfer-button ' +
    (exporting ? 'transfer-export' : '') +
    '"><strong>' +
    title +
    '</strong><small>' +
    description +
    '</small></button>';
  showDialog(
    'Import & Export',
    'Bring artwork in. Share editable sheets and decals, or export a PDF for printing.',
    pageNote(
      'share',
      'Import &amp; Export moves artwork, decals and sheets in and out of Decals.',
      'Sheet and decal files stay editable when they are opened in Decals again; a PDF is for printing.',
      'Import your own logos and pictures, share sheets or decals with another Decals user, or export the PDF for your decal paper.'
    ) +
      '<div class="transfer-headings"><span>IMPORT</span><span>EXPORT</span></div><section class="transfer-section"><h3>SHEETS</h3><div class="transfer-grid">' +
      button('open-sheet-file', 'Import a Sheet', 'Choose sheets and pages from an editable .sfsheet file.') +
      button(
        'export-sheet',
        'Export a Sheet',
        'Choose saved sheets and pages to share in one editable file.',
        true
      ) +
      '</div></section><section class="transfer-section"><h3>IMAGES AND DECALS</h3><div class="transfer-grid">' +
      button('import', 'Import an Image', 'PNG · JPG · WebP · SVG · EPS · PDF') +
      button('export-pack', 'Export Decals', 'Choose saved decals to share with other builders.', true) +
      button('import-pack', 'Import Decals', 'Choose decals from an .sfdecal file to add to your library.') +
      button('pdf', 'Export PDF', 'Print your current sheet at its exact physical size.', true) +
      '</div></section><p class="hint">Save Sheet keeps your work in Sheet Library. Editable sheet and decal files preserve editing; PDF is for printing. Workspace backups are in Settings → Backup & Recovery.</p>',
    '<button data-action="close">Done</button>',
    true
  );
}
// Help is split into topics with a topic list and search, instead of one long page.
const HELP_TOPICS = [
  [
    'Getting started',
    '<p>The usual workflow: <strong>import or create</strong> artwork, set its <strong>printed size</strong> in millimetres, check it on the <strong>car preview</strong>, <strong>arrange</strong> the sheet, <strong>save</strong> it, print a plain-paper <strong>sizing proof</strong>, then export the final PDF for your decal paper.</p><p>Everything is saved locally and automatically. Save sheet (Ctrl+S) also keeps a copy in Sheet Library.</p>'
  ],
  [
    'Import & prepare artwork',
    '<p>Import PNG, JPEG, WebP, SVG, EPS or PDF artwork with Import an Image, by dropping a file on the sheet, or by pasting (Ctrl+V) a copied image, screenshot or SVG code. New artwork is placed in free space on the page.</p><p>Select a bitmap and use <strong>Crop &amp; remove background</strong> to prepare it. Preview against transparent, light or dark backgrounds; the original is retained.</p><p>Choose <strong>Trace image to vector</strong> to review an SVG approximation of a PNG, JPEG or WebP. Adjust colours, detail and transparency, then replace traced colours or remove unwanted shapes before applying. Zoom both previews to compare details. The original image is kept for restoration. SVG filters and external resources need preparation in another editor.</p><p><strong>Edit Vector Artwork</strong> removes unwanted shapes, such as white backgrounds, from imported vectors while keeping the original for restoring.</p>'
  ],
  [
    'Text, shapes & paths',
    '<p>Add <strong>Text</strong> and choose a font: the built-in fonts, <strong>Choose installed font…</strong> for any font on this computer, or <strong>Import font</strong> for a font file. Chosen fonts are embedded in the sheet. Text bend arches lettering up or down.</p><p>Open <strong>Shapes &amp; Patterns</strong> for basic shapes, stars, polygons, arrows, chevrons, shields, checkerboards and 1–12 racing stripes. <strong>Racing Number Plates</strong> offers editable roundels and plates, including matching pairs. Fill in <strong>More numbers</strong> (for example 1-30, 44, 51) to create a plate for every car in the field at once; they fill free space and add pages as needed.</p><p><strong>Path Tool</strong> draws lines or closed shapes; edit points and curve handles afterwards. <strong>Merge &amp; Cut</strong> combines filled native shapes on the canvas: union, cut, intersection or excluded overlap. Results remain editable paths; imports and text cannot be combined.</p><p>Colour fields offer an eyedropper and quick swatches of your recent colours and the colours on the sheet. <strong>Add silhouette outline</strong> creates an adjustable vector border around imported artwork. Select a group and choose <strong>Edit group</strong> to change its parts; Apply changes commits them together.</p>'
  ],
  [
    'Size & car preview',
    '<p>Width and height are the <strong>printed dimensions</strong> in millimetres. Keep proportions resizes both together. Scale Conversion changes the model scale for the sheet or selected artwork.</p><p>The <strong>Car preview</strong> at the top of the right panel shows every selected decal at its printed size. Drag a decal over the car to test placement without moving it on the sheet, or enlarge the preview to adjust its size. Pick a <strong>Car</strong> — modern GT, classic endurance GT, touring saloon, rally hatchback or Group C prototype — and the model is sized from the real car’s length at your scale. Use Reference size to enter your model’s measurements or import your own side and top pictures. The car is illustrative, not a wrap calculation: confirm the fit with a paper proof.</p>'
  ],
  [
    'Arrange the sheet',
    '<p>Use the <strong>Sheet size</strong> picker for A4, A5, US Letter, Photo 4×6 in or a <strong>custom size</strong> (50–600 mm) for odd decal paper, and Portrait ↔ for orientation. All pages share that size; changing paper never rescales decals.</p><p>Drag across empty canvas to select decals; Ctrl/Shift-click toggles individual decals. Drag the selection to move it together. <strong>Arrange…</strong> creates grids of copies, equal gaps, alignment, mirroring and moves to another page. <strong>Auto-arrange</strong> makes room while preserving sizes. Group a finished design and Lock its placement.</p><p><strong>Add mirrored copy (other side)</strong> makes a horizontally mirrored copy for directional graphics such as arrows, stripes and slanted shapes; editable text stays readable, but lettering inside imported logos is mirrored too. <strong>Recolour…</strong> lists every colour in the selected decals, including inside SVG artwork, and replaces the ones you change — handy for team variants.</p><p>Margins, cutting gap, decal material and white ink are under <strong>Paper &amp; white ink</strong>. Print checks flag artwork outside the margins, too little cutting space and low-resolution images.</p>'
  ],
  [
    'Slice area',
    '<p>Use <strong>Slice area…</strong> above the sheet to draw a rectangle or enter its position and size in millimetres. Clip at its boundary or expand to include whole decals.</p><p>Save a transparent slice to your library, print only that area on the original paper size, or export a cropped PDF. The original sheet stays unchanged. Saved slices move and resize as one decal; edit the original artwork before making a new slice.</p>'
  ],
  [
    'Libraries & sharing',
    '<p><strong>Save decal to library</strong> keeps a reusable design with a name and tags. Copies on sheets stay independent. Share saved decals as an .sfdecal pack with Export Decals.</p><p><strong>Sheet Library</strong> holds complete saved sheets. Add Sheet saves the outgoing work and starts another. Export selected sheets as one editable .sfsheet; Choose pages… includes only the pages you want. Import Sheet(s) adds independent copies while your current work stays open. Versions and Recover a sheet open earlier work as separate copies.</p><p>Back up everything with <strong>App Settings → Export Complete Backup</strong>.</p>'
  ],
  [
    'Print & white ink',
    '<p>Export a <strong>sizing proof</strong> first and print it on plain paper at <strong>Actual size / 100%</strong>, with Fit to page disabled. Measure the labelled 50/100 mm bars, then export the final PDF.</p><div class="notice"><strong>White ink:</strong> enable the printer option, set its required spot name, and choose Colour + white backing or White ink only on a decal. Export uses an alpha-thresholded 600 PPI white mask. Confirm ink order and spot recognition with your print shop; this has not been validated on physical printers. RGB artwork is preserved; PDF/X and colour-proof certification are not provided.</div>'
  ],
  [
    'Print & cut',
    '<p>Under <strong>Print &amp; cut</strong> in the right panel, choose whether cut lines <strong>follow the decal shape</strong> or form a <strong>rectangle</strong>, and how far they sit around the artwork (offset, default 1 mm). Nearby parts such as letters share one cut line; holes are not cut. Dashed lines on the sheet show the result. Override a single decal with <strong>Cut line</strong> in its Text &amp; appearance settings.</p><p><strong>Export for cutter…</strong> saves a folder for Silhouette Studio (including the free Basic edition), Cricut Design Space or Brother ScanNCut, with an INSTRUCTIONS.txt. Each decal becomes a 300 DPI PNG with a white border along its cut line: inkjets print white as no ink, while the cutter software traces the border. Sheet files keep the exact layout: a page PNG with DXF cut lines for Silhouette, or an SVG with print and cut layers. The cutter software adds its own registration marks.</p><p>For cutting <strong>by hand</strong> or scanning with a ScanNCut, enable <strong>Print cut lines in the PDF</strong>. Always test on plain paper first.</p>'
  ],
  [
    'Updates',
    '<p>About 15 seconds after it starts, Decals asks GitHub for the newest published release, at most twice a day. Only the version number is requested; nothing about you or your sheets is sent. When a newer version exists, a notice appears above the sheet bar with <strong>Download</strong>, which opens the release page in your browser, and <strong>Not now</strong>, which hides it until an even newer version appears.</p><p>Decals never downloads or installs anything by itself. Close Decals, then install the new version as before; your sheets and decals stay in Documents/SlotForge Decals. <strong>App Settings → Updates</strong> shows the result, has <strong>Check now</strong> and turns automatic checks off.</p>'
  ],
  [
    'Keyboard shortcuts',
    '<dl class="help-keys"><dt>Ctrl+C / Ctrl+X / Ctrl+V</dt><dd>Copy, cut and paste decals (also between sheets); paste images, screenshots or SVG code</dd><dt>Ctrl+D</dt><dd>Duplicate</dd><dt>Ctrl+G</dt><dd>Group</dd><dt>Ctrl+A</dt><dd>Select everything on the page</dd><dt>Delete</dt><dd>Remove the selection</dd><dt>Arrow keys</dt><dd>Move 1 mm · with Shift 0.1 mm</dd><dt>Ctrl+Z / Ctrl+Y</dt><dd>Undo and redo, up to 200 steps (Ctrl+Shift+Z also redoes)</dd><dt>Ctrl+S</dt><dd>Save sheet to Sheet Library</dd><dt>Ctrl+mousewheel</dt><dd>Zoom the sheet</dd><dt>Alt-drag</dt><dd>Move without snapping</dd><dt>Escape</dt><dd>Clear the selection or cancel a drag</dd></dl><p class="hint">On a Mac, use Cmd instead of Ctrl.</p>'
  ]
];
function helpDialog() {
  showDialog(
    'Your decal workshop',
    'SlotForge Decals' + (appVersion ? ' · ' + appVersion : ''),
    `<div class="rail-shell help-shell"><nav class="rail" aria-label="Help topics"><span class="rail-search">${icon('search')}<input id="help-search" type="search" placeholder="Search help…" aria-label="Search help"></span>${HELP_TOPICS.map((t, n) => `<button class="rail-item" data-help-topic="${n}" data-rail="help-topic-${n}">${icon('topic')}<span class="rail-name">${E(t[0])}</span></button>`).join('')}</nav><div class="rail-canvas help-reader" id="help-content">${HELP_TOPICS.map((t, n) => `<section class="help-topic" id="help-topic-${n}"><h3>${E(t[0])}</h3>${t[1]}</section>`).join('')}<p class="hint help-empty" hidden>No help topics match your search.</p><p class="hint help-source">Source and third-party notices are included with the app.</p></div></div>`,
    '<button class="primary" data-action="close">Start creating</button>',
    true
  );
  $('#dialog').classList.add('rail-dialog');
  const rail = railShell($('.help-shell'));
  $('#help-search').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    HELP_TOPICS.forEach((_, n) => {
      const match =
        !q ||
        $('#help-topic-' + n)
          .textContent.toLowerCase()
          .includes(q);
      $('#help-topic-' + n).hidden = !match;
      $(`[data-help-topic="${n}"]`).hidden = !match;
      shown += match;
    });
    $('.help-empty').hidden = shown > 0;
    $('#help-content').scrollTop = 0;
    rail.mark();
  };
}
function welcome() {
  showDialog(
    'Welcome to SlotForge Decals',
    'Your artwork. Your scale. Your decal workshop.',
    `<p>Import your own pictures or logos, create text and shapes, or explore the example sheet.</p><div class="welcome-actions"><button class="primary" data-action="import">Import an Image<small>PNG · JPG · SVG · EPS · PDF</small></button><button data-action="demo">Open example sheet<small>Includes editable starter decals</small></button><button data-action="close">Start with a blank sheet<small>Import artwork or add text and shapes</small></button></div><p class="hint">Everything is saved locally. The car preview is an illustrated reference you can calibrate or replace.</p>`
  );
}
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
async function installedFontsDialog() {
  const text = current();
  if (text?.kind !== 'text') throw Error('Select a text decal first.');
  if (text.locked) throw Error('Unlock this decal before editing.');
  const list = await installedFonts(),
    sample = E(text.text.trim().slice(0, 24) || 'Race 27'),
    cssName = f => f.replace(/["\\]/g, '');
  showDialog(
    'Installed fonts',
    `${list.length} font families on this computer. The chosen font is embedded in this sheet, so PDFs and shared sheets keep it.`,
    '<div class="field"><input id="font-search" type="search" placeholder="Search fonts…" aria-label="Search installed fonts"></div><div id="font-list" class="font-list"></div><p class="hint">Only share sheets with fonts whose licence allows embedding.</p>',
    '<button data-action="close">Cancel</button>',
    true
  );
  const draw = () => {
    const q = $('#font-search').value.trim().toLowerCase(),
      matches = list.filter(f => f.family.toLowerCase().includes(q));
    $('#font-list').innerHTML = matches.length
      ? matches
          .map(
            f =>
              `<button class="font-option" data-font-family="${E(f.family)}"><span class="font-sample" style="font-family:&quot;${E(cssName(f.family))}&quot;, sans-serif">${sample}</span><small>${E(f.family)}</small></button>`
          )
          .join('')
      : '<p class="hint">No installed fonts match your search.</p>';
  };
  $('#font-search').oninput = draw;
  $('#font-list').onclick = async e => {
    const option = e.target.closest('[data-font-family]');
    if (!option) return;
    try {
      const entry = list.find(f => f.family === option.dataset.fontFamily);
      for (const b of $$('#font-list button')) b.disabled = true;
      const font = await fontFromBlob(await entry.face.blob(), entry.face.fullName || entry.family);
      await Art.loadFonts([...activeFonts(), font]);
      mutate(() => {
        const live = project.items.find(x => x.id === text.id);
        if (!live) throw Error('The text decal is no longer on this sheet.');
        if (!project.fonts.includes(font)) project.fonts.push(font);
        live.font = font.family;
        remeasureText(live);
      });
      closeDialog();
      toast(`${entry.family} embedded in this sheet.`);
    } catch (err) {
      $('#dialog-error').textContent = err.message;
      for (const b of $$('#font-list button')) b.disabled = false;
    }
  };
  draw();
  $('#font-search').focus();
}
// Recolour: replace any colour used by the selected decals, e.g. for a team variant.
function recolourDialog() {
  const list = items();
  if (!list.length) throw Error('Select a decal first.');
  if (list.some(i => i.locked)) throw Error('Unlock the selected decals before recolouring.');
  const colours = ColourKit.coloursIn(list).slice(0, 24);
  if (!colours.length)
    throw Error('These decals contain only bitmap images. Trace them to vector first to recolour them.');
  const rasters = list.some(i => DM.rasters(i).length);
  const subject = list.length === 1 ? list[0].name : list.length + ' decals';
  showDialog(
    'Recolour',
    `${colours.length} ${colours.length === 1 ? 'colour' : 'colours'} in ${subject}. Choose a new colour for any of them.`,
    `<div class="recolour-list">${colours
      .map(
        c =>
          `<div class="recolour-row"><span class="recolour-old" style="background:${c}" title="${c}"></span><code>${c}</code><span aria-hidden="true">→</span><div class="recolour-new"><input type="color" data-from="${c}" value="${c}" aria-label="New colour for ${c}"></div></div>`
      )
      .join(
        ''
      )}</div>${rasters ? '<p class="hint">Bitmap images inside these decals keep their colours.</p>' : ''}<p class="hint">Originals kept for tracing or vector editing stay unchanged. Undo reverts the recolour.</p>`,
    '<button data-action="close">Cancel</button><button class="primary" id="recolour-apply">Apply colours</button>'
  );
  $('#recolour-apply').onclick = () => {
    try {
      const map = {};
      for (const input of $$('[data-from]'))
        if (input.value.toLowerCase() !== input.dataset.from)
          map[input.dataset.from] = input.value.toLowerCase();
      const changed = Object.keys(map).length;
      if (!changed) return closeDialog();
      const ids = new Set(list.map(i => i.id));
      mutate(() => {
        for (const live of project.items) if (ids.has(live.id)) ColourKit.recolour(live, map);
      });
      closeDialog();
      toast(`Changed ${changed} ${changed === 1 ? 'colour' : 'colours'}.`);
    } catch (err) {
      $('#dialog-error').textContent = err.message;
    }
  };
}
function prepareSelected() {
  const item = current();
  if (item?.kind !== 'image') throw Error('Select a PNG, JPEG or WebP image.');
  if (item.locked) throw Error('Unlock this decal before preparing it.');
  ImagePrepUI.open(DM.clone(item), (prepared, copy) => {
    mutate(() => {
      const index = project.items.findIndex(i => i.id === item.id);
      if (index < 0) throw Error('The source decal is no longer on this sheet.');
      if (project.items[index].locked) throw Error('Unlock this decal before changing it.');
      if (copy) {
        if (project.items.length >= 2000) throw Error('A project supports up to 2,000 decals.');
        prepared.id = DM.uid();
        prepared.name = item.name + ' · prepared';
        prepared.x += 4;
        prepared.y += 4;
        delete prepared.carPositions;
        delete prepared.libraryId;
        project.items.push(prepared);
      } else project.items[index] = prepared;
      selected = new Set([prepared.id]);
    });
    toast(
      copy
        ? 'Prepared copy added. Your source decal is unchanged.'
        : 'Image prepared. The original is retained for restoration.'
    );
  });
}
function restorePrepared() {
  const item = current();
  if (item?.kind !== 'image' || !item.imageSource) throw Error('Select a prepared image.');
  if (item.locked) throw Error('Unlock this decal first.');
  mutate(() => {
    project.items[project.items.indexOf(item)] = ImagePrep.restore(item);
  });
  toast('Original image restored at the current printed artwork scale.');
}
function traceSelected() {
  const item = current();
  if (!item) throw Error('Select an image to trace.');
  if (item.locked) throw Error('Unlock this decal before tracing.');
  TraceUI.open(DM.clone(item), (vector, copy) => {
    mutate(() => {
      const index = project.items.findIndex(i => i.id === item.id);
      if (index < 0) throw Error('The source decal is no longer on this sheet.');
      if (copy) {
        vector.id = DM.uid();
        vector.name = item.name + ' · vector';
        vector.x += 4;
        vector.y += 4;
        delete vector.libraryId;
        project.items.push(vector);
      } else project.items[index] = vector;
      selected = new Set([vector.id]);
    });
    toast(
      copy
        ? 'Vector copy added. Save it to your library when ready.'
        : 'Vector trace applied. The original image is kept for restoration.'
    );
  });
}
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
function numberTemplate() {
  CreationUI.numberDialog((art, count) => {
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
      const ids = [];
      for (let n = 0; n < count; n++) {
        const i = DM.clone(art);
        place(i, {
          x: project.margin + (n && across ? art.w + gap : 0),
          y: project.margin + (n && down ? art.h + gap : 0)
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
  });
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
  'number-template': numberTemplate,
  'prepare-image': prepareSelected,
  'restore-prepared': restorePrepared,
  shapes: () => ShapeToolsUI.open(),
  'edit-shape': () => ShapeToolsUI.open(current()),
  orientation: () =>
    mutate(() => (project.orientation = project.orientation === 'portrait' ? 'landscape' : 'portrait')),
  'sidebar-grid': () => setSidebarView('grid'),
  'sidebar-list': () => setSidebarView('list'),
  projects: projectBrowser,
  'recover-workspace': () => projectVersions(),
  'open-sheet-file': () => $('#project-file').click(),
  'arrange-selection': arrangeSelectionDialog,
  'grid-copies': gridCopiesDialog,
  'move-page': moveSelectionDialog,
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
  editor: () => closeDialog(),
  close: closeDialog,
  rename: () => nameDialog('Name your sheet', project.name, n => mutate(() => (project.name = n))),
  import: () => $('#art-file').click(),
  'import-pack': () => $('#pack-file').click(),
  'restore-backup': () => $('#backup-file').click(),
  font: () => $('#font-file').click(),
  'installed-fonts': installedFontsDialog,
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
  'cutter-export': () => CutterExport.open(project),
  new: newProject,
  demo: () => {
    const open = () =>
      projectRun(async () => {
        await saveCurrentProject();
        await demo();
      });
    if (project.items.length) {
      confirmDialog(
        'Open example sheet?',
        'Your current sheet is saved in Sheet Library first. Your library is kept and starter decals are added.',
        open,
        'Open example'
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
    showDialog(
      'Exporting complete backup',
      'All saved sheets, decals, artwork and history.',
      '<p class="hint">Verifying your backup. Please wait…</p>'
    );
    try {
      const file = await desktop.completeBackup();
      closeDialog();
      if (file) toast('Complete backup saved and verified.');
    } catch (e) {
      closeDialog();
      throw e;
    }
  },
  'complete-restore': async () => {
    CanvasTools.resolve();
    await flush();
    showDialog(
      'Restoring complete backup',
      'Your current workspace will be backed up first.',
      '<p class="hint">Choose and confirm a complete backup in the file dialog.</p>'
    );
    try {
      const loaded = await desktop.completeRestore();
      if (!loaded) {
        closeDialog();
        return;
      }
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
      closeDialog();
      throw e;
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
  proof: () => {
    closeDialog();
    return exportPDF(true);
  },
  checks: showChecks,
  settings: settingsDialog,
  sharing: sharingDialog,
  help: helpDialog,
  folder: () => desktop.folder(),
  library: decalBrowser,
  duplicate: () => duplicate(),
  copies: () => {
    const n = DM.number($('#copies').value, 1, 100, 'Copies');
    if (!Number.isInteger(n)) throw Error('Copies must be a whole number.');
    duplicate(n);
  },
  delete: () =>
    mutate(() => {
      project.items = project.items.filter(i => !selected.has(i.id) || i.locked);
      selected.clear();
    }),
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
  arrange: () => {
    mutate(() => {
      project = DM.arrange(project);
      page = 0;
      selected.clear();
    });
    toast('Arranged at original sizes. Locked decals kept in place.');
  },
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
  backward: () => {
    const i = current();
    if (i?.locked) throw Error('Unlock this decal before editing.');
    if (i)
      mutate(() => {
        const n = project.items.indexOf(i);
        if (n > 0) [project.items[n - 1], project.items[n]] = [project.items[n], project.items[n - 1]];
      });
  },
  forward: () => {
    const i = current();
    if (i?.locked) throw Error('Unlock this decal before editing.');
    if (i)
      mutate(() => {
        const n = project.items.indexOf(i);
        if (n < project.items.length - 1)
          [project.items[n + 1], project.items[n]] = [project.items[n], project.items[n + 1]];
      });
  },
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
  'car-settings': carSettings,
  'expand-car': openCarPreview
};
document.addEventListener('click', e => {
  if (projectTask) return;
  const b = e.target.closest('[data-action]');
  if (b && !b.disabled) {
    e.preventDefault();
    Promise.resolve()
      .then(() => actions[b.dataset.action]?.())
      .catch(fail);
  }
  const create = e.target.closest('[data-create]');
  if (create)
    try {
      addShape(create.dataset.create);
    } catch (e) {
      fail(e);
    }
});
$('#library-search').oninput = () => renderLibrary();
for (const b of $$('[data-filter]'))
  b.onclick = () => {
    filter = b.dataset.filter;
    $$('[data-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderLibrary();
  };
// Choosing a body sizes the model from the real car's length at the sheet's scale; width and
// height follow that car's picture, so it is never stretched. One undoable change.
$('#car-body').onchange = async e => {
  const body = e.target.value;
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
        'Your own reference pictures are still shown. Choose Reference size → Use included car to see this car.'
      );
  } catch (err) {
    fail(err);
    render();
  }
};
$('#car-scale').onchange = e => scaleDialog(e.target.value === 'custom' ? null : Number(e.target.value));
// Custom paper asks for its size first; cancelling leaves the sheet unchanged.
function customPaperDialog() {
  const current = project.customPage || { w: 210, h: 297 };
  showDialog(
    'Custom paper size',
    'Enter the portrait width and height of your decal paper. Portrait ↔ switches orientation.',
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
// Print & cut panel: every change is one undoable sheet edit.
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
    mutate(() => {
      project.preview[carImportView] = { src, width: img.naturalWidth, height: img.naturalHeight };
      project.preview.view = carImportView;
    });
    closeDialog();
    carSettings();
  } catch (err) {
    fail(err);
  }
};
document.addEventListener('keydown', e => {
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
  if (e.target.matches('input,textarea,select') || $('#dialog').open) return;
  const ctrl = e.ctrlKey || e.metaKey;
  let action;
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
    });
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
    showDialog(
      'Your latest changes could not be saved',
      e.message,
      '<p>Keep the app open and export your unsaved sheet before closing.</p>',
      '<button data-action="rescue-sheet">Export Unsaved Sheet</button><button data-action="backup">Export workspace backup</button><button data-action="close">Keep working</button>'
    );
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
    return exportPDF(false).catch(fail);
  }
};
$('#sidebar-library summary').addEventListener('click', () => {
  settings.sidebarLibraryOpen = !$('#sidebar-library').open;
  revision++;
  scheduleSave();
  setTimeout(() => renderLibrary(), 0);
});
start();
