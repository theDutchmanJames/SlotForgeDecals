// Desktop check of the small windows: notices with Undo (and Undo refusing once other changes came
// after), the decision card for deleting a sheet (Keep it / Delete sheet, with Recover… afterwards),
// the progress card's steps for a backup, and the trouble card when the backup fails.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'messages-' + Date.now());
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
  const count = () => page.evaluate(() => Studio.project.items.length);
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
        DM.item('rect', { id: 'a', name: 'Alpha', x: 20, y: 20, w: 20, h: 10 }),
        DM.item('rect', { id: 'b', name: 'Bravo', x: 60, y: 20, w: 20, h: 10 })
      ];
      Studio.select(['a']);
    });

    // A notice with Undo: deleting a decal, then taking it back from the notice.
    await page.keyboard.press('Delete');
    assert.equal(await count(), 1);
    assert.match(await page.locator('#toast').textContent(), /^Decal deleted\.Undo$/);
    await page.screenshot({ path: path.join(run, 'notice.png') });
    await page.locator('#toast button', { hasText: 'Undo' }).click();
    assert.equal(await count(), 2, 'Undo on the notice brings it back');
    // Undo refuses once something else changed after it.
    await page.evaluate(() => Studio.select(['a']));
    await page.keyboard.press('Delete');
    const stale = page.locator('#toast');
    await page.evaluate(() => Studio.select(['b']));
    await page.keyboard.press('ArrowRight');
    await page.locator('#toast button', { hasText: 'Undo' }).click();
    assert.match(await stale.textContent(), /Other changes came after this one/);
    assert.equal(await count(), 1, 'nothing was undone');
    // At most three notices stay.
    await page.evaluate(() => ['one', 'two', 'three', 'four'].forEach(t => toast(t)));
    assert.equal(await page.locator('#notices .notice').count(), 3);

    // The decision card: what will happen and what stays safe; Keep it changes nothing.
    await page.evaluate(() => desktop.saveProject({ project: DM.project('Spare sheet') }));
    await page.locator('nav [data-action="projects"]').click();
    await page.waitForSelector('.ws-card');
    await page.locator('.ws-card', { hasText: 'Spare sheet' }).click();
    await page.locator('[data-ws="delete"]').click();
    assert.match(await page.locator('#dialog h2').textContent(), /^Delete “/);
    assert.match(await page.locator('.msg-cols .will').textContent(), /It leaves your sheets/);
    assert.match(await page.locator('.msg-cols .safe').textContent(), /Recover a sheet/);
    assert.equal(await page.locator('#confirm').textContent(), 'Delete sheet');
    await page.screenshot({ path: path.join(run, 'decision.png') });
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#dialog').evaluate(d => d.open)), 'Esc keeps it');
    await page.locator('[data-ws="delete"]').click();
    await page.locator('#confirm').click();
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('deleted'));
    await page.locator('#toast button', { hasText: 'Recover…' }).click();
    await page.waitForSelector('#ws-snapshots, .ws-recover, [data-recover-preview]');

    // Progress with steps, then a trouble card when the backup fails.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('complete-backup');
      ipcMain.handle('complete-backup', async () => {
        await new Promise(r => setTimeout(r, 1500));
        throw Error('ENOSPC: no space left on device');
      });
    });
    await page.locator('nav [data-action="editor"]').click();
    // Started without waiting for it, so its steps can be seen.
    await page.evaluate(() => {
      actions['complete-backup']().catch(() => {});
    });
    await page.waitForSelector('.msg-steps .now');
    assert.match(await page.locator('#dialog h2').textContent(), /Backing up everything/);
    assert.equal(await page.locator('.msg-steps .done').count(), 1);
    await page.screenshot({ path: path.join(run, 'progress.png') });
    await page.waitForSelector('.msg-safe');
    assert.match(await page.locator('#dialog h2').textContent(), /The backup could not be made/);
    assert.match(await page.locator('.dialog-head p').textContent(), /^ENOSPC: no space left/);
    assert.match(await page.locator('.msg-safe').textContent(), /Your work is safe/);
    await page.locator('.msg-details summary').click();
    assert.match(await page.locator('#msg-details').textContent(), /ENOSPC/);
    assert(await page.locator('#dialog [data-action="complete-backup"]').isVisible(), 'Try again');
    await page.screenshot({ path: path.join(run, 'trouble.png') });
    await page.locator('#dialog [data-action="close"]').first().click();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'notices with undo and stale undo, three at most, decision card, recover action, progress steps, trouble card'
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
