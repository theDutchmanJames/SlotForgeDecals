// Desktop check for print & cut: sheet preview, per-decal override, cutter packages for
// Silhouette / Cricut / ScanNCut, and PDF cut lines. Uses an isolated workspace.
const { _electron: electron } = require('playwright');
const path = require('node:path'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  run = path.join(root, 'test-output', 'print-cut-' + Date.now()),
  exportsDir = path.join(run, 'exports');

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true }))
    out.push(...(e.isDirectory() ? await walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  return out;
}
// PNG width/height and DPI from the pHYs chunk.
async function pngInfo(file) {
  const b = await fs.readFile(file);
  let dpi = null;
  for (let at = 8; at < b.length;) {
    const len = b.readUInt32BE(at),
      type = b.toString('latin1', at + 4, at + 8);
    if (type === 'pHYs') dpi = Math.round(b.readUInt32BE(at + 8) * 0.0254);
    if (type === 'IEND') break;
    at += 12 + len;
  }
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), dpi };
}

async function main() {
  await fs.mkdir(run, { recursive: true });
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: path.join(run, 'workspace'),
    SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
    SLOTFORGE_EXPORT_DIR: exportsDir
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
    args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
    env,
    timeout: 30000
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1600, 1000);
    w.showInactive();
  });
  const shot = n => page.screenshot({ path: path.join(run, n + '.png') });
  const P = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project)));
  try {
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#dialog [data-action="demo"]').click();
    await page.waitForFunction(() => Studio.project.items.length > 0);
    const decals = (await P()).items.length;

    // Preview: dashed cut lines appear for the page (shape mode, 1 mm by default).
    await page.locator('#cut-folder summary').click();
    assert.equal(await page.locator('#cut-mode').inputValue(), 'shape');
    assert.equal(await page.locator('#cut-offset').inputValue(), '1');
    await page.waitForSelector('#cut-preview-layer', { timeout: 20000 });
    const subpaths = await page
      .locator('#cut-preview-layer')
      .evaluate(p => p.getAttribute('d').split('M').length - 1);
    assert.ok(subpaths >= decals, `one or more cut lines per decal (${subpaths} for ${decals})`);
    await shot('sheet-shape-cut-lines');

    // Rectangle mode and a per-decal override, both undoable sheet edits.
    await page.locator('#cut-mode').selectOption('rect');
    assert.equal((await P()).cut.mode, 'rect');
    await page.waitForFunction(
      n => (document.querySelector('#cut-preview-layer')?.getAttribute('d').split('M').length || 0) - 1 === n,
      decals
    );
    await page.locator('#undo').click();
    assert.equal((await P()).cut.mode, 'shape');
    const first = (await P()).items[0].id;
    await page.evaluate(id => Studio.select([id]), first);
    await page.locator('#inspector summary', { hasText: 'Text & appearance' }).click();
    await page.locator('#cut-override').selectOption('none');
    assert.equal((await P()).items.find(i => i.id === first).cutMode, 'none');

    // Cutter packages for each machine.
    const packages = {};
    for (const machine of ['silhouette', 'cricut', 'scanncut']) {
      await page.locator('#cut-folder [data-action="cutter-export"]').click();
      await page.locator(`[name="cutter"][value="${machine}"]`).check();
      if (machine === 'silhouette') await shot('cutter-dialog');
      await page.locator('#cutter-go').click();
      await page.waitForFunction(() => !document.querySelector('#dialog').open, null, { timeout: 120000 });
      const folders = (await fs.readdir(exportsDir)).filter(n => !packages[n] && !n.endsWith('.pdf'));
      const folder = folders.find(n => !Object.values(packages).includes(n));
      packages[machine] = folder;
      const files = await walk(path.join(exportsDir, folder));
      const rel = files.map(f => path.relative(path.join(exportsDir, folder), f).replace(/\\/g, '/'));
      assert.ok(rel.includes('INSTRUCTIONS.txt'), machine + ' instructions');
      const pngs = rel.filter(f => f.startsWith('Decals/'));
      // The overridden decal has no cut line and is left out; identical copies are merged (xN).
      assert.ok(
        pngs.length >= 3 && pngs.some(f => / x\d+ - /.test(f)),
        machine + ' decal files: ' + pngs.join(', ')
      );
      for (const f of pngs) {
        const info = await pngInfo(path.join(exportsDir, folder, f)),
          [, w, h] = / - ([\d.]+) x ([\d.]+) mm\.png$/.exec(f).map(Number);
        assert.equal(info.dpi, 300, f + ' DPI');
        assert.ok(Math.abs((info.w / 300) * 25.4 - w) < 0.2, `${f} width ${info.w}px`);
        assert.ok(Math.abs((info.h / 300) * 25.4 - h) < 0.2, `${f} height ${info.h}px`);
      }
      if (machine === 'silhouette') {
        assert.ok(rel.includes('Sheet/Sheet page 1.png') && rel.includes('Sheet/Sheet page 1.dxf'));
        const sheet = await pngInfo(path.join(exportsDir, folder, 'Sheet/Sheet page 1.png'));
        assert.deepEqual([sheet.w, sheet.h, sheet.dpi], [2480, 3508, 300], 'A4 at 300 DPI');
        const dxf = await fs.readFile(path.join(exportsDir, folder, 'Sheet/Sheet page 1.dxf'), 'utf8');
        const polylines = dxf.match(/\r\nPOLYLINE\r\n/g).length;
        assert.ok(polylines >= decals, `${polylines} polylines (page frame + cut lines)`);
      } else {
        const svg = await fs.readFile(path.join(exportsDir, folder, 'Sheet/Sheet page 1.svg'), 'utf8');
        assert.ok(svg.includes('width="210mm" height="297mm"') && svg.includes('<g id="cut"'));
        assert.ok(svg.includes('data:image/png;base64,'), 'print layer image');
      }
      console.log(`✔ ${machine}: ${rel.length} files in "${folder}"`);
    }
    // Copy one decal PNG next to the screenshots for a visual check of the white border.
    const silhouetteFiles = await walk(path.join(exportsDir, packages.silhouette, 'Decals'));
    await fs.copyFile(silhouetteFiles[0], path.join(run, 'decal-sample.png'));

    // By hand: PDF with printed cut lines (setting switched on via the dialog).
    await page.locator('#cut-folder [data-action="cutter-export"]').click();
    await page.locator('[name="cutter"][value="hand"]').check();
    await page.locator('#cutter-go').click();
    await page.waitForSelector('#export-anyway');
    assert.equal((await P()).cut.pdfLines, true);
    await page.locator('#export-anyway').click();
    await page.waitForFunction(() => !busy, null, { timeout: 60000 });
    const pdfs = (await fs.readdir(exportsDir)).filter(n => n.endsWith('.pdf'));
    assert.equal(pdfs.length, 1);
    const pdfSize = (await fs.stat(path.join(exportsDir, pdfs[0]))).size;
    console.log(`✔ PDF with cut lines: ${pdfs[0]} (${Math.round(pdfSize / 1024)} KB)`);
    await shot('after-export');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'cut preview, rect mode + undo, per-decal override, Silhouette/Cricut/ScanNCut packages (DPI, mm sizes, DXF, SVG), PDF cut lines',
        errors
      })
    );
  } finally {
    await app.close();
  }
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
