// Desktop check of Print & share: the checks with one-click fixes, the test print and its answer,
// the print settings that write the sheet, saving the PDF, the cut step's settings, and the share
// and backup cards. Every fix is one undo step.
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'print-page-' + Date.now());
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
  const P = () => page.evaluate(() => JSON.parse(JSON.stringify(Studio.project)));
  const byId = async id => (await P()).items.find(i => i.id === id);
  const issues = () => page.locator('[data-pp-issue]').count();
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();
    await page.evaluate(() => {
      const s = DM.size(Studio.project);
      Studio.project.margin = 8;
      Studio.project.gap = 3;
      Studio.project.items = [
        DM.item('rect', { id: 'edge', name: 'Edge', x: s.w - 12, y: 20, w: 20, h: 10, fill: '#e5484d' }),
        DM.item('rect', { id: 'a', name: 'Left', x: 30, y: 60, w: 20, h: 10 }),
        DM.item('rect', { id: 'b', name: 'Right', x: 51, y: 60, w: 20, h: 10 }),
        DM.item('rect', {
          id: 'w',
          name: 'White',
          x: 30,
          y: 100,
          w: 20,
          h: 10,
          fill: '#ffffff',
          ink: 'colour-white'
        })
      ];
      Studio.project.whiteInk = false;
      Studio.select([]);
    });

    // The nav's Print & share opens the checks, with each problem marked on the page.
    assert.equal(await page.locator('nav [data-action="sharing"]').textContent(), 'Print & share');
    await page.locator('nav [data-action="sharing"]').click();
    assert(await page.locator('#print-page').isVisible());
    assert(await page.locator('.wb-body').isHidden());
    assert.equal(await issues(), 3);
    assert.equal(await page.locator('[data-pp-mark]').count(), 3);
    assert.match(await page.locator('.pp-step[data-pp-step="check"]').textContent(), /3 things to look at/);
    await page.screenshot({ path: path.join(run, 'check.png') });

    // Fixes: into the margin, to free space, white ink; each is one undo step.
    await page.locator('[data-pp-issue]', { hasText: 'Edge' }).locator('[data-pp-fix]').click();
    const edge = await byId('edge'),
      width = await page.evaluate(() => DM.size(Studio.project).w);
    assert.equal(edge.x + edge.w, width - 8);
    assert.equal(await issues(), 2);
    await page.keyboard.press('Control+z');
    assert.equal(await issues(), 3, 'Ctrl+Z works on this page');
    await page.keyboard.press('Control+Shift+z');
    await page.locator('[data-pp-issue]', { hasText: 'cutting space' }).locator('[data-pp-fix]').click();
    assert.equal(await issues(), 1);
    assert.notEqual((await byId('b')).x, 51, 'the second decal moved to free space');
    await page.locator('[data-pp-issue]', { hasText: 'white ink' }).locator('[data-pp-show]').click();
    assert.equal(await page.locator('[data-pp-mark].flash').count(), 1);
    await page.locator('[data-pp-issue]', { hasText: 'white ink' }).locator('[data-pp-fix]').click();
    assert.equal((await P()).whiteInk, true);
    assert.equal(
      await page.locator('.pp-step[data-pp-step="print"]').getAttribute('class'),
      'pp-step on',
      'on to the Print step'
    );
    await page.locator('.pp-step[data-pp-step="check"]').click();
    assert.match(await page.locator('.pp-side').textContent(), /Ready to print/);

    // Test print: the answer is remembered; "No" explains the printer setting.
    await page.locator('.pp-step[data-pp-step="proof"]').click();
    await page.locator('#pp-proof-no').click();
    assert.match(await page.locator('#pp-proof-help').textContent(), /Fit to page/);
    await page.locator('#pp-proof-yes').click();
    assert.equal(await page.evaluate(() => settings.proofOk), true);
    assert.match(await page.locator('.pp-step[data-pp-step="proof"]').textContent(), /Sizes measured right/);
    await page.locator('#pp-proof-go').click();
    await page.waitForFunction(() => !busy, null, { timeout: 60000 });

    // Print: the settings write the sheet; the artwork list is there; the PDF is saved.
    await page.locator('.pp-step[data-pp-step="print"]').click();
    await page.locator('[data-pp-paper="white"]').click();
    assert.equal((await P()).paper, 'white');
    await page.locator('#pp-spot').fill('WHITE_1');
    await page.locator('#pp-spot').press('Tab');
    assert.equal((await P()).spotName, 'WHITE_1');
    await page.locator('#pp-pdf-lines').check({ force: true });
    assert.equal((await P()).cut.pdfLines, true);
    await page.locator('[data-pp-overlay="white"]').click();
    await page.locator('[data-pp-overlay="white"]').click();
    assert.equal(await page.locator('#pp-sheet [fill="url(#pp-hatch)"]').count(), 1, 'white backing hatched');
    await page.locator('.pp-details summary').click();
    assert.equal(await page.locator('.pdf-artwork-list tbody tr').count(), 4);
    await page.screenshot({ path: path.join(run, 'print.png') });
    await page.locator('#pp-save').click();
    await page.waitForFunction(() => !busy, null, { timeout: 60000 });
    const pdfs = (await fs.readdir(path.join(run, 'exports'))).filter(n => n.endsWith('.pdf'));
    assert.equal(pdfs.length, 2, 'the test print and the PDF: ' + pdfs.join(', '));

    // Cut: machine choice and cut-line settings; the preview draws the cut lines.
    await page.locator('.pp-step[data-pp-step="cut"]').click();
    await page.waitForSelector('#pp-sheet .pp-cut');
    await page.locator('[name="cutter"][value="silhouette"]').check();
    assert.equal(await page.locator('#cutter-go').textContent(), 'Choose folder & export');
    await page.locator('[data-pp-cutmode="rect"]').click();
    assert.equal((await P()).cut.mode, 'rect');
    await page.locator('#pp-offset').fill('2');
    await page.locator('#pp-offset').press('Tab');
    assert.equal((await P()).cut.offset, 2);

    // Share & back up: seven cards, each with its own action.
    await page.locator('.pp-step[data-pp-step="share"]').click();
    assert.equal(await page.locator('.pp-card').count(), 7);
    assert.equal(await page.locator('#print-page [data-alias="complete-backup"]').count(), 1);
    await page.screenshot({ path: path.join(run, 'share.png') });

    // The status bar's print notes open the checks; going back to the editor clears the page.
    await page.locator('nav [data-action="editor"]').click();
    assert.equal(await page.locator('#print-page').innerHTML(), '');
    await page.locator('#checks').click();
    assert.equal(await page.locator('.pp-step[data-pp-step="check"]').getAttribute('class'), 'pp-step on');
    await page.locator('nav [data-action="projects"]').click();
    assert(await page.locator('#print-page').isHidden());
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        run,
        checks:
          'checks and fixes with undo, test print answer, print settings, PDF, cut settings, share cards'
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
