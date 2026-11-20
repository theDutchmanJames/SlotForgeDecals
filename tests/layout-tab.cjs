// Desktop check of the Layout tab: aligning to the margins, exact spacing with its cutting-gap note,
// Repeat's overlap warning, Most that fit and Fill the free space, Pages, and Auto-arrange with a
// preview, scopes, order and mirrored pairs. Each change is one undo step.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'layout-tab-' + Date.now());
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
  const section = async key => {
    await page.locator('[data-right-tab="layout"]').click();
    if ((await page.locator(`[data-layout-open="${key}"]`).getAttribute('aria-expanded')) !== 'true')
      await page.locator(`[data-layout-open="${key}"]`).click();
  };
  const select = ids => page.evaluate(ids => Studio.select(ids), ids);
  const reset = () =>
    page.evaluate(() => {
      Studio.project.pages = 1;
      Studio.project.margin = 8;
      Studio.project.gap = 3;
      Studio.project.items = [
        DM.item('rect', { id: 'a', name: 'Alpha', x: 30, y: 40, w: 20, h: 10 }),
        DM.item('rect', { id: 'b', name: 'Bravo', x: 70, y: 44, w: 10, h: 10 }),
        DM.item('rect', { id: 'c', name: 'Charlie', x: 95, y: 41, w: 15, h: 10 }),
        DM.item('rect', { id: 'big', name: 'Big', x: 120, y: 150, w: 60, h: 40 })
      ];
      Studio.select([]);
    });
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();
    await reset();

    // The selection's Arrange… opens Align & space in the Layout tab, which stays forward.
    await select(['a']);
    await page.locator('.ctx-bar [data-action="arrange-selection"]').click();
    assert.equal(await page.locator('[data-right-tab="layout"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-layout-open="align"]').getAttribute('aria-expanded'), 'true');
    assert(
      await page.locator('[data-layout-operation="align-x-end"]').isDisabled(),
      'one decal aligns to nothing'
    );
    await page.locator('[data-align-to="margins"]').click();
    await page.locator('[data-layout-operation="align-x-end"]').click();
    const width = await page.evaluate(() => DM.size(Studio.project).w);
    assert.equal((await byId('a')).x + 20, width - 8, 'right margin');
    await page.locator('#undo').click();
    assert.equal((await byId('a')).x, 30);

    // Exact spacing, with the note comparing it to the cutting gap.
    await page.locator('[data-align-to="selection"]').click();
    await select(['a', 'b', 'c']);
    await page.locator('#space-gap').fill('2');
    assert.match(
      await page.locator('#space-note').textContent(),
      /Closer than the sheet’s 3\.0 mm cutting gap/
    );
    await page.locator('#space-gap').fill('6');
    assert.match(await page.locator('#space-note').textContent(), /safe to cut/);
    await page.locator('#space-apply').click();
    assert.deepEqual(
      (await items()).slice(0, 3).map(i => i.x),
      [30, 56, 72]
    );
    await page.screenshot({ path: path.join(run, 'align.png') });

    // Repeat: a copy that would land on another decal is called out before anything is added.
    await reset();
    await select(['big']);
    await section('repeat');
    await page.locator('[data-step="grid-columns"][data-by="-1"]').click();
    assert.equal(await page.locator('#grid-columns').inputValue(), '1');
    await page.locator('[data-step="grid-rows"][data-by="1"]').click();
    assert.equal(await page.locator('#grid-rows').inputValue(), '3');
    assert.match(await page.locator('#grid-summary').textContent(), /adds 2 decals/);
    await select(['a']);
    await page.locator('#grid-columns').fill('4');
    await page.locator('#grid-rows').fill('1');
    assert.match(await page.locator('#grid-summary').textContent(), /copies land on other decals/);
    assert.equal(await page.locator('#layout-ghosts > rect').count(), 3);
    // Most that fit fills the rows and columns up to the margins.
    await page.locator('#grid-fill-page').click();
    const max = await page.evaluate(() => Layout.maxGrid(Studio.project, ['a'], 3, 3));
    assert.equal(await page.locator('#grid-columns').inputValue(), String(max.columns));
    assert.equal(await page.locator('#grid-rows').inputValue(), String(max.rows));
    await page.locator('#grid-reset').click();
    assert.equal(await page.locator('#grid-columns').inputValue(), '2');
    // Fill the free space: copies everywhere they fit, never on another decal.
    const offered = Number((await page.locator('#grid-fill').textContent()).match(/\d+/)[0]);
    assert(offered > 20, 'offers ' + offered);
    await page.locator('#grid-fill').click();
    const filled = await items();
    assert.equal(filled.length, 4 + offered);
    assert.deepEqual(
      await page.evaluate(() => DM.warnings(Studio.project).filter(w => /overlap|gap/i.test(w.message || w))),
      []
    );
    await page.screenshot({ path: path.join(run, 'filled.png') });
    await page.locator('#undo').click();
    assert.equal((await items()).length, 4, 'one undo step');

    // Pages: move to a new page and back; click a page to go there.
    await select(['b', 'c']);
    await section('pages');
    await page.locator('#move-new').click();
    assert.equal(await page.evaluate(() => Studio.project.pages), 2);
    assert.equal((await byId('b')).page, 1);
    assert.match(await page.locator('.lt-page.current b').textContent(), /Page 2/);
    await page.locator('[data-goto-page="0"]').click();
    assert.match(await page.locator('.lt-page.current b').textContent(), /Page 1/);
    await page.locator('[data-goto-page="1"]').click();
    await select(['b', 'c']);
    await page.locator('[data-move-to="0"]').click();
    assert.equal((await byId('c')).page, 0);

    // Auto-arrange: the rail's Arrange opens it; a preview first, then one undoable change.
    await reset();
    await page.evaluate(() => {
      const copy = DM.item('rect', { id: 'a2', name: 'Alpha (mirrored)', x: 20, y: 250, w: 20, h: 10 });
      Studio.project.items.push(
        copy,
        DM.item('rect', { id: 'lock', name: 'Locked', x: 150, y: 60, w: 10, h: 10, locked: true })
      );
      Studio.select([]);
    });
    await page.locator('.tool-rail [data-action="arrange"]').click();
    assert.equal(await page.locator('[data-layout-open="pack"]').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#pack-after svg rect').count(), 7);
    assert.match(
      await page.locator('#pack-summary').textContent(),
      /5 decals · 1 page · \d+% of page 1 stays free/
    );
    const before = await items();
    await page.locator('[data-pack-scope="page"]').click();
    await page.locator('#pack-order').selectOption('largest');
    assert.equal(await page.locator('#pack-apply').textContent(), 'Arrange this page');
    assert.deepEqual(await items(), before, 'the preview changes nothing');
    await page.screenshot({ path: path.join(run, 'pack.png') });
    await page.locator('#pack-apply').click();
    const packed = await items(),
      big = packed.find(i => i.id === 'big'),
      a = packed.find(i => i.id === 'a'),
      a2 = packed.find(i => i.id === 'a2');
    assert.deepEqual(
      packed.find(i => i.id === 'lock'),
      before.find(i => i.id === 'lock')
    );
    assert.equal(big.x, 8, 'largest first, at the margin');
    assert.equal(a2.x, a.x + a.w + 3, 'the mirrored copy sits next to its original');
    assert.equal(a2.y, a.y);
    await page.locator('#undo').click();
    assert.deepEqual(await items(), before);
    // Only the selection.
    await select(['c']);
    await page.locator('[data-pack-scope="selection"]').click();
    await page.locator('#pack-apply').click();
    const only = await items();
    assert.deepEqual(
      only.find(i => i.id === 'big'),
      before.find(i => i.id === 'big')
    );
    assert.notDeepEqual(
      only.find(i => i.id === 'c'),
      before.find(i => i.id === 'c')
    );

    // A closed section stays closed; the tab is remembered.
    await page.locator('[data-layout-open="pack"]').click();
    assert.equal(await page.locator('.lt-sec.open').count(), 0);
    assert.equal(await page.evaluate(() => settings.layoutSection), 'none');
    assert.equal(await page.evaluate(() => settings.rightTab), 'layout');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'align to margins, exact spacing, repeat warning, most that fit, fill free space, pages, auto-arrange preview/scope/pairs'
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
