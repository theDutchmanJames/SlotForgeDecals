'use strict';
// Sends heavy pixel jobs (cut contours, white-ink plates) to pixel-worker.js, so the editor stays
// responsive while print files and cut lines are made. Without a worker (or if it fails to start)
// run() returns null and the caller does the work itself, as before.
const PixelWork = (() => {
  let worker = null,
    broken = typeof Worker === 'undefined',
    next = 1;
  const waiting = new Map();
  function start() {
    if (worker || broken) return worker;
    try {
      worker = new Worker('pixel-worker.js');
      worker.onmessage = ({ data }) => {
        const job = waiting.get(data.id);
        if (!job) return;
        waiting.delete(data.id);
        data.error ? job.reject(Error(data.error)) : job.resolve(data.result);
      };
      worker.onerror = e => {
        // A worker that cannot start or crashes: everything waiting falls back to the main thread.
        e.preventDefault?.();
        broken = true;
        worker = null;
        for (const job of waiting.values()) job.resolve(null);
        waiting.clear();
      };
    } catch {
      broken = true;
      worker = null;
    }
    return worker;
  }
  // message: { job, ... }; transfer: ArrayBuffers handed over (not copied).
  function run(message, transfer = []) {
    const w = start();
    if (!w) return Promise.resolve(null);
    const id = next++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      w.postMessage({ ...message, id }, transfer);
    });
  }
  return { run };
})();
