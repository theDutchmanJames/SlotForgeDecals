// Builds the car preview images in assets/cars/ from the supplied side-and-top sheets in
// source-assets/cars/. Each sheet holds a side view above a top view on a transparent
// background, nose to the left. The script splits them at the empty band between the views,
// crops each view tightly, makes the body fully opaque and writes compact WebP files.
const sharp = require('sharp'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const root = path.resolve(__dirname, '..'),
  source = path.join(root, 'source-assets', 'cars'),
  out = path.join(root, 'assets', 'cars');
const BODIES = ['classic-gt', 'touring', 'rally', 'group-c'];

async function split(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width,
    H = info.height,
    alpha = (x, y) => data[(y * W + x) * 4 + 3];
  const rowEmpty = y => {
    for (let x = 0; x < W; x++) if (alpha(x, y) > 10) return false;
    return true;
  };
  // Widest empty band in the middle of the sheet separates the side and top views.
  let best = null,
    start = -1;
  for (let y = Math.floor(H * 0.25); y < H * 0.75; y++) {
    if (rowEmpty(y)) {
      if (start < 0) start = y;
      if (!best || y - start > best.end - best.start) best = { start, end: y };
    } else start = -1;
  }
  if (!best) throw Error('No gap between the side and top views in ' + path.basename(file));
  const cut = Math.round((best.start + best.end) / 2);
  const view = async (y0, y1) => {
    let x0 = W,
      x1 = 0,
      t = H,
      b = 0;
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < W; x++)
        if (alpha(x, y) > 24)
          ((x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (t = Math.min(t, y)), (b = Math.max(b, y)));
    const pad = 4,
      left = Math.max(0, x0 - pad),
      top = Math.max(0, t - pad),
      width = Math.min(W, x1 + pad + 1) - left,
      height = Math.min(H, b + pad + 1) - top;
    const crop = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
      .extract({ left, top, width, height })
      .raw()
      .toBuffer();
    // Lossy WebP alpha left the body ~94% opaque; anything clearly inside becomes solid.
    for (let i = 3; i < crop.length; i += 4) if (crop[i] >= 224) crop[i] = 255;
    return sharp(crop, { raw: { width, height, channels: 4 } });
  };
  return { side: await view(0, cut), top: await view(cut, H) };
}

async function main() {
  await fs.mkdir(out, { recursive: true });
  for (const body of BODIES) {
    const views = await split(path.join(source, body + '.webp'));
    for (const [name, image] of Object.entries(views)) {
      const file = path.join(out, `${body}-${name}.webp`);
      await image.webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(file);
      const meta = await sharp(file).metadata(),
        size = (await fs.stat(file)).size;
      console.log(
        `${path.relative(root, file)}: ${meta.width} × ${meta.height} px, ${Math.round(size / 1024)} KB`
      );
    }
  }
  // Precomputed sizes and outlines let the app skip decoding car images at startup.
  const bounds = require('./build-car-bounds.cjs');
  await fs.writeFile(path.join(root, 'renderer/car-bounds.js'), bounds.source(await bounds.carBounds()));
  console.log('renderer/car-bounds.js updated');
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
