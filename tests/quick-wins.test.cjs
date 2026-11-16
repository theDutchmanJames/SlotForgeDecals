const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../renderer/model.js');

const overlaps = (a, b, gap) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

test('new items go to the first free spot inside the margins, keeping the cutting gap', () => {
  const p = M.project();
  const first = M.item('rect', { x: 0, y: 0, w: 20, h: 10 });
  assert.deepEqual(M.freeSpot(first, p, []), { x: p.margin, y: p.margin });
  const blocker = M.item('rect', { x: p.margin, y: p.margin, w: 30, h: 30 });
  const spot = M.freeSpot(first, p, [blocker]);
  assert.deepEqual(spot, { x: p.margin + 30 + p.gap, y: p.margin });
  assert.ok(!overlaps({ ...spot, w: 20, h: 10 }, M.bounds(blocker), p.gap - 1e-9));
});

test('free spot accounts for rotation and skips rows that are blocked', () => {
  const p = M.project();
  const s = M.size(p);
  // A full-width band across the top forces the next row below it.
  const band = M.item('rect', { x: p.margin, y: p.margin, w: s.w - 2 * p.margin, h: 40 });
  const rotated = M.item('rect', { x: 0, y: 0, w: 30, h: 10, rotation: 90 });
  const spot = M.freeSpot(rotated, p, [band]);
  const placed = M.bounds({ ...rotated, ...spot });
  assert.ok(placed.y >= p.margin + 40 + p.gap - 1e-9, 'below the band');
  assert.ok(Math.abs(placed.x - p.margin) < 1e-9, 'rotated bounds start at the margin');
});

test('free spot returns null when the page is full or the item is larger than the printable area', () => {
  const p = M.project();
  const s = M.size(p);
  const full = M.item('rect', { x: p.margin, y: p.margin, w: s.w - 2 * p.margin, h: s.h - 2 * p.margin });
  assert.equal(M.freeSpot(M.item('rect', { w: 5, h: 5 }), p, [full]), null);
  assert.equal(M.freeSpot(M.item('rect', { w: s.w, h: 10 }), p, []), null);
});

test('colour helpers rank sheet colours by use and keep a short recent list', () => {
  const K = require('../renderer/colour-kit.js');
  const items = [
    M.item('rect', { fill: '#E5484D', stroke: '#111111', strokeWidth: 0 }),
    M.item('rect', { fill: '#e5484d', stroke: '#222222', strokeWidth: 1 }),
    M.item('group', { fill: 'none', children: [M.item('text', { fill: '#245CC3' })] })
  ];
  assert.deepEqual(K.sheetColours(items), ['#e5484d', '#222222', '#245cc3']);
  let recent = [];
  for (const c of ['#000000', '#ffffff', '#000000', 'red', '#123456']) recent = K.addRecent(recent, c, 3);
  assert.deepEqual(recent, ['#123456', '#000000', '#ffffff']);
});
