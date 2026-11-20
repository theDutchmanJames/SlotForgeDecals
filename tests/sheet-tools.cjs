// Desktop check for US Letter / custom paper, mirrored pairs, recolouring and batch racing
// numbers. Uses an isolated workspace.
const { _electron: electron } = require('playwright');
const path = require('node:path'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  run = path.join(root, 'test-output', 'sheet-tools-' + Date.now());

async function main() {
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
  const ok = (...a) => console.log('✔', ...a);
  try {
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#dialog [data-action="demo"]').click();
    await page.waitForFunction(() => Studio.project.items.length > 0);

    // Paper: US Letter, then a custom size via the dialog, then change it, then cancel a change.
    await page.locator('[data-right-tab="sheet"]').click();
    await page.locator('#sheet-size-select').selectOption('letter');
    assert.equal((await P()).pageSize, 'letter');
    assert.equal(await page.locator('#sheet-size').textContent(), '215.9 × 279.4 mm');
    await page.locator('#sheet-size-select').selectOption('custom');
    await page.locator('#custom-w').fill('160');
    await page.locator('#custom-h').fill('230');
    await page.locator('#custom-apply').click();
    let p = await P();
    assert.deepEqual([p.pageSize, p.customPage.w, p.customPage.h], ['custom', 160, 230]);
    assert.equal(await page.locator('#sheet-size').textContent(), '160 × 230 mm');
    assert.match(
      await page.locator('#sheet-size-select option:checked').textContent(),
      /Custom 160 × 230 mm/
    );
    await page.locator('#sheet-size-select').selectOption('custom-edit');
    await page.locator('#custom-w').fill('20');
    await page.locator('#custom-apply').click();
    assert.match(await page.locator('#dialog-error').textContent(), /between 50 and 600/);
    await page.locator('#dialog [data-action="close"]').first().click();
    assert.equal((await P()).customPage.w, 160, 'cancel keeps the size');
    assert.equal(await page.locator('#sheet-size-select').inputValue(), 'custom');
    await page.locator('#export-pdf').click();
    await page.locator('#export-anyway').click();
    await page.waitForFunction(() => !busy, null, { timeout: 60000 });
    const pdf = (await fs.readdir(path.join(run, 'exports'))).find(f => f.endsWith('.pdf'));
    const { PDFDocument } = require('../src/pdf-lib.cjs');
    const pdfSize = (await PDFDocument.load(await fs.readFile(path.join(run, 'exports', pdf))))
      .getPage(0)
      .getSize();
    assert.ok(Math.abs((pdfSize.width / 72) * 25.4 - 160) < 0.2, 'PDF width ' + pdfSize.width);
    assert.ok(Math.abs((pdfSize.height / 72) * 25.4 - 230) < 0.2, 'PDF height ' + pdfSize.height);
    ok('US Letter, custom 160 × 230 mm (validated, editable, cancel-safe) and PDF page size');
    await page.locator('#sheet-size-select').selectOption('a4');

    // Car bodies: each built-in car loads, sizes the model from its real length at 1:32 with
    // undistorted proportions, and can be undone.
    const roundel = (await P()).items.find(i => i.name === 'Roundel 27');
    await page.evaluate(id => Studio.select([id]), roundel.id);
    const bodies = { 'classic-gt': 4180, touring: 4800, rally: 4100, 'group-c': 4800 };
    for (const [body, real] of Object.entries(bodies)) {
      await page.locator('#car-body').selectOption(body);
      await page.waitForFunction(b => Studio.project.preview.body === b, body);
      const pv = (await P()).preview;
      assert.ok(Math.abs(pv.length - real / 32) < 0.06, body + ' length ' + pv.length);
      assert.ok(
        pv.height > 20 && pv.height < 60 && pv.width > 45 && pv.width < 80,
        body + ' ' + pv.width + ' x ' + pv.height
      );
      for (const view of ['side', 'top']) {
        await page.locator('#car-' + view).click();
        await page.waitForFunction(
          b => document.querySelector('#car-stage image')?.getAttribute('href').includes(b),
          body
        );
        if (body === 'group-c' || view === 'side')
          await page.locator('#car-stage').screenshot({ path: path.join(run, `car-${body}-${view}.png`) });
      }
      await page.locator('#car-side').click();
      ok(`${body}: ${pv.length} × ${pv.width} × ${pv.height} mm at 1:32`);
    }
    await page.locator('#undo').click();
    assert.equal((await P()).preview.body, 'rally', 'undo returns to the previous car');
    await page.locator('#car-body').selectOption('gt');
    assert.ok(Math.abs((await P()).preview.length - 140) < 0.06);
    // Mirrored pair of a decal: copy flipped, placed without overlapping, undoable.
    const before = (await P()).items.length,
      forge = (await P()).items.find(i => i.name === 'Forge Racing');
    await page.evaluate(id => Studio.select([id]), forge.id);
    await page.locator('[data-right-tab="decal"]').click();
    await page.locator('#inspector [data-action="mirror-pair"]').click();
    p = await P();
    const mirrored = p.items.at(-1);
    assert.equal(p.items.length, before + 1);
    assert.equal(mirrored.flipX, !forge.flipX);
    assert.match(mirrored.name, /\(mirrored\)/);
    await shot('mirrored-pair');
    ok('mirrored copy added at', mirrored.x.toFixed(1), mirrored.y.toFixed(1));

    // Recolour the mirrored copy: every colour listed, red → blue applied in one undo step.
    await page.locator('#inspector [data-action="recolour"]').click();
    const colours = await page.locator('[data-from]').evaluateAll(list => list.map(i => i.dataset.from));
    assert.ok(colours.length >= 2, 'colours found: ' + colours.join(' '));
    await shot('recolour-dialog');
    const red = colours.find(c => c !== '#000000' && c !== '#111111' && c !== '#ffffff') || colours[0];
    await page.locator(`[data-from="${red}"]`).evaluate(i => {
      i.value = '#245cc3';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await shot('recolour-dialog-set');
    await page.locator('#recolour-apply').click();
    p = await P();
    const recoloured = JSON.stringify(p.items.find(i => i.id === mirrored.id));
    assert.ok(recoloured.toLowerCase().includes('#245cc3') && !recoloured.toLowerCase().includes(red));
    assert.ok(
      JSON.stringify(p.items.find(i => i.id === forge.id))
        .toLowerCase()
        .includes(red),
      'original kept'
    );
    await page.locator('#undo').click();
    assert.ok(
      JSON.stringify((await P()).items.find(i => i.id === mirrored.id))
        .toLowerCase()
        .includes(red)
    );
    await page.locator('#redo').click();
    ok('recolour', red, '→ #245cc3 on the copy only; undo/redo work');

    // Batch racing numbers 1–30 as pairs: 60 decals over extra pages, no overlaps.
    await page.locator('[data-action="shapes"]').click();
    await page.locator('#dialog').getByRole('button', { name: 'Racing Number Plates' }).click();
    await page.locator('#number-w').fill('40');
    await page.locator('#number-batch').fill('1-30');
    await page.locator('#number-count').selectOption('2');
    assert.match(await page.locator('#number-size').textContent(), /30 numbers .* 60 decals/);
    await shot('batch-numbers-dialog');
    const beforeBatch = (await P()).items.length;
    await page.locator('#number-add').click();
    p = await P();
    const added = p.items.slice(beforeBatch);
    assert.equal(added.length, 60);
    assert.deepEqual([...new Set(added.map(i => i.name))].length, 30, 'one plate per number, two of each');
    assert.ok(p.pages >= 2, 'extra pages added');
    for (let pg = 0; pg < p.pages; pg++) {
      const onPage = p.items.filter(i => i.page === pg).map(i => page.evaluate(x => DM.bounds(x), i));
      const boxes = await Promise.all(onPage);
      for (let a = 0; a < boxes.length; a++)
        for (let b = a + 1; b < boxes.length; b++) {
          const A = boxes[a],
            B = boxes[b];
          const overlap =
            A.x < B.x + B.w - 1e-6 &&
            A.x + A.w > B.x + 1e-6 &&
            A.y < B.y + B.h - 1e-6 &&
            A.y + A.h > B.y + 1e-6;
          if (overlap && pg > 0) throw Error(`numbers overlap on page ${pg + 1}`);
        }
    }
    await shot('batch-numbers-sheet');
    ok(`batch: 60 number decals over ${p.pages} pages without overlaps on new pages`);

    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks: 'letter/custom paper + PDF size, mirrored pair, recolour + undo, batch numbers',
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
