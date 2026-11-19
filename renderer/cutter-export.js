/* SlotForge Decals — export print & cut packages for cutting machines.
   Every package contains one PNG per decal with a white border along its cut line
   (inkjets print white as no ink, but cutter software traces the border), plus sheet files
   for exact layouts: a page PNG + DXF cut lines (Silhouette Studio Basic) or an SVG with
   print and cut layers (Cricut, CanvasWorkspace). Physical units are millimetres. */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' ? require('./model.js') : root.DM,
    typeof module === 'object' ? null : root.Cutlines
  );
  if (typeof module === 'object') module.exports = api;
  else root.CutterExport = api;
})(globalThis, (DM, Cutlines) => {
  'use strict';
  const DPI = 300,
    PX_PER_MM = DPI / 25.4;
  const MACHINES = {
    silhouette: {
      label: 'Silhouette Studio',
      folder: 'Silhouette',
      description: 'Cameo and Portrait with Silhouette Studio, including the free Basic edition.'
    },
    cricut: {
      label: 'Cricut Design Space',
      folder: 'Cricut',
      description: 'Print Then Cut on Explore, Maker and Joy machines.'
    },
    scanncut: {
      label: 'Brother ScanNCut',
      folder: 'ScanNCut',
      description: 'CanvasWorkspace Print to Cut (DX models) or scanning a printed sheet.'
    },
    hand: {
      label: 'By hand',
      folder: '',
      description: 'Scissors or a hobby knife, using thin cut lines printed in the PDF.'
    }
  };

  // ---- Pure helpers (unit-tested in Node) ----
  const safe = name =>
    String(name || 'Decal')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Decal';
  const mm = v => (Math.round(v * 10) / 10).toString();
  // CRC-32 for PNG chunks.
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  // Insert a pHYs chunk so cutter software opens the PNG at its printed size.
  function withDPI(png, dpi = DPI) {
    if (png[12] !== 0x49 || png[13] !== 0x48 || png[14] !== 0x44 || png[15] !== 0x52)
      throw Error('Not a PNG image.');
    const ppm = Math.round(dpi / 0.0254),
      chunk = new Uint8Array(21),
      view = new DataView(chunk.buffer);
    view.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    view.setUint32(8, ppm);
    view.setUint32(12, ppm);
    chunk[16] = 1; // unit: metre
    view.setUint32(17, crc32(chunk.subarray(4, 17)));
    const at = 33; // after the signature (8) and IHDR chunk (25)
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, at));
    out.set(chunk, at);
    out.set(png.subarray(at), at + chunk.length);
    return out;
  }
  // AutoCAD R12 DXF in millimetres; DXF's Y axis points up, so the page is flipped.
  // A page-size frame on its own layer lets the cut lines be aligned to a page-size print.
  function dxf(polygons, page) {
    const out = [],
      g = (code, value) => out.push(String(code), String(value)),
      n = v => Number(v.toFixed(4));
    (g(0, 'SECTION'), g(2, 'HEADER'), g(9, '$ACADVER'), g(1, 'AC1009'), g(9, '$INSUNITS'), g(70, 4));
    (g(9, '$EXTMIN'),
      g(10, 0),
      g(20, 0),
      g(9, '$EXTMAX'),
      g(10, n(page.w)),
      g(20, n(page.h)),
      g(0, 'ENDSEC'));
    (g(0, 'SECTION'), g(2, 'TABLES'), g(0, 'TABLE'), g(2, 'LAYER'), g(70, 2));
    for (const [name, colour] of [
      ['CUT', 1],
      ['PAGE_FRAME', 8]
    ])
      (g(0, 'LAYER'), g(2, name), g(70, 0), g(62, colour), g(6, 'CONTINUOUS'));
    (g(0, 'ENDTAB'), g(0, 'ENDSEC'), g(0, 'SECTION'), g(2, 'ENTITIES'));
    const poly = (layer, points) => {
      (g(0, 'POLYLINE'), g(8, layer), g(66, 1), g(70, 1));
      for (const p of points) (g(0, 'VERTEX'), g(8, layer), g(10, n(p.x)), g(20, n(page.h - p.y)));
      (g(0, 'SEQEND'), g(8, layer));
    };
    poly('PAGE_FRAME', [
      { x: 0, y: 0 },
      { x: page.w, y: 0 },
      { x: page.w, y: page.h },
      { x: 0, y: page.h }
    ]);
    for (const p of polygons) poly('CUT', p);
    (g(0, 'ENDSEC'), g(0, 'EOF'));
    return out.join('\r\n') + '\r\n';
  }
  function cutSVG(polygons, page, printImage) {
    const d = polygons
      .map(p => 'M ' + p.map(pt => `${pt.x.toFixed(3)} ${pt.y.toFixed(3)}`).join(' L ') + ' Z')
      .join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.w}mm" height="${page.h}mm" viewBox="0 0 ${page.w} ${page.h}"><g id="print">${printImage ? `<image width="${page.w}" height="${page.h}" xlink:href="${printImage}" href="${printImage}"/>` : ''}</g><g id="cut" fill="none" stroke="#ff0000" stroke-width="0.1">${d ? `<path d="${d}"/>` : ''}</g></svg>`;
  }
  function instructions(machine, info) {
    const { sheet, paper, offset, decals, pages } = info;
    const head = `SlotForge Decals print & cut package
Sheet: ${sheet} · ${paper} · ${pages} ${pages === 1 ? 'page' : 'pages'}
Cut offset around artwork: ${offset} mm · ${decals} decal ${decals === 1 ? 'file' : 'files'}

Always print at Actual size / 100% (never "Fit to page"). Test on plain paper first.
The white border around each decal PNG marks the cut line. Inkjet printers print white
as no ink, so the border stays invisible on clear or white decal paper.
`;
    const steps = {
      silhouette: `
SILHOUETTE STUDIO (all editions, including the free Basic edition)

Option A - one decal at a time (simplest):
 1. Page Setup: choose your paper size and turn Registration Marks ON (Type 1 / default).
 2. File > Open (or drag in) a PNG from the "Decals" folder. Its size in mm is in the
    file name; check it in the Transform panel and type the exact size if needed.
 3. Open the Trace panel, select the trace area around the image, untick High Pass
    Filter, raise the Threshold until the whole decal including its white border is
    yellow, then choose "Trace Outer Edge".
 4. Add more decals and keep them inside the registration-mark area.
 5. Print from Studio (File > Print, actual size) on your decal paper, load the printed
    sheet on the mat, then Send: Studio detects the registration marks and cuts.

Option B - the complete sheet layout (exact positions):
 1. Page Setup: set the page to ${paper}, turn Registration Marks ON.
 2. File > Open "Sheet page 1.dxf" (Preferences > Import > DXF: "As-is").
 3. File > Merge "Sheet page 1.png". In the Transform panel set the PNG to exactly the
    page size and position 0, 0. Select the whole DXF (it contains a grey page frame),
    set it to the same page size and position 0, 0, then delete the page frame.
 4. Make sure no decal overlaps the registration marks (move or rearrange if needed),
    print from Studio, then cut with "Detect registration marks".
`,
      cricut: `
CRICUT DESIGN SPACE (Print Then Cut)

 1. Upload > Upload Image > choose the PNGs from the "Decals" folder. Keep the
    background (it is already transparent) and choose "Print Then Cut Image".
 2. On the canvas, set each image's width and height to the size in its file name
    (lock the proportions). Design Space cuts around the outer edge - the white border.
 3. A file name ending in "x4" means the sheet holds 4 copies: duplicate it.
 4. Make it! Print with "Use System Dialog" at 100% scale, then cut.
    Design Space limits the printable area (about 17 x 23 cm on A4 / Letter).
 The SVG files in "Sheet" hold the full layout with a red cut layer for editors that
 import SVG; Design Space users normally use the PNGs.
`,
      scanncut: `
BROTHER SCANNCUT

CanvasWorkspace Print to Cut (DX models):
 1. Activate Print to Cut, add registration marks, then import "Sheet page 1.svg".
    It contains the printed sheet and a red cut layer at exact size (${paper}).
 2. Keep the red outlines as cutting lines, print at actual size, then let the machine
    scan the registration marks and cut.
 Or import individual PNGs from the "Decals" folder and create cutting data around
 their outer edge (the white border).

Scanning a printed sheet (Direct Cut / Scan to Cut Data):
 Enable "Print cut lines in the PDF" in Decals, export the PDF, print it, then scan
 the sheet on the mat. The thin dark lines give the scanner a clear outline.
`
    };
    return head + (steps[machine] || '');
  }

  // ---- Browser rendering ----
  async function png(svg, wPx, hPx, background = null) {
    const img = new Image();
    img.src = Art.url(svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, wPx, hPx);
    }
    ctx.drawImage(img, 0, 0, wPx, hPx);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 1;
    return withDPI(new Uint8Array(await blob.arrayBuffer()));
  }
  const fontsCSS = p =>
    p.fonts.map(f => `@font-face{font-family:'${f.family}';src:url('${f.data}');}`).join('');
  const dataURL = bytes => {
    let binary = '';
    for (let n = 0; n < bytes.length; n += 8192)
      binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
    return 'data:image/png;base64,' + btoa(binary);
  };
  // One PNG per distinct decal: the artwork over a white shape along its cut line.
  async function decalFiles(p, progress) {
    const groups = new Map();
    for (const i of p.items) {
      if (DM.cutMode(i, p) === 'none') continue;
      const key = JSON.stringify({ ...i, id: '', x: 0, y: 0, page: 0, carPositions: null, locked: false });
      if (groups.has(key)) groups.get(key).count++;
      else groups.set(key, { item: i, count: 1 });
    }
    if (groups.size > 300) throw Error('Export at most 300 different decals at once.');
    const files = [];
    let n = 0;
    for (const { item, count } of groups.values()) {
      progress?.(`Preparing decal ${++n} of ${groups.size}…`);
      const polygons = await Cutlines.forItem(item, p, { pxPerMm: 20 }),
        b = DM.bounds(item);
      let x0 = b.x,
        y0 = b.y,
        x1 = b.x + b.w,
        y1 = b.y + b.h;
      for (const poly of polygons)
        for (const pt of poly)
          ((x0 = Math.min(x0, pt.x)),
            (y0 = Math.min(y0, pt.y)),
            (x1 = Math.max(x1, pt.x)),
            (y1 = Math.max(y1, pt.y)));
      const w = x1 - x0,
        h = y1 - y0,
        wPx = Math.max(1, Math.round(w * PX_PER_MM)),
        hPx = Math.max(1, Math.round(h * PX_PER_MM));
      const border = polygons.length ? `<path d="${Cutlines.pathData(polygons)}" fill="#ffffff"/>` : '';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="${x0} ${y0} ${w} ${h}" preserveAspectRatio="none"><style>${fontsCSS(p)}</style>${border}${Art.element(item, 'export' + n, 'colour')}</svg>`;
      const name = `${String(n).padStart(2, '0')} ${safe(item.name)}${count > 1 ? ' x' + count : ''} - ${mm(w)} x ${mm(h)} mm.png`;
      files.push({ path: 'Decals/' + name, data: await png(svg, wPx, hPx) });
    }
    return files;
  }
  async function sheetFiles(p, machine, progress) {
    const s = DM.size(p),
      files = [],
      wPx = Math.round(s.w * PX_PER_MM),
      hPx = Math.round(s.h * PX_PER_MM);
    for (let page = 0; page < p.pages; page++) {
      if (!p.items.some(i => i.page === page)) continue;
      progress?.(`Preparing sheet page ${page + 1}…`);
      const polygons = (await Cutlines.forPage(p, page, { pxPerMm: 20 })).flatMap(x => x.polygons);
      const print = await png(Art.sheet(p, page), wPx, hPx, '#ffffff'),
        label = `Sheet page ${page + 1}`;
      if (machine === 'silhouette') {
        files.push({ path: `Sheet/${label}.png`, data: print });
        files.push({ path: `Sheet/${label}.dxf`, data: dxf(polygons, s) });
      } else files.push({ path: `Sheet/${label}.svg`, data: cutSVG(polygons, s, dataURL(print)) });
    }
    return files;
  }
  async function build(p, machine, progress) {
    await Art.loadFonts(p.fonts);
    const files = [...(await decalFiles(p, progress)), ...(await sheetFiles(p, machine, progress))];
    const info = {
      sheet: p.name,
      paper: `${DM.pageFormat(p).label} ${p.orientation}`,
      offset: DM.cutSettings(p.cut).offset,
      decals: files.filter(f => f.path.startsWith('Decals/')).length,
      pages: p.pages
    };
    files.push({ path: 'INSTRUCTIONS.txt', data: instructions(machine, info).replace(/\n/g, '\r\n') });
    return files;
  }
  function open(project) {
    if (!project.items.length) throw Error('Add artwork to your sheet first.');
    const cut = DM.cutSettings(project.cut);
    showDialog(
      'Export for cutter',
      `Cut lines ${cut.mode === 'none' ? 'are switched off' : `${cut.mode === 'rect' ? 'are rectangles' : 'follow each decal'} with a ${cut.offset} mm offset`}. Change this under Print & cut.`,
      `${pageNote('export', 'Export for cutter saves a folder for your cutting machine.', 'Each decal becomes a 300 DPI picture with a white border along its cut line; the folder has step-by-step instructions for the software you choose.', 'Print on plain paper first, then open the folder in Silhouette Studio, Cricut Design Space or ScanNCut.')}<div class="cutter-choices" role="radiogroup" aria-label="Cutting method">${Object.entries(
        MACHINES
      )
        .map(
          ([key, m], n) =>
            `<label class="cutter-choice"><input type="radio" name="cutter" value="${key}" ${n === 0 ? 'checked' : ''}><strong>${m.label}</strong><small>${m.description}</small></label>`
        )
        .join(
          ''
        )}</div><p class="hint" id="cutter-note"></p><p class="hint">Each package is saved as a folder with an INSTRUCTIONS.txt for your machine. The cutter software adds its own registration marks.</p>`,
      '<button data-action="close">Cancel</button><button class="primary" id="cutter-go">Choose folder & export</button>',
      true
    );
    const note = () => {
      const machine = $('[name="cutter"]:checked').value;
      $('#cutter-note').textContent =
        machine === 'hand'
          ? 'Exports the PDF with thin cut lines printed around every decal.'
          : machine === 'silhouette'
            ? 'Decal PNGs with a white cut border, plus a page PNG and DXF cut lines for the exact layout.'
            : 'Decal PNGs with a white cut border, plus an SVG of each page with print and cut layers.';
      $('#cutter-go').textContent =
        machine === 'hand' ? 'Export PDF with cut lines' : 'Choose folder & export';
    };
    for (const r of $$('[name="cutter"]')) r.onchange = note;
    note();
    $('#cutter-go').onclick = async () => {
      const machine = $('[name="cutter"]:checked').value,
        button = $('#cutter-go');
      try {
        if (
          DM.cutSettings(project.cut).mode === 'none' &&
          project.items.every(i => !i.cutMode || i.cutMode === 'none')
        )
          throw Error('Cut lines are switched off. Choose a cut line under Print & cut first.');
        if (machine === 'hand') {
          closeDialog();
          return Studio.exportWithCutLines();
        }
        button.disabled = true;
        const snapshot = DM.clone(project);
        const files = await build(snapshot, machine, text => ($('#cutter-note').textContent = text));
        $('#cutter-note').textContent = 'Choose where to save the package…';
        const folder = await desktop.exportCutPackage({
          name: `${snapshot.name} - ${MACHINES[machine].folder}`,
          files
        });
        if (!folder) {
          note();
          button.disabled = false;
          return;
        }
        closeDialog();
        toast(`Cutter package saved with ${files.length} files. Open INSTRUCTIONS.txt for the steps.`);
      } catch (e) {
        $('#dialog-error').textContent = e.message;
        button.disabled = false;
      }
    };
  }
  return { MACHINES, safe, crc32, withDPI, dxf, cutSVG, instructions, build, open };
});
