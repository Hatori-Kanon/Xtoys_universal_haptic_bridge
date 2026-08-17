'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var benchmarkScript = path.join(repositoryRoot, 'scripts', 'Benchmark-XToysRuntime.js');
var configFile = path.join(repositoryRoot, 'tests', 'XToysUniversalBridge.Tests', 'fixtures', 'config.json');

function finiteMilliseconds(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function expectedAdaptiveTickSlots() {
  var config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.slots.forEach(function (slot) {
    slot.enabled = true;
    slot.type = 'intensity';
    slot.frequencyEnabled = false;
    slot.routes = { clitoris: 1 };
  });
  return config.slots.filter(function (slot) {
    return slot.enabled === true;
  }).length;
}

test('benchmark CLI reports deterministic workloads without timing thresholds', function () {
  var output = childProcess.execFileSync(
    process.execPath,
    [benchmarkScript, '--test'],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  var result = JSON.parse(output);
  var expectedTickSlots = expectedAdaptiveTickSlots();

  assert.equal(result.nodeVersion, process.version);
  assert.equal(result.sameEvent.updates, 20);
  assert.equal(finiteMilliseconds(result.sameEvent.milliseconds), true);
  assert.equal(result.adaptiveSamePart.updates, 20);
  assert.equal(result.adaptiveSamePart.cadenceRecords, 1);
  assert.equal(result.adaptiveSamePart.affectedSlots, 2);
  assert.equal(result.adaptiveSamePart.initialAdapterCalls, 2);
  assert.equal(result.adaptiveSamePart.maxUpdateAdapterCalls <=
    result.adaptiveSamePart.affectedSlots, true);
  assert.equal(result.adaptiveSamePart.zeroUpdateDispatches > 0, true);
  assert.equal(result.adaptiveSamePart.fullUpdateDispatches > 0, true);
  assert.equal(result.adaptiveSamePart.adapterCalls,
    result.adaptiveSamePart.initialAdapterCalls +
    result.adaptiveSamePart.updateAdapterCalls);
  assert.equal(result.adaptiveSamePart.envelopeSlots <= result.adaptiveSamePart.affectedSlots, true);
  assert.equal(finiteMilliseconds(result.adaptiveSamePart.milliseconds), true);
  assert.equal(result.envelopes.updates, 10);
  assert.equal(result.envelopes.affectedSlots, 2);
  assert.equal(result.envelopes.initialAdapterCalls, result.envelopes.affectedSlots);
  assert.equal(result.envelopes.retriggerAdapterCalls, result.envelopes.affectedSlots);
  assert.equal(result.envelopes.maxTickAdapterCalls <= result.envelopes.affectedSlots, true);
  assert.equal(result.envelopes.activeTickDispatches > 0, true);
  assert.equal(result.envelopes.zeroTickDispatches > 0, true);
  assert.equal(result.envelopes.envelopeSlots <= result.envelopes.affectedSlots, true);
  assert.equal(result.envelopes.adapterCalls,
    result.envelopes.initialAdapterCalls + result.envelopes.retriggerAdapterCalls +
    result.envelopes.tickAdapterCalls);
  assert.equal(finiteMilliseconds(result.envelopes.milliseconds), true);
  assert.equal(expectedTickSlots, 16);
  assert.equal(result.adaptiveTick16.enabledSlots, expectedTickSlots);
  assert.equal(result.adaptiveTick16.adapterCalls >= 0, true);
  assert.equal(result.adaptiveTick16.adapterCalls <= result.adaptiveTick16.enabledSlots, true);
  assert.equal(result.adaptiveTick16.deepCopies, 0);
  assert.equal(result.adaptiveTick16.fullWinnerCopies, 0);
  assert.equal(result.adaptiveTick16.fullSlotCopies, 0);
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
