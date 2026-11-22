// Desktop checks for paths the coverage map (scripts/coverage.cjs) showed no test ran: closing the
// window saves the last change (also one made a moment before), a failed save on closing keeps
// the window open with a trouble card, Change model scale converts decals and car positions and
// undoes in one step, and a decal dragged in from the library lands where it was dropped at the
// sheet's scale.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'coverage-gaps-' + Date.now());
  await fs.mkdir(run, { recursive: true });
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: path.join(run, 'workspace'),
    SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
    SLOTFORGE_EXPORT_DIR: path.join(run, 'exports'),
    SLOTFORGE_TEST_CLOSE_GUARD: '1'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = async () => {
    const app = await electron.launch({
      executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
      args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
      env
    });
    const page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.stack || e.message));
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    return { app, page };
  };
  const closeWindow = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  const errors = [];
  let { app, page } = await launch();
  try {
    await page.locator('#workshop [data-ws="blank"]').click();

    // A save that fails while closing: the window stays open and says what to do.
    await page.evaluate(() => {
      window.realFlush = window.flush;
      window.flush = () => Promise.reject(Error('The disk is full (test).'));
      mutate(() => (Studio.project.name = 'Not saved yet'));
    });
    await closeWindow(app);
    await page.getByText('Your latest changes could not be saved').waitFor();
    assert.match(await page.locator('#dialog').textContent(), /The disk is full/);
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
      'still open'
    );

    // Change model scale: 1:32 → 1:24 makes the selected decal bigger, moves car positions, and is one undo step.
    const scale = await page.evaluate(() => {
      window.flush = window.realFlush;
      closeDialog();
      const a = DM.item('rect', {
          id: 'a',
          x: 20,
          y: 20,
          w: 24,
          h: 12,
          carPositions: { side: { x: 30, y: 6 } }
        }),
        b = DM.item('rect', { id: 'b', x: 80, y: 20, w: 10, h: 10, carPositions: { top: { x: 12, y: 3 } } });
      mutate(() => (Studio.project.items = [a, b]));
      Studio.select(['a']);
      return { length: Studio.project.preview.length, steps: history.length };
    });
    await page.evaluate(() => actions.scale());
    await page.locator('#new-scale').fill('24');
    assert(await page.locator('#rescale-art').isChecked(), 'resizes the selection by default');
    await page.locator('#apply-scale').click();
    const scaled = await page.evaluate(() => {
      const [a, b] = Studio.project.items;
      return {
        scale: Studio.project.scale,
        a,
        b,
        length: Studio.project.preview.length,
        steps: history.length
      };
    });
    const k = 32 / 24;
    assert.equal(scaled.scale, 24);
    assert.equal(Math.round(scaled.a.w * 1000), Math.round(24 * k * 1000), 'selected decal resized');
    assert.equal(scaled.b.w, 10, 'unselected decal keeps its size');
    assert.equal(
      Math.round(scaled.a.carPositions.side.x * 1000),
      Math.round(30 * k * 1000),
      'car position follows'
    );
    assert.equal(Math.round(scaled.b.carPositions.top.x * 1000), Math.round(12 * k * 1000));
    assert.equal(Math.round(scaled.length * 1000), Math.round(scale.length * k * 1000), 'car length follows');
    assert.equal(scaled.steps, scale.steps + 1, 'one undo step');
    await page.evaluate(() => actions.undo());
    assert.equal(await page.evaluate(() => Studio.project.scale), 32);
    assert.equal(await page.evaluate(() => Studio.project.items[0].w), 24);

    // A library decal dropped on the sheet lands at the drop point, at the sheet's scale.
    const dropped = await page.evaluate(async () => {
      const saved = await desktop.saveDecal({
        decal: {
          id: 'drop-me',
          name: 'Dropped badge',
          tags: '',
          scale: 24,
          art: DM.item('ellipse', { x: 0, y: 0, w: 15, h: 15 })
        },
        fonts: []
      });
      const paper = document.querySelector('#paper'),
        box = paper.getBoundingClientRect(),
        data = new DataTransfer();
      data.setData('application/x-slotforge-decal', saved.file || 'drop-me');
      paper.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientX: box.x + box.width * 0.6,
          clientY: box.y + box.height * 0.5
        })
      );
      for (let n = 0; n < 100 && !Studio.project.items.some(i => i.libraryId === 'drop-me'); n++)
        await new Promise(r => setTimeout(r, 30));
      const i = Studio.project.items.find(i => i.libraryId === 'drop-me'),
        w = DM.size(Studio.project).w;
      return i && { w: i.w, cx: (i.x + i.w / 2) / w, name: i.name };
    });
    assert(dropped, 'the decal was added');
    assert.equal(dropped.name, 'Dropped badge');
    assert.equal(
      Math.round(dropped.w * 1000),
      Math.round(15 * (24 / 32) * 1000),
      'resized from 1:24 to 1:32'
    );
    assert(Math.abs(dropped.cx - 0.6) < 0.15, 'placed near the drop point, not at the top-left');

    // A damaged font says which font it is, instead of the browser's bare "NetworkError".
    const font = await page.evaluate(() =>
      Art.loadFonts([
        { family: 'sf-font-broken', name: 'Broken Sans', data: 'data:font/ttf;base64,AAAAAAAA' }
      ]).then(
        () => 'loaded',
        e => e.message
      )
    );
    assert.match(font, /The font “Broken Sans” could not be read/);

    // Closing right after an edit (before the autosave pause is over) still saves it.
    await page.evaluate(() => mutate(() => (Studio.project.name = 'Saved on close')));
    const closed = app.waitForEvent('close');
    await closeWindow(app);
    await closed;
    ({ app, page } = await launch());
    assert.equal(await page.evaluate(() => Studio.project.name), 'Saved on close');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'failed save on close keeps the window, change model scale and undo, library drop, save on close'
      })
    );
  } finally {
    await app.close().catch(() => {});
  }
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
