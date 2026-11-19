// Desktop check for "a new version is available": the update window from SlotForge Circuit, with
// What's new, Skip and Download. A local server stands in for GitHub; test runs without it never
// make a request. Uses an isolated workspace, profile and downloads folder. The check at start is
// off in test runs, so the test calls check(), the same code, as the start would.
// Set SLOTFORGE_UI_SHOTS to a folder to keep pictures of the window in both themes.
const { _electron: electron } = require('playwright');
const http = require('node:http'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  run = path.join(root, 'test-output', 'update-check-' + Date.now()),
  downloads = path.join(run, 'exports', 'downloads');
const REPO = '/theDutchmanJames/SlotForgeDecals';
const RELEASE = '/repos' + REPO + '/releases/latest';
const bytes = Buffer.from('a pretend installer');

async function main() {
  await fs.mkdir(run, { recursive: true });
  const requests = [];
  let tag = 'v9.9.0',
    status = 200;
  const name = () => `SlotForgeDecals-${tag.slice(1)}-Setup-x64.exe`;
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, agent: req.headers['user-agent'] });
    if (req.url.includes('/releases/download/')) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      return res.end(bytes);
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        tag_name: tag,
        draft: false,
        prerelease: false,
        published_at: '2026-01-01T00:00:00Z',
        body: "Intro.\n\n## What's new\n\n- **Sharper cut lines:** cleaner corners on small decals.\n\n## Verification\n\n- 149 unit tests",
        assets: [
          {
            name: name(),
            size: bytes.length,
            digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex')
          },
          { name: `SlotForgeDecals-${tag.slice(1)}-Portable-x64.exe`, size: 9 }
        ]
      })
    );
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const api = 'http://127.0.0.1:' + server.address().port;
  const ok = (...a) => console.log('✔', ...a);
  const shots = process.env.SLOTFORGE_UI_SHOTS;

  let current;
  async function launch(extra) {
    const env = {
      ...process.env,
      SLOTFORGE_WORKSPACE: path.join(run, 'workspace'),
      SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
      SLOTFORGE_EXPORT_DIR: path.join(run, 'exports'),
      ...extra
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({
      executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
      args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
      env,
      timeout: 30000
    });
    current = app;
    const page = await app.firstWindow(),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1600, 1000);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    if (await page.locator('#dialog[open] [data-action="demo"]').count())
      await page.locator('#dialog [data-action="demo"]').click();
    // This copy is the Windows installer, whatever computer runs the test.
    await app.evaluate(() => (global.updateCheck.edition = { platform: 'win32', arch: 'x64' }));
    return { app, page, errors };
  }
  const check = app => app.evaluate(() => global.updateCheck.check().catch(e => e.message));
  const isOpen = page => page.evaluate(() => !!document.getElementById('update-dialog')?.open);
  const waitOpen = page => page.waitForFunction(() => document.getElementById('update-dialog')?.open);
  const waitClosed = page => page.waitForFunction(() => !document.getElementById('update-dialog')?.open);
  const windowInfo = page =>
    page.evaluate(() => {
      const d = document.getElementById('update-dialog');
      return {
        title: d.querySelector('h2')?.textContent,
        news: d.querySelector('.update-news')?.textContent,
        text: d.textContent,
        buttons: [...d.querySelectorAll('.dialog-actions button')].map(b => b.textContent)
      };
    });
  const settings = async page => {
    await page.locator('[data-action="settings"]').first().click();
    await page.waitForSelector('#update-settings .update-card .ss-sheet');
  };
  const closeSettings = page => page.locator('#dialog [data-action="close"]').first().click();
  const shot = async (page, file) => {
    if (shots) await page.screenshot({ path: path.join(shots, file + '.png') });
  };

  try {
    if (shots) await fs.mkdir(shots, { recursive: true });
    // 1. No test server: nothing is asked or shown, and Settings says why.
    let { app, page, errors } = await launch({});
    assert.match(await check(app), /off in test runs/);
    await page.waitForTimeout(500);
    assert.equal(await isOpen(page), false);
    await settings(page);
    assert.match(await page.locator('#update-settings').textContent(), /off in test runs/);
    await closeSettings(page);
    assert.deepEqual(errors, []);
    await app.close();
    assert.equal(requests.length, 0);
    ok('without a server no request is made and no window is shown');

    // 2. A newer release opens the window: What's new without the technical part, the kind of copy.
    const env = { SLOTFORGE_UPDATE_API: api };
    ({ app, page, errors } = await launch(env));
    await check(app);
    await waitOpen(page);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, RELEASE);
    assert.match(requests[0].agent, /^SlotForge-Decals\/\d+\.\d+\.\d+$/);
    let d = await windowInfo(page);
    assert.equal(d.title, 'Decals 9.9.0');
    assert.match(d.news, /Sharper cut lines: cleaner corners on small decals\./);
    assert.doesNotMatch(d.news, /unit tests/);
    assert.match(d.text, /Windows · installer/);
    assert.match(d.text, /SlotForgeDecals-9\.9\.0-Setup-x64\.exe/);
    assert.doesNotMatch(d.text, /null|undefined/);
    assert.deepEqual(d.buttons, ['Skip this version', 'Download']);
    await shot(page, 'update-window-dark');
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    await shot(page, 'update-window-light');
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    // The editor stays still behind the window: its shortcuts are off while it is open.
    const undo = await page.evaluate(() => Studio.project.items?.length);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.evaluate(() => getSelection().removeAllRanges());
    assert.equal(await page.evaluate(() => Studio.project.items?.length), undo);
    ok("a newer release opens the window with What's new and the installer for this copy");

    // 3. Download: the exact file, checked, in the downloads folder; Show in folder only reveals it.
    await page.locator('#update-download').click();
    await page.waitForSelector('#update-show');
    assert.ok((await fs.readFile(path.join(downloads, name()))).equals(bytes));
    assert.deepEqual(await fs.readdir(downloads), [name()]);
    assert.equal(requests[1].url, `${REPO}/releases/download/v9.9.0/${name()}`);
    assert.match((await windowInfo(page)).text, /Saved in Downloads/);
    assert.match((await windowInfo(page)).text, /your sheets and decals stay in Documents\/SlotForge Decals/);
    await shot(page, 'update-saved');
    await page.locator('#update-show').click();
    await page.waitForFunction(() => true);
    assert.equal(await app.evaluate(() => global.shownUpdateFile), path.join(downloads, name()));
    await page.keyboard.press('Escape');
    await waitClosed(page);
    ok('Download saves the checked file in Downloads; Show in folder reveals it');

    // 4. Settings shows the new version; Check now opens the window again; Skip keeps it away.
    await app.evaluate(() => (global.updateCheck.download = { state: 'idle' })); // as a restart would
    await settings(page);
    assert.match(await page.locator('#update-settings').textContent(), /Version 9\.9\.0 is available/);
    assert.match(await page.locator('#rail-status-updates').textContent(), /9\.9\.0 available/);
    await page.locator('[data-rail="settings-updates"]').click();
    await page.waitForTimeout(400);
    await shot(page, 'update-settings');
    await page.locator('#update-check-now').click();
    await waitOpen(page);
    await page.locator('#update-skip').click();
    await waitClosed(page);
    await closeSettings(page);
    await check(app);
    await page.waitForTimeout(600);
    assert.equal(await isOpen(page), false, 'a skipped version came back');
    tag = 'v9.9.1';
    await check(app);
    await page.waitForFunction(() =>
      /9\.9\.1/.test(
        document.getElementById('update-dialog')?.open &&
          document.querySelector('#update-dialog h2').textContent
      )
    );
    await page.keyboard.press('Escape');
    await waitClosed(page);
    assert.deepEqual(errors, []);
    await app.close();
    ok('Check now reopens it, Skip keeps it away, a newer version shows again');

    // 5. Restart: a closed window comes back at the next start, from what was remembered (What's
    // new included); a GitHub error stays in Settings.
    const before = requests.length;
    ({ app, page, errors } = await launch(env));
    await waitOpen(page);
    d = await windowInfo(page);
    assert.equal(d.title, 'Decals 9.9.1');
    assert.match(d.news, /Sharper cut lines/);
    await page.keyboard.press('Escape');
    await waitClosed(page);
    await settings(page);
    assert.match(await page.locator('#update-settings').textContent(), /Version 9\.9\.1 is available/);
    assert.equal(requests.length, before, 'no request at start in test runs');
    status = 500;
    await page.locator('#update-check-now').click();
    await page.waitForSelector('#update-settings .ss-note.warn');
    assert.match(await page.locator('#update-settings .ss-note.warn').textContent(), /error \(500\)/);
    await closeSettings(page);
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('.update-notice').count(), 0, 'the old top-bar notice is gone');
    assert.deepEqual(errors, []);
    await app.close();
    ok('after a restart the window comes back from what was remembered; errors stay in Settings');
    console.log(JSON.stringify({ run, requests: requests.length }));
  } finally {
    await current?.close().catch(() => {});
    server.close();
  }
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
