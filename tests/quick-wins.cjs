// Desktop check for copy/paste, clipboard images and SVG, free placement, opacity, colour swatches,
// installed fonts and long undo. Uses an isolated workspace; writes to the system clipboard.
const { _electron: electron } = require('playwright');
const root = require('node:path').resolve(__dirname, '..'),
  out = require('node:path').join(root, 'test-output', 'quick-wins-' + Date.now());
const path = require('node:path'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: path.join(out, 'ws'),
    SLOTFORGE_TEST_PROFILE: path.join(out, 'prof'),
    SLOTFORGE_EXPORT_DIR: path.join(out, 'exports')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
    args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
    env,
    timeout: 30000
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1600, 1000);
    w.showInactive();
    w.focus();
  });
  await page.waitForFunction(() => window.Studio?.ready);
  const wc = fn =>
    app.evaluate(({ BrowserWindow }, f) => BrowserWindow.getAllWindows()[0].webContents[f](), fn);
  const P = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project)));
  const log = (...a) => console.log('✔', ...a);

  await page.locator('#workshop [data-action="demo"]').click();
  await page.waitForFunction(() => Studio.project.items.length > 0);
  const before = (await P()).items.length;

  // 1. Free placement: a new text must not overlap existing artwork on the page.
  await page.locator('.tool-rail [data-flyout="text"]').click();
  // The Text flyout waits for the sheet: Enter adds it in free space, Enter again ends typing.
  await page.keyboard.press('Enter');
  await page.waitForSelector('#text-inline');
  await page.keyboard.press('Enter');
  let p = await P();
  const text = p.items.at(-1);
  const overlap = await page.evaluate(id => {
    const items = Studio.project.items.filter(i => i.page === 0),
      t = items.find(i => i.id === id);
    const b = x => ({ x: x.x, y: x.y, w: x.w, h: x.h });
    return items
      .filter(i => i.id !== id)
      .some(o => {
        const a = b(t),
          c = b(o);
        return a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;
      });
  }, text.id);
  assert.equal(overlap, false, 'new text overlaps existing artwork');
  log('new text placed in free space at', text.x.toFixed(1), text.y.toFixed(1));

  // 2. Opacity slider in percent.
  await page.locator('#prop-opacity').fill('40');
  await page.locator('#prop-opacity').press('Tab');
  assert.equal((await P()).items.find(i => i.id === text.id).opacity, 0.4);
  assert.equal(await page.locator('#opacity-range').inputValue(), '40');
  log('opacity 40% stored as 0.4 and slider follows');

  // 3. Colour swatches + eyedropper exist; clicking a swatch applies it and becomes recent.
  const swatches = await page.locator('#inspector .colour-kit .swatch').count();
  assert.ok(swatches > 0, 'no swatches');
  assert.equal((await page.locator('#inspector .colour-dropper').count()) > 0, true);
  const sw = await page.locator('#fill + .colour-kit .swatch').nth(1).getAttribute('data-colour');
  await page.locator('#fill + .colour-kit .swatch').nth(1).click();
  assert.equal((await P()).items.find(i => i.id === text.id).fill, sw);
  const recent = await page.locator('#fill + .colour-kit .swatch').first().getAttribute('data-colour');
  assert.equal(recent, sw, 'picked colour should lead the swatches');
  log('swatch applied', sw, '— shown first as recent;', swatches, 'swatches in inspector');

  // 4. Copy / paste decals (internal), via the real edit commands.
  await page
    .locator('#paper')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => {});
  await page.evaluate(id => Studio.select([id]), text.id);
  await page.locator('body').focus();
  await wc('copy');
  await wc('paste');
  await page.waitForFunction(n => Studio.project.items.length === n, before + 2);
  p = await P();
  const pasted = p.items.at(-1);
  assert.notEqual(pasted.id, text.id);
  assert.equal(pasted.text, text.text);
  assert.ok(Math.abs(pasted.x - text.x - 4) < 0.01, 'pasted copy steps 4 mm');
  log('Ctrl+C / Ctrl+V pasted a copy 4 mm down-right');
  await wc('cut');
  await page.waitForFunction(n => Studio.project.items.length === n, before + 1);
  await wc('paste');
  await page.waitForFunction(n => Studio.project.items.length === n, before + 2);
  log('Ctrl+X removes, Ctrl+V brings it back');

  // 5. Paste an image from the system clipboard -> sizing dialog -> placed.
  await app.evaluate(async ({ clipboard, nativeImage, ClipboardItem }) => {
    const size = 40,
      buf = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) buf.writeUInt32BE(0x2050e0ff, i * 4);
    const png = nativeImage.createFromBitmap(buf, { width: size, height: size }).toPNG();
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
  });
  await wc('paste');
  await page.waitForSelector('#dialog[open]');
  const dialogTitle = await page.locator('#dialog h2').first().textContent();
  log('pasting an image opened:', dialogTitle);
  // A bitmap opens the import bay at Clean up: go straight to sizing and place it.
  await page.locator('[data-bay-step="size"]').click();
  await page.locator('#place-import').click();
  await page.waitForFunction(n => Studio.project.items.length === n, before + 3);
  assert.equal((await P()).items.at(-1).kind, 'image');
  log('pasted image added as an image decal');

  // 6. Paste SVG code.
  await app.evaluate(
    async ({ clipboard }) =>
      await clipboard.writeText(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#e00"/></svg>'
      )
  );
  await wc('paste');
  await page.waitForSelector('#dialog[open]');
  await page.locator('#dialog .dialog-foot .primary').click();
  await page.waitForFunction(n => Studio.project.items.length === n, before + 4);
  assert.equal((await P()).items.at(-1).kind, 'svg');
  log('pasted SVG code added as a vector decal');

  // 7. Installed fonts picker embeds a font.
  await page.evaluate(id => Studio.select([id]), text.id);
  // Installed fonts opens the Fonts tab of the Settings page, shown in the selected text.
  await page.locator('[data-action="installed-fonts"]').click();
  await page.waitForSelector('#font-list .font-option');
  assert.equal(await page.locator('[data-sp-tab="fonts"]').getAttribute('aria-selected'), 'true');
  const count = await page.locator('#font-list .font-option').count();
  await page
    .locator('#font-search')
    .fill((await page.locator('#font-list .font-option small').first().textContent()).slice(0, 4));
  await page.locator('#font-list .font-option').first().click();
  await page.waitForFunction(
    id => Studio.project.items.find(i => i.id === id).font.startsWith('sf-font-'),
    text.id
  );
  // The embedded font is listed under In this sheet.
  await page.waitForSelector('[data-sp-sheet-font]');
  await page.locator('nav [data-action="editor"]').click();
  p = await P();
  const t2 = p.items.find(i => i.id === text.id),
    font = p.fonts.find(f => f.family === t2.font);
  assert.ok(font && font.data.startsWith('data:font/'), 'font embedded');
  log(
    `installed font list had ${count} families; embedded "${font.name}" (${Math.round(font.data.length / 1024)} KB)`
  );

  // 8. Long undo: 60 nudges then undo all of them.
  const startX = t2.x;
  for (let n = 0; n < 60; n++) await page.keyboard.press('ArrowRight');
  const moved = (await P()).items.find(i => i.id === text.id).x;
  for (let n = 0; n < 60; n++) await page.keyboard.press('Control+Z');
  const back = (await P()).items.find(i => i.id === text.id)?.x;
  log(`moved to ${moved.toFixed(1)}, 60 undos back to ${back?.toFixed(1)} (start ${startX.toFixed(1)})`);
  assert.ok(Math.abs(back - startX) < 0.01, '60 undo steps');

  // 9. Locked decals disable the new controls.
  await page.evaluate(id => Studio.select([id]), text.id);
  await page.locator('[data-action="lock"]').click();
  for (const sel of [
    '#opacity-range',
    '#prop-opacity',
    '[data-action="installed-fonts"]',
    '#fill + .colour-kit .swatch'
  ])
    assert.ok(await page.locator(sel).first().isDisabled(), sel + ' should be disabled when locked');
  log('locked decal disables opacity, installed fonts and swatches');

  // 10. Light theme look.
  await page.locator('[data-action="theme-light"]').click();
  await page.locator('[data-action="lock"]').click();

  assert.deepEqual(errors, []);
  log('no page errors');
  await app.close();
})().catch(e => {
  console.error('✖', e.message);
  process.exit(1);
});
