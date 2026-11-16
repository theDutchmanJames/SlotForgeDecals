(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model.js') : root.DM);
  if (typeof module === 'object') module.exports = api;
  else root.Creation = api;
})(globalThis, DM => {
  'use strict';
  const styles = { roundel: 'Roundel', oval: 'Oval plate', plate: 'Number plate' };
  function numberTemplate(options, measure) {
    const style = options.style || 'roundel';
    if (!styles[style]) throw Error('Choose a number template.');
    const text = String(options.text ?? '27').trim();
    if (!/^[a-z\d -]{1,6}$/i.test(text)) throw Error('Use 1–6 letters, digits, spaces or hyphens.');
    const w = DM.number(options.w, 5, 150, 'Width'),
      h = style === 'roundel' ? w : DM.number(options.h, 5, 150, 'Height');
    const border = DM.number(options.border, 0, Math.min(5, w / 5, h / 5), 'Border');
    const background = DM.item(style === 'plate' ? 'rect' : 'ellipse', {
      name: 'Background',
      x: 0,
      y: 0,
      w,
      h,
      fill: options.background,
      stroke: options.outline,
      strokeWidth: border,
      radius: style === 'plate' ? Math.min(w, h) * 0.09 : 0
    });
    const number = DM.item('text', {
      name: 'Race number',
      text,
      font: options.font || 'Arial',
      bold: options.bold !== false,
      italic: false,
      spacing: 0,
      fill: options.foreground,
      strokeWidth: 0
    });
    const b = measure(number),
      maxW = (w - border * 2) * (style === 'plate' ? 0.8 : 0.65),
      maxH = (h - border * 2) * (style === 'plate' ? 0.7 : 0.65),
      k = Math.min(maxW / b.w, maxH / b.h);
    Object.assign(number, {
      textBounds: b,
      w: b.w * k,
      h: b.h * k,
      x: (w - b.w * k) / 2,
      y: (h - b.h * k) / 2
    });
    return DM.validateItem(
      DM.item('group', {
        name: styles[style] + ' ' + text,
        x: 0,
        y: 0,
        w,
        h,
        baseW: w,
        baseH: h,
        children: [background, number]
      })
    );
  }
  function at(root, path) {
    let node = root;
    for (const n of path) {
      if (node.kind !== 'group' || !Number.isInteger(n) || !node.children[n])
        throw Error('This group element is no longer available.');
      node = node.children[n];
    }
    return node;
  }
  function editable(root, path) {
    let node = root;
    if (node.locked) throw Error('Unlock this group before editing.');
    for (const n of path) {
      node = at(node, [n]);
      if (node.locked) throw Error('Unlock this element before editing.');
    }
    return node;
  }
  function session(source) {
    if (source.kind !== 'group') throw Error('Select a grouped decal.');
    editable(source, []);
    let draft = DM.clone(source),
      undo = [],
      redo = [];
    return {
      get draft() {
        return DM.clone(draft);
      },
      get canUndo() {
        return !!undo.length;
      },
      get canRedo() {
        return !!redo.length;
      },
      change(path, fn, { unlock = false } = {}) {
        if (!path.length) throw Error('Edit the contents; resize the complete group on the sheet.');
        const next = DM.clone(draft);
        editable(next, unlock ? path.slice(0, -1) : path);
        fn(at(next, path), at(next, path.slice(0, -1)), path.at(-1));
        const valid = DM.validateItem(next);
        if (JSON.stringify(valid) === JSON.stringify(draft)) return;
        undo.push(draft);
        if (undo.length > 200) undo.shift();
        redo = [];
        draft = valid;
      },
      add(path, item) {
        const next = DM.clone(draft),
          parent = editable(next, path);
        if (parent.kind !== 'group') throw Error('Select a group.');
        parent.children.push(DM.clone(item));
        const valid = DM.validateItem(next);
        undo.push(draft);
        if (undo.length > 200) undo.shift();
        redo = [];
        draft = valid;
        return parent.children.length - 1;
      },
      remove(path) {
        this.change(path, (_i, parent, n) => {
          if (parent.children.length === 1) throw Error('Keep at least one element in a group.');
          parent.children.splice(n, 1);
        });
      },
      undo() {
        if (undo.length) {
          redo.push(draft);
          draft = undo.pop();
        }
      },
      redo() {
        if (redo.length) {
          undo.push(draft);
          draft = redo.pop();
        }
      }
    };
  }
  // Batch numbers: "1-12, 21, 33 7A" → ['1', …, '12', '21', '33', '7A']. Ranges keep the
  // width of a zero-padded start ("01-03" → 01, 02, 03). Duplicates are removed.
  const BATCH_LIMIT = 200;
  function numberList(spec) {
    const out = [];
    for (const token of String(spec || '')
      .split(/[\s,;]+/)
      .filter(Boolean)) {
      const range = /^(\d{1,4})-(\d{1,4})$/.exec(token);
      if (range) {
        const [a, b] = [Number(range[1]), Number(range[2])],
          pad = range[1].length > 1 && range[1].startsWith('0') ? range[1].length : 0;
        if (b < a) throw Error(`Write the range ${token} from low to high.`);
        if (b - a >= BATCH_LIMIT) throw Error(`Add at most ${BATCH_LIMIT} numbers at once.`);
        for (let n = a; n <= b; n++) out.push(String(n).padStart(pad, '0'));
      } else if (/^[a-z\d]{1,6}$/i.test(token)) out.push(token);
      else throw Error(`"${token.slice(0, 12)}" is not a number or range such as 1-12.`);
      if (out.length > BATCH_LIMIT) throw Error(`Add at most ${BATCH_LIMIT} numbers at once.`);
    }
    return [...new Set(out)];
  }
  return { styles, numberTemplate, numberList, BATCH_LIMIT, at, session };
});
