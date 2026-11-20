const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'collections-' + Date.now());
  await fs.mkdir(run, { recursive: true });
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: path.join(run, 'workspace'),
    SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
    SLOTFORGE_EXPORT_DIR: path.join(run, 'exports')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = (overrides = {}) =>
    electron.launch({
      executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
      args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
      env: { ...env, ...overrides }
    });
  let app = await launch(),
    page = await app.firstWindow();
  const errors = [];
  const attach = async () => {
    page.on('pageerror', e => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.showInactive();
      w.setSize(1100, 800);
    });
    await page.waitForFunction(() => window.Studio?.ready);
  };
  const close = () => page.locator('#dialog [data-action="close"]').first().click();
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project)));
  const confirm = async () => {
    await page.locator('#collection-confirm').click();
    await page.waitForFunction(() => !document.querySelector('#dialog').open);
  };
  // Saved sheets live in the Workshop page.
  const browser = async () => {
    await page.locator('nav [data-action="projects"]').click();
    await page.waitForSelector('.ws-card');
  };
  const sheetsLoaded = n =>
    page.waitForFunction(
      n =>
        document.querySelector('#ws-grid')?.dataset.loading === 'false' &&
        document.querySelectorAll('.ws-card').length === n,
      n
    );
  const sheetCard = name =>
    page.locator('.ws-card').filter({ has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
  const card = name =>
    page
      .locator('.collection-item')
      .filter({ has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
  // Saved decals live on the Decal Library page.
  const shelfCard = name =>
    page
      .locator('#shelf .sh-card')
      .filter({ has: page.locator('.sh-meta b', { hasText: new RegExp('^' + name + '$') }) });
  const shelfLoaded = () =>
    page.waitForFunction(() => document.querySelector('#shelf-body')?.dataset.loading === 'false');
  try {
    await attach();
    await page.locator('#workshop [data-ws="blank"]').click();
    await page.evaluate(async () => {
      const p = Studio.project;
      p.name = 'Zulu Current';
      p.pageSize = 'a5';
      p.pages = 3;
      p.items = [
        DM.item('rect', { page: 0 }),
        DM.item('stripe', { page: 1 }),
        DM.item('text', { page: 2, text: 'RACING' })
      ];
      page = 2;
      Studio.select([p.items[2].id]);
      for (const name of ['Alfa Sprint', 'Bravo Endurance']) {
        const q = DM.project(name);
        q.pageSize = 'photo4x6';
        q.items = [DM.item('ellipse', { name })];
        await desktop.saveProject({ project: q });
      }
    });
    await page
      .locator('#font-file')
      .setInputFiles(
        process.env.TEST_FONT ||
          (process.platform === 'win32'
            ? 'C:/Windows/Fonts/arial.ttf'
            : process.platform === 'darwin'
              ? '/System/Library/Fonts/Supplemental/Arial.ttf'
              : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
      );
    await page.waitForFunction(() => Studio.project.fonts.length === 1);
    await page.locator('#sheet-menu-button').click();
    await page.locator('#sheet-menu [data-action="save-sheet"]').click();
    await page.waitForFunction(() => !projectTask);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => !projectTask);
    assert.equal((await fs.readdir(path.join(run, 'exports')).catch(() => [])).length, 0);
    const original = await state();
    // Print & share: the Share & back up step holds sharing, importing and the backup.
    await page.locator('nav [data-action="sharing"]').click();
    await page.locator('.pp-step[data-pp-step="share"]').click();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(t => setTheme(t), theme);
      const styles = await page.locator('.pp-card').evaluateAll(cards =>
        cards.map(b => ({
          bg: getComputedStyle(b).backgroundColor,
          colour: getComputedStyle(b.querySelector('p')).color,
          title: getComputedStyle(b.querySelector('h3')).color
        }))
      );
      assert.equal(styles.length, 7);
      // Cards follow the theme: titles use the normal ink colour (the accent is only for main actions).
      const tokens = await page.evaluate(() => {
        const probe = document.createElement('span');
        document.body.append(probe);
        const read = v => ((probe.style.color = 'var(' + v + ')'), getComputedStyle(probe).color);
        const out = { accent: read('--accent'), ink: read('--ink') };
        probe.remove();
        return out;
      });
      for (const b of styles) {
        if (theme === 'dark') assert.notEqual(b.bg, 'rgb(255, 255, 255)', 'dark cards are not white');
        assert.equal(b.title, tokens.ink);
      }
      await page.screenshot({ path: path.join(run, 'sharing-' + theme + '.png') });
    }
    await page.locator('nav [data-action="editor"]').click();
    await browser();
    await page.locator('#ws-sort').selectOption('name');
    await sheetsLoaded(3);
    await page.screenshot({ path: path.join(run, 'workshop-sheets.png') });
    // The open sheet comes first, then the saved ones by name.
    assert.deepEqual(await page.locator('.ws-card h3').allTextContents(), [
      'Zulu Current',
      'Alfa Sprint',
      'Bravo Endurance'
    ]);
    assert(await page.locator('#ws-share-picked').isHidden());
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await sheetCard('Zulu Current').click({ modifiers: ['Shift'] });
    await sheetCard('Alfa Sprint').click({ modifiers: [mod] });
    await sheetCard('Bravo Endurance').click({ modifiers: [mod] });
    assert.match(await page.locator('#ws-picked').textContent(), /^3 sheets selected/);
    await sheetCard('Bravo Endurance').click({ modifiers: [mod] });
    assert.match(await page.locator('#ws-picked').textContent(), /^2 sheets selected/);
    assert.deepEqual(await state(), original);
    // Searching keeps the chosen sheets chosen.
    await page.locator('#ws-search').fill('Alfa');
    await sheetsLoaded(1);
    await page.locator('#ws-search').fill('');
    await sheetsLoaded(3);
    assert.match(await page.locator('#ws-picked').textContent(), /^2 sheets selected/);
    await page.locator('#ws-share-picked').click();
    await page.waitForSelector('#collection-confirm');
    await page.waitForFunction(
      () => document.querySelector('#collection-items')?.dataset.loading === 'false'
    );
    assert.equal(await page.locator('[data-select]:checked').count(), 2);
    await card('Zulu Current').locator('[data-pages]').click();
    await card('Zulu Current').locator('[data-page-index="0"]').uncheck();
    await card('Zulu Current').locator('[data-page-index="1"]').uncheck();
    await confirm();
    const file = path.join(run, 'exports', 'My sheet collection.sfsheet'),
      shared = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(shared.format, 'slotforge-decals-sheets');
    assert.equal(shared.sheets.length, 2);
    const zulu = shared.sheets.find(e => e.project.name === 'Zulu Current').project;
    assert.equal(zulu.pages, 1);
    assert.equal(zulu.items[0].text, 'RACING');
    assert.equal(zulu.items[0].page, 0);
    assert.equal(zulu.fonts.length, 1);
    assert.deepEqual(await state(), original);
    // Import only one collection member, without changing the active sheet.
    await page.locator('#project-file').setInputFiles(file);
    await card('Alfa Sprint').locator('[data-select]').uncheck();
    await confirm();
    assert.deepEqual(await state(), original);
    let all = (await page.evaluate(() => desktop.listProjects())).entries;
    assert.equal(all.length, 4);
    const copy = all.find(e => e.name === 'Zulu Current' && e.id !== original.id);
    assert(copy);
    assert.equal(copy.pages, 1);
    await page.locator('#project-file').setInputFiles(file);
    await confirm();
    all = (await page.evaluate(() => desktop.listProjects())).entries;
    assert.equal(all.length, 6);
    assert.equal(new Set(all.map(e => e.id)).size, 6);
    // Legacy single-sheet export, page selection on import, and a blank template.
    await page.locator('nav [data-action="editor"]').click();
    await page.locator('#print-menu-button').click();
    await page.locator('#print-menu [data-action="export-sheet"]').click();
    await confirm();
    const single = path.join(run, 'exports', 'Zulu Current.sfsheet');
    assert.deepEqual(JSON.parse(await fs.readFile(single, 'utf8')).project, original);
    await page.locator('#project-file').setInputFiles(single);
    await page.locator('[data-pages]').click();
    await page.locator('[data-page-index="0"]').uncheck();
    await confirm();
    assert((await page.evaluate(() => desktop.listProjects())).entries.some(e => e.pages === 2));
    const blank = await page.evaluate(() => ({ ...DM.project(), pageSize: 'a5', scale: 43, margin: 8 }));
    await page.locator('#project-file').setInputFiles({
      name: 'blank.sfsheet',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'slotforge-decals-sheet', version: 2, project: blank }))
    });
    await confirm();
    const blankEntry = (await page.evaluate(() => desktop.listProjects())).entries.find(
      e => e.name === 'Untitled sheet'
    );
    assert(blankEntry);
    assert.deepEqual(await state(), original);
    await page.evaluate(e => openProjectEntry(e), blankEntry);
    await page.evaluate(() => {
      Studio.project.margin = 11;
    });
    const corrupt = require('./sqlite-fixture.cjs').corruptSheet(
        path.join(run, 'workspace'),
        blankEntry.file
      ),
      beforeFailure = await state();
    await page.locator('#sheet-menu-button').click();
    await page.locator('#sheet-menu [data-action="new"]').click();
    await page.waitForFunction(
      () => !projectTask && document.querySelector('#toast').classList.contains('error')
    );
    assert.deepEqual(await state(), beforeFailure);
    corrupt.restore();
    await page.locator('#sheet-menu-button').click();
    await page.locator('#sheet-menu [data-action="new"]').click();
    await page.waitForFunction(() => !projectTask);
    const refreshed = (await page.evaluate(() => desktop.listProjects())).entries.find(
      e => e.id === blankEntry.id
    );
    assert.equal((await page.evaluate(e => desktop.readProject(e), refreshed)).project.margin, 11);
    // Decal selections use the same controls; only selected decals travel.
    await page.evaluate(async () => {
      await Library.import(
        ['Alfa Badge', 'Bravo Badge', 'Charlie Badge'].map((name, n) => ({
          id: DM.uid(),
          name,
          scale: 32,
          art: DM.item('rect', { name, w: 10 + n })
        })),
        []
      );
    });
    const beforeDecals = await state();
    await page.locator('nav [data-action="library"]').click();
    await page.locator('#shelf-sort').selectOption('name');
    await shelfLoaded();
    await page.locator('#shelf-select').click();
    await shelfCard('Bravo Badge').locator('.sh-pv').click();
    assert.equal(await page.locator('#shelf-picked').textContent(), '1 selected');
    assert.deepEqual(await state(), beforeDecals);
    await page.locator('[data-shelf-act="export-picked"]').click();
    await page.waitForFunction(
      () => document.querySelector('#collection-items')?.dataset.loading === 'false'
    );
    assert.equal(await page.locator('[data-select]:checked').count(), 1);
    await confirm();
    const decalFile = path.join(run, 'exports', 'Bravo Badge.sfdecal');
    assert.equal(JSON.parse(await fs.readFile(decalFile, 'utf8')).decals.length, 1);
    await page.locator('#pack-file').setInputFiles(decalFile);
    await confirm();
    assert.equal(await page.evaluate(() => Studio.libraryCount), 4);
    await page.locator('nav [data-action="library"]').click();
    await page.locator('#shelf-sort').selectOption('name-desc');
    await shelfLoaded();
    assert.equal(await page.locator('#shelf .sh-card').count(), 4);
    await page.screenshot({ path: path.join(run, 'decal-library.png') });
    await page.locator('nav [data-action="editor"]').click();
    // Backups cannot be restored accidentally through Import Decals.
    const backup = await page.evaluate(() => assetsSnapshot()),
      backupFile = {
        name: 'workspace.sfbackup',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup))
      };
    await page.locator('#pack-file').setInputFiles(backupFile);
    await page.waitForFunction(() =>
      document.querySelector('#toast').textContent.includes('own import options')
    );
    assert.deepEqual(await state(), beforeDecals);
    await page.locator('nav [data-action="settings"]').click();
    await page.locator('#legacy-backups summary').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#settings-page [data-alias="restore-backup"]').click();
    await (await chooser).setFiles(backupFile);
    await page.waitForSelector('#confirm');
    assert.match(await page.locator('#dialog h2').textContent(), /Restore workspace backup/);
    await close();
    await page.locator('nav [data-action="editor"]').click();
    // Failed or cancelled export keeps the picker and current work intact.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('library-export');
      ipcMain.handle('library-export', () => null);
    });
    await page.locator('#print-menu-button').click();
    await page.locator('#print-menu [data-action="export-sheet"]').click();
    await page.locator('#collection-confirm').click();
    await page.waitForFunction(() =>
      document.querySelector('#toast').textContent.startsWith('Sheet export cancelled')
    );
    assert(await page.locator('#dialog').isVisible());
    await close();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('library-export');
      ipcMain.handle('library-export', () => {
        throw Error('Simulated write failure');
      });
    });
    await page.locator('#print-menu-button').click();
    await page.locator('#print-menu [data-action="export-sheet"]').click();
    await page.locator('#collection-confirm').click();
    await page.waitForFunction(() =>
      document.querySelector('#dialog-error').textContent.includes('Simulated write failure')
    );
    assert.deepEqual(await state(), beforeDecals);
    await close();
    await page.evaluate(() => Studio.flush());
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await attach();
    await page.locator('nav [data-action="library"]').click();
    assert.equal(
      await page.locator('#shelf-sort').inputValue(),
      'name-desc',
      'the library remembers its order'
    );
    assert.equal(await page.evaluate(() => Studio.libraryCount), 4);
    await page.locator('nav [data-action="editor"]').click();
    await browser();
    assert.equal(await page.locator('#ws-sort').inputValue(), 'name', 'the Workshop remembers its order');
    assert.deepEqual(errors, []);
    await page.locator('nav [data-action="editor"]').click();
    await page.evaluate(() => setTheme('dark'));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 720));
    await page.locator('nav [data-action="library"]').click();
    await shelfLoaded();
    await page.locator('#shelf .sh-card .sh-pv').first().click();
    await page.waitForSelector('#shelf-name');
    await page.screenshot({ path: path.join(run, 'decal-library-dark.png') });
    // The details panel keeps Add to sheet in view on a small window.
    const foot = await page.locator('.sh-acts').boundingBox();
    assert(foot.y + foot.height <= (await page.evaluate(() => innerHeight)));
    await page.locator('nav [data-action="editor"]').click();
    // Another installation can import the collection and edit the embedded-font page.
    await app.close();
    app = await launch({
      SLOTFORGE_WORKSPACE: path.join(run, 'recipient-workspace'),
      SLOTFORGE_TEST_PROFILE: path.join(run, 'recipient-profile')
    });
    page = await app.firstWindow();
    await attach();
    await page.locator('#workshop [data-ws="blank"]').click();
    const recipientBefore = await state();
    await page.locator('#project-file').setInputFiles(file);
    await confirm();
    assert.deepEqual(await state(), recipientBefore);
    const received = (await page.evaluate(() => desktop.listProjects())).entries;
    assert.equal(received.length, 2);
    await page.evaluate(
      e => openProjectEntry(e),
      received.find(e => e.name === 'Zulu Current')
    );
    assert.equal((await state()).fonts[0].data, zulu.fonts[0].data);
    assert.equal((await state()).items[0].text, 'RACING');
    assert.equal(await page.evaluate(() => Studio.libraryCount), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'themed import/export columns in both themes, shared libraries, sort and view persistence, checkbox/Ctrl/Shift selection, hidden selections, multi-sheet editable collections, selected pages, embedded fonts, legacy/blank imports, independent identities, current-sheet preservation, decal selection round trips, failed/cancelled exports and restart',
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
