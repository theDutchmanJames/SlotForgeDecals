// Random-sequence test of Undo and Redo in the editor. Runs random edits (toolbar actions, arrow
// keys, inspector-style changes, page changes, selections) mixed with Undo and Redo, and keeps its own
// list of what the sheet looked like before each step. Checks that every change can be undone,
// that Undo and Redo land on exactly the right earlier state, and that nothing errors.
//   SLOTFORGE_FUZZ_STEPS=3000 SLOTFORGE_FUZZ_SEED=7 node tests/undo-fuzz.cjs
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'undo-fuzz-' + Date.now()),
    steps = Number(process.env.SLOTFORGE_FUZZ_STEPS || 800),
    seed = Number(process.env.SLOTFORGE_FUZZ_SEED || 1);
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
  page.on('pageerror', e =>
    page
      .evaluate(() => window.fuzzStep)
      .catch(() => '?')
      .then(step => errors.push(`step ${step}: ${e.stack || e.message}`))
  );
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready);
    await page.locator('#workshop [data-ws="blank"]').click();
    const result = await page.evaluate(
      async ({ steps, seed }) => {
        let s = seed >>> 0 || 1;
        const rnd = () => {
            s ^= s << 13;
            s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5;
            s >>>= 0;
            return s / 2 ** 32;
          },
          int = n => Math.floor(rnd() * n),
          pick = list => list[int(list.length)];
        // The sheet as Undo should bring it back; the edit time is left out.
        const state = () => {
          const { updated, ...rest } = Studio.project;
          return JSON.stringify(rest);
        };
        const key = (k, extra = {}) =>
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
        // The first place two states differ, to show in a failure.
        const diff = (a, b) => {
          let n = 0;
          while (n < a.length && a[n] === b[n]) n++;
          return (
            '\n  expected …' +
            a.slice(Math.max(0, n - 80), n + 80) +
            '\n  got      …' +
            b.slice(Math.max(0, n - 80), n + 80)
          );
        };
        // Keyboard shortcuts run their action a moment later.
        const tick = () => new Promise(r => setTimeout(r, 0));
        const ids = () => Studio.project.items.map(i => i.id);
        const edits = {
          rect: () =>
            mutate(() =>
              Studio.project.items.push(
                DM.item(pick(['rect', 'ellipse', 'triangle', 'text']), {
                  x: 10 + int(150),
                  y: 10 + int(220),
                  w: 5 + int(30),
                  h: 5 + int(20),
                  page: int(Studio.project.pages)
                })
              )
            ),
          select: () => Studio.select(ids().filter(() => rnd() < 0.4)),
          selectOne: () => ids().length && Studio.select([pick(ids())]),
          field: () => {
            const i = Studio.project.items.find(i => selected.has(i.id));
            if (!i) return;
            const field = pick(['x', 'y', 'w', 'h', 'rotation', 'opacity', 'fill', 'name']);
            mutate(() => {
              const t = Studio.project.items.find(x => x.id === i.id);
              if (field === 'fill') t.fill = '#' + (0x100000 + int(0xefffff)).toString(16);
              else if (field === 'name') t.name = 'Name ' + int(99);
              else if (field === 'opacity') t.opacity = Math.round(rnd() * 100) / 100;
              else if (field === 'rotation') t.rotation = int(360);
              else t[field] = Math.max(1, Math.round(rnd() * 120));
            });
          },
          arrow: () =>
            key(pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']), { shiftKey: rnd() < 0.3 }),
          arrowHold: () => {
            const k = pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
            key(k);
            for (let n = int(5); n > 0; n--) key(k, { repeat: true });
          },
          action: () => {
            const name = pick([
              'duplicate',
              'delete',
              'group',
              'ungroup',
              'align-left',
              'align-center',
              'backward',
              'forward',
              'lock',
              'bold',
              'italic',
              'add-page',
              'mirror-pair'
            ]);
            log.push(name);
            return actions[name]?.();
          },
          deleteKey: () => key('Delete'),
          rename: () => mutate(() => (Studio.project.name = 'Sheet ' + int(99)))
        };
        const weights = {
          rect: 6,
          select: 4,
          selectOne: 4,
          field: 6,
          arrow: 4,
          arrowHold: 2,
          action: 8,
          deleteKey: 2,
          rename: 1
        };
        const bag = Object.entries(weights).flatMap(([k, w]) => Array(w).fill(k));
        const done = [],
          undone = [],
          log = [],
          counts = { edits: 0, undo: 0, redo: 0, noop: 0 };
        for (let step = 0; step < steps; step++) {
          const before = state(),
            top = history.at(-1),
            r = rnd(),
            name = r < 0.18 ? 'undo' : r < 0.26 ? 'redo' : pick(bag),
            viaKey = rnd() < 0.5;
          log.push(name);
          window.fuzzStep = step + ' ' + name + ' (' + log.slice(-4).join(', ') + ')';
          const where = () => `seed ${seed}, step ${step} (${name}); last: ${log.slice(-8).join(', ')}`;
          try {
            if (name === 'undo') {
              viaKey ? key('z', { ctrlKey: true }) : actions.undo();
              await tick();
              if (done.length) {
                const expected = done.pop();
                undone.push(before);
                if (state() !== expected)
                  return { error: 'Undo landed on the wrong state at ' + where() + diff(expected, state()) };
                counts.undo++;
              } else if (state() !== before && history.length === 0) {
                return { error: 'Undo with nothing to undo changed the sheet at ' + where() };
              }
            } else if (name === 'redo') {
              viaKey ? key('y', { ctrlKey: true }) : actions.redo();
              await tick();
              if (undone.length) {
                const expected = undone.pop();
                done.push(before);
                if (state() !== expected) return { error: 'Redo landed on the wrong state at ' + where() };
                counts.redo++;
              }
            } else {
              try {
                await edits[name]();
                await tick();
              } catch (e) {
                // A refused edit (for example grouping one decal) must leave the sheet as it was.
                if (state() !== before)
                  return { error: 'A refused edit changed the sheet at ' + where() + ': ' + e.message };
              }
              document.querySelector('#modal:not(.hidden) [data-action="close"]')?.click();
              const after = state();
              if (history.at(-1) !== top) {
                // A new undo step: the step must hold exactly the sheet as it was.
                const { updated, ...rest } = history.at(-1);
                if (JSON.stringify(rest) !== before)
                  return { error: 'The undo step does not match the sheet before the edit at ' + where() };
                done.push(before);
                undone.length = 0;
                counts.edits++;
              } else if (after !== before) {
                // Arrow repeats join the press before them; anything else must add a step.
                if (name !== 'arrowHold' && name !== 'arrow')
                  return { error: 'The sheet changed without an undo step at ' + where() };
                undone.length = 0;
              } else counts.noop++;
            }
            if (done.length > history.length) done.splice(0, done.length - history.length);
          } catch (e) {
            return { error: e.message + ' at ' + where() };
          }
        }
        return { counts, items: Studio.project.items.length };
      },
      { steps, seed }
    );
    assert(!result.error, result.error);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ run, seed, steps, ...result }));
  } finally {
    await app.close();
  }
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
