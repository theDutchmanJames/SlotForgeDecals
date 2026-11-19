const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const { installerNames } = require('../scripts/release-manifest.cjs');
const { options } = require('../scripts/build-desktop.cjs');
test('Release assets distinguish native Linux labels and Mac architectures', () => {
  assert.deepEqual(installerNames('0.2.12', 'linux', 'x64'), [
    'SlotForgeDecals-0.2.12-linux-x86_64.AppImage',
    'SlotForgeDecals-0.2.12-linux-amd64.deb'
  ]);
  assert.deepEqual(installerNames('0.2.12', 'windows', 'x64'), [
    'SlotForgeDecals-0.2.12-Portable-x64.exe',
    'SlotForgeDecals-0.2.12-Setup-x64.exe'
  ]);
  assert.equal(
    new Set(
      ['windows', 'mac', 'linux'].flatMap(p =>
        (p === 'windows' ? ['x64'] : ['x64', 'arm64']).flatMap(a => installerNames('0.2.12', p, a))
      )
    ).size,
    10
  );
  const pkg = require('../package.json');
  assert.deepEqual(pkg.build.win.target, ['portable', 'nsis']);
  assert.equal(pkg.build.portable.artifactName, 'SlotForgeDecals-${version}-Portable-${arch}.${ext}');
  assert.equal(pkg.build.nsis.artifactName, 'SlotForgeDecals-${version}-Setup-${arch}.${ext}');
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.throws(() => installerNames('../bad', 'linux', 'x64'));
  assert.throws(() => installerNames('0.2.12', 'windows', 'arm64'));
});
test('Native builder validates target arguments and supports unattended runs', () => {
  assert.deepEqual(options(['mac', '--arch', 'arm64', '--no-pause', '--quick']), {
    platform: 'mac',
    arch: 'arm64',
    quick: true,
    pause: false,
    help: false
  });
  assert.throws(() => options(['mac', '--arch', 'ia32']));
  assert.throws(() => options(['linux', '--unknown']));
});
test('Native packages keep converter resources external and retain all import runtimes', () => {
  const pkg = require('../package.json'),
    lock = require('../package-lock.json');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert(
    pkg.build.extraResources.some(
      r => r.to === 'ghostscript' && r.filter.includes('bin/gs') && r.filter.includes('bin/gswin64c.exe')
    )
  );
  assert(pkg.build.asarUnpack.includes('node_modules/mupdf/**/*'));
  assert(pkg.build.files.includes('vendor/imagetracer/**/*'));
  assert(
    fs
      .readFileSync('scripts/publish-release.cjs', 'utf8')
      .includes('Release tag must match the tested source')
  );
});
test('The update check finds the release file for every kind of Decals copy', () => {
  const { fileFor } = require('../src/update-check.cjs');
  const names = [
    ['windows', 'x64'],
    ['mac', 'x64'],
    ['mac', 'arm64'],
    ['linux', 'x64'],
    ['linux', 'arm64']
  ].flatMap(([p, a]) => installerNames('0.5.0', p, a));
  const latest = { version: '0.5.0', assets: names.map(name => ({ name, size: 1 })) };
  const pick = edition => fileFor(latest, edition, 'SlotForgeDecals')?.name;
  assert.equal(pick({ platform: 'win32', arch: 'x64' }), 'SlotForgeDecals-0.5.0-Setup-x64.exe');
  assert.equal(
    pick({ platform: 'win32', arch: 'x64', portable: true }),
    'SlotForgeDecals-0.5.0-Portable-x64.exe'
  );
  assert.equal(pick({ platform: 'darwin', arch: 'arm64' }), 'SlotForgeDecals-0.5.0-mac-arm64.dmg');
  assert.equal(pick({ platform: 'darwin', arch: 'x64' }), 'SlotForgeDecals-0.5.0-mac-x64.dmg');
  assert.equal(
    pick({ platform: 'linux', arch: 'x64', appImage: true }),
    'SlotForgeDecals-0.5.0-linux-x86_64.AppImage'
  );
  assert.equal(pick({ platform: 'linux', arch: 'x64' }), 'SlotForgeDecals-0.5.0-linux-amd64.deb');
  assert.equal(
    pick({ platform: 'linux', arch: 'arm64', appImage: true }),
    'SlotForgeDecals-0.5.0-linux-arm64.AppImage'
  );
  assert.equal(pick({ platform: 'linux', arch: 'arm64' }), 'SlotForgeDecals-0.5.0-linux-arm64.deb');
});
