// The precomputed car outlines must match the car images and cover every built-in car.
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const DM = require('../renderer/model.js'),
  bounds = require('../scripts/build-car-bounds.cjs');

test('renderer/car-bounds.js is up to date with the car images', async () => {
  const file = path.join(__dirname, '../renderer/car-bounds.js'),
    context = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { globalThis: context });
  const stored = JSON.parse(JSON.stringify(context.CAR_BOUNDS));
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(DM.CAR_BODIES).sort());
  assert.deepEqual(
    stored,
    await bounds.carBounds(),
    'Car images changed: run node scripts/build-car-bounds.cjs'
  );
});
