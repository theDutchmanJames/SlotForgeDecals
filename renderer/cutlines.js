/* SlotForge Decals — print & cut contours. Physical units are millimetres.
   A decal's cut line is either a rectangle around its frame or a contour that follows its
   artwork, both grown by the sheet's offset. Contours are traced from a raster mask:
   small gaps (between letters, for example) are bridged so a design gets one cut line,
   holes are filled, and the outer boundary is simplified to a polygon. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model.js') : root.DM);
  if (typeof module === 'object') module.exports = api;
  else root.Cutlines = api;
})(globalThis, DM => {
  'use strict';
  const BRIDGE_MM = 2; // gaps up to about twice this are bridged into one cut line
  const INF = 1e20;

  // Squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in place on rows/columns.
  function edt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }
  // Squared distance from every pixel to the nearest pixel where `on(i)` is true.
  function distance(w, h, on) {
    const out = new Float64Array(w * h),
      n = Math.max(w, h),
      f = new Float64Array(n),
      d = new Float64Array(n),
      v = new Int32Array(n),
      z = new Float64Array(n + 1);
    for (let i = 0; i < w * h; i++) out[i] = on(i) ? 0 : INF;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = out[y * w + x];
      edt1d(f, h, d, v, z);
      for (let y = 0; y < h; y++) out[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = out[y * w + x];
      edt1d(f, w, d, v, z);
      for (let x = 0; x < w; x++) out[y * w + x] = d[x];
    }
    return out;
  }
  // Bridge gaps (closing by `bridge` px), then grow by `offset` px. Mask: Uint8Array 0/1.
  function grow(mask, w, h, bridge, offset) {
    const out = new Uint8Array(w * h);
    if (bridge > offset) {
      const near = distance(w, h, i => mask[i] === 1),
        b2 = bridge * bridge;
      const far = distance(w, h, i => near[i] > b2),
        keep = (bridge - offset) * (bridge - offset);
      for (let i = 0; i < w * h; i++) out[i] = far[i] > keep ? 1 : 0;
    } else {
      const near = distance(w, h, i => mask[i] === 1),
        o2 = offset * offset;
      for (let i = 0; i < w * h; i++) out[i] = near[i] <= o2 ? 1 : 0;
    }
    return out;
  }
  // Fill enclosed holes: anything not reachable from the border through empty pixels is solid.
  function fillHoles(mask, w, h) {
    const outside = new Uint8Array(w * h),
      stack = [];
    const push = i => {
      if (!outside[i] && !mask[i]) {
        outside[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
    for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
    while (stack.length) {
      const i = stack.pop(),
        x = i % w,
        y = (i - x) / w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = outside[i] ? 0 : 1;
    return out;
  }
  // Follow pixel-edge boundaries ("cracks") with solid pixels on the right; returns closed
  // loops of corner points in pixel units. With holes filled, every loop is an outer contour.
  function trace(mask, w, h) {
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    const edges = new Map(),
      key = (x, y) => y * (w + 1) + x;
    const add = (x1, y1, x2, y2) => {
      const k = key(x1, y1);
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push([x2, y2]);
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!solid(x, y)) continue;
        if (!solid(x, y - 1)) add(x, y, x + 1, y);
        if (!solid(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!solid(x, y + 1)) add(x + 1, y + 1, x, y + 1);
        if (!solid(x - 1, y)) add(x, y + 1, x, y);
      }
    const loops = [];
    for (const [start, list] of edges) {
      while (list.length) {
        const sx = start % (w + 1),
          sy = (start - sx) / (w + 1),
          loop = [[sx, sy]];
        let [x, y] = list.pop(),
          px = sx,
          py = sy;
        while (!(x === sx && y === sy)) {
          loop.push([x, y]);
          const out = edges.get(key(x, y));
          if (!out || !out.length) break;
          // At a pinch point, turn right first so touching shapes stay separate loops.
          const dx = x - px,
            dy = y - py;
          let pick = 0;
          if (out.length > 1) {
            const right = [-dy, dx];
            pick = Math.max(
              0,
              out.findIndex(([nx, ny]) => nx - x === right[0] && ny - y === right[1])
            );
          }
          const [nx, ny] = out.splice(pick, 1)[0];
          px = x;
          py = y;
          x = nx;
          y = ny;
        }
        if (loop.length > 2) loops.push(loop);
      }
    }
    return loops;
  }
  // Douglas–Peucker simplification of a closed loop.
  function simplify(points, tolerance) {
    if (points.length < 4) return points;
    const dp = (pts, a, b, keep) => {
      const [ax, ay] = pts[a],
        [bx, by] = pts[b],
        dx = bx - ax,
        dy = by - ay,
        len = Math.hypot(dx, dy) || 1;
      let worst = -1,
        index = -1;
      for (let i = a + 1; i < b; i++) {
        const dist = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
        if (dist > worst) ((worst = dist), (index = i));
      }
      if (worst > tolerance) {
        dp(pts, a, index, keep);
        keep[index] = true;
        dp(pts, index, b, keep);
      }
    };
    // Split the loop at its two most distant points so both halves are open polylines.
    let far = 0,
      best = -1;
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
      if (d > best) ((best = d), (far = i));
    }
    const pts = [...points, points[0]],
      keep = new Array(pts.length).fill(false);
    keep[0] = keep[far] = keep[pts.length - 1] = true;
    dp(pts, 0, far, keep);
    dp(pts, far, pts.length - 1, keep);
    return pts.filter((_, i) => keep[i]).slice(0, -1);
  }
  const area = loop =>
    loop.reduce((s, [x, y], i) => {
      const [nx, ny] = loop[(i + 1) % loop.length];
      return s + x * ny - nx * y;
    }, 0) / 2;
  // Mask (alpha already thresholded) → polygons in millimetres on the sheet.
  function contourFromMask(mask, w, h, k, originX, originY, offset, bridge = BRIDGE_MM) {
    const grown = fillHoles(grow(mask, w, h, bridge * k, offset * k), w, h);
    return trace(grown, w, h)
      .filter(loop => Math.abs(area(loop)) >= 1)
      .map(loop => simplify(loop, 0.75).map(([x, y]) => ({ x: originX + x / k, y: originY + y / k })))
      .filter(poly => poly.length >= 3);
  }
  // Rectangle around the decal's frame (rotates with it), grown by the offset.
  function rectangle(i, offset) {
    const a = ((i.rotation || 0) * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a),
      cx = i.x + i.w / 2,
      cy = i.y + i.h / 2,
      hw = i.w / 2 + offset,
      hh = i.h / 2 + offset;
    return [
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh]
      ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }))
    ];
  }
  // Browser only: rasterise one decal (fonts and images included) to an alpha mask.
  async function shape(i, p, offset, pxPerMm) {
    const b = DM.bounds(i),
      pad = offset + BRIDGE_MM + 0.5,
      vx = b.x - pad,
      vy = b.y - pad,
      vw = b.w + 2 * pad,
      vh = b.h + 2 * pad;
    const k = Math.min(pxPerMm, 2400 / Math.max(vw, vh)),
      w = Math.max(4, Math.ceil(vw * k)),
      h = Math.max(4, Math.ceil(vh * k));
    const fonts = p.fonts.map(f => `@font-face{font-family:'${f.family}';src:url('${f.data}');}`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="none"><style>${fonts}</style>${Art.element(i, 'cut', 'all')}</svg>`;
    const img = new Image();
    img.src = Art.url(svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data,
      mask = new Uint8Array(w * h);
    for (let n = 0; n < w * h; n++) mask[n] = rgba[n * 4 + 3] >= 24 ? 1 : 0;
    canvas.width = canvas.height = 1;
    return contourFromMask(mask, w, h, k, vx, vy, offset);
  }
  // Cache by decal content and rotation, not position: moving a decal reuses its traced
  // contour. Large image/font strings are shortened in the key.
  const cache = new Map();
  const MOVABLE = new Set(['id', 'name', 'x', 'y', 'page', 'locked', 'carPositions', 'libraryId', 'cutMode']);
  const signature = (i, p, offset, k) => {
    const top = { ...i };
    for (const key of MOVABLE) delete top[key];
    return (
      offset +
      '|' +
      k +
      '|' +
      p.fonts.map(f => f.family).join(',') +
      '|' +
      JSON.stringify(top, (key, v) =>
        typeof v === 'string' && v.length > 240 ? v.length + ':' + v.slice(0, 80) + v.slice(-80) : v
      )
    );
  };
  const shift = (polygons, dx, dy) => polygons.map(poly => poly.map(pt => ({ x: pt.x + dx, y: pt.y + dy })));
  async function forItem(i, p, { pxPerMm = 10 } = {}) {
    const settings = DM.cutSettings(p.cut),
      mode = DM.cutMode(i, p);
    if (mode === 'none') return [];
    if (mode === 'rect') return rectangle(i, settings.offset);
    const key = signature(i, p, settings.offset, pxPerMm);
    if (!cache.has(key)) {
      if (cache.size > 400) cache.delete(cache.keys().next().value);
      cache.set(
        key,
        shape({ ...i, x: 0, y: 0 }, p, settings.offset, pxPerMm).catch(e => {
          cache.delete(key);
          throw e;
        })
      );
    }
    return shift(await cache.get(key), i.x, i.y);
  }
  async function forPage(p, page, options) {
    const out = [];
    for (const i of p.items.filter(x => x.page === page))
      out.push({ item: i, polygons: await forItem(i, p, options) });
    return out;
  }
  const pathData = polygons =>
    polygons
      .map(
        poly =>
          'M ' + poly.map(pt => `${Number(pt.x.toFixed(3))} ${Number(pt.y.toFixed(3))}`).join(' L ') + ' Z'
      )
      .join(' ');
  return {
    BRIDGE_MM,
    distance,
    grow,
    fillHoles,
    trace,
    simplify,
    contourFromMask,
    rectangle,
    forItem,
    forPage,
    pathData
  };
});
