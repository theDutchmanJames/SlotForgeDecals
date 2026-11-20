// Desktop check of the Workshop: the welcome page, saved sheets with thumbnails, search and order,
// open, rename, duplicate, pin, delete and recover, history and recovered copies, automatic
// preservation when switching, failed-save protection and the Workshop as start page.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'project-browser-' + Date.now());
  await fs.mkdir(run, { recursive: true });
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: path.join(run, 'workspace'),
    SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
    SLOTFORGE_EXPORT_DIR: path.join(run, 'exports'),
    // This test checks the Workshop as start page; other test runs open straight into the editor.
    SLOTFORGE_TEST_WORKSHOP: '1'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
      args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
      env
    });
  let app = await launch(),
    page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const editor = () => page.locator('nav [data-action="editor"]').click();
  const shown = () => page.evaluate(() => !document.querySelector('#workshop').hidden);
  const grid = () =>
    page.waitForFunction(() => document.querySelector('#ws-grid')?.dataset.loading === 'false');
  const workshop = async () => {
    await page.locator('nav [data-action="projects"]').click();
    await page.waitForSelector('.ws-card');
    await grid();
  };
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project)));
  const entries = () => page.evaluate(() => desktop.listProjects());
  const card = name =>
    page.locator('.ws-card').filter({ has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
  const idle = () => page.waitForFunction(() => !projectTask);
  const saveCurrent = async () => {
    if (await shown()) await editor();
    await page.locator('#sheet-menu-button').click();
    await page.locator('#sheet-menu [data-action="save-sheet"]').click();
    await page.waitForFunction(
      () => document.querySelector('#toast').textContent.startsWith('Saved to your sheets') && !projectTask
    );
  };
  const side = async name => {
    await card(name).click();
    await page.waitForFunction(n => document.querySelector('#ws-side h3')?.textContent === n, name);
  };
  const open = async name => {
    await side(name);
    await page.locator('#ws-side [data-ws="open"]').click();
  };
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.waitForFunction(() => window.Studio?.ready);
    // First start: the Workshop is the welcome page, with no sheets yet.
    assert(await shown());
    assert.match(await page.locator('#workshop h1').textContent(), /Your artwork/);
    assert.equal(await page.locator('.ws-card').count(), 0);
    await page.screenshot({ path: path.join(run, 'welcome.png') });
    await page.locator('#workshop [data-ws="blank"]').click();
    assert(!(await shown()));
    await page.evaluate(() => {
      const p = Studio.project;
      p.name = 'GT Sprint';
      p.items = [
        DM.item('svg', {
          id: 'badge',
          name: 'GT number',
          x: 20,
          y: 20,
          w: 20,
          h: 20,
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#e5484d"/><text x="20" y="68" font-size="52" fill="white" font-family="Arial">27</text></svg>'
        })
      ];
      Studio.select(['badge']);
    });
    await page.locator('#inspector [data-action="save-decal"]').click();
    await page.locator('#save-decal-confirm').click();
    await page.waitForFunction(() => !document.querySelector('#dialog').open);
    assert.equal(await page.evaluate(() => Studio.libraryCount), 1);
    await saveCurrent();
    assert.equal((await entries()).entries.length, 1);
    const original = await state();
    await page.locator('#prop-w').fill('25');
    await page.locator('#prop-w').press('Tab');
    await saveCurrent();
    assert.equal(
      (await page.evaluate(id => desktop.listProjects({ scope: 'history', projectId: id }), original.id))
        .entries.length,
      1
    );
    // The Workshop continues the open sheet; a blank sheet from it keeps the outgoing one.
    await workshop();
    assert.equal(await page.locator('#ws-current-name').textContent(), 'GT Sprint');
    await page.locator('[data-ws-paper="a5"]').click();
    await page.locator('#workshop [data-ws="blank"]').click();
    await page.waitForFunction(() => Studio.project.name === 'Untitled sheet' && !projectTask);
    assert.equal((await state()).pageSize, 'a5');
    assert(!(await shown()));
    assert.equal((await entries()).entries.length, 1);
    await page.locator('#project-name').click();
    await page.locator('#name-input').fill('Night Endurance');
    await page.locator('#name-submit').click();
    await page.locator('[data-action="shapes"]').click();
    await page.locator('[data-place=\"stripe\"]').click();
    await page.keyboard.press('Enter');
    await workshop();
    assert.equal(await page.locator('.ws-card').count(), 2);
    await page.locator('#ws-search').fill('GT');
    await page.waitForFunction(() => document.querySelectorAll('.ws-card').length === 1);
    await open('GT Sprint');
    await page.waitForFunction(() => Studio.project.name === 'GT Sprint' && !projectTask);
    assert(!(await shown()));
    assert.equal((await state()).items[0].w, 25);
    assert.ok(
      (await entries()).entries.some(e => e.name === 'Night Endurance'),
      'Switching preserved the outgoing sheet without a manual save'
    );
    const libraryBefore = await page.evaluate(async () =>
      JSON.stringify((await desktop.queryLibrary({ scope: 'decals' })).entries)
    );
    // History: an earlier version opens as a separate recovered copy.
    await workshop();
    await page.locator('#ws-search').fill('');
    await grid();
    await side('GT Sprint');
    await page.locator('#ws-history [data-recover-preview]').first().click();
    await page.waitForSelector('#recover-project');
    await page.locator('#recover-project').click();
    await page.waitForFunction(() => Studio.project.name.endsWith(' · recovered') && !projectTask);
    const recovered = await state();
    assert.notEqual(recovered.id, original.id);
    assert.equal(recovered.items[0].w, 20);
    assert.equal(
      await page.evaluate(async () =>
        JSON.stringify((await desktop.queryLibrary({ scope: 'decals' })).entries)
      ),
      libraryBefore
    );
    // Rename, duplicate and pin a saved sheet without opening it.
    await workshop();
    await side('Night Endurance');
    await page.locator('#ws-side [data-ws="rename"]').click();
    await page.locator('#name-input').fill('Night Endurance 24h');
    await page.locator('#name-submit').click();
    await page.waitForSelector('.ws-card h3:text-is("Night Endurance 24h")');
    await side('Night Endurance 24h');
    await page.locator('#ws-side [data-ws="duplicate"]').click();
    await page.waitForSelector('.ws-card h3:text-is("Night Endurance 24h copy")');
    assert.equal((await entries()).entries.filter(e => e.name.startsWith('Night Endurance 24h')).length, 2);
    await side('Night Endurance 24h');
    await page.locator('#ws-side [data-ws="pin"]').click();
    await page.locator('[data-ws-chip="pinned"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.ws-card').length === 1);
    assert.equal(await page.locator('.ws-card h3').textContent(), 'Night Endurance 24h');
    await page.locator('[data-ws-chip="all"]').click();
    // Delete moves a sheet out of the list; Recover a sheet brings it back as a copy.
    await side('Night Endurance 24h copy');
    await page.locator('#ws-side [data-ws="delete"]').click();
    await page.locator('#confirm').click();
    await page.waitForFunction(
      () => ![...document.querySelectorAll('.ws-card h3')].some(h => h.textContent.endsWith(' copy'))
    );
    assert.equal((await entries()).entries.filter(e => e.name.endsWith(' copy')).length, 0);
    await page.locator('#workshop [data-ws="recover"]').click();
    await page.locator('#ws-deleted [data-recover-preview]').first().click();
    await page.waitForSelector('#recover-project');
    await page.locator('#recover-project').click();
    await page.waitForFunction(
      () => Studio.project.name === 'Night Endurance 24h copy · recovered' && !projectTask
    );
    // The open sheet cannot be deleted.
    await workshop();
    await side(await page.evaluate(() => Studio.project.name));
    assert(await page.locator('#ws-side [data-ws="delete"]').isDisabled());
    // A legacy project gets a generated thumbnail; a bad file remains intact.
    const legacy = await page.evaluate(() => {
      const p = DM.project('Classic Stripes');
      p.items = [DM.item('stripe', { x: 15, y: 20, w: 60, h: 8, fill: '#245cc3', fill2: '#e5484d' })];
      return { format: 'slotforge-decals-sheet', version: 1, project: p };
    });
    await page.locator('#project-file').setInputFiles({
      name: 'Classic.sfsheet',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy))
    });
    await page.locator('#collection-confirm').click();
    await page.waitForFunction(() => !document.querySelector('#dialog').open);
    await workshop();
    await card('Classic Stripes').locator('img[src]').waitFor();
    await page.locator('#ws-sort').selectOption('name');
    await grid();
    const names = await page.locator('.ws-card h3').allTextContents();
    assert.deepEqual(
      names.slice(1),
      [...names.slice(1)].sort((a, b) => a.localeCompare(b))
    );
    assert(names.includes('Classic Stripes'));
    await page.screenshot({ path: path.join(run, 'workshop-dark.png') });
    await page.locator('[data-action="theme-light"]').click();
    await page.screenshot({ path: path.join(run, 'workshop-light.png') });
    await open('Classic Stripes');
    await page.waitForFunction(() => Studio.project.name === 'Classic Stripes' && !projectTask);
    assert.equal((await state()).items[0].w, 60);
    // Workspace rotation after preview must not change the version the user reviewed.
    await workshop();
    await page.locator('#workshop [data-ws="recover"]').click();
    await page.locator('#ws-snapshots [data-recover-preview]').first().click();
    await page.waitForSelector('#recover-project');
    const previewName = await page.locator('.dialog-head p').textContent();
    await page.evaluate(async () => {
      await Studio.flush();
      await Studio.flush();
      await Studio.flush();
    });
    await page.locator('#recover-project').click();
    await page.waitForFunction(() => !projectTask && !document.querySelector('#dialog').open);
    assert.equal((await state()).name, previewName + ' · recovered');
    assert.equal(
      await page.evaluate(async () =>
        JSON.stringify((await desktop.queryLibrary({ scope: 'decals' })).entries)
      ),
      libraryBefore
    );
    // A failed outgoing save must leave the active sheet unchanged.
    const beforeFailure = await state(),
      currentEntry = (await entries()).entries.find(e => e.id === beforeFailure.id),
      corrupt = require('./sqlite-fixture.cjs').corruptSheet(path.join(run, 'workspace'), currentEntry.file);
    await page.locator('#sheet-menu-button').click();
    await page.locator('#sheet-menu [data-action="new"]').click();
    await page.waitForFunction(
      () => !projectTask && document.querySelector('#toast').classList.contains('error')
    );
    assert.deepEqual(await state(), beforeFailure);
    corrupt.restore();
    await page.evaluate(() => Studio.flush());
    const saved = await state();
    await app.close();
    // Coming back: Decals opens on the Workshop with the sheet to continue, remembered order and pin.
    app = await launch();
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.waitForFunction(() => window.Studio?.ready);
    assert.deepEqual(await state(), saved);
    assert(await shown(), 'the Workshop is the start page');
    await page.waitForSelector('.ws-card');
    await grid();
    assert.equal(await page.locator('#ws-current-name').textContent(), saved.name);
    assert.equal(await page.locator('#ws-sort').inputValue(), 'name');
    assert.equal(await card('Night Endurance 24h').locator('.ws-pin').count(), 1);
    assert.ok((await page.locator('.ws-card').count()) >= 4);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 800));
    await page.screenshot({ path: path.join(run, 'workshop-compact.png') });
    await page.locator('#workshop [data-ws="blank"]').click();
    await idle();
    const blank = await state();
    await saveCurrent();
    assert.ok(
      (await entries()).entries.some(e => e.id === blank.id),
      'Explicitly saving a blank sheet creates a project too'
    );
    // The start page can be turned off in Settings.
    await page.locator('nav [data-action="settings"]').click();
    await page.locator('[data-sp-start="editor"]').click();
    await page.locator('nav [data-action="editor"]').click();
    await page.evaluate(() => Studio.flush());
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForFunction(() => window.Studio?.ready);
    assert(!(await shown()), 'with the setting off Decals opens in the editor');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          run,
          checks:
            'welcome page, Workshop start page and setting, thumbnails, search/order/pin, rename, duplicate, delete and recover, history and recovered copies, automatic preservation on switch/new, backup rotation after preview, unreadable files, failed-save protection, themes',
          errors
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
