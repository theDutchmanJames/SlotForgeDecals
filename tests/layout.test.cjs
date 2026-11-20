const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../renderer/model.js'),
  L = require('../renderer/layout.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('grid repeats rotated selections at measured cell gaps without changing originals', () => {
  const p = M.project();
  p.items = [
    M.item('rect', {
      x: 25,
      y: 25,
      w: 20,
      h: 10,
      rotation: 30,
      locked: true,
      carPositions: { side: { x: 40, y: 15 } }
    }),
    M.item('text', { x: 55, y: 30, w: 10, h: 5, text: '27' })
  ];
  const before = M.clone(p),
    ids = p.items.map(i => i.id),
    plan = L.gridPlan(p, ids, { rows: 2, columns: 3, gapX: 4, gapY: 7 }),
    r = L.grid(p, ids, plan);
  assert.deepEqual(p, before);
  assert.deepEqual(r.project.items.slice(0, 2), p.items);
  assert.equal(r.added, 10);
  assert.equal(new Set(r.ids).size, 12);
  const b = M.union(r.project.items.slice(2, 4));
  near(b.x - plan.bounds.x - plan.bounds.w, 4);
  const secondRow = M.union(r.project.items.slice(6, 8));
  near(secondRow.y - plan.bounds.y - plan.bounds.h, 7);
  assert.equal(r.project.items[2].locked, false);
  assert.equal(r.project.items[2].carPositions, undefined);
  assert.equal(r.project.items[2].rotation, 30);
  assert.equal(r.project.items[2].w, 20);
  assert.throws(() => L.grid(p, ids, { rows: 1, columns: 1, gapX: 3, gapY: 3 }), /at least two/);
  assert.throws(() => L.grid(p, ids, { rows: 2.5, columns: 2, gapX: 3, gapY: 3 }), /whole numbers/);
  assert.throws(() => L.grid(p, ids, { rows: 100, columns: 100, gapX: 3, gapY: 3 }), /2,000/);
  assert.throws(() => L.grid(p, ids, { rows: 2, columns: 20, gapX: 3, gapY: 3 }), /margins/);
});
test('equal gaps preserve anchors, artwork sizes, other pages and rotation', () => {
  const p = M.project();
  p.pages = 2;
  p.items = [
    M.item('rect', { x: 10, y: 20, w: 10, h: 10 }),
    M.item('rect', { x: 35, y: 30, w: 20, h: 10, rotation: 30 }),
    M.item('rect', { x: 100, y: 40, w: 10, h: 10 }),
    M.item('rect', { page: 1 })
  ];
  const ids = p.items.slice(0, 3).map(i => i.id),
    out = L.distribute(p, ids, 'x'),
    b = out.items.map(M.bounds);
  near(b[1].x - b[0].x - b[0].w, b[2].x - b[1].x - b[1].w);
  assert.deepEqual(out.items[0], p.items[0]);
  assert.deepEqual(out.items[2], p.items[2]);
  assert.deepEqual(out.items[3], p.items[3]);
  assert.equal(out.items[1].rotation, 30);
  assert.equal(out.items[1].w, 20);
  assert.equal(out.items[1].y, 30);
  p.items[1].locked = true;
  assert.throws(() => L.distribute(p, ids, 'x'), /Unlock/);
  p.items[1].locked = false;
  p.items[2].x = 35;
  assert.throws(() => L.distribute(p, ids, 'x'), /Not enough space/);
});
test('alignment uses rotated edges and centres on either axis', () => {
  const p = M.project();
  p.items = [
    M.item('rect', { x: 20, y: 20, w: 20, h: 10, rotation: 45 }),
    M.item('ellipse', { x: 80, y: 90, w: 10, h: 10 })
  ];
  const ids = p.items.map(i => i.id);
  for (const axis of ['x', 'y'])
    for (const edge of ['start', 'center', 'end']) {
      const out = L.align(p, ids, axis, edge),
        b = out.items.map(M.bounds),
        s = axis === 'x' ? 'w' : 'h',
        k = { start: 0, center: 0.5, end: 1 }[edge];
      near(b[0][axis] + b[0][s] * k, b[1][axis] + b[1][s] * k);
    }
});
test('mirroring is reversible, preserves positions and survives sharing', () => {
  const p = M.project();
  p.items = [M.item('text', { text: '27', x: 20, y: 20, rotation: 35 })];
  const ids = p.items.map(i => i.id);
  for (const axis of ['x', 'y']) {
    const out = L.mirror(p, ids, axis);
    assert.equal(out.items[0].rotation, -35);
    assert.equal(out.items[0].x, 20);
    assert.equal(out.items[0][axis === 'x' ? 'flipX' : 'flipY'], true);
    assert.deepEqual(L.mirror(out, ids, axis), p);
    const pack = M.readPack(M.pack([{ name: 'Mirror', scale: 32, art: out.items[0] }]));
    assert.equal(pack.decals[0].art[axis === 'x' ? 'flipX' : 'flipY'], true);
  }
  const g = M.group([
    M.item('text', { x: 10, y: 20, w: 20, h: 10, rotation: 20 }),
    M.item('rect', { x: 40, y: 25, w: 10, h: 5 })
  ]);
  g.flipX = true;
  const children = M.ungroup(g);
  near(children[0].x, g.x + (g.baseW - g.children[0].x - g.children[0].w));
  assert.equal(children[0].rotation, -20);
  assert.equal(children[0].flipX, true);
});
test('page moves keep layout, create only the next page and protect locked selections', () => {
  const p = M.project();
  p.items = [M.item('rect', { rotation: 15 }), M.item('line', { x: 80 })];
  const ids = [p.items[0].id],
    out = L.movePage(p, ids, 1);
  assert.equal(out.pages, 2);
  assert.deepEqual(out.items[0], { ...p.items[0], page: 1 });
  assert.deepEqual(out.items[1], p.items[1]);
  assert.equal(p.pages, 1);
  assert.throws(() => L.movePage(p, ids, 0), /already/);
  assert.throws(() => L.movePage(p, ids, 3), /existing page/);
  p.items[0].locked = true;
  assert.throws(() => L.movePage(p, ids, 1), /Unlock/);
});

