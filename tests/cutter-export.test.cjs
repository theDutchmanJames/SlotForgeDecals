const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  zlib = require('node:zlib'),
  X = require('../renderer/cutter-export.js');

test('CRC-32 matches the standard check value', () => {
  assert.equal(X.crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(X.crc32(Buffer.from('IEND')), 0xae426082);
});

test('PNG files get a pHYs chunk so cutter software opens them at 300 DPI', () => {
  // Minimal 1x1 PNG built here (signature + IHDR + IDAT + IEND).
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]),
      crc = Buffer.alloc(4);
    crc.writeUInt32BE(X.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk('IEND', Buffer.alloc(0))
  ]);
  const out = Buffer.from(X.withDPI(new Uint8Array(png)));
  assert.equal(out.toString('latin1', 37, 41), 'pHYs');
  assert.equal(out.readUInt32BE(41), 11811);
  assert.equal(out.readUInt32BE(45), 11811);
  assert.equal(out[49], 1);
  assert.equal(out.readUInt32BE(50), X.crc32(out.subarray(37, 50)));
  assert.equal(out.length, png.length + 21);
  assert.throws(() => X.withDPI(new Uint8Array(20)), /PNG/);
});

test('DXF cut files are R12 millimetre polylines with the page Y axis flipped', () => {
  const text = X.dxf(
    [
      [
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 40 }
      ]
    ],
    { w: 210, h: 297 }
  );
  const lines = text.split('\r\n');
  assert.equal(lines[lines.length - 2], 'EOF');
  assert.ok(text.includes('AC1009') && text.includes('$INSUNITS\r\n70\r\n4'));
  assert.equal(text.match(/\r\nPOLYLINE\r\n/g).length, 2, 'page frame + one cut line');
  assert.ok(text.includes('PAGE_FRAME') && text.includes('\r\nCUT\r\n'));
  // (10, 20) on the sheet becomes (10, 277) in DXF coordinates.
  assert.ok(text.includes('10\r\n10\r\n20\r\n277'));
});

test('SVG packages keep print and cut layers at the physical page size', () => {
  const svg = X.cutSVG(
    [
      [
        { x: 1, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 4 }
      ]
    ],
    { w: 148, h: 210 },
    'data:image/png;base64,AAAA'
  );
  assert.ok(svg.startsWith('<svg') && svg.includes('width="148mm" height="210mm" viewBox="0 0 148 210"'));
  assert.ok(svg.includes('<g id="print"><image width="148" height="210"'));
  assert.ok(svg.includes('<g id="cut" fill="none" stroke="#ff0000"'));
  assert.ok(svg.includes('M 1.000 2.000 L 3.000 2.000 L 3.000 4.000 Z'));
});

test('instructions name the machine workflow and the safe print setting', () => {
  const info = { sheet: 'Club', paper: 'A4 portrait', offset: 1, decals: 6, pages: 1 };
  for (const machine of ['silhouette', 'cricut', 'scanncut']) {
    const text = X.instructions(machine, info);
    assert.ok(text.includes('Actual size / 100%'), machine);
    assert.ok(
      text.includes('Offset around artwork') || text.includes('offset around artwork: 1 mm'),
      machine
    );
  }
  assert.ok(X.instructions('silhouette', info).includes('Trace Outer Edge'));
  assert.ok(X.instructions('cricut', info).includes('Print Then Cut'));
  assert.ok(X.instructions('scanncut', info).includes('CanvasWorkspace'));
  assert.equal(X.safe('a/b:c*?'), 'a b c');
});
