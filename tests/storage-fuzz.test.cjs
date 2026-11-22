// Random-sequence test of the storage: thousands of random saves, updates, deletes, restores and
// imports of sheets, library decals and the workspace, run against a plain in-memory copy of what
// should be stored. Artwork (images, fonts) is stored once and shared, and anything no longer used
// is removed after every write; after each step the test checks that nothing is missing and nothing
// is left behind, and that every sheet and decal reads back exactly as expected.
//   SLOTFORGE_FUZZ_STEPS=20000 SLOTFORGE_FUZZ_SEED=123 node --test tests/storage-fuzz.test.cjs
process.env.SLOTFORGE_SNAPSHOT_MS = '0';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  S = require('../src/sqlite-store.cjs'),
  D = require('../renderer/model.js');

// Small seeded random generator, so a failure can be replayed with its seed.
function random(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 2 ** 32;
  };
  return {
    next,
    int: n => Math.floor(next() * n),
    pick: list => list[Math.floor(next() * list.length)],
    chance: p => next() < p
  };
}
const clone = v => JSON.parse(JSON.stringify(v));
const b64 = (n, size) =>
  Buffer.from(Array.from({ length: size }, (_, k) => (n * 31 + k * 7) & 255)).toString('base64');
// A small pool, so the same picture and font turn up on many sheets and decals.
const IMAGES = Array.from({ length: 6 }, (_, n) => 'data:image/png;base64,' + b64(n + 1, 40 + n));
const FONTS = Array.from({ length: 3 }, (_, n) => ({
  family: 'sf-font-fuzz' + n,
  name: 'Fuzz ' + n,
  data: 'data:font/ttf;base64,' + b64(n + 50, 30)
}));

function makeItem(r, decals) {
  const kind = r.pick(['rect', 'ellipse', 'image', 'image', 'text', 'group', 'library']);
  const at = { x: 10 + r.int(150), y: 10 + r.int(220), w: 5 + r.int(30), h: 5 + r.int(20) };
  if (kind === 'image') return D.item('image', { ...at, src: r.pick(IMAGES), pixelsW: 4, pixelsH: 4 });
  if (kind === 'text') return D.item('text', { ...at, text: 'No ' + r.int(99), font: r.pick(FONTS).family });
  if (kind === 'group')
    return D.group([
      D.item('image', { x: at.x, y: at.y, w: 10, h: 10, src: r.pick(IMAGES), pixelsW: 4, pixelsH: 4 }),
      D.item('rect', { x: at.x + 12, y: at.y, w: 10, h: 10 })
    ]);
  if (kind === 'library' && decals.size)
    return D.item('image', {
      ...at,
      src: r.pick(IMAGES),
      pixelsW: 4,
      pixelsH: 4,
      libraryId: r.pick([...decals.keys()])
    });
  return D.item(kind === 'library' ? 'rect' : kind, {
    ...at,
    fill: '#' + (0x100000 + r.int(0xefffff)).toString(16)
  });
}
function makeProject(r, decals, id) {
  const p = D.project('Sheet ' + r.int(1000));
  if (id) p.id = id;
  const n = r.int(6);
  for (let k = 0; k < n; k++) p.items.push(makeItem(r, decals));
  const used = new Set(JSON.stringify(p.items).match(/sf-font-fuzz\d/g) || []);
  p.fonts = FONTS.filter(f => used.has(f.family));
  return D.validateProject(p);
}
function makeDecal(r, decals, id) {
  const art = r.chance(0.3)
    ? D.group([makeItem(r, new Map()), D.item('image', { src: r.pick(IMAGES), pixelsW: 4, pixelsH: 4 })])
    : makeItem(r, new Map());
  delete art.libraryId;
  return {
    decal: {
      id: id || 'decal-' + r.int(1e9),
      name: 'Decal ' + r.int(1000),
      tags: r.pick(['', 'Sponsors', 'Numbers, Team', 'Team']),
      scale: 32,
      art,
      ...(r.chance(0.3) ? { creator: 'Maker ' + r.int(5) } : {})
    },
    fonts: FONTS.filter(f => JSON.stringify(art).includes(f.family))
  };
}
const libraryIds = p => {
  const ids = new Set(),
    walk = list => {
      for (const i of list || []) {
        if (i.libraryId) ids.add(i.libraryId);
        walk(i.children);
      }
    };
  walk(p.items);
  return ids;
};
const decalShape = d => {
  const { added, updated, ...rest } = d;
  return rest;
};

