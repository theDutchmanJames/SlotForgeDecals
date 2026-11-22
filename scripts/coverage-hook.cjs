// Loaded with `node -r` by scripts/coverage.cjs: records which renderer code each desktop check runs.
// It wraps Playwright's Electron launch, starts precise JS coverage in every window, and writes the
// result to SLOTFORGE_COVERAGE_DIR when the app closes. The main process is covered through
// NODE_V8_COVERAGE, which Electron honours like Node.
const fs = require('node:fs'),
  path = require('node:path'),
  playwright = require('playwright');
const out = process.env.SLOTFORGE_COVERAGE_DIR;
if (out) {
  const launch = playwright._electron.launch.bind(playwright._electron);
  playwright._electron.launch = async options => {
    const env = { ...(options?.env || process.env), NODE_V8_COVERAGE: path.join(out, 'main') };
    const app = await launch({ ...options, env }),
      pages = new Set(),
      watch = async page => {
        try {
          await page.coverage.startJSCoverage({ resetOnNavigation: false });
          pages.add(page);
        } catch {
          // A window that closes at once has nothing to record.
        }
      };
    app.on('window', watch);
    // The first window has already run its start-up code; load it again so that code counts too.
    const first = await app.firstWindow();
    await watch(first);
    await first.reload();
    const close = app.close.bind(app);
    app.close = async () => {
      const results = [];
      for (const page of pages)
        try {
          results.push(...(await page.coverage.stopJSCoverage()));
        } catch {
          // Closed windows lose their numbers; the main window is what matters.
        }
      fs.mkdirSync(path.join(out, 'renderer'), { recursive: true });
      fs.writeFileSync(
        path.join(out, 'renderer', `${process.pid}-${Date.now()}.json`),
        JSON.stringify({ result: results.filter(r => /\/renderer\//.test(r.url)) })
      );
      return close();
    };
    return app;
  };
}
