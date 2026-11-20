// Desktop check of the Car page: every decal listed with where it sits, placing by button and by
// dragging from the list, moving and resizing on the car (one undo step, Esc cancels), taking a
// decal off, and Your car: bodies, measurements, and measuring your own photo from two pins.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'car-page-' + Date.now());
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
  page.on('pageerror', e => errors.push(e.stack || e.message));
  const items = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project.items)));
  const byId = async id => (await items()).find(i => i.id === id);
  const preview = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project.preview)));
  // Screen point of a car position in millimetres, on one view.
  const at = (view, x, y) =>
    page.locator(`[data-cp-svg="${view}"]`).evaluate(
      (svg, [x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
        return { x: p.x, y: p.y };
      },
      [x, y]
    );
  const badges = id =>
    page
      .locator(`[data-cp-item="${id}"] .cp-st span`)
      .evaluateAll(list => list.map(s => s.textContent + (s.classList.contains('on') ? '+' : '-')));
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();
    await page.evaluate(() => {
      Studio.project.items = [
        DM.item('rect', { id: 'num', name: 'Number', x: 20, y: 20, w: 18, h: 18, fill: '#e5484d' }),
        DM.item('rect', { id: 'logo', name: 'Logo', x: 60, y: 20, w: 30, h: 10, fill: '#2f8cff' }),
        DM.item('rect', { id: 'lock', name: 'Locked', x: 100, y: 20, w: 10, h: 10, locked: true })
      ];
      Studio.select([]);
    });

    // The Car page from the top bar: every decal listed, none on the car yet.
    await page.locator('nav [data-action="car-page"]').click();
    await page.waitForSelector('[data-cp-svg="side"] image');
    assert(await page.locator('.wb-body').isHidden());
    assert.equal(await page.locator('[data-cp-item]').count(), 3);
    assert.deepEqual(await badges('num'), ['SIDE-', 'TOP-']);
    assert.match(await page.locator('#cp-insp').textContent(), /Pick a decal/);

    // Place by button: centred on the side view.
    await page.locator('[data-cp-item="num"]').click();
    await page.locator('[data-cp-place="side"]').click();
    let num = await byId('num');
    const length = (await preview()).length;
    assert(Math.abs(num.carPositions.side.x + 9 - length * 0.49) < 0.01, JSON.stringify(num.carPositions));
    assert.deepEqual(await badges('num'), ['SIDE+', 'TOP-']);
    assert.equal(await page.locator('[data-cp-svg="side"] [data-cp-id="num"]').count(), 1);

    // Drag from the list onto the top view (simulated drag and drop gets a second try).
    for (let attempt = 0; attempt < 2; attempt++) {
      const target = await at('top', 70, 30),
        box = await page.locator('[data-cp-svg="top"]').boundingBox();
      await page.locator('[data-cp-item="logo"]').dragTo(page.locator('[data-cp-svg="top"]'), {
        targetPosition: { x: target.x - box.x, y: target.y - box.y }
      });
      if ((await byId('logo')).carPositions?.top) break;
      assert(attempt === 0, 'dragging a decal from the list places it');
    }
    const logo = await byId('logo');
    assert(Math.abs(logo.carPositions.top.x - 55) < 1 && Math.abs(logo.carPositions.top.y - 25) < 1);
    assert.equal(await page.locator('.cp-title').textContent(), 'Logo', 'the dropped decal is chosen');

    // Move on the car: one undo step; Esc during a drag puts it back.
    await page.locator('[data-cp-item="num"]').click();
    num = await byId('num');
    const s0 = num.carPositions.side,
      from = await at('side', s0.x + 9, s0.y + 9),
      to = await at('side', s0.x + 19, s0.y + 4);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    num = await byId('num');
    assert(
      Math.abs(num.carPositions.side.x - s0.x - 10) < 0.2 &&
        Math.abs(num.carPositions.side.y - s0.y + 5) < 0.2
    );
    assert.equal(num.x, 20, 'the sheet position stays');
    const moved = num.carPositions.side;
    const again = await at('side', moved.x + 9, moved.y + 9);
    await page.mouse.move(again.x, again.y);
    await page.mouse.down();
    await page.mouse.move(again.x + 60, again.y + 20, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.deepEqual((await byId('num')).carPositions.side, moved);
    await page.keyboard.press('Control+z');
    assert.deepEqual((await byId('num')).carPositions.side, s0);
    await page.keyboard.press('Control+Shift+z');
    assert.deepEqual((await byId('num')).carPositions.side, moved);

    // Resize by a corner keeps proportions; that is the printed size on the sheet too.
    const corner = await at('side', moved.x + 18, moved.y + 18),
      bigger = await at('side', moved.x + 27, moved.y + 27);
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(bigger.x, bigger.y, { steps: 6 });
    assert.match(await page.locator('#cp-live').textContent(), /27 × 27 mm/);
    await page.mouse.up();
    num = await byId('num');
    assert(Math.abs(num.w - 27) < 0.2 && Math.abs(num.h - 27) < 0.2, JSON.stringify([num.w, num.h]));
    assert.deepEqual(num.carPositions.side, moved, 'the opposite corner stays');
    assert.equal(await page.locator('#cp-w').inputValue(), String(num.w));
    await page.screenshot({ path: path.join(run, 'livery.png') });

    // Take off the car: by button for one view, by Delete for all of them.
    await page.locator('[data-cp-item="logo"]').click();
    await page.locator('[data-cp-off="top"]').click();
    assert.equal((await byId('logo')).carPositions, undefined);
    await page.locator('[data-cp-item="num"]').click();
    await page.keyboard.press('Delete');
    assert.equal((await byId('num')).carPositions, undefined);
    assert.equal((await items()).length, 3, 'the decals stay on the sheet');
    await page.keyboard.press('Control+z');
    assert((await byId('num')).carPositions.side);
    // A locked decal cannot be placed.
    await page.locator('[data-cp-item="lock"]').click();
    assert(await page.locator('[data-cp-place="side"]').isDisabled());
    assert(await page.locator('#cp-w').isDisabled());

    // Your car: a body sizes the model from the real car; measurements can be typed.
    await page.locator('#cp-car').click();
    await page.locator('[data-cp-body="touring"]').click();
    await page.waitForFunction(() => Studio.project.preview.body === 'touring');
    assert.equal((await preview()).length, 150, '4800 mm at 1:32');
    await page.locator('#cp-length').fill('152.5');
    await page.locator('#cp-length').press('Enter');
    assert.equal((await preview()).length, 152.5);
    await page.locator('[data-cp-scale="24"]').click();
    assert(await page.locator('#apply-scale').isVisible(), 'the scale goes through the scale window');
    await page.locator('#dialog [data-action="close"]').first().click();
    await page.screenshot({ path: path.join(run, 'your-car.png') });

    // Measure your own photo: pin the nose and the tail, type the length.
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1000;
      c.height = 400;
      const x = c.getContext('2d');
      x.fillStyle = '#56606b';
      x.fillRect(0, 0, 1000, 400);
      x.fillStyle = '#e5484d';
      x.fillRect(100, 150, 800, 150);
      CarPage.measurePhoto('side', c.toDataURL('image/png'), 1000, 400);
    });
    const photo = await page.locator('#cp-photo').boundingBox();
    assert(await page.locator('#cp-measure-apply').isDisabled());
    await page.mouse.click(photo.x + photo.width * 0.1, photo.y + photo.height / 2);
    await page.mouse.click(photo.x + photo.width * 0.9, photo.y + photo.height / 2);
    await page.locator('#cp-measure-length').fill('140');
    assert.match(await page.locator('#cp-measure-facts').textContent(), /800 px apart/);
    await page.screenshot({ path: path.join(run, 'measure.png') });
    await page.locator('#cp-measure-apply').click();
    const own = await preview();
    assert.equal(own.length, 140);
    assert(
      Math.abs(own.side.bounds.x - 100) < 2 && Math.abs(own.side.bounds.w - 800) < 3,
      JSON.stringify(own.side.bounds)
    );
    assert(Math.abs(own.height - 70) < 0.5, 'the picture is 400 px high: 70 mm at 800 px = 140 mm');
    assert.match(await page.locator('#cp-car').textContent(), /Your own car/);
    await page.locator('#cp-included').click();
    await page.waitForFunction(() => Studio.project.preview.length === 150);
    assert.equal((await preview()).side, null);

    // Other pages replace the Car page; the fit check's gear opens Your car.
    await page.locator('nav [data-action="projects"]').click();
    assert(await page.locator('#car-page').isHidden());
    await page.locator('nav [data-action="editor"]').click();
    await page.locator('#car-folder [data-action="car-settings"]').click();
    assert(await page.locator('#cp-garage').isVisible());
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'list and badges, place, drag from the list, move/undo/Esc, corner resize, take off, locks, bodies, measurements, measure a photo'
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