function fuzz(t, seed, steps) {
  fs.mkdirSync('test-output', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('test-output/fuzz-'));
  t.after(() => {
    S.closeSession(root);
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  });
  const run = (method, args) => S.execute(root, method, args),
    r = random(seed),
    log = [];
  run('load');
  const file = path.join(root, S.FILE),
    sheets = new Map(), // id → project as saved
    history = new Map(), // id → number of earlier versions kept
    decals = new Map(), // id → { decal, fonts, stamp, favourite }
    workspaces = []; // saved workspace projects, newest last
  const check = full => {
    const db = S.connection(file);
    try {
      const garbage = {
        documents: db
          .prepare(
            'SELECT count(*) n FROM documents WHERE hash NOT IN (SELECT document FROM records) AND hash NOT IN (SELECT child FROM document_links)'
          )
          .get().n,
        assets: db
          .prepare('SELECT count(*) n FROM assets WHERE hash NOT IN (SELECT asset FROM asset_links)')
          .get().n,
        missingDocuments: db
          .prepare(
            'SELECT count(*) n FROM (SELECT document h FROM records UNION SELECT child FROM document_links) WHERE h NOT IN (SELECT hash FROM documents)'
          )
          .get().n,
        missingAssets: db
          .prepare('SELECT count(*) n FROM asset_links WHERE asset NOT IN (SELECT hash FROM assets)')
          .get().n
      };
      assert.deepEqual(
        garbage,
        { documents: 0, assets: 0, missingDocuments: 0, missingAssets: 0 },
        'storage tidy'
      );
      if (full) S.verifyAll(db);
    } finally {
      db.close();
    }
    if (!full) return;
    const listed = run('list', { scope: 'projects' }).entries;
    assert.deepEqual(listed.map(e => e.id).sort(), [...sheets.keys()].sort(), 'saved sheets');
    for (const e of listed)
      assert.deepEqual(run('read', { entry: e }).project, sheets.get(e.id), 'sheet ' + e.id);
    for (const [id, count] of history)
      assert.equal(
        run('list', { scope: 'history', projectId: id }).entries.length,
        count,
        'history of ' + id
      );
    const q = run('catalog-query', { limit: 60 });
    assert.equal(q.total, decals.size, 'library size');
    for (const [id, d] of decals) {
      const stored = run('catalog-read', { id, stamp: d.stamp });
      assert.deepEqual(decalShape(stored.decal), d.decal, 'decal ' + id);
      assert.deepEqual(
        stored.fonts.map(f => f.family).sort(),
        d.fonts.map(f => f.family).sort(),
        'fonts of ' + id
      );
    }
    assert.equal(
      run('catalog-query', { filter: 'favourite', limit: 60 }).total,
      [...decals.values()].filter(d => d.favourite).length,
      'favourites'
    );
    if (decals.size) {
      const id = r.pick([...decals.keys()]),
        expected = [...sheets.values()]
          .filter(p => libraryIds(p).has(id))
          .map(p => p.id)
          .sort();
      const used = run('catalog-used-on', { id });
      assert.deepEqual(used.map(e => e.id).sort(), expected, 'sheets using ' + id);
    }
    if (workspaces.length) {
      assert.deepEqual(run('load').data.project, workspaces.at(-1), 'workspace');
      const snaps = run('list', { scope: 'workspace' }).entries.sort((a, b) => a.file.localeCompare(b.file));
      assert.equal(snaps.length, Math.min(3, workspaces.length - 1), 'snapshots');
      snaps.forEach((s, n) =>
        assert.deepEqual(run('read', { entry: s }).project, workspaces.at(-2 - n), s.file)
      );
    }
  };
  const saveSheet = project => {
    const before = sheets.get(project.id);
    run('saveSheet', { project });
    if (before && JSON.stringify(before) !== JSON.stringify(project))
      history.set(project.id, (history.get(project.id) || 0) + 1);
    sheets.set(project.id, clone(project));
  };
  const actions = {
    newSheet: () => saveSheet(makeProject(r, decals)),
    editSheet: () => {
      if (!sheets.size) return;
      const p = clone(sheets.get(r.pick([...sheets.keys()])));
      if (p.items.length && r.chance(0.4)) p.items.splice(r.int(p.items.length), 1);
      else p.items.push(makeItem(r, decals));
      if (r.chance(0.2)) p.name = 'Renamed ' + r.int(100);
      const used = new Set(JSON.stringify(p.items).match(/sf-font-fuzz\d/g) || []);
      p.fonts = FONTS.filter(f => used.has(f.family));
      saveSheet(D.validateProject(p));
    },
    sameSheet: () => sheets.size && saveSheet(clone(sheets.get(r.pick([...sheets.keys()])))),
    deleteSheet: () => {
      if (!sheets.size) return;
      const id = r.pick([...sheets.keys()]),
        entry = run('list', { scope: 'projects' }).entries.find(e => e.id === id);
      run('deleteSheet', { id, stamp: entry.stamp });
      sheets.delete(id);
      history.set(id, (history.get(id) || 0) + 1);
    },
    recover: () => {
      const all = run('list', { scope: 'history' }).entries;
      if (!all.length) return;
      const entry = r.pick(all),
        old = run('read', { entry }).project;
      saveSheet(old);
    },
    importSheets: () => {
      const projects = Array.from({ length: 1 + r.int(3) }, () => makeProject(r, decals));
      for (const [n, made] of run('import', projects).entries()) {
        const p = clone(projects[n]);
        p.id = made.id;
        const stored = run('read', {
          entry: run('list', { scope: 'projects' }).entries.find(e => e.id === made.id)
        }).project;
        p.added = stored.added;
        sheets.set(made.id, D.validateProject(p));
      }
    },
    newDecal: () => {
      if (decals.size > 60) return;
      const d = makeDecal(r, decals),
        saved = run('catalog-save', clone(d));
      decals.set(d.decal.id, {
        decal: decalShape(D.validateLibrary([d.decal], d.fonts).library[0]),
        fonts: d.fonts,
        stamp: saved.stamp
      });
    },
    updateDecal: () => {
      if (!decals.size) return;
      const id = r.pick([...decals.keys()]),
        old = decals.get(id),
        d = makeDecal(r, decals, id);
      const saved = run('catalog-save', { ...clone(d), expected: old.stamp });
      const shape = decalShape(D.validateLibrary([d.decal], d.fonts).library[0]);
      if (!shape.creator && old.decal.creator) shape.creator = old.decal.creator;
      decals.set(id, { ...old, decal: shape, fonts: d.fonts, stamp: saved.stamp });
    },
    deleteDecal: () => {
      if (!decals.size) return;
      const id = r.pick([...decals.keys()]);
      run('catalog-delete', { id, stamp: decals.get(id).stamp });
      decals.delete(id);
    },
    favourite: () => {
      if (!decals.size) return;
      const id = r.pick([...decals.keys()]),
        favourite = r.chance(0.6),
        saved = run('catalog-mark', { id, favourite });
      decals.set(id, { ...decals.get(id), favourite, stamp: saved.stamp });
    },
    importDecals: () => {
      if (decals.size > 60) return;
      const made = Array.from({ length: 1 + r.int(3) }, () => makeDecal(r, decals)),
        fonts = [...new Map(made.flatMap(d => d.fonts).map(f => [f.family, f])).values()];
      const saved = run('catalog-import', { decals: made.map(d => clone(d.decal)), fonts });
      saved.forEach((e, n) => {
        const shape = decalShape(
          D.validateLibrary([{ ...made[n].decal, id: e.id }], made[n].fonts).library[0]
        );
        decals.set(e.id, { decal: shape, fonts: made[n].fonts, stamp: e.stamp });
      });
    },
    autosave: () => {
      const project = makeProject(r, decals);
      run('save', {
        data: {
          format: 'slotforge-decals-workspace',
          version: 1,
          libraryMode: 'external',
          project,
          library: [],
          libraryFonts: [],
          settings: {}
        }
      });
      if (JSON.stringify(workspaces.at(-1)) !== JSON.stringify(project)) workspaces.push(project);
    },
    reopen: () => S.closeSession(root)
  };
  const weights = {
    newSheet: 8,
    editSheet: 12,
    sameSheet: 3,
    deleteSheet: 4,
    recover: 4,
    importSheets: 2,
    newDecal: 8,
    updateDecal: 6,
    deleteDecal: 4,
    favourite: 4,
    importDecals: 2,
    autosave: 6,
    reopen: 1
  };
  const bag = Object.entries(weights).flatMap(([k, w]) => Array(w).fill(k));
  for (let step = 0; step < steps; step++) {
    const name = r.pick(bag);
    log.push(name);
    try {
      actions[name]();
      check(step % 50 === 49 || step === steps - 1);
    } catch (e) {
      e.message += `\n  seed ${seed}, step ${step} (${name}); last steps: ${log.slice(-8).join(', ')}`;
      throw e;
    }
  }
  return { sheets: sheets.size, decals: decals.size };
}

const STEPS = Number(process.env.SLOTFORGE_FUZZ_STEPS || 600),
  SEEDS = process.env.SLOTFORGE_FUZZ_SEED ? [Number(process.env.SLOTFORGE_FUZZ_SEED)] : [1, 2, 3];
for (const seed of SEEDS)
  test(`random storage sequence, seed ${seed}`, t => {
    const result = fuzz(t, seed, STEPS);
    assert(result.sheets + result.decals > 0);
  });