test('mirrored pairs flip the layout and artwork for the other side but keep text readable', () => {
  const p = M.project();
  const arrow = M.item('polygon', { name: 'Arrow', x: 10, y: 10, w: 20, h: 10, rotation: 15 });
  const label = M.item('text', { name: 'Number', x: 40, y: 10, w: 10, h: 8, text: '27' });
  const badge = M.item('group', {
    name: 'Badge',
    x: 10,
    y: 30,
    w: 20,
    h: 10,
    baseW: 20,
    baseH: 10,
    children: [
      M.item('rect', { x: 0, y: 0, w: 5, h: 5 }),
      M.item('text', { x: 6, y: 0, w: 10, h: 5, text: 'SF' })
    ]
  });
  p.items = [arrow, label, badge];
  const { project, ids, placed } = L.mirroredPair(p, [arrow.id, label.id, badge.id]);
  assert.equal(placed, true);
  assert.equal(project.items.length, 6);
  assert.deepEqual(p.items.length, 3, 'original project unchanged');
  const [a, t, g] = ids.map(id => project.items.find(i => i.id === id));
  assert.equal(a.flipX, true);
  near(a.rotation, -15);
  assert.equal(t.flipX, false, 'plain text is not mirrored');
  assert.equal(g.flipX, true);
  assert.equal(g.children[1].flipX, true, 'text inside a mirrored group is flipped back');
  assert.equal(g.children[0].flipX, false);
  assert.match(a.name, /\(mirrored\)$/);
  // Layout mirrors: the text that was right of the arrow is now left of it.
  assert.ok(t.x < a.x, 'order reversed');
  // The copies do not overlap the originals.
  const orig = p.items.map(M.bounds),
    copies = [a, t, g].map(M.bounds);
  for (const c of copies)
    for (const o of orig)
      assert.ok(!(c.x < o.x + o.w && c.x + c.w > o.x && c.y < o.y + o.h && c.y + c.h > o.y));
});
test('align to the page or margins, exact spacing and the largest grid that fits', () => {
  const p = M.project();
  p.margin = 8;
  p.items = [
    M.item('rect', { x: 30, y: 40, w: 20, h: 10 }),
    M.item('rect', { x: 70, y: 44, w: 10, h: 10 }),
    M.item('rect', { x: 95, y: 41, w: 15, h: 10 })
  ];
  const ids = p.items.map(i => i.id),
    s = M.size(p);
  const one = L.align(p, [ids[0]], 'x', 'end', 'margins');
  near(one.items[0].x + 20, s.w - 8);
  const centred = L.align(p, [ids[1]], 'y', 'center', 'page');
  near(centred.items[1].y + 5, s.h / 2);
  assert.throws(() => L.align(p, [ids[0]], 'x', 'start'), /at least 2/);
  const spaced = L.space(p, ids, 'x', 6);
  assert.equal(spaced.items[0].x, 30);
  near(spaced.items[1].x, 56);
  near(spaced.items[2].x, 72);
  assert.throws(() => L.space(p, ids, 'x', 150), /margin/);
  const max = L.maxGrid(p, [ids[0]], 2, 2);
  assert.equal(max.columns, Math.floor((s.w - 8 - 30 + 2) / 22));
  assert.equal(max.rows, Math.floor((s.h - 8 - 40 + 2) / 12));
  L.gridPlan(p, [ids[0]], { ...max, gapX: 2, gapY: 2 });
});
test('fill adds copies into free space only, keeping the cutting gap', () => {
  const p = M.project();
  p.gap = 3;
  p.items = [
    M.item('rect', { x: 10, y: 10, w: 40, h: 30 }),
    M.item('rect', { x: 60, y: 10, w: 100, h: 200 })
  ];
  const r = L.fill(p, [p.items[0].id]);
  assert(r.copies > 5);
  const boxes = r.project.items.map(M.bounds);
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++)
      assert(!M.overlaps(boxes[a], boxes[b], 2.999), `${a} overlaps ${b}`);
  assert.equal(L.fill(p, [p.items[0].id], 2).copies, 2);
});
test('pack arranges by scope and order, keeps locked decals and mirrored pairs together', () => {
  const p = M.project();
  p.pages = 2;
  p.items = [
    M.item('rect', { name: 'Small', x: 150, y: 200, w: 10, h: 10 }),
    M.item('rect', { name: 'Big', x: 100, y: 150, w: 60, h: 40 }),
    M.item('rect', { name: 'Small (mirrored)', x: 20, y: 250, w: 10, h: 10 }),
    M.item('rect', { name: 'Locked', x: 8, y: 8, w: 20, h: 20, locked: true }),
    M.item('rect', { name: 'Other page', x: 100, y: 100, w: 10, h: 10, page: 1 })
  ];
  const byName = (out, n) => out.items.find(i => i.name === n);
  const page = L.pack(p, { scope: 'page', order: 'largest', pairs: true, page: 0 }).project;
  assert.deepEqual(byName(page, 'Locked'), p.items[3]);
  assert.deepEqual(byName(page, 'Other page'), p.items[4]);
  assert.equal(page.pages, 2, 'pages outside the scope stay');
  const big = M.bounds(byName(page, 'Big')),
    small = M.bounds(byName(page, 'Small')),
    copy = M.bounds(byName(page, 'Small (mirrored)'));
  assert(big.x < small.x, 'largest first');
  near(copy.x, small.x + small.w + p.gap);
  near(copy.y, small.y);
  const all = L.pack(p, { scope: 'all', order: 'name' });
  assert.equal(all.project.pages, 1, 'empty trailing pages go');
  assert.equal(all.moved, 4);
  const sel = L.pack(p, { scope: 'selection', ids: [p.items[0].id], page: 0 }).project;
  assert.deepEqual(byName(sel, 'Big'), p.items[1]);
  assert.throws(() => L.pack(p, { scope: 'selection', ids: [] }), /Select/);
  assert(L.freeShare(p, 0) > 0.8 && L.freeShare(p, 0) < 1);
});
test('print fixes: into the margins and to free space keep the decal size', () => {
  const p = M.project();
  p.margin = 8;
  p.gap = 3;
  p.items = [
    M.item('rect', { id: 'a', x: 200, y: -2, w: 20, h: 10 }),
    M.item('rect', { id: 'b', x: 30, y: 30, w: 20, h: 10 }),
    M.item('rect', { id: 'c', x: 51, y: 30, w: 20, h: 10 })
  ];
  const s = M.size(p),
    inside = L.intoMargins(p, 'a').items[0];
  assert.equal(inside.x + 20, s.w - 8);
  assert.equal(inside.y, 8);
  assert.equal(inside.w, 20);
  const spacing = M.warnings(p).find(w => w.type === 'spacing');
  assert.equal(spacing.id, 'b');
  assert.equal(spacing.other, 'c');
  const moved = L.toFreeSpot(p, 'c');
  assert(!M.warnings(moved).some(w => w.type === 'spacing' && [w.id, w.other].includes('c')));
  p.items[0].w = 400;
  assert.throws(() => L.intoMargins(p, 'a'), /larger than the printable area/);
});
