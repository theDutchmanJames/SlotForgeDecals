// Desktop check for "a new version is available". A local server stands in for GitHub; test runs
// without it never make a request. Uses an isolated workspace and profile.
const { _electron: electron } = require('playwright');
const http = require('node:http'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  run = path.join(root, 'test-output', 'update-check-' + Date.now());
const RELEASE = '/repos/theDutchmanJames/SlotForgeDecals/releases/latest';

async function main() {
  await fs.mkdir(run, { recursive: true });
  const requests = [];
  let reply = {
    status: 200,
    body: { tag_name: 'v9.9.9', published_at: '2026-01-01T00:00:00Z', draft: false }
  };
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, agent: req.headers['user-agent'] });
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const api = 'http://127.0.0.1:' + server.address().port;
  const ok = (...a) => console.log('✔', ...a);

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
    return { app, page, errors };
  }
  const settings = async page => {
    await page.locator('[data-action="settings"]').first().click();
    await page.waitForSelector('#update-settings dl');
  };
  const close = page => page.locator('#dialog [data-action="close"]').first().click();

  try {
    // 1. No test server: nothing is asked, nothing shown, and Settings says why.
    let { app, page, errors } = await launch({});
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('.update-notice').count(), 0);
    await settings(page);
    assert.match(await page.locator('#update-settings').textContent(), /off in test runs/);
    await close(page);
    assert.deepEqual(errors, []);
    await app.close();
    assert.equal(requests.length, 0);
    ok('without a server no request is made and no notice is shown');

    // 2. A newer release: the notice appears shortly after start; Download opens only the release page.
    const env = { SLOTFORGE_UPDATE_API: api, SLOTFORGE_UPDATE_DELAY: '800' };
    ({ app, page, errors } = await launch(env));
    await page.waitForSelector('.update-notice', { timeout: 10000 });
    assert.match(await page.locator('.update-notice').textContent(), /Decals 9\.9\.9 is available/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, RELEASE);
    assert.match(requests[0].agent, /^SlotForge-Decals\/\d+\.\d+\.\d+$/);
    await page.locator('.projectbar').screenshot({ path: path.join(run, 'notice.png') });
    await page.locator('.update-notice [data-action="update-open"]').click();
    await page.waitForFunction(() => true);
    assert.equal(
      await app.evaluate(() => global.openedUpdatePage),
      'https://github.com/theDutchmanJames/SlotForgeDecals/releases/tag/v9.9.9'
    );
    ok('notice after the start delay; Download opens the GitHub release page');

    // 3. Settings shows it; Not now hides the notice.
    await settings(page);
    assert.match(await page.locator('#update-newest').textContent(), /9\.9\.9 is available/);
    await page.locator('#dialog').screenshot({ path: path.join(run, 'settings.png') });
    await close(page);
    await page.locator('.update-notice [data-action="update-skip"]').click();
    await page.waitForFunction(() => !document.querySelector('.update-notice'));
    assert.deepEqual(errors, []);
    await app.close();
    ok('Not now hides the notice');

    // 4. Restart: no new request within 12 hours, and the skipped version stays hidden.
    ({ app, page, errors } = await launch(env));
    await page.waitForTimeout(2000);
    assert.equal(await page.locator('.update-notice').count(), 0);
    assert.equal(requests.length, 1, 'checked at most every 12 hours');
    // Check now finds an even newer version, which shows again.
    reply = { status: 200, body: { tag_name: 'v10.0.0', published_at: '2026-01-01T00:00:00Z' } };
    await settings(page);
    await page.locator('#update-settings [data-action="update-check"]').click();
    await page.waitForFunction(() =>
      /10\.0\.0 is available/.test(document.querySelector('#update-newest')?.textContent)
    );
    await close(page);
    await page.waitForSelector('.update-notice');
    assert.match(await page.locator('.update-notice').textContent(), /10\.0\.0/);
    ok('restart: no repeat request, skip remembered; Check now finds 10.0.0');

    // 5. Turning automatic checks off hides the notice; a GitHub error is shown only in Settings.
    await settings(page);
    await page.locator('#update-settings [data-action="update-toggle"]').click();
    await page.waitForFunction(() =>
      /Turn on automatic/.test(document.querySelector('#update-settings').textContent)
    );
    assert.equal(await page.locator('.update-notice').count(), 0);
    reply = { status: 500, body: {} };
    await page.locator('#update-settings [data-action="update-check"]').click();
    await page.waitForSelector('#update-settings .update-error');
    assert.match(await page.locator('#update-settings .update-error').textContent(), /error \(500\)/);
    await close(page);
    assert.equal(await page.locator('.update-notice').count(), 0);
    assert.deepEqual(errors, []);
    await app.close();
    ok('turning checks off hides the notice; errors stay in Settings');
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
