'use strict';
const { call } = require('./sqlite-client.cjs');
class Workspace {
  constructor(root) {
    this.root = root;
    this.queue = Promise.resolve();
    this.stamp = null;
  }
  async init() {
    await call(this.root, 'stats');
  }
  async read() {
    await this.queue.catch(() => {});
    const result = await call(this.root, 'load');
    this.stamp = result.stamp;
    return result;
  }
  // data arrives over IPC, so it is already this process's own copy: no need to clone it again.
  save(data) {
    const snapshot = data;
    const job = this.queue
      .catch(() => {})
      .then(async () => {
        const result = await call(this.root, 'save', { data: snapshot, expected: this.stamp });
        this.stamp = result.stamp;
        return true;
      });
    this.queue = job;
    return job;
  }
  catalog(method, args) {
    return call(this.root, 'catalog-' + method, args);
  }
  async restoreLegacy(data) {
    await this.queue.catch(() => {}); // a failed autosave must not block backup or restore
    const result = await call(this.root, 'legacy-restore', { data, expected: this.stamp });
    this.stamp = result.stamp;
    return result;
  }
  exportLegacy(data) {
    return call(this.root, 'legacy-export', { data });
  }
  async close() {
    await this.queue.catch(() => {});
    return call(this.root, 'close');
  }
  stats() {
    return call(this.root, 'stats');
  }
  async backup(destination) {
    await this.queue.catch(() => {}); // a failed autosave must not block backup or restore
    return call(this.root, 'backup', { destination });
  }
  async restore(source) {
    await this.queue.catch(() => {}); // a failed autosave must not block backup or restore
    const result = await call(this.root, 'restore', { source });
    this.stamp = result.stamp;
    return result;
  }
}
module.exports = { Workspace };
