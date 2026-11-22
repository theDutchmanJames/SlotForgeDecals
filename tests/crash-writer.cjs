// Helper for tests/crash.test.cjs: writes to a Decals workspace in a loop until it is killed.
// After each finished step it appends the step number to a journal (flushed to disk), so the test
// knows what was certainly saved before the kill.
//   node tests/crash-writer.cjs <workspace> <mode> <journal> <first step>
const fs = require('node:fs'),
  path = require('node:path'),
  S = require('../src/sqlite-store.cjs'),
  D = require('../renderer/model.js');
const [root, mode, journal, first] = process.argv.slice(2);
const run = (method, args) => S.execute(root, method, args);
// About 2 MB of image data that differs per step, so each write takes long enough to be interrupted.
const picture = n =>
  'data:image/png;base64,' +
  Buffer.from(Array.from({ length: 1.5e6 }, (_, k) => (k * 13 + n * 101) & 255)).toString('base64');
const sheet = (n, id = 'crash-sheet') => {
  const p = D.project('v' + n);
  p.id = id;
  p.items = [D.item('image', { src: picture(n), pixelsW: 4, pixelsH: 4 }), D.item('rect', { name: 'n' + n })];
  return p;
};
const done = n => {
  const fd = fs.openSync(journal, 'a');
  fs.writeSync(fd, n + '\n');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
};
const steps = {
  sheet: n => run('saveSheet', { project: sheet(n) }),
  autosave: n =>
    run('save', {
      data: {
        format: 'slotforge-decals-workspace',
        version: 1,
        libraryMode: 'external',
        project: sheet(n, 'crash-workspace'),
        library: [],
        libraryFonts: [],
        settings: {}
      }
    }),
  decal: n => {
    const art = D.item('image', { src: picture(n), pixelsW: 4, pixelsH: 4 }),
      entry = run('catalog-query', {}).entries.find(e => e.id === 'crash-decal');
    run('catalog-save', {
      decal: { id: 'crash-decal', name: 'v' + n, tags: '', scale: 32, art },
      fonts: [],
      ...(entry ? { expected: entry.stamp } : {})
    });
  },
  import: n =>
    run(
      'import',
      Array.from({ length: 8 }, (_, k) => {
        const p = sheet(n * 10 + k, 'batch-' + n + '-' + k);
        p.name = 'batch ' + n;
        return p;
      })
    ),
  backup: () =>
    run('backup', { destination: path.join(path.dirname(root), path.basename(root) + '-copy.sfdbbackup') }),
  restore: n => {
    // Alternate: restore the prepared backup, then save a new state on top of it.
    if (n % 2)
      run('restore', { source: path.join(path.dirname(root), path.basename(root) + '-source.sfdbbackup') });
    else run('saveSheet', { project: sheet(n) });
  }
};
for (let n = Number(first); ; n++) {
  steps[mode](n);
  done(n);
}
