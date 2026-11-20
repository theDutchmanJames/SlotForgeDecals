// Desktop check of making artwork on the canvas: a stripe dragged to a measured size, text placed
// by a click and typed on the sheet, racing numbers dropped where clicked, Recolour in the Decal tab,
// and Edit vector over the sheet with its shape list.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'make-tools-' + Date.now());
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
  // Screen position of a point on the sheet, in millimetres.
  const at = (x, y) =>
    page.locator('#paper').evaluate(
      (svg, [x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
        return { x: p.x, y: p.y };
      },
      [x, y]
    );
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();
    await page.locator('#snap').uncheck({ force: true });

    // Shape flyout: drag a rectangle from 20 to 100 mm across.
    await page.locator('.tool-rail [data-flyout="shape"]').click();
    assert(await page.locator('#make-flyout').isVisible());
    assert((await page.locator('#make-flyout [data-place]').count()) >= 12);
    await page.locator('[data-place="rect"]').click();
    const a = await at(20, 40),
      b = await at(100, 70);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
    await page.mouse.move(b.x, b.y, { steps: 5 });
    assert.match(await page.locator('#place-dims').textContent(), /^80 × 30 mm$/);
    await page.screenshot({ path: path.join(run, 'drawing.png') });
    await page.mouse.up();
    await page.waitForFunction(() => Studio.project.items.length === 1);
    let r = (await items())[0];
    assert.equal(r.kind, 'rect');
    assert(Math.abs(r.w - 80) < 0.2 && Math.abs(r.h - 30) < 0.2, JSON.stringify([r.w, r.h]));
    assert(Math.abs(r.x - 20) < 0.2 && Math.abs(r.y - 40) < 0.2);
    assert(await page.locator('#make-flyout').isHidden(), 'the flyout closes after placing');
    assert.equal(await page.evaluate(() => CanvasTools.active), null);

    // Text flyout: a sponsor style, clicked onto the sheet and typed there.
    await page.locator('.tool-rail [data-flyout="text"]').click();
    await page.locator('[data-text-style="sponsor"]').click();
    const t = await at(60, 120);
    await page.mouse.click(t.x, t.y);
    await page.waitForSelector('#text-inline');
    assert(await page.locator('#text-bar').isVisible());
    await page.keyboard.type('FORGE TEAM');
    await page.locator('#text-bar-bold').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'text-inline', 'typing keeps focus');
    await page.screenshot({ path: path.join(run, 'typing.png') });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#text-inline'));
    let text = (await items())[1];
    assert.equal(text.kind, 'text');
    assert.equal(text.text, 'FORGE TEAM');
    assert.equal(text.bold, false, 'the bold button toggled the sponsor style off');
    assert.equal(text.italic, true);
    assert(text.x < 60 && text.x + text.w > 60, 'placed where clicked');
    // Double-click types on the sheet again; the change is one undo step.
    const c = await at(text.x + text.w / 2, text.y + text.h / 2);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForSelector('#text-inline');
    await page.keyboard.press('End');
    await page.keyboard.type(' 27');
    await page.keyboard.press('Escape');
    assert.equal((await items())[1].text, 'FORGE TEAM 27');
    await page.locator('#undo').click();
    assert.equal((await items())[1].text, 'FORGE TEAM');

    // Number flyout: a batch of two plates in a row from the clicked point.
    await page.locator('.tool-rail [data-flyout="number"]').click();
    await page.locator('[data-number-style="plate"]').click();
    await page.locator('#number-batch').fill('44, 51');
    await page.locator('#number-place').click();
    const n = await at(30, 180);
    await page.mouse.click(n.x, n.y);
    await page.waitForFunction(() => Studio.project.items.length === 4);
    const plates = (await items()).slice(2);
    assert.deepEqual(
      plates.map(p => p.name),
      ['Number plate 44', 'Number plate 51']
    );
    assert(
      plates.every(p => Math.abs(p.y - plates[0].y) < 0.01),
      'one row'
    );
    assert(plates[1].x > plates[0].x);

    // Recolour in the Decal tab: the plates' white background becomes yellow at once.
    await page.evaluate(() => Studio.select(Studio.project.items.slice(2).map(i => i.id)));
    await page.locator('#recolour-sec [data-recolour-from="#ffffff"]').click();
    await page.locator('#recolour-other').evaluate(i => {
      i.value = '#f5c400';
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('[data-recolour-from="#f5c400"]'));
    assert((await items()).slice(2).every(p => JSON.stringify(p).includes('#f5c400')));
    await page.screenshot({ path: path.join(run, 'recolour.png') });
    await page.locator('#undo').click();
    assert(!(await items()).slice(2).some(p => JSON.stringify(p).includes('#f5c400')));

    // Edit vector over the sheet: the shape list removes the white background.
    await page.evaluate(() => {
      const i = DM.item('svg', {
        name: 'Logo',
        w: 30,
        h: 15,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect id="bg" width="20" height="10" fill="#ffffff"/><circle id="dot" cx="10" cy="5" r="4" fill="#e5484d"/></svg>'
      });
      Studio.project.items.push(i);
      Studio.select([i.id]);
    });
    await page.locator('[data-action="edit-vector"]').click();
    await page.waitForSelector('#vector-lens');
    assert.equal(await page.locator('#vector-shapes [data-vector-node]').count(), 2);
    await page.locator('#vector-shapes [data-vector-drop]').first().click();
    assert.equal(await page.locator('#vector-shapes [data-vector-node]').count(), 1);
    await page.screenshot({ path: path.join(run, 'vector.png') });
    await page.locator('#vector-apply').click();
    await page.waitForFunction(() => !document.querySelector('#vector-lens'));
    assert.match((await items()).at(-1).svg, /display: none/);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks: 'drag to draw, text on the sheet, numbers where clicked, recolour, edit vector'
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
