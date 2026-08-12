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
    baselineBlend: data.baselineBlend || 'boost',
    retrigger: data.retrigger === undefined ? null : data.retrigger
  };
}

function retrigger(values) {
  var data = values || {};
  return {
    mode: data.mode === undefined ? 'adaptive' : data.mode,
    minDropPercent: data.minDropPercent === undefined ? 25 : data.minDropPercent,
    maxDropPercent: data.maxDropPercent === undefined ? 100 : data.maxDropPercent,
    minRampUpMs: data.minRampUpMs === undefined ? 30 : data.minRampUpMs,
    minRampDownMs: data.minRampDownMs === undefined ? 20 : data.minRampDownMs,
    textureThresholdMs: data.textureThresholdMs === undefined ? 150 : data.textureThresholdMs,
    quietResetMs: data.quietResetMs === undefined ? 600 : data.quietResetMs
  };
}

function cadence(values) {
  var data = values || {};
  return {
    averageInterval: data.averageInterval === undefined ? null : data.averageInterval,
    lastAttackAt: data.lastAttackAt === undefined ? 0 : data.lastAttackAt,
    lastGeneration: data.lastGeneration === undefined ? 1 : data.lastGeneration,
    mode: data.mode === undefined ? 'single' : data.mode,
    quietResetMs: data.quietResetMs === undefined ? 600 : data.quietResetMs,
    textureStartedAt: data.textureStartedAt === undefined ? null : data.textureStartedAt
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
    target: target(part, data),
    cadence: data.cadence === undefined ? null : data.cadence
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

function parse(payload, routeConfig) {
  return runtime.parseMessage(JSON.stringify(payload), routeConfig || config());
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

test('does not let a parsed rotation-only transient publish to an intensity slot', function () {
  var engine = runtime.createStateEngine();
  var baselineMessage = parse({
    protocolVersion: 1,
    command: 'set_baseline',
    source: 'baseline-source',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, frequency: 65 }]
  });
  var rotationMessage = parse({
    protocolVersion: 1,
    command: 'play',
    source: 'rotation-source',
    eventId: 'rotation-only',
    sequence: 1,
    targets: [{
      part: 'clitoris',
      rotateSpeed: 90,
      rotateDirection: 'clockwise',
      durationMs: 1000,
      baselineBlend: 'replace'
    }]
  });
  var output;

  assert.equal(baselineMessage.ok, true);
  assert.equal(rotationMessage.ok, true);
  engine.applyMessage(baselineMessage.message, 0, false);
  engine.applyMessage(rotationMessage.message, 10, false);
  output = slotsFor(runtime, engine.snapshot(), validatedConfig(), 20)[0];

  assert.equal(output.value, 40);
  assert.equal(output.frequency, 65);
  assert.equal(output.baselineWinner.target.part, 'clitoris');
  assert.equal(output.transientWinner, null);
  assert.equal(rotationMessage.message.targets[0].hasIntensity, false);
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

test('newest adaptive foreground beats a stronger ordinary transient on a shared slot', function () {
  var state = snapshot({}, {
    strong: [transient('vagina', { intensity: 90, priority: 100, acceptedAt: 1000 })],
    weak: [transient('clitoris', {
      eventId: 'weak', intensity: 20, priority: 0, acceptedAt: 1100,
      retrigger: retrigger(), cadence: cadence(300)
    })]
  });
  var slot = slotsFor(runtime, state, validatedConfig(), 1100)[0];

  assert.equal(slot.foregroundWinner.eventId, 'weak');
  assert.equal(slot.transientWinner.target.part, 'clitoris');
  assert.equal(slot.value, 10);
});

test('adaptive foreground uses identity to break equal acceptance and generation ties', function () {
  var slot = slotsFor(runtime, snapshot({}, {
    beta: [transient('vagina', {
      eventId: 'beta', intensity: 80, acceptedAt: 1000, generation: 2,
      retrigger: retrigger(), cadence: cadence()
    })],
    alpha: [transient('clitoris', {
      eventId: 'alpha', intensity: 20, acceptedAt: 1000, generation: 2,
      retrigger: retrigger(), cadence: cadence()
    })]
  }), validatedConfig(), 1000)[0];

  assert.equal(slot.foregroundWinner.eventId, 'alpha');
  assert.equal(slot.transientWinner.target.part, 'clitoris');
});

test('removing the latest adaptive foreground reveals an active different-part event on recomputation', function () {
  var state = snapshot({}, {
    earlier: [transient('clitoris', {
      eventId: 'earlier', intensity: 20, acceptedAt: 1000,
      retrigger: retrigger(), cadence: cadence()
    })],
    latest: [transient('vagina', {
      eventId: 'latest', intensity: 40, acceptedAt: 1100,
      retrigger: retrigger(), cadence: cadence()
    })]
  });
  var initial = slotsFor(runtime, state, validatedConfig(), 1100)[0];

  delete state.events.latest;
  var afterRemoval = slotsFor(runtime, state, validatedConfig(), 1101)[0];

  assert.equal(initial.foregroundWinner.eventId, 'latest');
  assert.equal(initial.transientWinner.target.part, 'vagina');
  assert.equal(afterRemoval.foregroundWinner.eventId, 'earlier');
  assert.equal(afterRemoval.transientWinner.target.part, 'clitoris');
  assert.equal(afterRemoval.value, 10);
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

test('resolved slot exposes the winning baseline actuator tuple', function () {
  var slot = slotsFor(runtime, snapshot({
    base: baseline('clitoris', {
      intensity: 60, frequency: 45, rotateDirection: 'clockwise'
    })
  }), validatedConfig())[0];

  assert.equal(slot.baselineValue, 30);
  assert.equal(slot.baselineFrequency, 45);
  assert.equal(slot.baselineDirection, null);
});

test('baseline metadata retains its frequency outside frequency-enabled slots and direction for rotation slots', function () {
  var state = snapshot({
    intensity: baseline('clitoris', { intensity: 60, frequency: 45 }),
    rotation: baseline('vagina', { rotateSpeed: 30, rotateDirection: 'clockwise' })
  });
  var result = slotsFor(runtime, state, validatedConfig());

  assert.equal(result[1].baselineValue, 15);
  assert.equal(result[1].baselineFrequency, 45);
  assert.equal(result[1].baselineDirection, null);
  assert.equal(result[2].baselineValue, 15);
  assert.equal(result[2].baselineFrequency, 0);
  assert.equal(result[2].baselineDirection, 'clockwise');
});

test('uses exact pulse boundaries, rollover, and zero-duration pulse phases', function () {
  var routeConfig = validatedConfig();
  var baselineState = { a: baseline('clitoris', { intensity: 60 }) };
  var pulseState = snapshot(baselineState, {
    pulse: [transient('clitoris', {
      intensity: 20,
      baselineBlend: 'replace',
      effect: 'pulse',
      pulseOnMs: 100,
      pulseOffMs: 100,
      acceptedAt: 1000
    })]
  });
  var zeroOnState = snapshot(baselineState, {
    pulse: [transient('clitoris', {
      intensity: 20,
      baselineBlend: 'replace',
      effect: 'pulse',
      pulseOnMs: 0,
      pulseOffMs: 100,
      acceptedAt: 1000
    })]
  });
  var zeroOffState = snapshot(baselineState, {
    pulse: [transient('clitoris', {
      intensity: 20,
      baselineBlend: 'replace',
      effect: 'pulse',
      pulseOnMs: 100,
      pulseOffMs: 0,
      acceptedAt: 1000
    })]
  });

  assert.equal(slotsFor(runtime, pulseState, routeConfig, 1000)[0].value, 10);
  assert.equal(slotsFor(runtime, pulseState, routeConfig, 1100)[0].value, 30);
  assert.equal(slotsFor(runtime, pulseState, routeConfig, 1200)[0].value, 10);
  assert.equal(slotsFor(runtime, zeroOnState, routeConfig, 1000)[0].value, 30);
  assert.equal(slotsFor(runtime, zeroOffState, routeConfig, 1100)[0].value, 10);
});

test('returns the complete resolved schema for every physical slot', function () {
  var result = slotsFor(runtime, snapshot({
    baseline: baseline('clitoris', {
      intensity: 80,
      frequency: 65,
      rampUpMs: 300,
      rampDownMs: 500,
      pulseOnMs: 0,
      pulseOffMs: 0
    })
  }, {}, 7), validatedConfig());
  var expectedKeys = [
    'baselineDirection', 'baselineFrequency', 'baselineValue', 'baselineWinner', 'direction',
    'enabled', 'foregroundWinner', 'frequency', 'generation', 'id', 'pulseOffMs', 'pulseOnMs',
    'rampDownMs', 'rampUpMs', 'transientWinner', 'type', 'value'
  ];

  assert.equal(result.length, 16);
  result.forEach(function (slot) {
    assert.deepEqual(Object.keys(slot).sort(), expectedKeys);
    assert.equal(slot.generation, 7);
  });
  assert.equal(result[0].value, 40);
  assert.equal(result[0].frequency, 65);
  assert.equal(result[0].direction, null);
  assert.equal(result[0].rampUpMs, 300);
  assert.equal(result[0].rampDownMs, 500);
  assert.equal(result[0].pulseOnMs, 0);
  assert.equal(result[0].pulseOffMs, 0);
  assert.equal(result[0].baselineWinner.target.part, 'clitoris');
  assert.equal(result[0].foregroundWinner, null);
  assert.equal(result[0].baselineValue, 40);
  assert.equal(result[0].baselineFrequency, 65);
  assert.equal(result[0].baselineDirection, null);
  assert.equal(result[0].transientWinner, null);
  assert.equal(result[2].direction, null);
  assert.equal(result[2].baselineWinner, null);
  assert.equal(result[2].foregroundWinner, null);
  assert.equal(result[2].baselineValue, 0);
  assert.equal(result[2].baselineFrequency, 0);
  assert.equal(result[2].baselineDirection, null);
  assert.equal(result[2].transientWinner, null);
});
