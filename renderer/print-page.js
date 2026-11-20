'use strict';
// Print & share (remake option A, docs/ui-reference/output-2026-11): one page that walks from the
// print checks to a plain-paper test print, the PDF for decal paper and the cutter, with the printed
// page always in view. Sharing, importing and backups are on the same page.
const PrintPage = (() => {
  const STEPS = ['check', 'proof', 'print', 'cut', 'share'];
  let step = 'check',
    pg = 0,
    overlay = null, // 'issues' | 'cut' | 'white'
    machine = 'hand',
    proofHelp = false,
    flash = null,
    drawRun = 0;
  const root = () => document.getElementById('print-page');
  const isOpen = () => !!root() && !root().hidden;
  const item = id => project.items.find(i => i.id === id);
  const defaults = { check: 'issues', proof: 'issues', print: 'white', cut: 'cut' };

  function show(to = 'check') {
    try {
      CanvasTools.resolve();
    } catch (e) {
      fail(e);
      return;
    }
    Workshop.hide();
    Shelf.hide();
    CarPage.hide();
    SettingsPage.hide();
    closeDialog();
    step = STEPS.includes(to) ? to : 'check';
    overlay = defaults[step] || null;
    pg = Math.min(page, project.pages - 1);
    root().hidden = false;
    document.body.classList.add('printpage-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'sharing');
    Finder.close();
    render();
  }
  function hide() {
    if (!isOpen()) return;
    root().hidden = true;
    root().innerHTML = ''; // no leftover fields or ids while the page is away
    document.body.classList.remove('printpage-mode');
    for (const b of $$('.wb-nav .nav')) b.classList.toggle('active', b.dataset.action === 'editor');
    renderPaper();
  }

  // The checks, each with what to do about it.
  function issues() {
    return DM.warnings(project).map((w, n) => {
      const i = item(w.id),
        other = w.other && item(w.other);
      const fix =
        w.type === 'margin'
          ? ['margin', 'Move inside the margin']
          : w.type === 'spacing'
            ? ['spacing', `Move ${other?.name || 'it'} to free space`]
            : w.type === 'white'
              ? ['white', 'Turn on white ink']
              : ['trace', 'Trace to vector…'];
      return { ...w, n: n + 1, item: i, other, fix, page: i?.page ?? 0 };
    });
  }
  const severity = w => (w.type === 'margin' || w.type === 'white' ? 'red' : '');

  function sheet(list) {
    const s = DM.size(project),
      m = project.margin,
      onPage = project.items.filter(i => i.page === pg);
    const marks =
      overlay === 'issues'
        ? list
            .filter(w => w.item && w.page === pg)
            .map(w => {
              const b = DM.bounds(w.other && w.type === 'spacing' ? w.other : w.item);
              return `<g class="pp-mark ${severity(w)} ${flash === w.n ? 'flash' : ''}" data-pp-mark="${w.n}"><rect x="${b.x - 1.2}" y="${b.y - 1.2}" width="${b.w + 2.4}" height="${b.h + 2.4}" rx="1.2"/><circle cx="${b.x - 1.2}" cy="${b.y - 1.2}" r="3.4"/><text x="${b.x - 1.2}" y="${b.y - 1.2 + 1.3}" text-anchor="middle">${w.n}</text></g>`;
            })
            .join('')
        : '';
    const white =
      overlay === 'white' && project.whiteInk
        ? onPage
            .filter(i => DM.hasWhite(i) || i.ink === 'white' || i.ink === 'both')
            .map(i => {
              const b = DM.bounds(i);
              return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#pp-hatch)" pointer-events="none"/>`;
            })
            .join('')
        : '';
    const bars =
      step === 'proof'
        ? (() => {
            const bar = DM.proofBars(project);
            return `<g class="pp-bar"><rect x="${m}" y="${s.h - m - 6}" width="${bar.x}" height="2.5" fill="#111"/><text x="${m}" y="${s.h - m - 0.8}" font-size="3" fill="#333">${bar.x} mm</text></g>`;
          })()
        : '';
    return `<svg id="pp-sheet" class="pp-sheet" viewBox="0 0 ${s.w} ${s.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Page ${pg + 1} as it prints"><defs><pattern id="pp-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".7" height="2" fill="#8d9bb0"/></pattern></defs><rect width="${s.w}" height="${s.h}" fill="#fff"/><rect x="${m}" y="${m}" width="${s.w - 2 * m}" height="${s.h - 2 * m}" fill="none" stroke="#9db4d3" stroke-width=".25" stroke-dasharray="1.5 1"/>${onPage.map((i, n) => Art.element(i, 'pp-' + n, 'all')).join('')}${white}${bars}${marks}</svg>`;
  }
  async function drawCutLines() {
    const run = ++drawRun;
    if (overlay !== 'cut' || !isOpen()) return;
    try {
      const shapes = await Cutlines.forPage(project, pg, { pxPerMm: 8 });
      const svg = $('#pp-sheet');
      if (run !== drawRun || !svg) return;
      const d = shapes.map(s => Cutlines.pathData(s.polygons)).join(' ');
      if (d.trim())
        svg.insertAdjacentHTML(
          'beforeend',
          `<path class="pp-cut" d="${d}" fill="none" stroke="#d6249f" stroke-width=".3" stroke-dasharray="1.2 .7"/>`
        );
    } catch (e) {
      console.warn('Cut line preview failed', e);
    }
  }

  function stepsNav(list) {
    const proofOk = settings.proofOk === true;
    const row = (key, n, title, sub, state) =>
      `<button class="pp-step ${step === key ? 'on' : state}" data-pp-step="${key}"><span class="n">${state === 'warn' && step !== key ? '!' : state === 'done' && step !== key ? '✓' : n}</span><span><b>${title}</b><small>${sub}</small></span></button>`;
    return `<nav class="pp-steps" aria-label="Steps">${row('check', 1, 'Check the sheet', list.length ? `${list.length} ${list.length === 1 ? 'thing' : 'things'} to look at` : 'Ready to print', list.length ? 'warn' : 'done')}${row('proof', 2, 'Test print', proofOk ? 'Sizes measured right' : 'Plain paper, check sizes', proofOk ? 'done' : '')}${row('print', 3, 'Print on decal paper', 'The PDF for your printer', '')}${row('cut', 4, 'Cut out', 'By hand or with a machine', '')}<hr>${row('share', icon('share'), 'Share &amp; back up', 'Sheets, decals, everything', '')}<span class="spacer"></span><p class="pp-facts">${E(DM.pageFormat(project).label.split(' · ')[0])} · ${project.orientation} · 1:${project.scale} · ${project.pages} ${project.pages === 1 ? 'page' : 'pages'}<br>Gap ${fmt(project.gap)} mm · margin ${fmt(project.margin)} mm</p></nav>`;
  }
  function bar(title) {
    const pages =
      project.pages > 1
        ? `<div class="seg" role="group" aria-label="Page">${Array.from({ length: project.pages }, (_, n) => `<button data-pp-page="${n}" aria-pressed="${n === pg}">Page ${n + 1}</button>`).join('')}</div>`
        : '';
    const layers =
      step === 'share'
        ? ''
        : `<div class="seg" role="group" aria-label="Show on the page">${[
            ['issues', 'Issues'],
            ['cut', 'Cut lines'],
            ['white', 'White ink']
          ]
            .map(([k, l]) => `<button data-pp-overlay="${k}" aria-pressed="${overlay === k}">${l}</button>`)
            .join('')}</div>`;
    return `<header class="pp-bar"><h2>${title}</h2><span class="spacer"></span>${pages}${layers}</header>`;
  }
  function checkSide(list) {
    const ok = project.items.length;
    if (!ok)
      return `<aside class="pp-side"><section><div class="pp-ok"><b>Nothing to print yet</b><p>Add artwork to the sheet in the Editor first.</p></div></section></aside>`;
    return `<aside class="pp-side"><section><h3>${list.length ? `${list.length} ${list.length === 1 ? 'thing' : 'things'} to look at` : 'Ready to print'}</h3>${list
      .map(
        w =>
          `<div class="pp-issue ${severity(w)}" data-pp-issue="${w.n}"><span class="b">${w.n}</span><div><b>${E(w.text)}</b><div class="pp-line"><button class="${w.n === 1 ? 'primary' : ''}" data-pp-fix="${w.n}">${E(w.fix[1])}</button><button class="ghost" data-pp-show="${w.n}">Show</button></div></div></div>`
      )
      .join(
        ''
      )}</section><section><div class="pp-ok"><span class="b">✓</span><div><b>${list.length ? 'Everything else is fine' : 'Everything is fine'}</b><p>${project.items.length} ${project.items.length === 1 ? 'decal' : 'decals'} checked: margins, cutting gaps, picture sharpness and white ink.</p></div></div><div class="pp-line end"><button data-pp-step="proof">Next: test print ${icon('chev')}</button></div></section></aside>`;
  }
  function proofSide() {
    return `<aside class="pp-side"><section><h3>Before your decal paper</h3><ol class="pp-ol"><li>Print the test on <b>plain paper</b>, at <b>Actual size / 100 %</b>.</li><li>Measure the black bar: it must be exactly <b>${DM.proofBars(project).x} mm</b>.</li><li>Cut a decal out and hold it on your car.</li></ol><button class="primary" id="pp-proof-go">${icon('ruler')}Save the test print</button></section>
      <section><h3>Did the bar measure ${DM.proofBars(project).x} mm?</h3><div class="pp-line"><button id="pp-proof-yes" aria-pressed="${settings.proofOk === true}">Yes, sizes are right</button><button class="ghost" id="pp-proof-no">No…</button></div>${
        proofHelp
          ? `<p class="pp-note warn" id="pp-proof-help">Your printer scaled the page. In the print window choose <b>Actual size</b> or <b>100 %</b>, and switch off <b>Fit to page</b>, <b>Shrink oversized pages</b> and <b>Borderless</b>. Then print the test again.</p>`
          : '<p class="pp-note">Once your printer prints at the right size you only need this again after changing printers.</p>'
      }</section><section><div class="pp-line end"><button data-pp-step="print">Next: decal paper ${icon('chev')}</button></div></section></aside>`;
  }
  function printSide(list) {
    const cut = DM.cutSettings(project.cut),
      rows = PdfReview.artwork(project.items),
      raster = rows.filter(r => r.raster).length;
    return `<aside class="pp-side"><section><h3>Your decal paper</h3><div class="seg" role="group" aria-label="Decal paper">${[
      ['clear', 'Clear'],
      ['white', 'White']
    ]
      .map(([k, l]) => `<button data-pp-paper="${k}" aria-pressed="${project.paper === k}">${l}</button>`)
      .join(
        ''
      )}</div><p class="pp-note">On clear paper, light colours need white ink behind them.</p></section>
      <section><h3>White ink</h3><label class="switch-row"><input id="pp-white" type="checkbox" role="switch" ${project.whiteInk ? 'checked' : ''}><span class="sw" aria-hidden="true"></span>My printer prints white</label><div class="field"><label for="pp-spot">Spot colour name</label><input id="pp-spot" value="${E(project.spotName)}" maxlength="41" ${project.whiteInk ? '' : 'disabled'}></div><p class="pp-note">${project.whiteInk ? 'Shown hatched on the page with White ink.' : 'Without white ink, white parts of your decals print as the paper.'}</p></section>
      <section><h3>In the PDF</h3><label class="switch-row"><input id="pp-pdf-lines" type="checkbox" role="switch" ${cut.pdfLines ? 'checked' : ''}><span class="sw" aria-hidden="true"></span>Thin cut lines around each decal</label><div class="pp-kv"><span>Pages</span><b>${project.pages}</b><span>Artwork</span><b>${rows.length - raster} vector · ${raster} ${raster === 1 ? 'picture' : 'pictures'}</b><span>Size</span><b>${E(DM.pageFormat(project).label.split(' · ')[0])} · 100 %</b></div>
        <details class="pp-details"><summary>Artwork in this PDF</summary>${PdfReview.markup(project.items, project.whiteInk)}</details></section>
      <section>${list.length ? `<p class="pp-note warn">${list.length} ${list.length === 1 ? 'check is' : 'checks are'} still open. <button class="link" data-pp-step="check">Look at ${list.length === 1 ? 'it' : 'them'}</button></p>` : ''}<button class="primary big" id="pp-save">${icon('pdf')}Save the PDF</button><p class="pp-note">Print it with “Actual size” or “100 %”, never “Fit to page”.</p></section></aside>`;
  }
  function cutSide() {
    const cut = DM.cutSettings(project.cut);
    return `<aside class="pp-side"><section><h3>How do you cut?</h3><div class="pp-machines" role="radiogroup" aria-label="Cutting method">${[
      'hand',
      'silhouette',
      'cricut',
      'scanncut'
    ]
      .map(k => {
        const m = CutterExport.MACHINES[k];
        return `<label class="pp-machine"><input type="radio" name="cutter" value="${k}" ${machine === k ? 'checked' : ''}><span class="pic">${icon('cut')}</span><b>${E(m.label)}</b><small>${E(m.description)}</small></label>`;
      })
      .join('')}</div></section>
      <section><h3>Cut lines</h3><div class="seg" role="group" aria-label="Cut line">${[
        ['shape', 'Follow each decal'],
        ['rect', 'Rectangles'],
        ['none', 'None']
      ]
        .map(([k, l]) => `<button data-pp-cutmode="${k}" aria-pressed="${cut.mode === k}">${l}</button>`)
        .join(
          ''
        )}</div><div class="field"><label for="pp-offset">Offset around the artwork (mm)</label><input id="pp-offset" type="number" min="0" max="5" step=".25" value="${cut.offset}"></div></section>
      <section><button class="primary big" id="cutter-go">${icon(machine === 'hand' ? 'pdf' : 'cut')}${machine === 'hand' ? 'Save the PDF with cut lines' : 'Choose folder &amp; export'}</button><p class="pp-note" id="cutter-note">${
        machine === 'hand'
          ? 'The PDF gets thin cut lines printed around every decal.'
          : machine === 'silhouette'
            ? 'Decal PNGs with a white cut border, plus a page PNG and DXF cut lines for the exact layout.'
            : 'Decal PNGs with a white cut border, plus an SVG of each page with print and cut layers.'
      } Each machine package comes with INSTRUCTIONS.txt.</p><p class="pp-error" id="pp-cut-error" role="alert"></p></section></aside>`;
  }
  function share() {
    const card = (iconName, title, ext, text, buttons) =>
      `<article class="pp-card"><header>${icon(iconName)}<h3>${title}</h3><span class="spacer"></span><span class="pp-ext">${ext}</span></header><p>${text}</p><div class="pp-line">${buttons}</div></article>`;
    return `<div class="pp-cards"><h4 class="pp-group">Send to another builder</h4>${card('sheet', 'This sheet', '.sfsheet', 'Editable, with its fonts and artwork. Choose pages if you only want some.', '<button class="primary" data-alias="export-sheet">Share sheets…</button>')}${card('library', 'Decals', '.sfdecal', 'Choose decals from your library. They arrive as editable copies.', '<button data-alias="export-pack">Choose decals…</button>')}${card('pdf', 'A printable PDF', '.pdf', 'For someone who only wants to print. It cannot be edited.', '<button data-pp-step="print">Make the PDF</button>')}
      <h4 class="pp-group">Bring in</h4>${card('down', 'A shared sheet', '.sfsheet', 'Opens as a new sheet; your work stays as it is.', '<button data-alias="open-sheet-file">Open a sheet…</button>')}${card('down', 'Shared decals', '.sfdecal', 'Goes into your Decal Library.', '<button data-alias="import-pack">Import decals…</button>')}${card('down', 'Artwork', 'PNG · SVG · PDF…', 'Opens the import bay for logos, numbers and pictures.', '<button data-alias="import">Import artwork…</button>')}
      <h4 class="pp-group">Keep it safe</h4>${card('backup', 'Complete backup', '.sfdbbackup', 'Every sheet with its history, the whole library and all fonts, in one file.', '<button class="primary" data-alias="complete-backup">Back up now…</button><button class="ghost" data-alias="complete-restore">Restore…</button>')}</div>`;
  }

  function render() {
    if (!isOpen()) return;
    pg = Math.min(pg, project.pages - 1);
    const list = issues(),
      titles = {
        check: 'Check the sheet',
        proof: 'Test print',
        print: 'Print on decal paper',
        cut: 'Cut out',
        share: 'Share &amp; back up'
      };
    const side = { check: checkSide, proof: proofSide, print: printSide, cut: cutSide }[step];
    root().innerHTML = `${stepsNav(list)}<main class="pp-main">${bar(titles[step])}${step === 'share' ? share() : `<div class="pp-stage">${sheet(list)}</div>`}</main>${side ? side(list) : ''}`;
    drawCutLines();
  }

  const fixIt = w => {
    const [kind] = w.fix;
    if (kind === 'margin') {
      mutate(() => (project = Layout.intoMargins(project, w.item.id)));
      return toast(`${w.item.name} moved inside the margin.`, false, { undo: true });
    }
    if (kind === 'spacing') {
      const moving = w.other || w.item;
      mutate(() => (project = Layout.toFreeSpot(project, moving.id)));
      return toast(`${moving.name} moved to free space.`, false, { undo: true });
    }
    if (kind === 'white') {
      mutate(() => (project.whiteInk = true));
      return show('print');
    }
    // A picture: trace it in the Editor.
    page = w.item.page;
    selected = new Set([w.item.id]);
    hide();
    revealDecal();
    window.render(); // the editor's render, not this page's
    return actions.trace();
  };
  document.addEventListener('click', e => {
    if (!isOpen() || !root().contains(e.target)) return;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const run = (fn, host = '#pp-cut-error') =>
      Promise.resolve()
        .then(fn)
        .catch(err => {
          if ($(host)) $(host).textContent = err.message;
          else fail(err);
        });
    if (b.dataset.ppStep) return show(b.dataset.ppStep);
    if (b.dataset.ppPage) {
      pg = Number(b.dataset.ppPage);
      return render();
    }
    if (b.dataset.ppOverlay) {
      overlay = overlay === b.dataset.ppOverlay ? null : b.dataset.ppOverlay;
      return render();
    }
    const list = issues();
    if (b.dataset.ppFix) {
      const w = list.find(x => x.n === Number(b.dataset.ppFix));
      return run(() => fixIt(w), '#none');
    }
    if (b.dataset.ppShow) {
      const w = list.find(x => x.n === Number(b.dataset.ppShow));
      pg = w.page;
      overlay = 'issues';
      flash = w.n;
      render();
      setTimeout(() => {
        flash = null;
        $(`[data-pp-mark="${w.n}"]`)?.classList.remove('flash');
      }, 1400);
      return;
    }
    if (b.id === 'pp-proof-go') return run(() => exportPDF(true), '#none');
    if (b.id === 'pp-proof-yes') {
      settings.proofOk = true;
      proofHelp = false;
      revision++;
      scheduleSave();
      return render();
    }
    if (b.id === 'pp-proof-no') {
      settings.proofOk = false;
      proofHelp = true;
      revision++;
      scheduleSave();
      return render();
    }
    if (b.dataset.ppPaper) return run(() => mutate(() => (project.paper = b.dataset.ppPaper)), '#none');
    if (b.dataset.ppCutmode)
      return run(() =>
        mutate(() => (project.cut = { ...DM.cutSettings(project.cut), mode: b.dataset.ppCutmode }))
      );
    if (b.id === 'pp-save') return run(() => exportPDF(false, true), '#none');
    if (b.id === 'cutter-go')
      return run(async () => {
        b.disabled = true;
        try {
          const message = await CutterExport.run(project, machine, text => {
            if ($('#cutter-note')) $('#cutter-note').textContent = text;
          });
          if (message && message !== 'hand') toast(message);
        } finally {
          if (b.isConnected) b.disabled = false;
          if (isOpen()) render();
        }
      });
  });
  document.addEventListener('change', e => {
    if (!isOpen() || !root().contains(e.target)) return;
    const t = e.target;
    try {
      if (t.name === 'cutter') {
        machine = t.value;
        return render();
      }
      if (t.id === 'pp-white') mutate(() => (project.whiteInk = t.checked));
      if (t.id === 'pp-spot') mutate(() => (project.spotName = t.value));
      if (t.id === 'pp-pdf-lines')
        mutate(() => (project.cut = { ...DM.cutSettings(project.cut), pdfLines: t.checked }));
      if (t.id === 'pp-offset')
        mutate(
          () =>
            (project.cut = { ...DM.cutSettings(project.cut), offset: DM.number(t.value, 0, 5, 'Cut offset') })
        );
    } catch (err) {
      fail(err);
      render();
    }
  });
  // Undo and redo work here too: a fix is one undo step.
  document.addEventListener('keydown', e => {
    if (!isOpen() || document.querySelector('dialog[open]') || e.target.matches('input,textarea,select'))
      return;
    const ctrl = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (ctrl && key === 'z') {
      e.preventDefault();
      actions[e.shiftKey ? 'redo' : 'undo']();
    } else if (ctrl && key === 'y') {
      e.preventDefault();
      actions.redo();
    }
  });
  // Any Decals file dropped on the Share page opens the way its own button would.
  document.addEventListener('dragover', e => {
    if (
      isOpen() &&
      step === 'share' &&
      root().contains(e.target) &&
      [...(e.dataTransfer?.types || [])].includes('Files')
    )
      e.preventDefault();
  });
  document.addEventListener('drop', e => {
    if (!isOpen() || step !== 'share' || !root().contains(e.target)) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    const name = file.name.toLowerCase();
    (name.endsWith('.sfsheet')
      ? importPackage(file, 'sheets')
      : name.endsWith('.sfdecal')
        ? importPackage(file, 'decals')
        : Promise.reject(
            Error('Drop an .sfsheet or .sfdecal file here; artwork goes in with Import artwork.')
          )
    ).catch(fail);
  });
  return {
    show,
    hide,
    isOpen,
    render,
    get step() {
      return step;
    }
  };
})();
