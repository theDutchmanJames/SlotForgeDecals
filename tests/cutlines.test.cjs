const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../renderer/model.js'),
  C = require('../renderer/cutlines.js');

// Draw filled rectangles (in mm) into a mask at k px/mm.
function mask(wMm, hMm, k, rects) {
  const w = Math.round(wMm * k),
    h = Math.round(hMm * k),
    m = new Uint8Array(w * h);
  for (const [x, y, rw, rh] of rects)
    for (let py = Math.round(y * k); py < Math.round((y + rh) * k); py++)
      for (let px = Math.round(x * k); px < Math.round((x + rw) * k); px++) m[py * w + px] = 1;
  return { m, w, h };
}
const bounds = poly => {
  const xs = poly.map(p => p.x),
    ys = poly.map(p => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys)
  };
};
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);

test('a square gets one contour grown by the offset, in sheet millimetres', () => {
  const k = 10,
    { m, w, h } = mask(30, 30, k, [[10, 10, 10, 10]]);
  const polys = C.contourFromMask(m, w, h, k, 100, 50, 1, 0);
  assert.equal(polys.length, 1);
  const b = bounds(polys[0]);
  near(b.x, 109, 0.15, 'left');
  near(b.y, 59, 0.15, 'top');
  near(b.w, 12, 0.2, 'width');
  near(b.h, 12, 0.2, 'height');
  assert.ok(polys[0].length < 200, 'simplified, not one point per pixel: ' + polys[0].length);
});

test('nearby parts such as letters share one cut line; distant parts are cut separately', () => {
  const k = 10;
  const letters = mask(60, 30, k, [
    [10, 10, 5, 10],
    [16, 10, 5, 10],
    [22, 10, 5, 10]
  ]);
  assert.equal(C.contourFromMask(letters.m, letters.w, letters.h, k, 0, 0, 0.5).length, 1);
  const apart = mask(80, 30, k, [
    [5, 10, 10, 10],
    [50, 10, 10, 10]
  ]);
  assert.equal(C.contourFromMask(apart.m, apart.w, apart.h, k, 0, 0, 0.5).length, 2);
});

test('holes are not cut: a ring gives only its outer contour', () => {
  const k = 10,
    ring = mask(40, 40, k, [
      [10, 10, 20, 3],
      [10, 27, 20, 3],
      [10, 10, 3, 20],
      [27, 10, 3, 20]
    ]);
  const polys = C.contourFromMask(ring.m, ring.w, ring.h, k, 0, 0, 0.5, 0);
  assert.equal(polys.length, 1);
  near(bounds(polys[0]).w, 21, 0.25, 'outer width');
});

test('rectangle cut lines rotate with the decal and include the offset', () => {
  const i = M.item('rect', { x: 10, y: 20, w: 30, h: 10, rotation: 90 });
  const [poly] = C.rectangle(i, 1);
  const b = bounds(poly);
  near(b.w, 12, 1e-9, 'rotated width');
  near(b.h, 32, 1e-9, 'rotated height');
  near(b.x + b.w / 2, 25, 1e-9, 'centre x');
  near(b.y + b.h / 2, 25, 1e-9, 'centre y');
});

test('cut settings are validated and decals can override the sheet mode', () => {
  assert.deepEqual(M.cutSettings(undefined), { mode: 'shape', offset: 1, preview: true, pdfLines: false });
  assert.deepEqual(M.cutSettings({ mode: 'rect', offset: 9, preview: false, pdfLines: true }), {
    mode: 'rect',
    offset: 5,
    preview: false,
    pdfLines: true
  });
  const p = M.validateProject({ ...M.project(), cut: { mode: 'bogus', offset: -2 } });
  assert.deepEqual(p.cut, { mode: 'shape', offset: 0, preview: true, pdfLines: false });
  const i = M.validateItem(M.item('rect', { cutMode: 'none' }));
  assert.equal(M.cutMode(i, p), 'none');
  assert.equal(M.validateItem(M.item('rect', { cutMode: 'zigzag' })).cutMode, undefined);
  assert.equal(M.cutMode(M.item('rect'), { cut: { mode: 'rect' } }), 'rect');
});

test('path data closes every polygon', () => {
  const d = C.pathData([
    [
      { x: 0, y: 0 },
      { x: 1.23456, y: 0 },
      { x: 1, y: 1 }
    ]
  ]);
  assert.equal(d, 'M 0 0 L 1.235 0 L 1 1 Z');
});
