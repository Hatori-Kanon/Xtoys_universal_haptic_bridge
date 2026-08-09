'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var loadRuntime = require('./harness').loadRuntime;

var fixtures = path.join(__dirname, 'fixtures');
var runtime = loadRuntime().XTHB;

function config() {
  return JSON.parse(fs.readFileSync(path.join(fixtures, 'config.json'), 'utf8'));
}

function validatedConfig(mutate) {
  var value = config();
  if (mutate) {
    mutate(value);
  }
  return runtime.validateConfig(value).config;
}

function target(part, values) {
  var data = values || {};
  return {
    part: part,
    effect: data.effect || 'hold',
    intensity: data.intensity === undefined ? 0 : data.intensity,
    frequency: data.frequency === undefined ? 0 : data.frequency,
    rotateSpeed: data.rotateSpeed === undefined ? null : data.rotateSpeed,
    rotateDirection: data.rotateDirection === undefined ? null : data.rotateDirection,
    durationMs: data.durationMs === undefined ? 1000 : data.durationMs,
    rampUpMs: data.rampUpMs === undefined ? 0 : data.rampUpMs,
    rampDownMs: data.rampDownMs === undefined ? 0 : data.rampDownMs,
    pulseOnMs: data.pulseOnMs === undefined ? 0 : data.pulseOnMs,
    pulseOffMs: data.pulseOffMs === undefined ? 0 : data.pulseOffMs,
    priority: data.priority === undefined ? 0 : data.priority,
    blend: data.blend || 'replace',
    baselineBlend: data.baselineBlend || 'boost'
  };
}

function baseline(part, values) {
  var data = values || {};
  return {
    source: data.source || 'baseline',
    sequence: data.sequence === undefined ? 1 : data.sequence,
    target: target(part, data)
  };
}

function transient(part, values) {
  var data = values || {};
  return {
    source: data.source || 'event',
    eventId: data.eventId || 'event-1',
    sequence: data.sequence === undefined ? 1 : data.sequence,
    acceptedAt: data.acceptedAt === undefined ? 0 : data.acceptedAt,
    expiresAt: data.expiresAt === undefined ? 1000 : data.expiresAt,
    generation: data.generation === undefined ? 1 : data.generation,
    target: target(part, data)
  };
}

function snapshot(baselineEntries, eventEntries, generation) {
  return {
    baseline: baselineEntries || {},
    events: eventEntries || {},
    generation: generation === undefined ? 1 : generation
  };
}

function slotsFor(runtime, state, routeConfig, nowMs) {
  return runtime.computeSlots(state, routeConfig, nowMs === undefined ? 0 : nowMs);
}

test('exposes routing and mixing APIs', function () {
  assert.equal(typeof runtime.computeSlots, 'function');
  assert.equal(typeof runtime.mixValue, 'function');
});

test('routes a leaf value through its route weight and preserves sixteen physical slots', function () {
  var result = slotsFor(runtime, snapshot({ a: baseline('clitoris', { intensity: 80, frequency: 65 }) }), validatedConfig());

  assert.equal(result.length, 16);
  assert.equal(result[0].value, 40);
  assert.equal(result[0].frequency, 65);
  assert.equal(result[0].baselineWinner.target.part, 'clitoris');
  assert.equal(result[1].value, 20);
  assert.equal(result[3].enabled, false);
  assert.equal(result[3].value, 0);
  assert.equal(result[3].baselineWinner, null);
});

test('expands groups before applying route weight and global multiplier with one final clamp', function () {
  var routeConfig = validatedConfig(function (value) {
    value.globalMultiplier = 2;
    value.groups.genitals = { clitoris: 0.5 };
  });
  var result = slotsFor(runtime, snapshot({ a: baseline('genitals', { intensity: 100 }) }), routeConfig);

  assert.equal(result[0].value, 50);
  assert.equal(result[1].value, 25);
  assert.equal(result[0].baselineWinner.target.part, 'genitals');
});

