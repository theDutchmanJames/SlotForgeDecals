// Desktop checks for the fixes from the full app review (2026-11-20): Auto-arrange and Undo never
// use an old state (also once history is full), the Layout tab's page cards move the editor,
// arrow-key repeats are one undo step, free space for numbers, Back/Forward on the same page,
// SVG blend modes and hidden layers, white ink for long sheets and see-through decals, fonts once
// in the print file, and the pixel worker tracing the same cut contour as the main thread.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'full-review-' + Date.now());
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
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();

    // History at its 200-step limit: Arrange and the fill count still use the sheet as it is now.
    const limits = await page.evaluate(() => {
      Studio.project.items = [
        DM.item('rect', { id: 'a', name: 'Alpha', x: 20, y: 20, w: 20, h: 10 }),
        DM.item('rect', { id: 'big', name: 'Big', x: 150, y: 250, w: 10, h: 10 })
      ];
      Studio.select(['a']);
      LayoutTab.show('repeat');
      render();
      while (history.length < 200) history.push(DM.clone(Studio.project));
      mutate(() => Object.assign(Studio.project.items[1], { x: 10, y: 40, w: 180, h: 200 }));
      const shown = Number(document.querySelector('#grid-fill').textContent.match(/\d+$/)[0]),
        truth = Layout.fill(Studio.project, ['a'], 200).copies;
      LayoutTab.show('pack');
      render();
      mutate(() => Object.assign(Studio.project.items[0], { fill: '#00ff00', name: 'Renamed' }));
      document.querySelector('#pack-apply').click();
      const a = Studio.project.items.find(i => i.id === 'a');
      return { shown, truth, fill: a.fill, name: a.name, history: history.length };
    });
    assert.equal(limits.shown, limits.truth, 'fill count follows the sheet');
    assert.equal(limits.fill, '#00ff00', 'Arrange keeps the recolour');
    assert.equal(limits.name, 'Renamed', 'Arrange keeps the rename');

    // A notice's Undo refuses once another change came after it, also with history full.
    await page.evaluate(() => {
      Studio.project.items = [
        DM.item('rect', { id: 'a', name: 'Alpha', x: 20, y: 20, w: 20, h: 10 }),
        DM.item('rect', { id: 'b', name: 'Bravo', x: 60, y: 20, w: 20, h: 10 })
      ];
      Studio.select(['a']);
      render();
    });
    await page.locator('[data-right-tab="decal"]').click();
    await page.keyboard.press('Delete');
    const stale = page.locator('#toast');
    await page.evaluate(() => Studio.select(['b']));
    await page.keyboard.press('ArrowRight');
    await stale.locator('button', { hasText: 'Undo' }).click();
    assert.match(await stale.textContent(), /Other changes came after this one/);
    assert.equal(await page.evaluate(() => Studio.project.items.length), 1, 'nothing was undone');

    // Delete with nothing selected adds no undo step; arrow repeats join the first press.
    const steps = await page.evaluate(() => {
      Studio.select([]);
      const before = history.at(-1);
      actions.delete();
      const empty = history.at(-1) === before;
      Studio.select(['b']);
      const at = history.length < 200 ? history.length : null,
        top = history.at(-1),
        key = repeat =>
          document.body.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', repeat, bubbles: true })
          );
      key(false);
      const first = history.at(-1);
      for (let n = 0; n < 6; n++) key(true);
      return {
        empty,
        oneStep: history.at(-1) === first && first !== top && (at === null || history.length === at + 1),
        y: Studio.project.items.find(i => i.id === 'b').y
      };
    });
    assert(steps.empty, 'no empty undo step');
    assert(steps.oneStep, 'holding an arrow is one undo step');
    assert.equal(steps.y, 27, 'all seven presses moved it');

    // Back swaps with the decal below it on the same page, not with one on another page.
    const order = await page.evaluate(() => {
      Studio.project.pages = 2;
      Studio.project.items = [
        DM.item('rect', { id: 'A', x: 20, y: 20, page: 0 }),
        DM.item('rect', { id: 'C', x: 20, y: 20, page: 1 }),
        DM.item('rect', { id: 'B', x: 30, y: 30, page: 0 })
      ];
      render();
      Studio.select(['B']);
      actions.backward();
      return Studio.project.items.map(i => i.id).join('');
    });
    assert.equal(order, 'BCA');

    // The Layout tab's page cards move the editor to that page.
    await page.evaluate(() => LayoutTab.show('pages'));
    await page.locator('[data-goto-page="1"]').click();
    assert.equal(await page.locator('#paper .sheet-item[data-id="C"]').count(), 1, 'the sheet shows page 2');
    await page.locator('[data-goto-page="0"]').click();

    // A racing number added in free space does not land on a decal at the top-left.
    const number = await page.evaluate(() => {
      Studio.project.pages = 1;
      Studio.project.items = [
        DM.item('rect', { id: 'corner', x: Studio.project.margin, y: Studio.project.margin, w: 40, h: 30 })
      ];
      render();
      numberCommit(DM.item('rect', { name: 'Number', w: 20, h: 15 }), 1);
      numberCommit(DM.item('rect', { name: 'Pair', w: 20, h: 15 }), 2);
      return DM.warnings(Studio.project).filter(w => w.type === 'spacing').length;
    });
    assert.equal(number, 0, 'numbers keep clear of other decals');

    // Imports: blend modes are kept, hidden layers stay hidden.
    const svg = await page.evaluate(
      () =>
        Art.sanitize(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g style="mix-blend-mode:multiply"><rect width="5" height="5"/></g><g display="none"><rect width="9" height="9" fill="red"/></g><text xml:space="preserve" dx="1">A  B</text></svg>'
        ).svg
    );
    assert.match(svg, /mix-blend-mode:\s*multiply/);
    assert.match(svg, /display="none"/);
    assert.match(svg, /dx="1"/);

    // White ink: long custom sheets fit the plate; see-through decals still get their white;
    // white-only parts inside groups show on the proof.
    const white = await page.evaluate(async () => {
      const p = DM.validateProject({
        ...DM.project('Long'),
        pageSize: 'custom',
        customPage: { w: 210, h: 330 },
        whiteInk: true
      });
      const faint = DM.item('rect', { x: 20, y: 20, w: 30, h: 20, ink: 'colour+white', opacity: 0.4 }),
        child = DM.item('rect', { x: 0, y: 0, w: 10, h: 10, ink: 'white-only' });
      p.items = [faint, DM.group([child, DM.item('rect', { x: 15, y: 0, w: 10, h: 10, ink: 'white-only' })])];
      p.items[1].x = 80;
      const masks = await Art.masks(p);
      const bits = atob(masks[0].bits),
        stride = Math.ceil(masks[0].width / 8),
        k = masks[0].width / 210,
        row = Math.round(30 * k),
        col = Math.round(35 * k);
      return {
        width: masks[0].width,
        height: masks[0].height,
        whiteUnderFaint: !(bits.charCodeAt(row * stride + (col >> 3)) & (128 >> (col & 7))),
        proof: Art.sheet(p, 0, true).includes('#bf36a8')
      };
    });
    assert(white.width <= 7100 && white.height <= 7100, 'plate within the PDF limit');
    assert.equal(white.height, 7100);
    assert(white.whiteUnderFaint, 'a 40% decal still prints its white');
    assert(white.proof, 'white-only parts in a group show on the proof');

    // The print file holds each used font once, and not the unused ones.
    const fonts = await page.evaluate(() => {
      const p = DM.project('Fonts');
      p.pages = 3;
      p.fonts = [
        { family: 'sf-font-used', name: 'Used', data: 'data:font/ttf;base64,AAAA' },
        { family: 'sf-font-unused', name: 'Unused', data: 'data:font/ttf;base64,BBBB' }
      ];
      p.items = [0, 1, 2].map(n => DM.item('text', { text: 'Go', font: 'sf-font-used', page: n }));
      const html = Art.printHTML(p);
      return { faces: html.split('@font-face').length - 1, unused: html.includes('sf-font-unused') };
    });
    assert.deepEqual(fonts, { faces: 1, unused: false });

    // The pixel worker traces exactly the contour the main thread would.
    const contour = await page.evaluate(async () => {
      const w = 120,
        h = 80,
        mask = new Uint8Array(w * h);
      for (let y = 20; y < 60; y++) for (let x = 10; x < 50; x++) mask[y * w + x] = 1;
      for (let y = 30; y < 50; y++) for (let x = 70; x < 100; x++) mask[y * w + x] = 1;
      const here = Cutlines.contourFromMask(mask, w, h, 10, 5, 5, 1.5),
        there = await PixelWork.run({
          job: 'contour',
          mask: mask.slice().buffer,
          w,
          h,
          k: 10,
          x: 5,
          y: 5,
          offset: 1.5
        });
      return { same: JSON.stringify(here) === JSON.stringify(there), loops: here.length };
    });
    assert(contour.same && contour.loops >= 1, 'worker contour matches');

    await page.screenshot({ path: path.join(run, 'editor.png') });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'arrange and fill at the history limit, stale notice undo, delete nothing, arrow repeats, back on the same page, layout page cards, numbers in free space, SVG blend and hidden layers, long white plate, faint white, proof in groups, fonts once, worker contour'
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
