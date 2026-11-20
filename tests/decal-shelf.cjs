// Desktop check of the Decal Library page (the Decal shelf): tag shelves, favourites, details that
// save as you type, tagging by dragging, several at once, true size, Recently used and On your sheets.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'decal-shelf-' + Date.now());
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
  const loaded = () =>
    page.waitForFunction(() => document.querySelector('#shelf-body')?.dataset.loading === 'false');
  const names = () => page.locator('#shelf .sh-meta b').allTextContents();
  const card = name =>
    page
      .locator('#shelf .sh-card')
      .filter({ has: page.locator('.sh-meta b', { hasText: new RegExp('^' + name + '$') }) });
  const shelf = async key => {
    await page.locator(`#shelf [data-shelf="${key}"]`).click();
    await loaded();
  };
  const count = key => page.locator(`#shelf [data-shelf="${key}"] .n`).textContent();
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();
    await page.evaluate(async () => {
      await Library.import(
        [
          ['Roundel 27', 'Numbers', 18],
          ['Forge Racing', 'Sponsors, Team Forge', 36],
          ['Kestrel Oil', 'sponsors', 28],
          ['Double stripe', '', 80]
        ].map(([name, tags, w], n) => ({
          id: DM.uid(),
          name,
          tags,
          scale: 32,
          art: DM.item('rect', { name, w, h: 10, fill: ['#e5484d', '#111111', '#f5c400', '#1d4ed8'][n] })
        })),
        []
      );
    });

    // The page: tag shelves with counts, whole-tag matches, untagged and kinds.
    await page.locator('nav [data-action="library"]').click();
    await loaded();
    assert(await page.locator('#shelf').isVisible());
    assert(await page.locator('.wb-body').isHidden(), 'the editor is out of the way');
    assert.equal(await page.locator('#shelf .sh-card').count(), 4);
    assert.equal(await count('all'), '4');
    assert.equal(await count('tag:Sponsors'), '2');
    assert.equal(await count('tag:Numbers'), '1');
    assert.equal(await count('untagged'), '1');
    await shelf('tag:Sponsors');
    assert.deepEqual((await names()).sort(), ['Forge Racing', 'Kestrel Oil']);
    assert.equal(await page.locator('#shelf-title').textContent(), 'Sponsors');
    await shelf('untagged');
    assert.deepEqual(await names(), ['Double stripe']);
    await shelf('all');
    await page.locator('#shelf-search').fill('kestrel');
    await page.waitForFunction(() => document.querySelectorAll('#shelf .sh-card').length === 1);
    await page.locator('#shelf-search').fill('');
    await page.waitForFunction(() => document.querySelectorAll('#shelf .sh-card').length === 4);

    // Favourites: the star on a card; the shelf counts it.
    await card('Roundel 27').locator('[data-fav]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-shelf="favourite"] .n').textContent === '1'
    );
    await shelf('favourite');
    assert.deepEqual(await names(), ['Roundel 27']);
    await shelf('all');

    // Details: rename, add and remove tags, and the creator, each saved straight away.
    await card('Double stripe').locator('.sh-pv').click();
    await page.waitForSelector('#shelf-name');
    assert.match(await page.locator('.sh-scales').textContent(), /1:32.*80 × 10 mm/);
    assert.match(await page.locator('.sh-scales').textContent(), /1:24.*106\.7 × 13\.3 mm/);
    await page.locator('#shelf-name').fill('Twin stripe');
    await page.locator('#shelf-name').press('Enter');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#shelf .sh-meta b')].some(b => b.textContent === 'Twin stripe')
    );
    await page.locator('#shelf-tag-add').fill('Stripes');
    await page.locator('#shelf-tag-add').press('Enter');
    await page.waitForSelector('#shelf [data-shelf="tag:Stripes"]');
    await page.locator('#shelf-creator').fill('James');
    await page.locator('#shelf-creator').press('Tab');
    await page.waitForFunction(() => document.querySelector('.sh-facts')?.textContent.includes('by James'));
    await page.locator('#shelf [data-untag="Stripes"]').click();
    await page.waitForFunction(() => !document.querySelector('#shelf [data-shelf="tag:Stripes"]'));
    const twin = await page.evaluate(
      async () => (await Library.query({ search: 'twin', limit: 1 })).entries[0]
    );
    assert.equal(twin.name, 'Twin stripe');
    assert.equal(twin.creator, 'James');
    assert.equal(twin.tags, '');

    // Drag a card onto a tag shelf to tag it.
    // (after the details panel has finished refreshing from the last change)
    await page.waitForFunction(
      () =>
        document.querySelector('#shelf-tag-add') &&
        !document.querySelector('.sh-taglist')?.textContent.includes('Stripes') &&
        document.querySelector('#shelf-used')?.textContent !== 'Looking…'
    );
    await loaded();
    // Simulated HTML drag and drop occasionally loses the drop, so it gets a second try.
    const tagged = () =>
      page
        .waitForFunction(
          () => document.querySelector('[data-shelf="tag:Numbers"] .n')?.textContent === '2',
          null,
          {
            timeout: 5000
          }
        )
        .then(() => true)
        .catch(() => false);
    for (let attempt = 0; attempt < 2; attempt++) {
      await card('Twin stripe').dragTo(page.locator('#shelf [data-shelf="tag:Numbers"]'));
      if (await tagged()) break;
      assert(attempt === 0, 'dragging a card onto a tag shelf tags it');
    }

    // Several at once: tag them in one go.
    await page.locator('#shelf-select').click();
    await card('Roundel 27').locator('.sh-pv').click();
    await card('Kestrel Oil').locator('.sh-pv').click();
    assert.equal(await page.locator('#shelf-picked').textContent(), '2 selected');
    await page.screenshot({ path: path.join(run, 'selected.png') });
    await page.locator('[data-shelf-act="tag"]').click();
    await page.locator('#shelf-bulk-tag').fill('Club racing');
    await page.locator('#shelf-bulk-confirm').click();
    await page.waitForFunction(
      () => document.querySelector('[data-shelf="tag:Club racing"] .n')?.textContent === '2'
    );
    assert(!(await page.locator('#dialog').isVisible()));
    await page.keyboard.press('Escape');
    assert(await page.locator('#shelf-selbar').isHidden());

    // True size: each decal drawn at its printed size (96 pixels per inch).
    await page.locator('[data-shelf-view="true"]').click();
    const widths = await page
      .locator('#shelf .sh-fig img')
      .evaluateAll(list => Object.fromEntries(list.map(i => [i.alt, parseFloat(i.style.width)])));
    assert(Math.abs(widths['Forge Racing'] - (36 * 96) / 25.4) < 0.2, JSON.stringify(widths));
    await page.screenshot({ path: path.join(run, 'true-size.png') });
    await page.locator('[data-shelf-view="cards"]').click();

    // Double-click adds to the sheet: back in the editor; the decal moves to Recently used and On your sheets.
    await loaded();
    await card('Forge Racing').locator('.sh-pv').dblclick();
    await page.waitForFunction(() => Studio.project.items.length === 1 && !Shelf.isOpen());
    assert(await page.locator('.wb-body').isVisible());
    await page.locator('#sheet-menu-button').click();
    await page.locator('#sheet-menu [data-action="save-sheet"]').click();
    await page.waitForFunction(() => !projectTask);
    await page.locator('nav [data-action="library"]').click();
    await loaded();
    await page.waitForFunction(() => document.querySelector('[data-shelf="recent"] .n')?.textContent === '1');
    await shelf('recent');
    assert.deepEqual(await names(), ['Forge Racing']);
    await card('Forge Racing').locator('.sh-pv').click();
    await page.waitForFunction(() => document.querySelector('#shelf-used')?.textContent.includes('open now'));
    await page.screenshot({ path: path.join(run, 'details.png') });

    // Delete from the details panel; the copy on the sheet stays.
    await page.locator('[data-shelf-act="delete-one"]').click();
    await page.locator('#confirm').click();
    await page.waitForFunction(() => Studio.libraryCount === 3);
    await page.waitForFunction(() => document.querySelector('[data-shelf="all"] .n')?.textContent === '3');
    // The details panel closes once the shelves have redrawn.
    await page.locator('#shelf-insp').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => Studio.project.items.length), 1);

    // The editor's Library tab opens a decal's details here.
    await page.locator('nav [data-action="editor"]').click();
    await page.locator('#library-grid [data-lib-menu]').first().click();
    await page.waitForSelector('#shelf-name');
    assert(await page.locator('#shelf').isVisible());
    await page.locator('nav [data-action="projects"]').click();
    assert(await page.locator('#shelf').isHidden(), 'the Workshop replaces the library page');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'tag shelves, favourites, details saved as typed, drag to tag, tag several, true size, recent, used on, delete'
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
