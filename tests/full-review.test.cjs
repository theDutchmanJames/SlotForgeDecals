// Checks for the fixes from the full app review (2026-11-20): storage backfills and snapshots,
// saved-decal updates, backups after a failed autosave, and the faster layout tools.
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  S = require('../src/sqlite-store.cjs'),
  D = require('../renderer/model.js'),
  L = require('../renderer/layout.js'),
  { Workspace } = require('../src/storage.cjs');
function fixture(t) {
  fs.mkdirSync('test-output', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('test-output/review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }));
  return { root, run: (method, args) => S.execute(root, method, args) };
}
const decal = (n, extra = {}) => ({
  id: 'decal-' + n,
  name: 'Decal ' + n,
  tags: 'Sponsors',
  scale: 32,
  art: D.item('rect'),
  added: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
  ...extra
});
const workspace = name => ({
  format: 'slotforge-decals-workspace',
  version: 1,
  libraryMode: 'external',
  project: D.project(name),
  library: [],
  libraryFonts: [],
  settings: {}
});

test('older libraries get their tag keys in one go, and the tag shelves find them', t => {
  const { root, run } = fixture(t);
  run('load');
  for (let n = 0; n < 40; n++) run('catalog-save', { decal: decal(n), fonts: [] });
  // As saved before tag shelves: no tag keys.
  const db = S.connection(path.join(root, S.FILE));
  db.exec("UPDATE records SET metadata=json_remove(metadata,'$.tagKey') WHERE scope='decals'");
  db.close();
  S.closeSession(root);
  const started = performance.now();
  assert.equal(run('catalog-shelves').tags[0].count, 40);
  assert(performance.now() - started < 3000, 'one transaction, not one commit per decal');
  assert.equal(run('catalog-query', { filter: 'tag:sponsors' }).total, 40);
});

test('updating a saved decal keeps its creator, and Recover counts unreadable deleted sheets', t => {
  const { root, run } = fixture(t);
  run('load');
  const saved = run('catalog-save', { decal: decal(1, { creator: 'Alice' }), fonts: [] });
  const value = run('catalog-read', saved);
  const { creator, ...rest } = value.decal;
  assert.equal(creator, 'Alice');
  const updated = run('catalog-save', {
    ...value,
    decal: { ...rest, name: 'New artwork' },
    expected: saved.stamp
  });
  assert.equal(run('catalog-read', updated).decal.creator, 'Alice');
  const db = S.connection(path.join(root, S.FILE));
  db.prepare('INSERT INTO migration_issues VALUES(?,?,?)').run(
    'Projects/History/x.sfsheet',
    'history',
    'bad'
  );
  db.close();
  assert.equal(run('catalog-query', { scope: 'deleted' }).unreadable, 1);
});

test('automatic snapshots are spaced out instead of the last few autosaves', t => {
  const { run } = fixture(t),
    data = workspace('Sheet');
  run('load');
  for (let n = 0; n < 6; n++) {
    data.project.name = 'Edit ' + n;
    run('save', { data });
  }
  // The first earlier state is kept; the next ones wait until it is ten minutes old.
  const snapshots = run('list', { scope: 'workspace' }).entries;
  assert.equal(snapshots.length, 1);
  assert.equal(run('read', { entry: snapshots[0] }).project.name, 'Edit 0');
});

test('a failed autosave does not block a complete backup', async t => {
  const { root } = fixture(t),
    ws = new Workspace(root);
  await ws.read();
  await assert.rejects(ws.save({ ...workspace('Sheet'), library: [decal(1)] }), /Autosave/);
  const destination = root + '-backup.sfdbbackup';
  t.after(() => fs.rmSync(destination, { force: true }));
  await ws.backup(destination);
  assert(fs.existsSync(destination));
  await require('../src/sqlite-client.cjs').close(root); // before the folder is removed
});

test('auto-arrange stays fast on big sheets and keeps the cutting gap', () => {
  const p = D.project('Big');
  for (let n = 0; n < 600; n++) p.items.push(D.item('rect', { x: 10, y: 10, w: 8, h: 6 }));
  const started = performance.now(),
    result = L.pack(p, { scope: 'all' });
  assert(performance.now() - started < 2000, 'was over a minute');
  const items = result.project.items;
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++)
      if (items[a].page === items[b].page)
        assert(!D.overlaps(D.bounds(items[a]), D.bounds(items[b]), p.gap), 'no two decals too close');
  assert.equal(D.warnings(result.project).length, 0);
});

test('fill finds every free spot, and free space is found on pages with many decals', () => {
  const p = D.project('Fill');
  p.items = [D.item('rect', { id: 'a', x: 10, y: 10, w: 20, h: 10 })];
  const result = L.fill(p, ['a'], 400);
  assert(result.copies > 50);
  assert.equal(D.warnings(result.project).filter(w => w.type === 'spacing').length, 0);
  // More than 400 decals on a page no longer means "no free space".
  const busy = D.project('Busy');
  busy.pageSize = 'custom';
  busy.customPage = { w: 297, h: 420 };
  for (let n = 0; n < 450; n++)
    busy.items.push(D.item('rect', { x: 10 + (n % 30) * 9, y: 10 + Math.floor(n / 30) * 5, w: 6, h: 2 }));
  assert(D.freeSpot(D.item('rect', { w: 20, h: 20 }), busy, busy.items));
});

test('spacing warnings only compare decals on the same page', () => {
  const p = D.project('Pages');
  p.pages = 2;
  p.items = [
    D.item('rect', { id: 'a', name: 'A', x: 20, y: 20, page: 0 }),
    D.item('rect', { id: 'b', name: 'B', x: 20, y: 20, page: 1 }),
    D.item('rect', { id: 'c', name: 'C', x: 22, y: 22, page: 0 })
  ];
  const spacing = D.warnings(p).filter(w => w.type === 'spacing');
  assert.deepEqual(
    spacing.map(w => [w.id, w.other]),
    [['a', 'c']]
  );
});
