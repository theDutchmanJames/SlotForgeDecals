// Kills the running app while you edit (no chance to save on closing, as in a crash or power cut),
// then starts it again. It must open normally, with no trouble message, the sheet intact and at most
// the last couple of seconds of edits lost. Also kills it while a sheet is being saved to the
// Workshop and while a PDF is being made.
//   SLOTFORGE_CRASH_ROUNDS=10 node tests/crash-desktop.cjs
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'crash-desktop-' + Date.now()),
    rounds = Number(process.env.SLOTFORGE_CRASH_ROUNDS || 3);
  await fs.mkdir(run, { recursive: true });
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: path.join(run, 'workspace'),
    SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
    SLOTFORGE_EXPORT_DIR: path.join(run, 'exports')
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const errors = [];
  const launch = async (tries = 5) => {
    try {
      return await start();
    } catch (e) {
      // The previous copy's helpers may hold the single-instance lock a moment longer.
      if (tries <= 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
      return launch(tries - 1);
    }
  };
  const start = async () => {
    const app = await electron.launch({
      executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
      args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
      env
    });
    const page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.stack || e.message));
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    return { app, page };
  };
  // A hard stop of the whole app at once (main process and Chromium's helpers), as in a power cut.
  const kill = async app => {
    const child = app.process(),
      gone = new Promise(resolve => child.once('exit', resolve));
    if (process.platform === 'win32')
      require('node:child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    else child.kill('SIGKILL');
    await gone;
    await new Promise(r => setTimeout(r, 500));
  };
  const picture =
    'data:image/png;base64,' +
    Buffer.from(Array.from({ length: 4e5 }, (_, k) => (k * 7) & 255)).toString('base64');
  let { app, page } = await launch();
  try {
    await page.locator('#workshop [data-ws="blank"]').click();
    let last = 0;
    for (let round = 0; round < rounds; round++) {
      // Edit for a while, a rename and a moved decal every 40 ms, then kill in the middle of it.
      await page.evaluate(
        ({ picture, start }) => {
          mutate(() => {
            if (!Studio.project.items.length)
              Studio.project.items.push(
                DM.item('image', {
                  id: 'pic',
                  x: 20,
                  y: 20,
                  w: 40,
                  h: 30,
                  src: picture,
                  pixelsW: 4,
                  pixelsH: 4
                })
              );
          });
          let n = start;
          window.crashEdits = setInterval(() => {
            n++;
            window.crashLast = n;
            mutate(() => {
              Studio.project.name = 'Edit ' + n;
              Studio.project.items[0].x = 20 + (n % 50);
            });
          }, 40);
        },
        { picture, start: last }
      );
      await page.waitForTimeout(3000 + Math.random() * 2000);
      last = await page.evaluate(() => window.crashLast);
      await kill(app);
      ({ app, page } = await launch());
      const after = await page.evaluate(() => ({
        name: Studio.project.name,
        x: Studio.project.items[0]?.x,
        trouble: !!document.querySelector('#dialog[open] .msg-safe'),
        workshop: !document.querySelector('#workshop')?.hidden
      }));
      assert(!after.trouble, `round ${round}: a trouble message after the restart`);
      const n = Number(after.name.match(/^Edit (\d+)$/)?.[1]);
      assert(Number.isInteger(n), `round ${round}: the sheet came back as "${after.name}"`);
      assert.equal(after.x, 20 + (n % 50), `round ${round}: name and position belong to the same save`);
      // Autosave waits for a pause, but at most 2.5 s: with an edit every 40 ms, about 60 edits plus the save.
      assert(
        n <= last && last - n <= 110,
        `round ${round}: lost ${last - n} edits (back at ${n} of ${last})`
      );
      last = n;
      if (after.workshop)
        await page
          .locator('#workshop [data-ws="current"], #workshop [data-ws="resume"]')
          .first()
          .click()
          .catch(() => {});
    }

    // Killed while saving the sheet to the Workshop: it opens again, the Workshop lists it at most once,
    // and the copy there (if any) is readable.
    await page.evaluate(() => mutate(() => (Studio.project.name = 'Workshop copy')));
    await page.evaluate(() => {
      actions['save-sheet']();
    });
    await page.waitForTimeout(40 + Math.random() * 150);
    await kill(app);
    ({ app, page } = await launch());
    const saved = await page.evaluate(async () => {
      const list = (await desktop.listProjects({ scope: 'projects' })).entries;
      const copies = list.filter(e => e.name === 'Workshop copy');
      if (copies.length) await desktop.readProject(copies[0]);
      return copies.length;
    });
    assert(saved <= 1, 'the sheet is in the Workshop at most once');

    // Killed while making a PDF: the next start is normal and the export folder has no half-written PDF
    // posing as finished (an unfinished file, if any, is not named .pdf).
    await page.evaluate(() => mutate(() => (Studio.project.name = 'PDF sheet')));
    page.evaluate(() => exportPDF(false, true)).catch(() => {});
    await page.waitForTimeout(300 + Math.random() * 600);
    await kill(app);
    ({ app, page } = await launch());
    assert.equal(await page.evaluate(() => !!document.querySelector('#dialog[open] .msg-safe')), false);
    const exported = await fs.readdir(path.join(run, 'exports')).catch(() => []);
    for (const name of exported.filter(n => n.endsWith('.pdf'))) {
      const head = await fs.readFile(path.join(run, 'exports', name));
      assert(
        head.subarray(0, 5).toString() === '%PDF-' && head.includes('%%EOF'),
        name + ' is a complete PDF'
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ run, rounds, checks: 'kill while editing, while saving a sheet, while making a PDF' })
    );
  } finally {
    await app.close().catch(() => {});
  }
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
