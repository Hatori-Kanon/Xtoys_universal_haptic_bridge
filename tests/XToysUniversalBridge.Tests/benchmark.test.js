'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var path = require('node:path');
var test = require('node:test');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var benchmarkScript = path.join(repositoryRoot, 'scripts', 'Benchmark-XToysRuntime.js');

function finiteMilliseconds(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

test('benchmark CLI reports deterministic workloads without timing thresholds', function () {
  var output = childProcess.execFileSync(
    process.execPath,
    [benchmarkScript, '--test'],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  var result = JSON.parse(output);

  assert.equal(result.nodeVersion, process.version);
  assert.equal(result.sameEvent.updates, 20);
  assert.equal(finiteMilliseconds(result.sameEvent.milliseconds), true);
  assert.equal(result.adaptiveSamePart.updates, 20);
  assert.equal(result.adaptiveSamePart.cadenceRecords, 1);
  assert.equal(result.adaptiveSamePart.envelopeSlots <= 16, true);
  assert.equal(result.adaptiveSamePart.adapterCalls <= 2 * (20 + 1), true);
  assert.equal(finiteMilliseconds(result.adaptiveSamePart.milliseconds), true);
  assert.equal(result.envelopes.updates, 10);
  assert.equal(result.envelopes.envelopeSlots <= 16, true);
  assert.equal(result.envelopes.adapterCalls <= 16 + 16 * 10, true);
  assert.equal(finiteMilliseconds(result.envelopes.milliseconds), true);
  assert.deepEqual(result.uniqueEvents.map(function (row) {
    return [row.requested, row.accepted, row.rejected];
  }), [
    [32, 32, 0],
    [64, 64, 0],
    [128, 128, 0],
    [129, 128, 1]
  ]);
  result.uniqueEvents.forEach(function (row) {
    assert.equal(finiteMilliseconds(row.milliseconds), true);
  });
  assert.equal(result.ticks.activeEvents, 32);
  assert.equal(result.ticks.iterations, 10);
  assert.equal(finiteMilliseconds(result.ticks.milliseconds), true);
});
