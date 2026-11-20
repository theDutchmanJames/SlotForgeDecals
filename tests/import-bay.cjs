// Desktop check of the import bay: choosing PDF pages with thumbnails, cropping them to their
// artwork, sizing from the car (door number pick), copies for both sides, and a bitmap taken through
// Clean up (plain background found) and Image or vector (traced as a logo) onto the sheet.
const { _electron: electron } = require('playwright'),
  { PDFDocument, rgb } = require('../src/pdf-lib.cjs'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'import-bay-' + Date.now());
  await fs.mkdir(run, { recursive: true });
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: path.join(run, 'workspace'),
    SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
    SLOTFORGE_EXPORT_DIR: path.join(run, 'exports')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
    args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
    env
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const items = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project.items)));
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();

    // A three-page PDF: thumbnails, two pages chosen, cropped to their artwork.
    const doc = await PDFDocument.create();
    for (const c of [rgb(0.85, 0.17, 0.17), rgb(0.11, 0.25, 0.56), rgb(0.95, 0.45, 0.1)]) {
      const p = doc.addPage([595.28, 841.89]);
      p.drawRectangle({ x: 100, y: 600, width: 170.08, height: 85.04, color: c }); // 60 × 30 mm
    }
    const pdf = path.join(run, 'Team pack.pdf');
    await fs.writeFile(pdf, await doc.save());
    await page.locator('#art-file').setInputFiles(pdf);
    await page.waitForSelector('[data-bay-page="3"]', { timeout: 40000 });
    assert.equal(await page.locator('[data-bay-page]').count(), 3);
    await page.waitForSelector('[data-bay-thumb="3"][src]', { timeout: 40000 });
    assert.equal(await page.locator('[data-bay-page][aria-pressed="true"]').count(), 1);
    await page.locator('[data-bay-page="3"]').click();
    assert.match(await page.locator('#dialog .dialog-foot .primary').textContent(), /Size the 2 decals/);
    await page.screenshot({ path: path.join(run, 'pages.png') });
    await page.locator('#dialog .dialog-foot .primary').click();
    await page.waitForSelector('#place-import', { timeout: 40000 });
    // Cropped to the artwork: the page's own 60 mm wide rectangle, not the 210 mm page.
    const own = Number(await page.locator('#import-width').inputValue());
    assert(Math.abs(own - 60) < 2, 'cropped to the artwork: ' + own);
    // Door number on a 140 mm 1:32 GT is 18 mm; both pages keep their sizes relative to each other.
    await page.locator('[data-size-pick="door"]').click();
    assert.equal(await page.locator('#import-width').inputValue(), '18.00');
    assert.match(await page.locator('#bay-quality').textContent(), /Vector/);
    await page.locator('[data-copies="2"]').click();
    assert.match(await page.locator('#place-import').textContent(), /Add 4 decals/);
    await page.screenshot({ path: path.join(run, 'size.png') });
    await page.locator('#place-import').click();
    await page.waitForFunction(
      () => Studio.project.items.length === 4 && !document.querySelector('#dialog').open
    );
    const placed = await items();
    assert.deepEqual(
      placed.map(i => Math.round(i.w)),
      [18, 18, 18, 18]
    );
    assert.equal(placed.filter(i => i.flipX).length, 2, 'two mirrored copies for the other side');
    assert.match(placed[0].name, /page 1$/);
    assert.match(placed[1].name, /page 3$/);

    // A bitmap with a plain background: Clean up offers to remove it, then trace it as a logo.
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 200;
      const x = c.getContext('2d');
      x.fillStyle = '#f1f1f1';
      x.fillRect(0, 0, 320, 200);
      x.fillStyle = '#d92b2b';
      x.fillRect(40, 40, 120, 120);
      x.fillStyle = '#1d3f8f';
      x.fillRect(190, 40, 90, 120);
      return c.toDataURL('image/png').split(',')[1];
    });
    const logo = path.join(run, 'Team logo.png');
    await fs.writeFile(logo, Buffer.from(png, 'base64'));
    await page.locator('#art-file').setInputFiles(logo);
    await page.waitForSelector('#prep-suggest-use');
    assert.match(await page.locator('#prep-suggest').textContent(), /#F1F1F1/);
    await page.locator('#prep-suggest-use').click();
    await page.waitForFunction(() =>
      /background pixels removed/.test(document.querySelector('#prep-status').textContent)
    );
    assert(!/^0 background/.test(await page.locator('#prep-status').textContent()));
    await page.locator('#dialog .dialog-foot .primary').click();
    await page.waitForSelector('[data-trace-choice="image"][aria-pressed="true"]');
    await page.locator('[data-trace-choice="logo"]').click();
    await page.waitForFunction(
      () => !document.querySelector('#dialog .dialog-foot .primary').disabled,
      null,
      {
        timeout: 50000
      }
    );
    await page.locator('#dialog .dialog-foot .primary').click();
    await page.waitForSelector('#place-import');
    await page.locator('#import-width').fill('30');
    await page.locator('#place-import').click();
    await page.waitForFunction(() => Studio.project.items.length === 5);
    const traced = (await items())[4];
    assert.equal(traced.kind, 'svg');
    assert.ok(traced.traceSource?.src?.startsWith('data:image/png'), 'the cleaned-up bitmap is kept');
    assert.equal(Math.round(traced.w), 30);
    assert.match(await page.locator('#inspector .artwork-badge').textContent(), /vector/i);

    // Cancel leaves the sheet as it was.
    await page.locator('#art-file').setInputFiles(logo);
    await page.waitForSelector('#cancel-import');
    await page.locator('#cancel-import').click();
    await page.waitForFunction(() => !document.querySelector('#dialog').open);
    assert.equal((await items()).length, 5);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks: 'PDF pages, crop to artwork, size picks, copies, clean up suggestion, trace as logo, cancel'
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
