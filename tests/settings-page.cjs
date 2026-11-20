// Desktop check of the Settings page: the cards (theme, start page, backups and reminder, the older
// format), Help (topics, how-tos, search, the full topic, Show me) and Fonts (your own sample text,
// fonts embedded in the sheet and removing an unused one, using a font for the selected text).
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'settings-page-' + Date.now());
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
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(settings)));
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();
    await page.evaluate(() => {
      const t = DM.item('text', {
        id: 't',
        name: 'Sponsor',
        text: 'FORGE',
        x: 20,
        y: 20,
        w: 40,
        h: 10,
        font: 'Arial'
      });
      Studio.project.items = [t];
      Studio.project.fonts = [
        { family: 'sf-font-unused', name: 'Old Script', data: 'data:font/ttf;base64,AAAA' }
      ];
      Studio.select(['t']);
    });

    // The gear opens the Settings page: cards you can see.
    await page.locator('[data-action="settings"]').first().click();
    assert(await page.locator('#settings-page').isVisible());
    assert(await page.locator('.wb-body').isHidden());
    await page.waitForFunction(() =>
      document.querySelector('#storage-usage .ss-stat b')?.textContent.endsWith('MB')
    );
    await page.locator('[data-sp-theme="light"]').click();
    assert.equal((await S()).theme, 'light');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('[data-sp-theme="dark"]').click();
    await page.locator('[data-sp-start="editor"]').click();
    assert.equal((await S()).startOnWorkshop, false);
    assert.equal(await page.locator('[data-sp-start="editor"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-sp-start="workshop"]').click();
    assert.match(await page.locator('#sp-backup-status').textContent(), /No backup made yet/);
    await page.locator('#sp-remind').uncheck({ force: true });
    assert.equal((await S()).backupReminder, false);
    await page.locator('#legacy-backups summary').click();
    assert(await page.locator('#settings-page [data-alias="restore-backup"]').isVisible());
    await page.screenshot({ path: path.join(run, 'settings.png') });

    // Help: the topics as chips, short how-tos, search answers, the whole topic, and Show me.
    await page.locator('[data-action="help"]').first().click();
    assert.equal(await page.locator('[data-sp-tab="help"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-sp-topic]').count(), 12);
    await page.locator('[data-sp-topic="8"]').click();
    assert.equal(await page.locator('.sp-how').count(), 2);
    await page.locator('#help-search').fill('white ink');
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      'help-search',
      'typing keeps the field'
    );
    assert((await page.locator('.sp-answer').count()) >= 1);
    assert.match(await page.locator('.sp-hhead h2').textContent(), /Matching how-tos/);
    await page.locator('.sp-answer').first().click();
    assert(await page.locator('#sp-reader .help-topic').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sp-reader').count(), 0, 'Esc closes the topic');
    await page.locator('#help-search').fill('');
    await page.locator('[data-sp-topic="11"]').click();
    assert(await page.locator('.sp-inline .help-keys').isVisible(), 'shortcuts show in full');
    await page.locator('[data-sp-topic="8"]').click();
    await page.screenshot({ path: path.join(run, 'help.png') });
    await page.locator('.sp-how', { hasText: 'Your first test print' }).locator('[data-sp-show]').click();
    assert(await page.locator('#print-page').isVisible(), 'Show me goes to the place');
    assert(await page.locator('#settings-page').isHidden());

    // Fonts: your own text, fonts in this sheet (remove the unused one), and using a font.
    await page.locator('nav [data-action="editor"]').click();
    await page.evaluate(() => Studio.select(['t']));
    await page.locator('[data-action="installed-fonts"]').click();
    assert.equal(await page.locator('[data-sp-tab="fonts"]').getAttribute('aria-selected'), 'true');
    await page.locator('#sp-sample').fill('RACE 27');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sp-sample');
    // The samples redraw once typing pauses.
    await page.waitForFunction(() => document.querySelector('.sp-sample')?.textContent.includes('RACE 27'));
    const unused = page.locator('[data-sp-sheet-font="sf-font-unused"]');
    assert.match(await unused.textContent(), /Not used any more/);
    await unused.locator('[data-sp-font-remove]').click();
    assert.equal(await page.evaluate(() => Studio.project.fonts.length), 0);
    await page.locator('[data-sp-use-builtin="Georgia"]').click();
    assert.equal(await page.evaluate(() => Studio.project.items[0].font), 'Georgia');
    await page.locator('#sp-sample').blur();
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => Studio.project.items[0].font), 'Arial', 'one undo step, here too');
    await page.locator('nav [data-action="editor"]').click();
    await page.locator('[data-action="settings"]').first().click();
    await page.locator('[data-sp-tab="fonts"]').click();
    await page.screenshot({ path: path.join(run, 'fonts.png') });
    await page.locator('[data-sp-done]').click();
    assert(await page.locator('.wb-body').isVisible());
    assert.equal(await page.locator('#settings-page').innerHTML(), '');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks: 'settings cards, help topics/how-tos/search/reader/show me, fonts sample/remove/use'
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
