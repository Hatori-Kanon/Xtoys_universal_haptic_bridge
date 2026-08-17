'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var path = require('node:path');
var test = require('node:test');
var loadRuntime = require('./harness').loadRuntime;

var repositoryRoot = path.resolve(__dirname, '..', '..');
var buildScript = path.join(repositoryRoot, 'scripts', 'Build-XToysRuntime.ps1');

function buildRuntime() {
  childProcess.execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  return loadRuntime().XTHB;
}

function target(values) {
  var data = values || {};
  return {
    durationMs: data.durationMs === undefined ? 500 : data.durationMs,
    rampUpMs: data.rampUpMs === undefined ? 180 : data.rampUpMs,
    rampDownMs: data.rampDownMs === undefined ? 80 : data.rampDownMs,
    retrigger: {
      mode: 'adaptive',
      minDropPercent: 25,
      maxDropPercent: 100,
      minRampUpMs: 30,
      minRampDownMs: 20,
      textureThresholdMs: 150,
      quietResetMs: 600
    }
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('cadence resets after quiet and enters texture without resetting its phase on updates', function () {
  var runtime = buildRuntime();
  var first = runtime.nextCadence(null, target(), 1000, 1);
  var second = runtime.nextCadence(first, target(), 1400, 2);
  var texturePrevious = {
    lastAttackAt: 1500,
    averageInterval: 100,
    mode: 'texture',
    lastGeneration: 3,
    textureStartedAt: 1450,
    quietResetMs: 600
  };
  var rapidUpdate = runtime.nextCadence(texturePrevious, target(), 1580, 4);
  var reset = runtime.nextCadence(rapidUpdate, target(), 2300, 5);

  assert.equal(first.averageInterval, null);
  assert.equal(second.averageInterval, 400);
  assert.equal(rapidUpdate.averageInterval, 95);
  assert.equal(rapidUpdate.mode, 'texture');
  assert.equal(rapidUpdate.textureStartedAt, 1450);
  assert.equal(reset.averageInterval, null);
});

test('envelope plan interpolates and fits without crossing declared minimums', function () {
  var runtime = buildRuntime();
  var cadence = { averageInterval: 375, mode: 'adaptive' };
  var compressed = runtime.envelopePlan(target({ durationMs: 200 }), {
    averageInterval: null,
    mode: 'single'
  });

  assert.deepEqual(plain(runtime.envelopePlan(target(), cadence)), {
    mode: 'adaptive', dropPercent: 62.5, fallMs: 50, riseMs: 105
  });
  assert.equal(compressed.dropPercent, 100);
  assert.equal(compressed.fallMs, 34.285714285714285);
  assert.equal(compressed.riseMs, 65.71428571428572);
  assert.equal(runtime.hapticFloor(30, 44, 'boost', 50), 37);
  assert.equal(runtime.hapticFloor(30, 60, 'replace', 50), 30);
  assert.equal(runtime.hapticFloor(100, 100, 'boost', 0), 100);
});

test('texture phase has a 200ms lower-bound cycle and deterministic halves', function () {
  var runtime = buildRuntime();
  var cadence = { averageInterval: 80, textureStartedAt: 1000 };

  assert.equal(runtime.textureTargetPhase(cadence, 1000), true);
  assert.equal(runtime.textureTargetPhase(cadence, 1100), false);
  assert.equal(runtime.textureTargetPhase(cadence, 1200), true);
});

test('cadence and envelope helpers honor exact deferred boundaries', function () {
  var runtime = buildRuntime();
  var profile = target();
  var quietPrevious = runtime.nextCadence(null, profile, 1000, 1);
  var thresholdPrevious = {
    lastAttackAt: 1000,
    averageInterval: null,
    mode: 'single',
    lastGeneration: 1,
    textureStartedAt: null,
    quietResetMs: 600
  };
  var quiet = runtime.nextCadence(quietPrevious, profile, 1600, 2);
  var threshold = runtime.nextCadence(thresholdPrevious, profile, 1150, 2);

  assert.equal(quiet.mode, 'single');
  assert.equal(quiet.averageInterval, null);
  assert.equal(threshold.mode, 'adaptive');
  assert.equal(threshold.averageInterval, 150);
  assert.equal(runtime.hapticFloor(0, 100, 'replace', 100), 0);
  assert.equal(runtime.textureTargetPhase({
    averageInterval: 80,
    textureStartedAt: 1000
  }, 999), true);
});
