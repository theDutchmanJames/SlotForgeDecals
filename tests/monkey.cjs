// Random-click run: builds a workspace the size of a real one (hundreds of library decals, a few
// dozen sheets with pictures), then clicks, double-clicks, drags, types and presses keys at random
// for a while. It records every page error, console error, failed request and freeze (the window
// not answering for over a second), and at the end checks the database. Real system windows (file
// pickers, Explorer, web pages) are switched off, so nothing leaves the test folder.
//   SLOTFORGE_MONKEY_MINUTES=60 SLOTFORGE_MONKEY_SEED=5 node tests/monkey.cjs
// Writes test-output/monkey-*/report.json (and a screenshot for each new problem).
const { _electron: electron } = require('playwright'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  S = require('../src/sqlite-store.cjs'),
  D = require('../renderer/model.js');
const minutes = Number(process.env.SLOTFORGE_MONKEY_MINUTES || 2);
let seed = Number(process.env.SLOTFORGE_MONKEY_SEED || Date.now() % 100000);
const startSeed = seed;
const rnd = () => {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 2 ** 32;
};
const pick = list => list[Math.floor(rnd() * list.length)];

// A library and Workshop like a real user's: shared pictures, tags, groups, text with fonts.
function buildWorkspace(root) {
  const picture = n =>
    'data:image/png;base64,' +
    Buffer.from(Array.from({ length: 3000 + n * 50 }, (_, k) => (k * 7 + n) & 255)).toString('base64');
  const pictures = Array.from({ length: 25 }, (_, n) => picture(n));
  const font = {
    family: 'sf-font-monkey',
    name: 'Barlow Condensed Bold',
    data:
      'data:font/ttf;base64,' +
      require('node:fs')
        .readFileSync(path.join(__dirname, '../renderer/fonts/barlowcondensed/BarlowCondensed-Bold.ttf'))
        .toString('base64')
  };
  const art = n =>
    n % 5 === 0
      ? D.group([D.item('rect', { x: 0, y: 0, w: 10, h: 8 }), D.item('ellipse', { x: 12, y: 0, w: 8, h: 8 })])
      : n % 3 === 0
        ? D.item('text', { text: String(n), font: 'sf-font-monkey', w: 12, h: 10 })
        : D.item('image', { src: pictures[n % pictures.length], pixelsW: 40, pixelsH: 30, w: 30, h: 22 });
  S.execute(root, 'load');
  for (let start = 0; start < 400; start += 100)
    S.execute(root, 'catalog-import', {
      decals: Array.from({ length: 100 }, (_, k) => ({
        id: 'm' + (start + k),
        name: pick(['Sponsor', 'Number', 'Stripe', 'Roundel', 'Logo']) + ' ' + (start + k),
        tags: pick(['Sponsors', 'Numbers', 'Team Forge, Sponsors', '', 'Classics']),
        scale: pick([24, 32, 43]),
        art: art(start + k)
      })),
      fonts: [font]
    });
  for (let n = 0; n < 25; n++) {
    const p = D.project('Sheet ' + n);
    p.pages = 1 + (n % 3);
    p.fonts = [font];
    for (let k = 0; k < 6 + (n % 10); k++) {
      const i = art(n * 7 + k);
      Object.assign(i, { x: 10 + (k % 5) * 35, y: 10 + Math.floor(k / 5) * 30, page: k % p.pages });
      p.items.push(i);
    }
    S.execute(root, 'saveSheet', { project: p });
  }
  S.closeSession(root);
}

async function main() {
  const root = path.resolve(__dirname, '..'),
    run = path.join(root, 'test-output', 'monkey-' + Date.now()),
    workspace = path.join(run, 'workspace');
  await fs.mkdir(run, { recursive: true });
  buildWorkspace(workspace);
  const env = {
    ...process.env,
    SLOTFORGE_WORKSPACE: workspace,
    SLOTFORGE_TEST_PROFILE: path.join(run, 'profile'),
    SLOTFORGE_EXPORT_DIR: path.join(run, 'exports'),
    SLOTFORGE_TEST_WORKSHOP: '1'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const problems = new Map(),
    recent = [];
  let step = 0,
    app,
    page;
  const note = async (kind, message) => {
    const key =
      kind +
      ': ' +
      String(message)
        .split('\n')[0]
        .replace(/\d{4,}/g, 'N')
        .slice(0, 300);
    const known = problems.get(key);
    if (known) return known.count++;
    const entry = {
      kind,
      message: String(message).slice(0, 4000),
      step,
      count: 1,
      before: recent.slice(-15)
    };
    problems.set(key, entry);
    console.log(`[step ${step}] ${key}`);
    entry.screenshot = `problem-${problems.size}.png`;
    await page?.screenshot({ path: path.join(run, entry.screenshot) }).catch(() => (entry.screenshot = null));
  };
  const watch = p => {
    p.on('pageerror', e => note('page error', e.stack || e.message));
    // fail() logs each message it shows you; those are expected. Anything else logged as an error is not.
    p.on('console', async m => {
      if (m.type() !== 'error') return;
      const text = m
        .text()
        .split('\n')[0]
        .replace(/^Error: /, '');
      const shown = await p.evaluate(t => window.monkeyShown?.has(t), text).catch(() => false);
      if (!shown) note('console error', m.text());
    });
    p.on(
      'requestfailed',
      r => !/^data:|^blob:/.test(r.url()) && note('failed request', r.url() + ' ' + r.failure()?.errorText)
    );
    p.on('filechooser', fc => fc.setFiles([]).catch(() => {}));
    p.on('dialog', d => d.dismiss().catch(() => {}));
  };
  const launch = async () => {
    app = await electron.launch({
      executablePath: process.env.SLOTFORGE_TEST_EXE || require('electron'),
      args: process.env.SLOTFORGE_TEST_EXE ? [] : [root],
      env
    });
    // No real system windows: file pickers cancel, questions answer "Cancel", nothing opens outside.
    await app.evaluate(({ dialog, shell }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      dialog.showSaveDialog = async () => ({ canceled: true });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      shell.openPath = async () => '';
      shell.openExternal = async () => {};
      shell.showItemInFolder = () => {};
    });
    page = await app.firstWindow();
    watch(page);
    app.on('window', w => {
      if (w !== page) watch(w);
    });
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1500, 950);
      w.showInactive();
    });
    await page.waitForFunction(() => window.Studio?.ready, null, { timeout: 60000 });
    await page.evaluate(() => {
      // Keep the run inside the app: no file pickers from hidden inputs, no new browser windows.
      HTMLInputElement.prototype.showPicker = () => {};
      window.open = () => null;
      // Messages shown to you through fail() (a notice), to tell them from unexpected errors.
      window.monkeyShown = new Set();
      const shown = window.fail;
      window.fail = e => {
        window.monkeyShown.add(String(e?.message ?? e));
        return shown(e);
      };
    });
  };
  await launch();
  // Buttons that would only open a real file window or leave the app are skipped.
  const SKIP = [
    'folder',
    'import',
    'font',
    'import-pack',
    'open-sheet-file',
    'restore-backup',
    'installed-fonts'
  ];
  const deadline = Date.now() + minutes * 60000;
  const counts = {};
  try {
    while (Date.now() < deadline) {
      step++;
      const r = rnd();
      let action;
      try {
        if (r < 0.55) {
          // Click (sometimes double or right) on a random visible control or decal.
          const target = await page.evaluate(
            ({ skip, roll }) => {
              const selector =
                'button, [data-action], a, input, select, textarea, summary, label, [role="button"], [role="tab"], [tabindex="0"], .sheet-item, [data-ws], [data-lib], [data-place]';
              const all = [...document.querySelectorAll(selector)].filter(el => {
                if (el.disabled || el.closest('[hidden], [inert]')) return false;
                if (skip.includes(el.dataset.action) || el.type === 'file') return false;
                if (el.tagName === 'A' && /^https?:/.test(el.getAttribute('href') || '')) return false;
                const b = el.getBoundingClientRect();
                if (
                  b.width < 2 ||
                  b.height < 2 ||
                  b.bottom < 0 ||
                  b.right < 0 ||
                  b.top > innerHeight ||
                  b.left > innerWidth
                )
                  return false;
                const x = b.left + b.width / 2,
                  y = b.top + b.height / 2,
                  hit = document.elementFromPoint(x, y);
                return hit && (hit === el || el.contains(hit) || hit.contains(el));
              });
              if (!all.length) return null;
              const el = all[Math.floor(roll * all.length)],
                b = el.getBoundingClientRect();
              return {
                x: b.left + b.width / 2,
                y: b.top + b.height / 2,
                what:
                  (el.dataset.action || el.id || el.tagName.toLowerCase()) +
                  ' “' +
                  (el.textContent || el.value || '').trim().slice(0, 30) +
                  '”',
                input: el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea')
              };
            },
            { skip: SKIP, roll: rnd() }
          );
          if (!target) {
            action = 'key Escape (nothing to click)';
            await page.keyboard.press('Escape');
          } else {
            const how = rnd();
            action = (how < 0.12 ? 'double-click ' : how < 0.17 ? 'right-click ' : 'click ') + target.what;
            if (how < 0.12) await page.mouse.dblclick(target.x, target.y);
            else if (how < 0.17) await page.mouse.click(target.x, target.y, { button: 'right' });
            else await page.mouse.click(target.x, target.y);
            if (target.input && rnd() < 0.7) {
              const text = pick([
                '12',
                '0',
                '-5',
                '999999',
                '1:32',
                'Team Forge',
                '',
                '   ',
                'a'.repeat(200),
                '3.5',
                '#ff0000',
                'é ü ß 😀'
              ]);
              await page.keyboard.press('Control+A');
              await page.keyboard.type(text);
              if (rnd() < 0.6) await page.keyboard.press(pick(['Enter', 'Tab']));
              action += ' and type “' + text.slice(0, 20) + '”';
            }
          }
        } else if (r < 0.75) {
          const key = pick([
            'Escape',
            'Enter',
            'Tab',
            'Delete',
            'Backspace',
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Shift+ArrowRight',
            'Control+Z',
            'Control+Y',
            'Control+Shift+Z',
            'Control+D',
            'Control+G',
            'Control+A',
            'Control+C',
            'Control+V',
            'Control+K',
            'Control+S',
            'v',
            's',
            't',
            'n',
            'p',
            'm',
            'PageDown',
            'Home'
          ]);
          action = 'key ' + key;
          await page.keyboard.press(key);
        } else if (r < 0.9) {
          // Drag somewhere on the sheet: moves decals, draws a selection box, or uses the active tool.
          const box = await page
            .locator('#paper')
            .boundingBox()
            .catch(() => null);
          const area = box || { x: 300, y: 150, width: 800, height: 600 };
          const x1 = area.x + rnd() * area.width,
            y1 = area.y + rnd() * area.height,
            x2 = x1 + (rnd() - 0.5) * 300,
            y2 = y1 + (rnd() - 0.5) * 300;
          action = `drag ${Math.round(x1)},${Math.round(y1)} → ${Math.round(x2)},${Math.round(y2)}`;
          await page.mouse.move(x1, y1);
          await page.mouse.down();
          for (let k = 1; k <= 5; k++)
            await page.mouse.move(x1 + ((x2 - x1) * k) / 5, y1 + ((y2 - y1) * k) / 5);
          await page.mouse.up();
        } else {
          action = 'scroll';
          await page.mouse.move(300 + rnd() * 900, 150 + rnd() * 650);
          await page.mouse.wheel(0, (rnd() - 0.5) * 1500);
        }
        recent.push(action);
        if (recent.length > 40) recent.shift();
        const kind = action.split(' ')[0];
        counts[kind] = (counts[kind] || 0) + 1;
        // Is the window still answering? A long answer is a freeze.
        const started = Date.now();
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
        const took = Date.now() - started;
        if (took > 1000) await note('freeze', `${took} ms after: ${action}`);
        // Every so often: the sheet in memory is still valid.
        if (step % 25 === 0) {
          const bad = await page.evaluate(() => {
            try {
              DM.validateProject(JSON.parse(JSON.stringify(Studio.project)));
              return null;
            } catch (e) {
              return e.message;
            }
          });
          if (bad) await note('invalid sheet', bad);
        }
        if (step % 200 === 0)
          console.log(
            `step ${step}, ${Math.round((deadline - Date.now()) / 60000)} min left, ${problems.size} problems`
          );
      } catch (e) {
        if (!page || page.isClosed() || /closed|Target page|crashed/i.test(e.message)) {
          await note('window closed or crashed', e.message + ' after ' + recent.at(-1));
          await app.close().catch(() => {});
          await launch();
        } else await note('test step failed', e.message + ' during ' + (action || '?'));
      }
    }
  } finally {
    // Close the way a user does (it saves first), then check the stored data.
    await app.close().catch(() => {});
  }
  let storage = 'ok';
  try {
    S.execute(workspace, 'verify');
    S.closeSession(workspace);
  } catch (e) {
    storage = e.message;
    await note('storage check failed', e.message);
  }
  const report = {
    seed: startSeed,
    minutes,
    steps: step,
    counts,
    storage,
    problems: [...problems.values()]
  };
  await fs.writeFile(path.join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ run, seed: startSeed, steps: step, problems: problems.size, storage }));
  if (problems.size) process.exitCode = 1;
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