test('ignores targets without the actuator required by their physical slot type', function () {
  var intensityWithoutIntensity = transient('clitoris', { rotateSpeed: 80, rotateDirection: 'clockwise' });
  var rotationWithoutSpeed = transient('vagina', { intensity: 90 });
  delete intensityWithoutIntensity.target.intensity;
  delete rotationWithoutSpeed.target.rotateSpeed;
  var routeConfig = validatedConfig();
  var intensityResult = slotsFor(runtime, snapshot({}, {
    intensity: [intensityWithoutIntensity]
  }), routeConfig);
  var rotationResult = slotsFor(runtime, snapshot({}, {
    rotation: [rotationWithoutSpeed]
  }), routeConfig);

  assert.equal(intensityResult[0].value, 0);
  assert.equal(intensityResult[0].transientWinner, null);
  assert.equal(rotationResult[2].value, 0);
  assert.equal(rotationResult[2].transientWinner, null);
});

test('arbitrates multiple parts sharing one physical slot while independently resolving other slots', function () {
  var result = slotsFor(runtime, snapshot({
    vagina: baseline('vagina', { intensity: 60 }),
    clitoris: baseline('clitoris', { intensity: 80 })
  }), validatedConfig());

  assert.equal(result[0].value, 48);
  assert.equal(result[0].baselineWinner.target.part, 'vagina');
  assert.equal(result[1].value, 20);
  assert.equal(result[1].baselineWinner.target.part, 'clitoris');
});

test('uses the documented stable transient tie-break order', function () {
  var events = {
    lowPriority: [transient('clitoris', { intensity: 100, priority: 1, sequence: 99, acceptedAt: 99, generation: 99 })],
    lowValue: [transient('clitoris', { intensity: 20, priority: 2, sequence: 99, acceptedAt: 99, generation: 99 })],
    oldSequence: [transient('clitoris', { intensity: 80, priority: 2, sequence: 1, acceptedAt: 99, generation: 99 })],
    oldAccepted: [transient('clitoris', { intensity: 80, priority: 2, sequence: 2, acceptedAt: 1, generation: 99 })],
    oldGeneration: [transient('clitoris', { intensity: 80, priority: 2, sequence: 2, acceptedAt: 2, generation: 1 })],
    winner: [transient('clitoris', { intensity: 80, priority: 2, sequence: 2, acceptedAt: 2, generation: 2 })]
  };
  var result = slotsFor(runtime, snapshot({}, events), validatedConfig());

  assert.equal(result[0].transientWinner.generation, 2);
  assert.equal(result[0].transientWinner.sequence, 2);
  assert.equal(result[0].transientWinner.acceptedAt, 2);
});

test('mixes only baseline and transient winners using exact boost, max, and replace values', function () {
  assert.equal(runtime.mixValue(30, 20, 'boost'), 44);
  assert.equal(runtime.mixValue(30, 20, 'max'), 30);
  assert.equal(runtime.mixValue(30, 20, 'replace'), 20);

  assert.equal(slotsFor(runtime, snapshot({ a: baseline('clitoris', { intensity: 60 }) }, {
    transient: [transient('clitoris', { intensity: 40, baselineBlend: 'boost' })]
  }), validatedConfig())[0].value, 44);
});

test('resolves rotation speed with the same mixing rules and switches direction by transient pulse phase', function () {
  var routeConfig = validatedConfig();
  var state = snapshot({
    baseline: baseline('vagina', { rotateSpeed: 30, rotateDirection: 'clockwise' })
  }, {
    transient: [transient('vagina', {
      rotateSpeed: 20,
      rotateDirection: 'counterclockwise',
      baselineBlend: 'boost',
      effect: 'pulse',
      pulseOnMs: 100,
      pulseOffMs: 100,
      acceptedAt: 1000
    })]
  });
  var onPhase = slotsFor(runtime, state, routeConfig, 1050)[2];
  var offPhase = slotsFor(runtime, state, routeConfig, 1150)[2];

  assert.equal(onPhase.value, 23.5);
  assert.equal(onPhase.direction, 'counterclockwise');
  assert.equal(offPhase.value, 15);
  assert.equal(offPhase.direction, 'clockwise');
  assert.equal(onPhase.frequency, 0);
});
