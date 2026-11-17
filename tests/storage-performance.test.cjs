// Storage speed-ups must not change what is kept: targeted cleanup, the worker's open connection and
// stored sheet thumbnails.
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  DM = require('../renderer/model.js'),
  S = require('../src/sqlite-store.cjs');

function workspace(t) {
  const parent = path.resolve(__dirname, '../test-output');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'storage-speed-'));
  t.after(() => {
    S.closeSession(dir);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return dir;
}
// A small valid PNG; different seeds give different (unshared) artwork.
function png(seed) {
  const crc = b => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length);
    Buffer.from(type).copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, seed & 255, 1, 2, 3, 4, 5, 0, 6, 7, 8, 9, 10, 11]);
  return (
    'data:image/png;base64,' +
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0))
    ]).toString('base64')
  );
}
const image = seed => DM.item('image', { src: png(seed), pixelsW: 2, pixelsH: 2, w: 10, h: 10 });
const workspaceData = project =>
  DM.validateWorkspace({
    format: 'slotforge-decals-workspace',
    version: 1,
    libraryMode: 'external',
    project,
    library: [],
    libraryFonts: [],
    settings: {}
  });
// After every operation a full sweep must find nothing left behind.
function nothingLeft(dir, label) {
  const db = S.connection(path.join(dir, S.FILE));
  try {
    db.exec('BEGIN');
    assert.equal(S.collectAll(db), 0, label + ': unused rows were left behind');
    db.exec('ROLLBACK');
  } finally {
    db.close();
  }
}
const count = (dir, table) => {
  const db = S.connection(path.join(dir, S.FILE));
  try {
    return db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  } finally {
    db.close();
  }
};

test('targeted cleanup removes exactly what a full sweep would', t => {
  const dir = workspace(t),
    run = (method, args) => S.execute(dir, method, args);
  const p = DM.project('Cleanup');
  p.items = [image(1), image(2), DM.item('rect')];
  run('save', { data: workspaceData(p) });
  nothingLeft(dir, 'first save');
  // Autosaves rotate three previous versions; the fourth one's unique artwork must go.
  for (let n = 3; n < 8; n++) {
    p.items = [image(n), DM.item('rect')];
    run('save', { data: workspaceData(p) });
    nothingLeft(dir, 'autosave ' + n);
  }
  const assetsAfterSaves = count(dir, 'assets');
  assert.ok(
    assetsAfterSaves <= 4,
    'only current and three previous versions keep artwork: ' + assetsAfterSaves
  );
  // Saved sheets with history, imports and decal library changes.
  const sheet = DM.project('Sheet');
  sheet.items = [image(20)];
  run('saveSheet', { project: sheet, thumbnail: png(21) });
  sheet.items = [image(22)];
  run('saveSheet', { project: sheet, thumbnail: png(23) });
  nothingLeft(dir, 'sheet with history');
  run('import', [DM.project('Imported A'), { ...DM.project('Imported B'), items: [image(24)] }]);
  nothingLeft(dir, 'sheet import');
  run('catalog-import', {
    decals: [30, 31, 32].map(n => ({ id: 'd' + n, name: 'Decal ' + n, scale: 32, art: image(n) })),
    fonts: []
  });
  nothingLeft(dir, 'decal import');
  const before = count(dir, 'assets');
  const entry = run('catalog-query', { scope: 'decals', limit: 10 }).entries.find(e => e.name === 'Decal 31');
  run('catalog-delete', entry);
  nothingLeft(dir, 'decal delete');
  assert.equal(count(dir, 'assets'), before - 1, 'the deleted decal’s own artwork is removed');
  // A complete backup restored over the workspace (bulk path).
  const backup = path.join(dir, 'Backups', 'check.sfdbbackup');
  run('backup', { destination: backup });
  p.items = [image(40)];
  run('save', { data: workspaceData(p) });
  run('restore', { source: backup });
  nothingLeft(dir, 'restore');
  assert(run('verify'));
});

test('the worker keeps one connection per workspace and recovers after errors', t => {
  const dir = workspace(t),
    p = DM.project('Session');
  S.session(dir, 'save', { data: workspaceData(p) });
  const loaded = S.session(dir, 'load');
  assert.equal(loaded.data.project.name, 'Session');
  // A failing call closes the connection; the next call reopens it and works.
  assert.throws(
    () => S.session(dir, 'read', { entry: { scope: 'projects', file: '../x' } }),
    /Invalid project/
  );
  assert.equal(S.session(dir, 'load').data.project.name, 'Session');
  // Stale saves are still refused with a kept connection.
  assert.throws(
    () => S.session(dir, 'save', { data: workspaceData(DM.project('Other')), expected: 'stale' }),
    /another session/
  );
  // Close releases the file so it can be deleted (Windows refuses to delete open files).
  S.session(dir, 'close');
  fs.renameSync(path.join(dir, S.FILE), path.join(dir, 'moved.sqlite'));
  fs.renameSync(path.join(dir, 'moved.sqlite'), path.join(dir, S.FILE));
  assert.equal(S.session(dir, 'load').data.project.name, 'Session');
});

test('sheet thumbnails are read without loading the sheet', t => {
  const dir = workspace(t),
    sheet = DM.project('Thumb');
  sheet.items = [image(50)];
  const thumb = png(51);
  S.execute(dir, 'saveSheet', { project: sheet, thumbnail: thumb });
  S.execute(dir, 'import', [DM.project('No thumbnail')]);
  const entries = S.execute(dir, 'catalog-query', { scope: 'projects', limit: 10 }).entries;
  const saved = entries.find(e => e.name === 'Thumb'),
    imported = entries.find(e => e.name === 'No thumbnail');
  assert.equal(S.execute(dir, 'thumbnail', { entry: saved }), thumb);
  assert.equal(S.execute(dir, 'thumbnail', { entry: imported }), null, 'imported sheets have none');
  assert.equal(S.execute(dir, 'thumbnail', { entry: { ...saved, stamp: 'old' } }), null, 'stale entry');
  for (const file of ['../decals.sqlite', 'a/b.sfsheet', 'c:x'])
    assert.throws(() => S.execute(dir, 'thumbnail', { entry: { ...saved, file } }), /Invalid project/);
});
