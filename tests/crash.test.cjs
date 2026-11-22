// Crash and interruption tests: a helper process (tests/crash-writer.cjs) saves sheets, autosaves,
// library decals, sheet imports, backups and restores in a loop, and is killed at a random moment.
// The workspace must then open cleanly: the database passes its full check, the last finished step
// is there (or the one that was running, completely), an import is all-or-nothing, a backup file is
// either absent or complete, and no half-written temporary files are left behind.
//   SLOTFORGE_CRASH_ROUNDS=40 node --test tests/crash.test.cjs
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process'),
  S = require('../src/sqlite-store.cjs'),
  D = require('../renderer/model.js');
const ROUNDS = Number(process.env.SLOTFORGE_CRASH_ROUNDS || 3);
let seed = Number(process.env.SLOTFORGE_CRASH_SEED || 7);
const rnd = () => {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 2 ** 32;
};
function fixture(t, name) {
  fs.mkdirSync('test-output', { recursive: true });
  const dir = fs.mkdtempSync(path.resolve('test-output/crash-' + name + '-')),
    root = path.join(dir, 'ws');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  return { dir, root, journal: path.join(dir, 'journal.txt') };
}
const journalled = file =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(Number) : [];
// Starts the writer, lets it finish at least one step, then kills it somewhere in a later one.
async function interrupt({ root, journal }, mode, next) {
  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'crash-writer.cjs'), root, mode, journal, String(next)],
    {
      stdio: ['ignore', 'ignore', 'pipe']
    }
  );
  let stderr = '';
  child.stderr.on('data', d => (stderr += d));
  const exited = new Promise(resolve => child.on('exit', resolve));
  const before = journalled(journal).length;
  for (let n = 0; n < 600 && journalled(journal).length === before; n++) {
    if (child.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 25));
  }
  assert.equal(child.exitCode, null, 'the writer stopped by itself: ' + stderr);
  await new Promise(r => setTimeout(r, 20 + rnd() * 400));
  child.kill('SIGKILL');
  await exited;
  return journalled(journal);
}
// What may be left in the workspace folder after a kill: the database and its folders only.
function leftovers(dir) {
  const found = [];
  const walk = d => {
    for (const name of fs.readdirSync(d)) {
      const file = path.join(d, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (/\.tmp$|\.migration-|^restore-[0-9a-f-]+\.sfdbbackup$/.test(name))
        found.push(path.relative(dir, file));
    }
  };
  walk(dir);
  return found;
}
// Opening after the crash is what Decals does at start: the full check must pass.
const reopen = root => {
  S.closeSession(root);
  S.execute(root, 'load');
  assert.equal(S.execute(root, 'verify'), true);
};
const sheetName = root => {
  const e = S.execute(root, 'list', { scope: 'projects' }).entries.find(e => e.id === 'crash-sheet');
  return e && S.execute(root, 'read', { entry: e }).project.name;
};

for (const mode of ['sheet', 'autosave', 'decal'])
  test(`killed while saving (${mode}): the last save is complete and nothing is damaged`, async t => {
    const f = fixture(t, mode);
    for (let round = 0; round < ROUNDS; round++) {
      const steps = await interrupt(f, mode, journalled(f.journal).length);
      reopen(f.root);
      const last = steps.length - 1,
        name =
          mode === 'sheet'
            ? sheetName(f.root)
            : mode === 'autosave'
              ? S.execute(f.root, 'load').data.project.name
              : S.execute(f.root, 'catalog-read', { id: 'crash-decal' }).decal.name;
      assert(
        ['v' + last, 'v' + (last + 1)].includes(name),
        `round ${round}: found ${name}, last finished v${last}`
      );
      // The picture belongs to that same save, not to an earlier or half-written one.
      if (mode === 'sheet') {
        const p = S.execute(f.root, 'read', {
          entry: S.execute(f.root, 'list', { scope: 'projects' }).entries[0]
        }).project;
        assert.equal(p.items[1].name, 'n' + name.slice(1));
      }
    }
    assert.deepEqual(leftovers(f.root), []);
  });

test('killed while importing sheets: each import is all or nothing', async t => {
  const f = fixture(t, 'import');
  for (let round = 0; round < ROUNDS; round++) {
    const steps = await interrupt(f, 'import', journalled(f.journal).length);
    reopen(f.root);
    const counts = {};
    for (const e of S.execute(f.root, 'list', { scope: 'projects' }).entries)
      counts[e.name] = (counts[e.name] || 0) + 1;
    for (const [name, count] of Object.entries(counts)) assert.equal(count, 8, `${name} is complete`);
    for (const n of steps) assert.equal(counts['batch ' + n], 8, `finished batch ${n} is kept`);
    assert(Object.keys(counts).length <= steps.length + 1);
  }
  assert.deepEqual(leftovers(f.root), []);
});

test('killed while backing up: the backup file is absent or complete, and no partial copies remain', async t => {
  const f = fixture(t, 'backup');
  S.execute(f.root, 'load');
  for (let n = 0; n < 6; n++) {
    const p = D.project('Sheet ' + n);
    p.items = [
      D.item('image', {
        src: 'data:image/png;base64,' + Buffer.alloc(1e6, n + 1).toString('base64'),
        pixelsW: 4,
        pixelsH: 4
      })
    ];
    S.execute(f.root, 'saveSheet', { project: p });
  }
  S.closeSession(f.root);
  const copy = f.root + '-copy.sfdbbackup';
  for (let round = 0; round < ROUNDS; round++) {
    await interrupt(f, 'backup', 0);
    reopen(f.root);
    if (fs.existsSync(copy)) {
      const db = S.connection(copy);
      try {
        S.verifyAll(db);
      } finally {
        db.close();
      }
    }
    // The next backup to the same file clears what an interrupted one left, so they never pile up.
    assert(
      fs.readdirSync(f.dir).filter(n => n.endsWith('.tmp')).length <= 1,
      `round ${round}: half-written backup copies pile up`
    );
  }
  S.execute(f.root, 'backup', { destination: copy });
  assert.deepEqual(
    fs.readdirSync(f.dir).filter(n => n.endsWith('.tmp')),
    []
  );
});

test('killed while restoring a backup: the workspace is the old one or the restored one, never a mix', async t => {
  const f = fixture(t, 'restore');
  // The backup to restore: one sheet, "from backup".
  const source = path.join(f.dir, 'source');
  const p = D.project('from backup');
  p.id = 'crash-sheet';
  p.items = [
    D.item('image', {
      src: 'data:image/png;base64,' + Buffer.alloc(3e6, 9).toString('base64'),
      pixelsW: 4,
      pixelsH: 4
    })
  ];
  S.execute(source, 'load');
  S.execute(source, 'saveSheet', { project: p });
  S.execute(source, 'backup', { destination: f.root + '-source.sfdbbackup' });
  S.closeSession(source);
  for (let round = 0; round < ROUNDS; round++) {
    const steps = await interrupt(f, 'restore', journalled(f.journal).length);
    reopen(f.root);
    const name = sheetName(f.root),
      last = steps.length - 1,
      allowed = ['from backup', 'v' + last, 'v' + (last + 1)];
    assert(allowed.includes(name), `round ${round}: found ${name}, expected one of ${allowed.join(', ')}`);
  }
  assert.deepEqual(leftovers(f.root), [], 'no staging copies left: ' + leftovers(f.root).join(', '));
});
