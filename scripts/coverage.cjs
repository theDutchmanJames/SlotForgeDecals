// Coverage map: which lines the tests never run. Runs the unit tests and (unless --unit) every
// desktop check with V8 coverage, merges the numbers and writes test-output/coverage/report.txt,
// lowest coverage first. Lines count as run when any test ran them.
//   node scripts/coverage.cjs [--unit] [suite ...]
const fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process'),
  { fileURLToPath } = require('node:url');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'test-output', 'coverage'),
  args = process.argv.slice(2),
  unitOnly = args.includes('--unit'),
  only = args.filter(a => !a.startsWith('--'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

if (!only.length) {
  console.log('Unit tests with coverage…');
  const tests = fs.readdirSync(path.join(root, 'tests')).filter(n => n.endsWith('.test.cjs'));
  const r = spawnSync(process.execPath, ['--test', ...tests.map(n => 'tests/' + n)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_V8_COVERAGE: path.join(out, 'unit') }
  });
  if (r.status) console.error('Some unit tests failed; the map still shows what ran.');
}
if (!unitOnly) {
  const source = fs.readFileSync(path.join(root, 'scripts', 'test-desktop.cjs'), 'utf8'),
    suites = only.length
      ? only
      : [...source.match(/const suites = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const suite of suites) {
    console.log('Desktop check with coverage: ' + suite);
    const r = spawnSync(process.execPath, ['-r', './scripts/coverage-hook.cjs', `tests/${suite}.cjs`], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, SLOTFORGE_COVERAGE_DIR: out }
    });
    if (r.status) console.error(`  ${suite} failed; its numbers are still counted.`);
  }
}

// Merge: per file, a "ran" flag per character from V8's nested ranges (inner ranges win).
const files = new Map();
function local(url) {
  if (!url.startsWith('file:')) return null;
  let file;
  try {
    file = fileURLToPath(url.split('?')[0]);
  } catch {
    return null;
  }
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (rel.startsWith('..') || /node_modules|^tests\/|^vendor\//.test(rel)) return null;
  if (!/^(src|renderer)\//.test(rel)) return null;
  return rel;
}
function add(rel, functions) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return;
  }
  const run = new Uint8Array(text.length),
    here = new Int8Array(text.length).fill(-1);
  const ranges = functions
    .flatMap(f => f.ranges)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) here.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(r.endOffset, text.length));
  for (let i = 0; i < text.length; i++) run[i] = here[i] === 1 ? 1 : 0;
  const known = files.get(rel);
  if (known) for (let i = 0; i < text.length; i++) known.run[i] |= run[i];
  else files.set(rel, { text, run });
}
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (name.endsWith('.json'))
      try {
        for (const s of JSON.parse(fs.readFileSync(file, 'utf8')).result || []) {
          const rel = local(s.url);
          if (rel) add(rel, s.functions);
        }
      } catch {
        // A half-written file from a crashed run.
      }
  }
}
walk(out);

// Every source file appears, also ones no test loads at all.
for (const dir of ['src', 'renderer'])
  for (const name of fs.readdirSync(path.join(root, dir)))
    if (/\.c?js$/.test(name) && name !== 'pdf-lib.cjs' && name !== 'car-bounds.js') {
      const rel = dir + '/' + name;
      if (!files.has(rel)) {
        const text = fs.readFileSync(path.join(root, rel), 'utf8');
        files.set(rel, { text, run: new Uint8Array(text.length) });
      }
    }
files.delete('src/pdf-lib.cjs');
files.delete('renderer/car-bounds.js');

const rows = [];
for (const [rel, { text, run }] of files) {
  let offset = 0,
    total = 0,
    missed = [];
  for (const [n, line] of text.split('\n').entries()) {
    const code = line.replace(/\/\/.*$/, '').trim();
    if (code && !/^[{}()[\];,]*$/.test(code)) {
      total++;
      let any = false;
      for (let i = offset; i < offset + line.length; i++)
        if (run[i] && !/\s/.test(text[i])) {
          any = true;
          break;
        }
      if (!any) missed.push(n + 1);
    }
    offset += line.length + 1;
  }
  const spans = [];
  for (const n of missed) {
    const last = spans.at(-1);
    if (last && n <= last[1] + 2) last[1] = n;
    else spans.push([n, n]);
  }
  rows.push({
    rel,
    total,
    missed: missed.length,
    pct: total ? 100 - (100 * missed.length) / total : 100,
    spans
  });
}
rows.sort((a, b) => a.pct - b.pct);
const sum = rows.reduce((s, r) => [s[0] + r.total, s[1] + r.missed], [0, 0]),
  report = [
    `Coverage map ${new Date().toISOString().slice(0, 10)}${unitOnly ? ' (unit tests only)' : ''}`,
    `All files: ${(100 - (100 * sum[1]) / sum[0]).toFixed(1)}% of ${sum[0]} code lines run`,
    '',
    ...rows.map(
      r =>
        `${r.pct.toFixed(1).padStart(5)}%  ${r.rel.padEnd(32)} ${String(r.missed).padStart(5)} of ${String(r.total).padStart(5)} lines never run` +
        (r.spans.length ? '\n        ' + r.spans.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(' ') : '')
    )
  ].join('\n');
fs.writeFileSync(path.join(out, 'report.txt'), report + '\n');
console.log(report.split('\n').slice(0, 3).join('\n') + '\nFull map: ' + path.join(out, 'report.txt'));
