'use strict';
// The heavy pixel work off the editor's thread: tracing a cut contour from a decal's mask, and
// packing a page's white-ink plate into 1-bit rows. Both run the same code as on the main thread.
importScripts('model.js', 'cutlines.js');
function packWhite(rgba, width, height) {
  const stride = Math.ceil(width / 8),
    bits = new Uint8Array(stride * height);
  bits.fill(255);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (rgba[(y * width + x) * 4 + 3] >= 128) bits[y * stride + (x >> 3)] &= ~(128 >> (x & 7));
  let binary = '';
  for (let n = 0; n < bits.length; n += 8192) binary += String.fromCharCode(...bits.subarray(n, n + 8192));
  return btoa(binary);
}
self.onmessage = ({ data }) => {
  const { id, job } = data;
  try {
    if (job === 'contour') {
      const { mask, w, h, k, x, y, offset } = data;
      self.postMessage({ id, result: Cutlines.contourFromMask(new Uint8Array(mask), w, h, k, x, y, offset) });
    } else if (job === 'white') {
      self.postMessage({ id, result: packWhite(new Uint8ClampedArray(data.rgba), data.width, data.height) });
    } else throw Error('Unknown pixel job.');
  } catch (error) {
    self.postMessage({ id, error: error.message || 'The pixel work failed.' });
  }
};
