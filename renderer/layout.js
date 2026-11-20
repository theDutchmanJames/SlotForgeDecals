(function (root, factory) {
  if (typeof module === 'object') module.exports = factory(require('./model.js'));
  else root.Layout = factory(root.DM);
})(globalThis, DM => {
  'use strict';
  function selection(p, ids, min = 1, unlocked = false) {
    const wanted = new Set(ids),
      list = p.items.filter(i => wanted.has(i.id));
    if (list.length < min)
      throw Error(min === 1 ? 'Select at least one decal.' : `Select at least ${min} decals.`);
    if (list.some(i => i.page !== list[0].page)) throw Error('Select decals on the same page.');
    if (unlocked && list.some(i => i.locked))
      throw Error('Unlock all selected decals before arranging them.');
    return list;
  }
  function gridPlan(p, ids, options) {
    const sources = selection(p, ids),
      b = DM.union(sources),
      rows = DM.number(options.rows, 1, 100, 'Rows'),
      columns = DM.number(options.columns, 1, 100, 'Columns'),
      gapX = DM.number(options.gapX, 0, 100, 'Horizontal gap'),
      gapY = DM.number(options.gapY, 0, 100, 'Vertical gap');
    if (!Number.isInteger(rows) || !Number.isInteger(columns))
      throw Error('Rows and columns must be whole numbers.');
    if (rows * columns < 2)
      throw Error('Choose at least two cells. The first cell is your original selection.');
    const added = (rows * columns - 1) * sources.length;
    if (p.items.length + added > 2000)
      throw Error('A project supports up to 2,000 decals. Reduce the rows or columns.');
    const width = columns * b.w + (columns - 1) * gapX,
      height = rows * b.h + (rows - 1) * gapY,
      s = DM.size(p),
      m = p.margin;
    if (
      b.x < m - 0.00001 ||
      b.y < m - 0.00001 ||
      b.x + width > s.w - m + 0.00001 ||
      b.y + height > s.h - m + 0.00001
    )
      throw Error(
        'This grid extends beyond the printable margins. Reduce its rows, columns or gaps, or move the original selection toward the top left.'
      );
    return { sources, bounds: b, rows, columns, gapX, gapY, width, height, added };
  }
  function grid(p, ids, options) {
    const plan = gridPlan(p, ids, options),
      out = DM.clone(p),
      selected = plan.sources.map(i => i.id);
    for (let row = 0; row < plan.rows; row++)
      for (let col = 0; col < plan.columns; col++) {
        if (row === 0 && col === 0) continue;
        for (const source of plan.sources) {
          const i = DM.clone(source);
          i.id = DM.uid();
          i.x += col * (plan.bounds.w + plan.gapX);
          i.y += row * (plan.bounds.h + plan.gapY);
          i.locked = false;
          delete i.carPositions;
          out.items.push(i);
          selected.push(i.id);
        }
      }
    return { project: out, ids: selected, added: plan.added };
  }
  // The box decals align to: the selection itself, the whole page, or the printable area inside
  // the margins. Aligning to the page or margins works for a single decal too.
  function alignBox(p, list, to) {
    const s = DM.size(p),
      m = p.margin;
    if (to === 'page') return { x: 0, y: 0, w: s.w, h: s.h };
    if (to === 'margins') return { x: m, y: m, w: s.w - 2 * m, h: s.h - 2 * m };
    if (to !== 'selection') throw Error('Invalid alignment target.');
    return DM.union(list);
  }
  function align(p, ids, axis, edge, to = 'selection') {
    if (!['x', 'y'].includes(axis) || !['start', 'center', 'end'].includes(edge))
      throw Error('Invalid alignment.');
    const out = DM.clone(p),
      list = selection(out, ids, to === 'selection' ? 2 : 1, true),
      b = alignBox(out, list, to),
      size = axis === 'x' ? 'w' : 'h',
      factor = { start: 0, center: 0.5, end: 1 }[edge],
      target = b[axis] + b[size] * factor;
    for (const i of list) {
      const ib = DM.bounds(i);
      i[axis] += target - ib[axis] - ib[size] * factor;
    }
    return out;
  }
  function distribute(p, ids, axis) {
    if (!['x', 'y'].includes(axis)) throw Error('Invalid distribution.');
    const out = DM.clone(p),
      list = selection(out, ids, 3, true).sort((a, b) => DM.bounds(a)[axis] - DM.bounds(b)[axis]),
      size = axis === 'x' ? 'w' : 'h',
      boxes = list.map(DM.bounds);
    const first = boxes[0],
      last = boxes.at(-1),
      gap =
        (last[axis] + last[size] - first[axis] - boxes.reduce((s, b) => s + b[size], 0)) / (list.length - 1);
    if (gap < -0.00001)
      throw Error('Not enough space for equal gaps. Move the two outer decals farther apart first.');
    let position = first[axis] + first[size] + Math.max(0, gap);
    for (let n = 1; n < list.length - 1; n++) {
      list[n][axis] += position - boxes[n][axis];
      position += boxes[n][size] + Math.max(0, gap);
    }
    return out;
  }
  // Exact spacing: the first decal (left-most or top-most) stays; the others follow it in order,
  // each the given gap after the previous one, measured between their outlines.
  function space(p, ids, axis, gapValue) {
    if (!['x', 'y'].includes(axis)) throw Error('Invalid spacing direction.');
    const gap = DM.number(gapValue, 0, 200, 'Spacing'),
      out = DM.clone(p),
      list = selection(out, ids, 2, true).sort((a, b) => DM.bounds(a)[axis] - DM.bounds(b)[axis]),
      size = axis === 'x' ? 'w' : 'h';
    let position = DM.bounds(list[0])[axis] + DM.bounds(list[0])[size] + gap;
    for (const i of list.slice(1)) {
      const b = DM.bounds(i);
      i[axis] += position - b[axis];
      position += b[size] + gap;
    }
    const s = DM.size(p),
      end = position - gap;
    if (end > (axis === 'x' ? s.w : s.h) - p.margin + 0.00001)
      throw Error('At this spacing the decals run past the margin. Use a smaller gap or move the first one.');
    return out;
  }
  // The most columns and rows of the selection that fit between it and the margins.
  function maxGrid(p, ids, gapXValue, gapYValue) {
    const sources = selection(p, ids),
      b = DM.union(sources),
      s = DM.size(p),
      m = p.margin,
      gapX = DM.number(gapXValue, 0, 100, 'Horizontal gap'),
      gapY = DM.number(gapYValue, 0, 100, 'Vertical gap'),
      fit = (room, cell, gap) =>
        Math.max(1, Math.min(100, Math.floor((room + gap + 0.00001) / (cell + gap))));
    return { columns: fit(s.w - m - b.x, b.w, gapX), rows: fit(s.h - m - b.y, b.h, gapY) };
  }
  // Fill the free space of the selection's page with copies of the selection, keeping the
  // cutting gap from everything already there. Copies keep the selection's internal layout.
  function fill(p, ids, limit = 400) {
    const out = DM.clone(p),
      sources = selection(out, ids),
      page = sources[0].page,
      b = DM.union(sources),
      block = DM.item('rect', { x: b.x, y: b.y, w: b.w, h: b.h }),
      others = out.items.filter(i => i.page === page),
      added = [];
    while (out.items.length + sources.length <= 2000 && added.length < limit * sources.length) {
      const spot = DM.freeSpot(block, out, others);
      if (!spot) break;
      const box = DM.item('rect', { x: spot.x, y: spot.y, w: b.w, h: b.h, page });
      for (const source of sources) {
        const i = DM.clone(source);
        i.id = DM.uid();
        i.x += spot.x - b.x;
        i.y += spot.y - b.y;
        i.locked = false;
        delete i.carPositions;
        out.items.push(i);
        added.push(i.id);
      }
      others.push(box);
    }
    return { project: out, ids: added, copies: added.length / sources.length, added: added.length };
  }
  // Auto-arrange with choices: which decals move (this page, all pages or the selection), in which
  // order, and whether a decal and its mirrored copy stay side by side. Locked decals and decals
  // outside the scope stay where they are. Nothing is resized.
  function pack(p, options = {}) {
    const scope = options.scope || 'all',
      order = options.order || 'largest',
      current = options.page || 0;
    if (!['all', 'page', 'selection'].includes(scope)) throw Error('Invalid arrange scope.');
    if (!['largest', 'layers', 'name'].includes(order)) throw Error('Invalid arrange order.');
    const out = DM.clone(p),
      s = DM.size(out),
      m = out.margin,
      g = out.gap,
      wanted = new Set(options.ids || []);
    const moves = i =>
      !i.locked &&
      (scope === 'all' || (scope === 'page' ? i.page === current : wanted.has(i.id) && i.page === current));
    let movable = out.items.filter(moves);
    if (!movable.length)
      throw Error(
        scope === 'selection'
          ? 'Select unlocked decals to arrange.'
          : 'There are no unlocked decals to arrange.'
      );
    const area = i => DM.bounds(i).w * DM.bounds(i).h;
    if (order === 'largest')
      movable.sort((a, b) => area(b) - area(a) || out.items.indexOf(a) - out.items.indexOf(b));
    if (order === 'name')
      movable.sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      );
    if (options.pairs) {
      // A mirrored copy ("Name (mirrored)") follows its original directly.
      const copies = movable.filter(i => / \(mirrored\)$/.test(i.name || ''));
      for (const c of copies) {
        const original = movable.find(i => i !== c && i.name === c.name.replace(/ \(mirrored\)$/, ''));
        if (!original) continue;
        movable.splice(movable.indexOf(c), 1);
        movable.splice(movable.indexOf(original) + 1, 0, c);
      }
    }
    const fixed = out.items.filter(i => !movable.includes(i)).map(i => ({ ...DM.bounds(i), page: i.page })),
      placed = [...fixed],
      pages = scope === 'all' ? Array.from({ length: 50 }, (_, n) => n) : [current];
    for (const i of movable) {
      const b = DM.bounds(i);
      if (b.w > s.w - 2 * m + 0.0001 || b.h > s.h - 2 * m + 0.0001)
        throw Error(`“${i.name}” is larger than the printable area. Resize it first.`);
      let found = false;
      for (const page of pages) {
        const obstacles = placed.filter(o => o.page === page),
          xs = [m, ...obstacles.map(o => o.x + o.w + g)].sort((a, b) => a - b),
          ys = [m, ...obstacles.map(o => o.y + o.h + g)].sort((a, b) => a - b);
        for (const y of ys) {
          for (const x of xs) {
            const c = { x, y, w: b.w, h: b.h };
            if (
              x + b.w > s.w - m + 0.0001 ||
              y + b.h > s.h - m + 0.0001 ||
              obstacles.some(o => DM.overlaps(c, o, g))
            )
              continue;
            i.x += x - b.x;
            i.y += y - b.y;
            i.page = page;
            placed.push({ ...c, page });
            found = true;
            break;
          }
          if (found) break;
        }
        if (found) break;
      }
      if (!found)
        throw Error(
          scope === 'all'
            ? 'These decals need more than 50 pages.'
            : 'Not everything fits on this page. Choose All pages, or make room first.'
        );
    }
    // Arranging everything drops pages left empty at the end.
    if (scope === 'all') out.pages = Math.max(1, ...out.items.map(i => i.page + 1));
    return { project: out, moved: movable.length, pages: out.pages };
  }
  // How much of a page's printable area is still free, from 0 to 1.
  function freeShare(p, page) {
    const s = DM.size(p),
      m = p.margin,
      printable = (s.w - 2 * m) * (s.h - 2 * m),
      used = p.items
        .filter(i => i.page === page)
        .reduce((sum, i) => sum + DM.bounds(i).w * DM.bounds(i).h, 0);
    return Math.max(0, Math.min(1, 1 - used / printable));
  }
  // Print-check fixes. Into the margins: the decal moves just far enough to sit inside them.
  function intoMargins(p, id) {
    const out = DM.clone(p),
      i = out.items.find(x => x.id === id);
    if (!i) throw Error('This decal is no longer on the sheet.');
    if (i.locked) throw Error('Unlock this decal first.');
    const s = DM.size(out),
      m = out.margin,
      b = DM.bounds(i);
    if (b.w > s.w - 2 * m + 0.00001 || b.h > s.h - 2 * m + 0.00001)
      throw Error(`“${i.name}” is larger than the printable area. Make it smaller first.`);
    i.x += Math.max(m - b.x, Math.min(0, s.w - m - (b.x + b.w)));
    i.y += Math.max(m - b.y, Math.min(0, s.h - m - (b.y + b.h)));
    return out;
  }
  // Too close to cut: the decal moves to free space on its page, keeping the cutting gap.
  function toFreeSpot(p, id) {
    const out = DM.clone(p),
      i = out.items.find(x => x.id === id);
    if (!i) throw Error('This decal is no longer on the sheet.');
    if (i.locked) throw Error('Unlock this decal first.');
    const spot = DM.freeSpot(
      i,
      out,
      out.items.filter(x => x.page === i.page && x !== i)
    );
    if (!spot)
      throw Error('There is no free space left on this page. Move it to another page in the Layout tab.');
    i.x = spot.x;
    i.y = spot.y;
    return out;
  }
  function mirror(p, ids, axis) {
    if (!['x', 'y'].includes(axis)) throw Error('Invalid mirror direction.');
    const out = DM.clone(p),
      list = selection(out, ids, 1, true),
      key = axis === 'x' ? 'flipX' : 'flipY';
    for (const i of list) {
      i[key] = !i[key];
      i.rotation = -(i.rotation || 0);
    }
    return out;
  }
  function movePage(p, ids, target) {
    const out = DM.clone(p),
      list = selection(out, ids, 1, true),
      page = DM.number(target, 0, 49, 'Page');
    if (!Number.isInteger(page) || page > p.pages)
      throw Error('Choose an existing page or the next new page.');
    if (page === list[0].page) throw Error('These decals are already on that page.');
    out.pages = Math.max(out.pages, page + 1);
    for (const i of list) i.page = page;
    return out;
  }
  // Left/right pair: copies of the selection mirrored horizontally (layout included), for the
  // other side of the car. Text keeps reading correctly: a text decal is copied unflipped and
  // text inside groups is flipped back within its own box. Copies go to free space.
  function mirroredPair(p, ids) {
    const out = DM.clone(p),
      list = selection(out, ids, 1);
    if (out.items.length + list.length > 2000) throw Error('A project supports up to 2,000 decals.');
    const boxes = list.map(DM.bounds),
      left = Math.min(...boxes.map(b => b.x)),
      right = Math.max(...boxes.map(b => b.x + b.w)),
      top = Math.min(...boxes.map(b => b.y)),
      bottom = Math.max(...boxes.map(b => b.y + b.h));
    const readable = i => {
      if (i.kind === 'text') i.flipX = !i.flipX;
      if (i.kind === 'group' || i.kind === 'slice') i.children.forEach(readable);
    };
    const copies = list.map(source => {
      const c = DM.clone(source);
      c.id = DM.uid();
      c.locked = false;
      delete c.carPositions;
      c.name = String(source.name || 'Decal').slice(0, 148) + ' (mirrored)';
      c.x = left + right - (source.x + source.w);
      if (c.kind !== 'text') {
        c.flipX = !c.flipX;
        c.rotation = -(c.rotation || 0);
        if (c.kind === 'group' || c.kind === 'slice') c.children.forEach(readable);
      } else c.rotation = -(c.rotation || 0);
      return c;
    });
    // Find room for the whole mirrored set, keeping its internal layout.
    const block = DM.item('rect', { x: left, y: top, w: right - left, h: bottom - top }),
      page = list[0].page,
      spot = DM.freeSpot(
        block,
        out,
        out.items.filter(i => i.page === page)
      ),
      dx = spot ? spot.x - left : 5,
      dy = spot ? spot.y - top : 5;
    for (const c of copies) {
      c.x += dx;
      c.y += dy;
      out.items.push(c);
    }
    return { project: out, ids: copies.map(c => c.id), placed: !!spot };
  }
  return {
    selection,
    gridPlan,
    grid,
    align,
    distribute,
    space,
    maxGrid,
    fill,
    pack,
    freeShare,
    intoMargins,
    toFreeSpot,
    mirror,
    movePage,
    mirroredPair
  };
});
