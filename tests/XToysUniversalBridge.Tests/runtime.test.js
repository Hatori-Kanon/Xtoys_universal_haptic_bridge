'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var loadRuntime = require('./harness').loadRuntime;

var repositoryRoot = path.resolve(__dirname, '..', '..');
var buildScript = path.join(repositoryRoot, 'scripts', 'Build-XToysRuntime.ps1');
var configFile = path.join(__dirname, 'fixtures', 'config.json');

childProcess.execFileSync(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript],
  { cwd: repositoryRoot, encoding: 'utf8' }
);

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureConfig() {
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function target(part, values) {
  var data = values || {};
  var result = { part: part };
  var key;
  for (key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      result[key] = data[key];
    }
  }
  return result;
}

function retrigger() {
  return {
    mode: 'adaptive', minDropPercent: 25, maxDropPercent: 100,
    minRampUpMs: 30, minRampDownMs: 20,
    textureThresholdMs: 150, quietResetMs: 600
  };
}

function adaptiveValues(values) {
  var result = {
    intensity: 60, durationMs: 500, rampUpMs: 180, rampDownMs: 80,
    retrigger: retrigger()
  };
  var key;
  for (key in values || {}) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      result[key] = values[key];
    }
  }
  return result;
}

function payload(command, values) {
  var data = values || {};
  var result = {
    protocolVersion: 1,
    command: command,
    source: data.source || 'runtime-test'
  };
  var key;
  for (key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && key !== 'source') {
      result[key] = data[key];
    }
  }
  return JSON.stringify(result);
}

function createSubject(now, applySlot) {
  var loaded = loadRuntime({ now: now === undefined ? 0 : now });
  var calls = [];
  var logs = [];
  var adapter = {
    applySlot: function (slotOutput, transition) {
      calls.push({ slot: slotOutput, transition: transition });
      if (applySlot) {
        applySlot(slotOutput, transition);
      }
    },
    log: function (preview) {
      logs.push(copy(preview));
    }
  };
  var runtime = loaded.XTHB.createRuntime(fixtureConfig(), adapter, loaded.XTHB.nowMs);
  return {
    loaded: loaded,
    runtime: runtime,
    calls: calls,
    logs: logs
  };
}

function playAdaptive(subject, eventId, part, intensity) {
  return subject.runtime.handle(payload('play', {
    eventId: eventId, sequence: 1,
    targets: [target(part, adaptiveValues({ intensity: intensity }))]
  }));
}

function callsFor(subject, slotId) {
  return subject.calls.filter(function (call) {
    return call.slot.id === slotId;
  });
}

function lastCall(subject, slotId) {
  var calls = callsFor(subject, slotId);
  return calls[calls.length - 1];
}

function publicSubject(logLevel) {
  var config = fixtureConfig();
  var loaded;
  config.logLevel = logLevel || 'errors';
  loaded = loadRuntime({
    now: 0,
    variables: { 'xthb-config-json': JSON.stringify(config) }
  });
  return loaded;
}

function slotVariables(loaded, slotId) {
  var suffix = slotId < 10 ? '0' + slotId : String(slotId);
  return {
    value: loaded.variables['xthb-slot-' + suffix + '-value'],
    frequency: loaded.variables['xthb-slot-' + suffix + '-frequency'],
    rampSeconds: loaded.variables['xthb-slot-' + suffix + '-ramp-seconds'],
    directionCode: loaded.variables['xthb-slot-' + suffix + '-direction-code'],
    generation: loaded.variables['xthb-slot-' + suffix + '-generation']
  };
}

function expectedJobActions(slotIds) {
  return (slotIds || [1, 2, 3]).map(function (slotId) {
    var suffix = '0' + slotId;
    return { type: 'updateJob', job: 'xthb-output-' + suffix, action: 'start' };
  });
}

function assertPublicStep(loaded, actionStart, expectedSlots, actionSlotIds) {
  assert.deepEqual(copy(loaded.actions.slice(actionStart)), expectedJobActions(actionSlotIds));
  [1, 2, 3].forEach(function (slotId) {
    assert.deepEqual(slotVariables(loaded, slotId), expectedSlots[slotId - 1]);
  });
}

function sendWebhook(loaded, command, values, outerAction) {
  var inner = JSON.parse(payload(command, values));
  var wireText = JSON.stringify({
    action: outerAction === undefined ? 'xtoys_game_bridge' : outerAction,
    payload: JSON.stringify(inner)
  });
  var received = JSON.parse(wireText);
  if (received.action !== 'xtoys_game_bridge') {
    return null;
  }
  return loaded.context.xtoysBridgeHandle(received.payload);
}

test('play dispatches immediately through the adapter with a rising ramp', function () {
  var subject = createSubject(1000);
  var result = subject.runtime.handle(payload('play', {
    eventId: 'attack',
    sequence: 1,
    targets: [target('clitoris', {
      intensity: 80,
      frequency: 65,
      durationMs: 1000,
      rampUpMs: 2500
    })]
  }));
  var call = lastCall(subject, 1);

  assert.equal(result.ok, true);
  assert.equal(call.slot.value, 40);
  assert.equal(call.slot.frequency, 65);
  assert.equal(call.slot.direction, null);
  assert.equal(call.slot.generation, 1);
  assert.deepEqual(copy(call.transition), { rampSeconds: 2.5 });
  assert.deepEqual(subject.loaded.actions, []);
  assert.deepEqual(subject.loaded.variables, {});
});

test('expiry returns to the newest baseline and uses the released transient ramp down', function () {
  var subject = createSubject(0);

  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, rampUpMs: 1000 })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'attack',
    sequence: 1,
    targets: [target('clitoris', {
      intensity: 80,
      durationMs: 100,
      baselineBlend: 'replace',
      rampDownMs: 7000
    })]
  }));
  subject.loaded.setNow(50);
  subject.runtime.handle(payload('set_baseline', {
    sequence: 2,
    targets: [target('clitoris', { intensity: 100, rampUpMs: 1000 })]
  }));
  subject.loaded.setNow(100);
  subject.runtime.tick();

  assert.equal(lastCall(subject, 1).slot.value, 50);
  assert.equal(lastCall(subject, 1).transition.rampSeconds, 7);
});

test('pulse on mixes the transient and pulse off returns to baseline at exact modulo boundaries', function () {
  var subject = createSubject(1000);

  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 60 })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'pulse',
    sequence: 1,
    targets: [target('clitoris', {
      effect: 'pulse',
      intensity: 40,
      durationMs: 1000,
      pulseOnMs: 100,
      pulseOffMs: 200,
      baselineBlend: 'boost'
    })]
  }));

  assert.equal(lastCall(subject, 1).slot.value, 44);
  subject.loaded.setNow(1099);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 44);
  subject.loaded.setNow(1100);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
  subject.loaded.setNow(1299);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
  subject.loaded.setNow(1300);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 44);
});

test('a higher-sequence generation survives the old expiry boundary', function () {
  var subject = createSubject(0);

  subject.runtime.handle(payload('play', {
    eventId: 'refreshable',
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, durationMs: 100 })]
  }));
  subject.loaded.setNow(50);
  subject.runtime.handle(payload('update', {
    eventId: 'refreshable',
    sequence: 2,
    targets: [target('clitoris', { intensity: 90, durationMs: 200 })]
  }));
  subject.loaded.setNow(100);
  subject.runtime.tick();

  assert.equal(lastCall(subject, 1).slot.value, 45);
  assert.equal(lastCall(subject, 1).slot.generation, 2);
  subject.loaded.setNow(250);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 0);
  assert.ok(lastCall(subject, 1).slot.generation > 2);
});

test('clearing a baseline without a transient dispatches zero with its falling ramp', function () {
  var subject = createSubject(0);

  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 80, rampDownMs: 4000 })]
  }));
  subject.runtime.handle(payload('set_baseline', {
    sequence: 2,
    targets: []
  }));

  assert.equal(lastCall(subject, 1).slot.value, 0);
  assert.equal(lastCall(subject, 1).transition.rampSeconds, 4);
});

test('two slots maintain independent expiry and pulse phases', function () {
  var subject = createSubject(0);

  subject.runtime.handle(payload('play', {
    eventId: 'two-slots',
    sequence: 1,
    targets: [
      target('vagina', { intensity: 80, durationMs: 150 }),
      target('vulva', {
        effect: 'pulse', intensity: 60, durationMs: 300,
        pulseOnMs: 100, pulseOffMs: 100
      })
    ]
  }));
  assert.equal(lastCall(subject, 1).slot.value, 64);
  assert.equal(lastCall(subject, 2).slot.value, 30);

  subject.loaded.setNow(100);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 64);
  assert.equal(lastCall(subject, 2).slot.value, 0);

  subject.loaded.setNow(150);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 0);
  assert.equal(lastCall(subject, 2).slot.value, 0);

  subject.loaded.setNow(200);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 2).slot.value, 30);
});

test('rotation direction changes only for an explicit higher-sequence update', function () {
  var subject = createSubject(0);
  var callsAfterPlay;

  subject.runtime.handle(payload('play', {
    eventId: 'rotation',
    sequence: 4,
    targets: [target('vagina', {
      rotateSpeed: 80,
      rotateDirection: 'clockwise',
      durationMs: 1000
    })]
  }));
  callsAfterPlay = callsFor(subject, 3).length;
  subject.runtime.handle(payload('update', {
    eventId: 'rotation',
    sequence: 4,
    targets: [target('vagina', {
      rotateSpeed: 80,
      rotateDirection: 'counterclockwise',
      durationMs: 1000
    })]
  }));

  assert.equal(callsFor(subject, 3).length, callsAfterPlay);
  assert.equal(lastCall(subject, 3).slot.direction, 'clockwise');

  subject.runtime.handle(payload('update', {
    eventId: 'rotation',
    sequence: 5,
    targets: [target('vagina', {
      rotateSpeed: 80,
      rotateDirection: 'counterclockwise',
      durationMs: 1000
    })]
  }));
  assert.equal(lastCall(subject, 3).slot.direction, 'counterclockwise');
});

test('test returns and logs a preview without adapter output or state mutation', function () {
  var subject = createSubject(0);
  var before = copy(subject.runtime.snapshot());
  var result = subject.runtime.handle(payload('test', {
    source: 'preview-source',
    sequence: 7,
    targets: [target('genitals', {
      intensity: 100,
      frequency: 67,
      rotateSpeed: 80,
      rotateDirection: 'counterclockwise'
    })]
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(copy(result.preview.slots.slice(0, 3).map(function (slot) {
    return {
      id: slot.id,
      value: slot.value,
      frequency: slot.frequency,
      direction: slot.direction,
      winnerSource: slot.transientWinner && slot.transientWinner.source,
      winnerEventId: slot.transientWinner && slot.transientWinner.eventId,
      winnerPart: slot.transientWinner && slot.transientWinner.target.part
    };
  })), [
    { id: 1, value: 48, frequency: 67, direction: null, winnerSource: 'preview-source', winnerEventId: null, winnerPart: 'genitals' },
    { id: 2, value: 40, frequency: 0, direction: null, winnerSource: 'preview-source', winnerEventId: null, winnerPart: 'genitals' },
    { id: 3, value: 24, frequency: 0, direction: 'counterclockwise', winnerSource: 'preview-source', winnerEventId: null, winnerPart: 'genitals' }
  ]);
  assert.equal(subject.logs.length, 1);
  assert.deepEqual(subject.logs[0], copy(result.preview));
  assert.deepEqual(subject.calls, []);
  assert.deepEqual(copy(subject.runtime.snapshot()), before);
});

test('updates for absent stopped or expired events are ignored without creating output', function () {
  var subject = createSubject(0);
  var absentUpdate = {
    eventId: 'missing',
    sequence: 2,
    targets: [target('clitoris', { intensity: 100, durationMs: 100 })]
  };

  assert.equal(subject.runtime.handle(payload('update', absentUpdate)).changed, false);
  assert.deepEqual(subject.calls, []);
  assert.deepEqual(copy(subject.runtime.snapshot().events), {});

  subject.runtime.handle(payload('play', {
    eventId: 'stopped', sequence: 1,
    targets: [target('clitoris', { intensity: 80, durationMs: 100 })]
  }));
  subject.runtime.handle(payload('stop', { eventId: 'stopped' }));
  subject.calls.length = 0;
  assert.equal(subject.runtime.handle(payload('update', {
    eventId: 'stopped', sequence: 2,
    targets: [target('clitoris', { intensity: 100, durationMs: 100 })]
  })).changed, false);
  assert.deepEqual(subject.calls, []);
  assert.deepEqual(copy(subject.runtime.snapshot().events), {});

  subject.runtime.handle(payload('play', {
    eventId: 'expired', sequence: 1,
    targets: [target('clitoris', { intensity: 80, durationMs: 100 })]
  }));
  subject.loaded.setNow(100);
  subject.runtime.tick();
  subject.calls.length = 0;
  assert.equal(subject.runtime.handle(payload('update', {
    eventId: 'expired', sequence: 2,
    targets: [target('clitoris', { intensity: 100, durationMs: 100 })]
  })).changed, false);
  assert.deepEqual(subject.calls, []);
  assert.deepEqual(copy(subject.runtime.snapshot().events), {});
});

test('invalid messages are atomic and never change or increase output', function () {
  var subject = createSubject(0);
  var callsBefore;
  var snapshotBefore;
  var result;

  subject.runtime.handle(payload('play', {
    eventId: 'valid',
    sequence: 1,
    targets: [target('clitoris', { intensity: 20, durationMs: 1000 })]
  }));
  callsBefore = subject.calls.length;
  snapshotBefore = copy(subject.runtime.snapshot());
  result = subject.runtime.handle(payload('play', {
    eventId: 'invalid',
    sequence: 1,
    targets: [target('clitoris', { intensity: 100, durationMs: 'NaN' })]
  }));

  assert.equal(result.ok, false);
  assert.equal(subject.calls.length, callsBefore);
  assert.deepEqual(copy(subject.runtime.snapshot()), snapshotBefore);
  assert.equal(lastCall(subject, 1).slot.value, 10);
});

test('physical tuple comparison ignores logical generation and retains latest expiry metadata', function () {
  var subject = createSubject(0);
  var firstCall;
  var callsAfterPlay;

  subject.runtime.handle(payload('play', {
    eventId: 'tuple',
    sequence: 1,
    targets: [target('clitoris', {
      intensity: 80, frequency: 0, durationMs: 1000,
      rampUpMs: 700000, rampDownMs: 100
    })]
  }));
  firstCall = lastCall(subject, 1);
  callsAfterPlay = callsFor(subject, 1).length;
  subject.runtime.tick();

  assert.equal(callsFor(subject, 1).length, callsAfterPlay);
  assert.equal(firstCall.slot.direction, null);
  assert.equal(firstCall.slot.frequency, 0);
  assert.equal(firstCall.transition.rampSeconds, 600);

  subject.runtime.handle(payload('update', {
    eventId: 'tuple',
    sequence: 2,
    targets: [target('clitoris', {
      intensity: 80, frequency: 0, durationMs: 200,
      rampUpMs: 700000, rampDownMs: 700
    })]
  }));
  assert.equal(callsFor(subject, 1).length, callsAfterPlay);
  assert.equal(subject.runtime.snapshot().generation, 2);
  assert.equal(firstCall.slot.generation, 1);
  assert.equal(firstCall.transition.rampSeconds, 600);

  subject.loaded.setNow(200);
  subject.runtime.tick();
  assert.equal(callsFor(subject, 1).length, callsAfterPlay + 1);
  assert.equal(lastCall(subject, 1).slot.value, 0);
  assert.equal(lastCall(subject, 1).transition.rampSeconds, 0.7);
});

test('first adaptive attack at baseline rises directly without a floor job', function () {
  var subject = createSubject(1000);
  var result = subject.runtime.handle(payload('play', {
    eventId: 'first', sequence: 1,
    targets: [target('clitoris', adaptiveValues({ intensity: 60 }))]
  }));
  assert.equal(result.ok, true);
  assert.equal(callsFor(subject, 1).length, 1);
  assert.equal(lastCall(subject, 1).slot.value, 30);
  assert.equal(lastCall(subject, 1).transition.rampSeconds, 0.18);
});

test('failed first direct rise stays unconfirmed and retries the exact target tuple', function () {
  var failFirstRise = true;
  var subject = createSubject(1000, function (slot) {
    if (failFirstRise && slot.id === 1 && slot.value === 30) {
      failFirstRise = false;
      throw new Error('first rise failed');
    }
  });
  var failedRise;
  var retriedRise;
  var result = playAdaptive(subject, 'first-failure', 'clitoris', 60);
  failedRise = lastCall(subject, 1);

  assert.deepEqual(copy(result.dispatchFailures), [{
    slotId: 1, code: 'adapter_apply_failed', detail: 'first rise failed'
  }]);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].phase, 'rise');
  subject.loaded.setNow(1100);
  subject.runtime.tick();
  retriedRise = lastCall(subject, 1);
  assert.deepEqual({
    value: retriedRise.slot.value,
    frequency: retriedRise.slot.frequency,
    direction: retriedRise.slot.direction,
    rampSeconds: retriedRise.transition.rampSeconds
  }, {
    value: failedRise.slot.value,
    frequency: failedRise.slot.frequency,
    direction: failedRise.slot.direction,
    rampSeconds: failedRise.transition.rampSeconds
  });
  assert.equal(retriedRise.slot.generation > failedRise.slot.generation, true);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].phase, 'target');
});

test('same physical target performs one floor then one generation-safe rise', function () {
  var subject = createSubject(1000);
  playAdaptive(subject, 'first', 'clitoris', 60);
  subject.loaded.setNow(1400);
  playAdaptive(subject, 'second', 'clitoris', 60);
  assert.equal(lastCall(subject, 1).slot.value < 30, true);
  var countAfterFloor = callsFor(subject, 1).length;
  subject.loaded.setNow(1500);
  subject.runtime.tick();
  assert.equal(callsFor(subject, 1).length, countAfterFloor + 1);
  assert.equal(lastCall(subject, 1).slot.value, 30);
});

test('failed floor retries before any rise can advance', function () {
  var failFloor = false;
  var result;
  var failedFloorCall;
  var retriedFloorCall;
  var subject = createSubject(1000, function (slot) {
    if (failFloor && slot.id === 1 && slot.value < 30) {
      throw new Error('floor failed');
    }
  });
  playAdaptive(subject, 'first', 'clitoris', 60);
  subject.loaded.setNow(1400);
  failFloor = true;
  result = playAdaptive(subject, 'second', 'clitoris', 60);
  failedFloorCall = lastCall(subject, 1);
  assert.equal(failedFloorCall.slot.value < 30, true);
  assert.deepEqual(copy(result.dispatchFailures), [{
    slotId: 1, code: 'adapter_apply_failed', detail: 'floor failed'
  }]);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].phase, 'fall');
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].floorApplied, false);
  failFloor = false;
  subject.loaded.setNow(1500);
  subject.runtime.tick();
  retriedFloorCall = lastCall(subject, 1);
  assert.deepEqual({
    value: retriedFloorCall.slot.value,
    frequency: retriedFloorCall.slot.frequency,
    direction: retriedFloorCall.slot.direction,
    rampSeconds: retriedFloorCall.transition.rampSeconds
  }, {
    value: failedFloorCall.slot.value,
    frequency: failedFloorCall.slot.frequency,
    direction: failedFloorCall.slot.direction,
    rampSeconds: failedFloorCall.transition.rampSeconds
  });
  assert.equal(retriedFloorCall.slot.generation > failedFloorCall.slot.generation, true);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].floorApplied, true);
  subject.loaded.setNow(1600);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
});

test('delayed floor confirmation starts the rise deadline at first success', function () {
  var remainingFloorFailures = 2;
  var subject = createSubject(1000, function (slot) {
    if (remainingFloorFailures > 0 && slot.id === 1 && slot.value < 30) {
      remainingFloorFailures -= 1;
      throw new Error('floor delayed');
    }
  });
  var floorSuccessCount;
  var confirmedRiseAt;
  playAdaptive(subject, 'first-delayed', 'clitoris', 60);
  subject.loaded.setNow(1400);
  playAdaptive(subject, 'second-delayed', 'clitoris', 60);
  subject.loaded.setNow(1700);
  subject.runtime.tick();
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].floorApplied, false);
  subject.loaded.setNow(1800);
  subject.runtime.tick();
  floorSuccessCount = callsFor(subject, 1).length;
  confirmedRiseAt = subject.runtime.hapticSnapshot().slotEnvelopes[1].riseAt;
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].floorApplied, true);
  assert.equal(confirmedRiseAt > 1800, true);
  subject.loaded.setNow(1801);
  subject.runtime.tick();
  assert.equal(callsFor(subject, 1).length, floorSuccessCount);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].phase, 'fall');
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].riseAt, confirmedRiseAt);
  subject.loaded.setNow(Math.ceil(confirmedRiseAt));
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].phase, 'target');
});

test('baseline mutation cannot replace an exact failed adaptive floor retry', function () {
  var failFloor = false;
  var subject = createSubject(1000, function (slot) {
    if (failFloor && slot.id === 1 && slot.value < 30) {
      failFloor = false;
      throw new Error('floor before baseline');
    }
  });
  var failedFloor;
  var retriedFloor;
  playAdaptive(subject, 'first-baseline', 'clitoris', 60);
  subject.loaded.setNow(1400);
  failFloor = true;
  playAdaptive(subject, 'second-baseline', 'clitoris', 60);
  failedFloor = lastCall(subject, 1);
  subject.loaded.setNow(1500);
  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, frequency: 45 })]
  }));
  retriedFloor = lastCall(subject, 1);

  assert.deepEqual({
    value: retriedFloor.slot.value,
    frequency: retriedFloor.slot.frequency,
    direction: retriedFloor.slot.direction,
    rampSeconds: retriedFloor.transition.rampSeconds
  }, {
    value: failedFloor.slot.value,
    frequency: failedFloor.slot.frequency,
    direction: failedFloor.slot.direction,
    rampSeconds: failedFloor.transition.rampSeconds
  });
  assert.equal(retriedFloor.slot.generation > failedFloor.slot.generation, true);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].floorApplied, true);
});

test('failed rise keeps the confirmed floor phase and retries the exact target tuple', function () {
  var failRise = false;
  var subject = createSubject(1000, function (slot) {
    if (failRise && slot.id === 1 && slot.value === 30) {
      failRise = false;
      throw new Error('rise failed');
    }
  });
  var failedRise;
  var retriedRise;
  playAdaptive(subject, 'first-rise', 'clitoris', 60);
  subject.loaded.setNow(1400);
  playAdaptive(subject, 'second-rise', 'clitoris', 60);
  failRise = true;
  subject.loaded.setNow(1500);
  subject.runtime.tick();
  failedRise = lastCall(subject, 1);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].phase, 'fall');
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].floorApplied, true);
  subject.loaded.setNow(1600);
  subject.runtime.tick();
  retriedRise = lastCall(subject, 1);
  assert.deepEqual({
    value: retriedRise.slot.value,
    frequency: retriedRise.slot.frequency,
    direction: retriedRise.slot.direction,
    rampSeconds: retriedRise.transition.rampSeconds
  }, {
    value: failedRise.slot.value,
    frequency: failedRise.slot.frequency,
    direction: failedRise.slot.direction,
    rampSeconds: failedRise.transition.rampSeconds
  });
  assert.equal(retriedRise.slot.generation > failedRise.slot.generation, true);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].phase, 'target');
});

test('tuple-suppressed floor still confirms before the envelope advances', function () {
  var subject = createSubject(1000);
  var profile = retrigger();
  var callsAfterFirst;
  var snapshot;
  profile.minDropPercent = 0;
  profile.maxDropPercent = 0;
  profile.minRampUpMs = 30;
  profile.minRampDownMs = 30;
  subject.runtime.handle(payload('play', {
    eventId: 'first-suppressed', sequence: 1,
    targets: [target('clitoris', adaptiveValues({
      rampUpMs: 30, rampDownMs: 30, retrigger: profile
    }))]
  }));
  callsAfterFirst = callsFor(subject, 1).length;
  subject.loaded.setNow(1400);
  subject.runtime.handle(payload('play', {
    eventId: 'second-suppressed', sequence: 1,
    targets: [target('clitoris', adaptiveValues({
      rampUpMs: 30, rampDownMs: 30, retrigger: profile
    }))]
  }));
  assert.equal(callsFor(subject, 1).length, callsAfterFirst);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].floorApplied, true);
  subject.loaded.setNow(1430);
  subject.runtime.tick();
  snapshot = subject.runtime.hapticSnapshot();
  assert.equal(callsFor(subject, 1).length, callsAfterFirst);
  assert.equal(snapshot.slotEnvelopes[1].phase, 'target');
});

test('rapid same-part hits enter one phase-stable texture without queued catch-up', function () {
  var subject = createSubject(1000);
  var phaseOrigin;
  playAdaptive(subject, 'hit-1', 'clitoris', 60);
  subject.loaded.setNow(1100);
  playAdaptive(subject, 'hit-2', 'clitoris', 60);
  subject.loaded.setNow(1180);
  playAdaptive(subject, 'hit-3', 'clitoris', 60);
  phaseOrigin = subject.runtime.hapticSnapshot().slotEnvelopes[1].textureStartedAt;
  subject.loaded.setNow(1260);
  playAdaptive(subject, 'hit-4', 'clitoris', 60);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].textureStartedAt, phaseOrigin);
  subject.loaded.setNow(phaseOrigin + 300);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value < 30, true);
  subject.loaded.setNow(phaseOrigin + 400);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
});

test('texture floor uses baseline frequency and target uses attack frequency', function () {
  var subject = createSubject(1000);
  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, frequency: 20 })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'first', sequence: 1,
    targets: [target('clitoris', adaptiveValues({ intensity: 60, frequency: 70 }))]
  }));
  subject.loaded.setNow(1100);
  subject.runtime.handle(payload('play', {
    eventId: 'second', sequence: 1,
    targets: [target('clitoris', adaptiveValues({ intensity: 60, frequency: 70 }))]
  }));
  assert.equal(lastCall(subject, 1).slot.frequency, 70);
  subject.loaded.setNow(1200);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.frequency, 20);
});

test('failed texture floor is retried before sampling the current later phase', function () {
  var failFloor = false;
  var subject = createSubject(1000, function (slot) {
    if (failFloor && slot.id === 1 && slot.frequency === 20) {
      throw new Error('texture floor failed');
    }
  });
  var phaseOrigin;
  var failed;
  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, frequency: 20 })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'hit-1', sequence: 1,
    targets: [target('clitoris', adaptiveValues({
      intensity: 60, frequency: 70, durationMs: 1000
    }))]
  }));
  subject.loaded.setNow(1100);
  subject.runtime.handle(payload('play', {
    eventId: 'hit-2', sequence: 1,
    targets: [target('clitoris', adaptiveValues({
      intensity: 60, frequency: 70, durationMs: 1000
    }))]
  }));
  phaseOrigin = subject.runtime.hapticSnapshot().slotEnvelopes[1].textureStartedAt;
  failFloor = true;
  subject.loaded.setNow(phaseOrigin + 300);
  subject.runtime.tick();
  failed = lastCall(subject, 1);
  failFloor = false;
  subject.loaded.setNow(phaseOrigin + 400);
  subject.runtime.tick();
  assert.deepEqual({
    value: lastCall(subject, 1).slot.value,
    frequency: lastCall(subject, 1).slot.frequency,
    direction: lastCall(subject, 1).slot.direction,
    rampSeconds: lastCall(subject, 1).transition.rampSeconds
  }, {
    value: failed.slot.value,
    frequency: failed.slot.frequency,
    direction: failed.slot.direction,
    rampSeconds: failed.transition.rampSeconds
  });
  subject.loaded.setNow(phaseOrigin + 600);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 44);
  assert.equal(lastCall(subject, 1).slot.frequency, 70);
});

test('failed texture target is retried across a floor boundary before resampling', function () {
  var failTarget = false;
  var subject = createSubject(1000, function (slot) {
    if (failTarget && slot.id === 1 && slot.frequency === 70) {
      throw new Error('texture target failed');
    }
  });
  var phaseOrigin;
  var failed;
  var retried;
  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, frequency: 20 })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'hit-1', sequence: 1,
    targets: [target('clitoris', adaptiveValues({
      intensity: 60, frequency: 70, durationMs: 1200
    }))]
  }));
  subject.loaded.setNow(1100);
  subject.runtime.handle(payload('play', {
    eventId: 'hit-2', sequence: 1,
    targets: [target('clitoris', adaptiveValues({
      intensity: 60, frequency: 70, durationMs: 1200
    }))]
  }));
  phaseOrigin = subject.runtime.hapticSnapshot().slotEnvelopes[1].textureStartedAt;
  subject.loaded.setNow(phaseOrigin + 300);
  subject.runtime.tick();
  failTarget = true;
  subject.loaded.setNow(phaseOrigin + 400);
  subject.runtime.tick();
  failed = lastCall(subject, 1);
  failTarget = false;
  subject.loaded.setNow(phaseOrigin + 500);
  subject.runtime.tick();
  retried = lastCall(subject, 1);
  assert.deepEqual({
    value: retried.slot.value,
    frequency: retried.slot.frequency,
    direction: retried.slot.direction,
    rampSeconds: retried.transition.rampSeconds
  }, {
    value: failed.slot.value,
    frequency: failed.slot.frequency,
    direction: failed.slot.direction,
    rampSeconds: failed.transition.rampSeconds
  });
  subject.loaded.setNow(phaseOrigin + 700);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value < 44, true);
  assert.equal(lastCall(subject, 1).slot.frequency, 20);
});

test('rotation reverses only after a confirmed zero-speed floor', function () {
  var subject = createSubject(1000);
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 60, rotateDirection: 'clockwise'
    }))]
  }));
  subject.loaded.setNow(1400);
  subject.runtime.handle(payload('play', {
    eventId: 'counterclockwise', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 60, rotateDirection: 'counterclockwise'
    }))]
  }));
  assert.equal(lastCall(subject, 3).slot.value, 0);
  assert.equal(lastCall(subject, 3).slot.direction, 'clockwise');
  subject.loaded.setNow(1500);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.value, 30);
  assert.equal(lastCall(subject, 3).slot.direction, 'counterclockwise');
});

test('failed rotation zero does not switch direction', function () {
  var failZero = false;
  var subject = createSubject(1000, function (slot) {
    if (failZero && slot.id === 3 && slot.value === 0) {
      throw new Error('rotation zero failed');
    }
  });
  var failed;
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 60, rotateDirection: 'clockwise'
    }))]
  }));
  subject.loaded.setNow(1400);
  failZero = true;
  subject.runtime.handle(payload('play', {
    eventId: 'counterclockwise', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 60, rotateDirection: 'counterclockwise'
    }))]
  }));
  failed = lastCall(subject, 3);
  assert.equal(failed.slot.value, 0);
  assert.equal(failed.slot.direction, 'clockwise');
  failZero = false;
  subject.loaded.setNow(1500);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.value, 0);
  assert.equal(lastCall(subject, 3).slot.direction, 'clockwise');
  subject.loaded.setNow(1600);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.value, 30);
  assert.equal(lastCall(subject, 3).slot.direction, 'counterclockwise');
});

test('same-direction rotation changes speed without an intermediate zero', function () {
  var subject = createSubject(1000);
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise-slow', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 40, rotateDirection: 'clockwise'
    }))]
  }));
  subject.loaded.setNow(1400);
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise-fast', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 80, rotateDirection: 'clockwise'
    }))]
  }));
  assert.equal(lastCall(subject, 3).slot.value > 0, true);
  assert.equal(lastCall(subject, 3).slot.direction, 'clockwise');
});

test('stopping an adaptive rotation confirms zero before restoring the opposite baseline direction', function () {
  var failReleaseZero = false;
  var failedZero;
  var retriedZero;
  var subject = createSubject(1000, function (slot) {
    if (failReleaseZero && slot.id === 3 && slot.value === 0 &&
        slot.direction === 'clockwise') {
      failReleaseZero = false;
      throw new Error('release zero failed');
    }
  });

  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('vagina', {
      rotateSpeed: 30, rotateDirection: 'counterclockwise'
    })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise-stop', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 60, rotateDirection: 'clockwise'
    }))]
  }));
  subject.loaded.setNow(1100);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.direction, 'clockwise');

  failReleaseZero = true;
  subject.loaded.setNow(1200);
  subject.runtime.handle(payload('stop', { eventId: 'clockwise-stop' }));
  failedZero = lastCall(subject, 3);
  assert.equal(failedZero.slot.value, 0);
  assert.equal(failedZero.slot.direction, 'clockwise');

  subject.loaded.setNow(1300);
  subject.runtime.tick();
  retriedZero = lastCall(subject, 3);
  assert.equal(retriedZero.slot.value, 0);
  assert.equal(retriedZero.slot.direction, 'clockwise');
  subject.loaded.setNow(1400);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.value, 15);
  assert.equal(lastCall(subject, 3).slot.direction, 'counterclockwise');
});

test('adaptive rotation expiry reaches zero before restoring the opposite baseline direction', function () {
  var subject = createSubject(1000);

  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('vagina', {
      rotateSpeed: 30, rotateDirection: 'counterclockwise'
    })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise-expiry', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 60, rotateDirection: 'clockwise',
      durationMs: 500
    }))]
  }));
  subject.loaded.setNow(1100);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.direction, 'clockwise');

  subject.loaded.setNow(1500);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.value, 0);
  assert.equal(lastCall(subject, 3).slot.direction, 'clockwise');
  subject.loaded.setNow(1600);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 3).slot.value, 15);
  assert.equal(lastCall(subject, 3).slot.direction, 'counterclockwise');
});

test('restoring an older adaptive part skips a full fall when little lifetime remains', function () {
  var subject = createSubject(1000);

  subject.runtime.handle(payload('play', {
    eventId: 'older-vagina', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 80, durationMs: 250
    }))]
  }));
  subject.loaded.setNow(1050);
  subject.runtime.handle(payload('play', {
    eventId: 'newer-clitoris', sequence: 1,
    targets: [target('clitoris', adaptiveValues({
      intensity: 20, durationMs: 150
    }))]
  }));
  subject.loaded.setNow(1150);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 10);

  subject.loaded.setNow(1200);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 64);
  assert.equal(lastCall(subject, 1).transition.rampSeconds, 0);
});

test('frequency-disabled slots keep ordinary fall texture and rotation phases at zero frequency', function () {
  var ordinary = createSubject(1000);
  var adaptive = createSubject(1000);
  var texture = createSubject(1000);
  var rotation = createSubject(1000);

  ordinary.runtime.handle(payload('play', {
    eventId: 'ordinary-frequency', sequence: 1,
    targets: [target('clitoris', {
      intensity: 60, frequency: 70, durationMs: 500
    })]
  }));
  assert.equal(lastCall(ordinary, 2).slot.frequency, 0);

  adaptive.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, frequency: 20 })]
  }));
  adaptive.runtime.handle(payload('play', {
    eventId: 'adaptive-frequency-1', sequence: 1,
    targets: [target('clitoris', adaptiveValues({ frequency: 70 }))]
  }));
  adaptive.loaded.setNow(1400);
  adaptive.runtime.handle(payload('play', {
    eventId: 'adaptive-frequency-2', sequence: 1,
    targets: [target('clitoris', adaptiveValues({ frequency: 70 }))]
  }));
  assert.equal(lastCall(adaptive, 2).slot.frequency, 0);

  texture.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, frequency: 20 })]
  }));
  texture.runtime.handle(payload('play', {
    eventId: 'texture-frequency-1', sequence: 1,
    targets: [target('clitoris', adaptiveValues({ frequency: 70 }))]
  }));
  texture.loaded.setNow(1100);
  texture.runtime.handle(payload('play', {
    eventId: 'texture-frequency-2', sequence: 1,
    targets: [target('clitoris', adaptiveValues({ frequency: 70 }))]
  }));
  assert.equal(lastCall(texture, 2).slot.frequency, 0);
  texture.loaded.setNow(1200);
  texture.runtime.tick();
  assert.equal(lastCall(texture, 2).slot.frequency, 0);

  rotation.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('vagina', {
      frequency: 20, rotateSpeed: 30, rotateDirection: 'clockwise'
    })]
  }));
  rotation.runtime.handle(payload('play', {
    eventId: 'rotation-frequency', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      frequency: 70, intensity: 0, rotateSpeed: 60,
      rotateDirection: 'counterclockwise'
    }))]
  }));
  assert.equal(lastCall(rotation, 3).slot.value, 0);
  assert.equal(lastCall(rotation, 3).slot.frequency, 0);
  rotation.loaded.setNow(1100);
  rotation.runtime.tick();
  assert.equal(lastCall(rotation, 3).slot.frequency, 0);
});

test('expiry of an adaptive shared-slot owner resumes a still-valid different-part event', function () {
  var subject = createSubject(1000);
  var ownerKey;
  subject.runtime.handle(payload('play', {
    eventId: 'strong-vagina', sequence: 1,
    targets: [target('vagina', {
      intensity: 90, durationMs: 2000, rampUpMs: 40, rampDownMs: 50
    })]
  }));
  assert.equal(lastCall(subject, 1).slot.value, 72);
  subject.loaded.setNow(1100);
  playAdaptive(subject, 'weak-clitoris', 'clitoris', 20);
  ownerKey = JSON.stringify(['runtime-test', 'weak-clitoris', 'clitoris', 2]);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1].ownerKey, ownerKey);
  subject.loaded.setNow(1200);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 10);
  subject.loaded.setNow(1600);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 72);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes[1], undefined);
});

test('runtime haptic snapshots combine logical diagnostics and defensive envelope copies', function () {
  var subject = createSubject(1000);
  var ownerKey = JSON.stringify(['runtime-test', 'diagnostic', 'clitoris', 1]);
  var snapshot;
  playAdaptive(subject, 'diagnostic', 'clitoris', 60);
  snapshot = subject.runtime.hapticSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'cadenceRecords', 'partOwners', 'slotEnvelopes'
  ]);
  assert.equal(snapshot.cadenceRecords[
    JSON.stringify(['runtime-test', 'clitoris'])
  ].mode, 'single');
  assert.equal(snapshot.slotEnvelopes[1].ownerKey, ownerKey);
  assert.deepEqual(Object.keys(snapshot.slotEnvelopes[1]).sort(), [
    'dropPercent', 'fallDirection', 'fallMs', 'floorApplied', 'ownerGeneration',
    'ownerKey', 'pendingTexturePhase', 'pendingTextureSlot',
    'pendingTextureTransition', 'phase', 'releaseOnly', 'restoredOwner',
    'riseAt', 'riseMs', 'textureStartedAt', 'zeroBeforeReverse'
  ]);
  snapshot.cadenceRecords[JSON.stringify(['runtime-test', 'clitoris'])].mode = 'mutated';
  snapshot.partOwners[JSON.stringify(['runtime-test', 'clitoris'])].adaptiveEventKey = 'mutated';
  snapshot.slotEnvelopes[1].phase = 'mutated';
  snapshot = subject.runtime.hapticSnapshot();
  assert.equal(snapshot.cadenceRecords[
    JSON.stringify(['runtime-test', 'clitoris'])
  ].mode, 'single');
  assert.equal(snapshot.partOwners[
    JSON.stringify(['runtime-test', 'clitoris'])
  ].adaptiveEventKey, JSON.stringify(['runtime-test', 'diagnostic']));
  assert.equal(snapshot.slotEnvelopes[1].phase, 'target');
  subject.runtime.stopAll();
  assert.deepEqual(copy(subject.runtime.hapticSnapshot().slotEnvelopes), {});
});

test('ordinary attacks retain same-tuple suppression and exact ramp output', function () {
  var subject = createSubject(1000);
  var callsAfterFirst;
  subject.runtime.handle(payload('play', {
    eventId: 'ordinary-first', sequence: 1,
    targets: [target('clitoris', {
      intensity: 60, frequency: 45, durationMs: 1000, rampUpMs: 180
    })]
  }));
  assert.deepEqual({
    value: lastCall(subject, 1).slot.value,
    frequency: lastCall(subject, 1).slot.frequency,
    direction: lastCall(subject, 1).slot.direction,
    generation: lastCall(subject, 1).slot.generation,
    rampSeconds: lastCall(subject, 1).transition.rampSeconds
  }, {
    value: 30, frequency: 45, direction: null, generation: 1, rampSeconds: 0.18
  });
  callsAfterFirst = callsFor(subject, 1).length;
  subject.loaded.setNow(1100);
  subject.runtime.handle(payload('play', {
    eventId: 'ordinary-second', sequence: 1,
    targets: [target('clitoris', {
      intensity: 60, frequency: 45, durationMs: 1000, rampUpMs: 180
    })]
  }));
  assert.equal(callsFor(subject, 1).length, callsAfterFirst);
  assert.deepEqual(copy(subject.runtime.hapticSnapshot().slotEnvelopes), {});
});

test('stopAll clears state and dispatches zero-ramp snapshots to every enabled slot', function () {
  var subject = createSubject(0);
  var beforeStop;
  var stopCalls;
  var snapshot;

  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 80 })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'rotation',
    sequence: 1,
    targets: [target('vagina', {
      rotateSpeed: 80, rotateDirection: 'clockwise', durationMs: 1000
    })]
  }));
  beforeStop = subject.calls.length;
  subject.runtime.stopAll();
  stopCalls = subject.calls.slice(beforeStop);
  snapshot = copy(subject.runtime.snapshot());

  assert.deepEqual(stopCalls.map(function (call) { return call.slot.id; }), [1, 2, 3]);
  stopCalls.forEach(function (call) {
    assert.equal(call.slot.value, 0);
    assert.equal(call.slot.frequency, 0);
    assert.equal(call.slot.direction, null);
    assert.equal(call.transition.rampSeconds, 0);
  });
  assert.deepEqual(snapshot.baseline, {});
  assert.deepEqual(snapshot.events, {});
});

test('a failed middle-slot dispatch does not block later slots and retries only the failure', function () {
  var failSlotTwo = true;
  var subject = createSubject(0, function (slotOutput) {
    if (slotOutput.id === 2 && failSlotTwo) {
      failSlotTwo = false;
      throw new Error('slot 2 unavailable');
    }
  });
  var result = subject.runtime.handle(payload('play', {
    eventId: 'multi-slot',
    sequence: 1,
    targets: [target('clitoris', { intensity: 80, durationMs: 1000 })]
  }));

  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [1, 2, 3]);
  assert.equal(result.changedSlots, 2);
  assert.deepEqual(copy(result.dispatchFailures), [{
    slotId: 2,
    code: 'adapter_apply_failed',
    detail: 'slot 2 unavailable'
  }]);
  assert.deepEqual(subject.logs, [{
    type: 'dispatch_error',
    slotId: 2,
    code: 'adapter_apply_failed',
    detail: 'slot 2 unavailable'
  }]);

  subject.calls.length = 0;
  subject.runtime.tick();
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [2]);
  subject.calls.length = 0;
  subject.runtime.tick();
  assert.deepEqual(subject.calls, []);
});

test('a partial failed pulse dispatch is fully reasserted when output returns to the last successful tuple', function () {
  var hardware = {};
  var failNextSlotOne = false;
  var subject = createSubject(0, function (slotOutput, transition) {
    if (slotOutput.id !== 1) {
      return;
    }
    hardware.value = slotOutput.value;
    if (failNextSlotOne) {
      failNextSlotOne = false;
      throw new Error('partial slot write');
    }
    hardware.frequency = slotOutput.frequency;
    hardware.direction = slotOutput.direction;
    hardware.rampSeconds = transition.rampSeconds;
    hardware.generation = slotOutput.generation;
  });

  subject.runtime.handle(payload('play', {
    eventId: 'pulse-retry', sequence: 1,
    targets: [target('clitoris', {
      effect: 'pulse', intensity: 80, frequency: 70, durationMs: 1000,
      pulseOnMs: 100, pulseOffMs: 100, rampUpMs: 200, rampDownMs: 300
    })]
  }));
  assert.deepEqual(hardware, {
    value: 40, frequency: 70, direction: null, rampSeconds: 0.2, generation: 1
  });

  subject.loaded.setNow(100);
  failNextSlotOne = true;
  subject.runtime.tick();
  assert.equal(hardware.value, 0);
  subject.calls.length = 0;

  subject.loaded.setNow(200);
  assert.equal(subject.runtime.tick(), 2);
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [1, 2]);
  assert.deepEqual(hardware, {
    value: 40, frequency: 70, direction: null, rampSeconds: 0.2, generation: 3
  });
});

test('stopAll continues past a failed slot and the next tick retries only that zero', function () {
  var failStopSlotTwo = false;
  var subject = createSubject(0, function (slotOutput) {
    if (slotOutput.id === 2 && failStopSlotTwo) {
      failStopSlotTwo = false;
      throw new Error('slot 2 stop failed');
    }
  });
  var stopCalls;

  subject.runtime.handle(payload('play', {
    eventId: 'active',
    sequence: 1,
    targets: [target('clitoris', {
      intensity: 80, durationMs: 1000, rampDownMs: 4000
    })]
  }));
  subject.calls.length = 0;
  subject.logs.length = 0;
  failStopSlotTwo = true;
  subject.runtime.stopAll();
  stopCalls = subject.calls.slice();

  assert.deepEqual(stopCalls.map(function (call) { return call.slot.id; }), [1, 2, 3]);
  stopCalls.forEach(function (call) {
    assert.equal(call.slot.value, 0);
    assert.equal(call.transition.rampSeconds, 0);
  });
  assert.deepEqual(subject.logs, [{
    type: 'dispatch_error',
    slotId: 2,
    code: 'adapter_apply_failed',
    detail: 'slot 2 stop failed'
  }]);

  subject.calls.length = 0;
  subject.runtime.tick();
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [2]);
  assert.equal(subject.calls[0].slot.value, 0);
  assert.equal(subject.calls[0].transition.rampSeconds, 0);
  subject.calls.length = 0;
  subject.runtime.tick();
  assert.deepEqual(subject.calls, []);
});

test('recent failure snapshots are copied and a chosen slot cache can be invalidated', function () {
  var failSlotTwo = true;
  var subject = createSubject(0, function (slotOutput) {
    if (slotOutput.id === 2 && failSlotTwo) {
      failSlotTwo = false;
      throw new Error('copy me');
    }
  });
  var failures;
  subject.runtime.handle(payload('play', {
    eventId: 'failure-copy',
    sequence: 1,
    targets: [target('clitoris', { intensity: 80, durationMs: 1000 })]
  }));
  failures = subject.runtime.recentFailures();
  failures[0].detail = 'mutated';
  assert.equal(subject.runtime.recentFailures()[0].detail, 'copy me');

  subject.calls.length = 0;
  subject.runtime.invalidateSlot(1);
  assert.equal(subject.runtime.tick(), 2);
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [1, 2]);
});

test('forceResync redispatches the complete current enabled-slot snapshot', function () {
  var subject = createSubject(0);
  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 80 })]
  }));
  subject.calls.length = 0;

  assert.equal(subject.runtime.forceResync(), 3);
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [1, 2, 3]);
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.value; }), [40, 20, 0]);
});

test('built public globals preserve the complete baseline attack stop expiry and stop-all flow', function () {
  var loaded = publicSubject();
  var actionStart = 0;

  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 0, frequency: 0, rampSeconds: 0, directionCode: 0, generation: 1 },
    { value: 0, frequency: 0, rampSeconds: 0, directionCode: 0, generation: 1 },
    { value: 0, frequency: 0, rampSeconds: 0, directionCode: 0, generation: 1 }
  ]);

  actionStart = loaded.actions.length;
  assert.equal(sendWebhook(loaded, 'set_baseline', {
    source: 'acceptance',
    sequence: 1,
    targets: [
      target('clitoris', {
        intensity: 20, frequency: 11, rampUpMs: 1000, rampDownMs: 2000
      }),
      target('vagina', {
        rotateSpeed: 20, rotateDirection: 'clockwise', rampUpMs: 500, rampDownMs: 700
      })
    ]
  }), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 10, frequency: 11, rampSeconds: 1, directionCode: 0, generation: 2 },
    { value: 5, frequency: 0, rampSeconds: 1, directionCode: 0, generation: 2 },
    { value: 10, frequency: 0, rampSeconds: 0.5, directionCode: 1, generation: 2 }
  ]);

  loaded.setNow(100);
  actionStart = loaded.actions.length;
  assert.equal(sendWebhook(loaded, 'play', {
    source: 'acceptance',
    eventId: 'clitoris-attack',
    sequence: 1,
    targets: [target('clitoris', {
      intensity: 80, frequency: 70, durationMs: 500,
      rampUpMs: 200, rampDownMs: 400, priority: 10
    })]
  }), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 46, frequency: 70, rampSeconds: 0.2, directionCode: 0, generation: 3 },
    { value: 24, frequency: 0, rampSeconds: 0.2, directionCode: 0, generation: 3 },
    { value: 10, frequency: 0, rampSeconds: 0.5, directionCode: 1, generation: 2 }
  ], [1, 2]);

  loaded.setNow(120);
  actionStart = loaded.actions.length;
  assert.equal(sendWebhook(loaded, 'play', {
    source: 'acceptance',
    eventId: 'vagina-attack',
    sequence: 1,
    targets: [target('vagina', {
      rotateSpeed: 60, rotateDirection: 'clockwise', durationMs: 800,
      rampUpMs: 300, rampDownMs: 600, priority: 20
    })]
  }), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 46, frequency: 70, rampSeconds: 0.2, directionCode: 0, generation: 3 },
    { value: 24, frequency: 0, rampSeconds: 0.2, directionCode: 0, generation: 3 },
    { value: 37, frequency: 0, rampSeconds: 0.3, directionCode: 1, generation: 4 }
  ], [3]);

  loaded.setNow(150);
  actionStart = loaded.actions.length;
  assert.equal(sendWebhook(loaded, 'update', {
    source: 'acceptance',
    eventId: 'vagina-attack',
    sequence: 2,
    targets: [target('vagina', {
      rotateSpeed: 80, rotateDirection: 'counterclockwise', durationMs: 800,
      rampUpMs: 100, rampDownMs: 500, priority: 20
    })]
  }), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 46, frequency: 70, rampSeconds: 0.2, directionCode: 0, generation: 3 },
    { value: 24, frequency: 0, rampSeconds: 0.2, directionCode: 0, generation: 3 },
    { value: 46, frequency: 0, rampSeconds: 0.1, directionCode: -1, generation: 5 }
  ], [3]);

  loaded.setNow(200);
  actionStart = loaded.actions.length;
  assert.equal(sendWebhook(loaded, 'stop', {
    source: 'acceptance',
    eventId: 'clitoris-attack',
    targets: [target('clitoris')]
  }), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 10, frequency: 11, rampSeconds: 0.4, directionCode: 0, generation: 6 },
    { value: 5, frequency: 0, rampSeconds: 0.4, directionCode: 0, generation: 6 },
    { value: 46, frequency: 0, rampSeconds: 0.1, directionCode: -1, generation: 5 }
  ], [1, 2]);

  loaded.setNow(949);
  actionStart = loaded.actions.length;
  assert.equal(loaded.context.xtoysBridgeTick(), 0);
  assert.deepEqual(loaded.actions.slice(actionStart), []);
  assert.deepEqual(slotVariables(loaded, 3), {
    value: 46, frequency: 0, rampSeconds: 0.1, directionCode: -1, generation: 5
  });

  loaded.setNow(950);
  actionStart = loaded.actions.length;
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 10, frequency: 11, rampSeconds: 0.4, directionCode: 0, generation: 6 },
    { value: 5, frequency: 0, rampSeconds: 0.4, directionCode: 0, generation: 6 },
    { value: 10, frequency: 0, rampSeconds: 0.5, directionCode: 1, generation: 7 }
  ], [3]);

  loaded.setNow(1000);
  actionStart = loaded.actions.length;
  assert.equal(sendWebhook(loaded, 'set_baseline', {
    source: 'acceptance', sequence: 2, targets: []
  }), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 0, frequency: 0, rampSeconds: 2, directionCode: 0, generation: 8 },
    { value: 0, frequency: 0, rampSeconds: 2, directionCode: 0, generation: 8 },
    { value: 0, frequency: 0, rampSeconds: 0.7, directionCode: 0, generation: 8 }
  ]);

  actionStart = loaded.actions.length;
  assert.equal(sendWebhook(loaded, 'stop_all', {
    source: 'acceptance'
  }), 1);
  assertPublicStep(loaded, actionStart, [
    { value: 0, frequency: 0, rampSeconds: 0, directionCode: 0, generation: 9 },
    { value: 0, frequency: 0, rampSeconds: 0, directionCode: 0, generation: 9 },
    { value: 0, frequency: 0, rampSeconds: 0, directionCode: 0, generation: 9 }
  ]);
});

test('simulated webhook trigger ignores an outer action other than the documented exact filter', function () {
  var loaded = publicSubject();
  var calls = 0;
  loaded.context.xtoysBridgeHandle = function () {
    calls += 1;
    return 1;
  };

  assert.equal(sendWebhook(loaded, 'stop_all', {
    source: 'acceptance-wrong-action'
  }, 'XToys_Game_Bridge'), null);
  assert.equal(calls, 0);
});

test('built public handler rejects malformed and oversized payloads without output', function () {
  var loaded = publicSubject();
  var variablesBefore;
  var actionsBefore;
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    source: 'acceptance-invalid',
    sequence: 1,
    targets: [target('clitoris', { intensity: 20 })]
  }));
  variablesBefore = copy(loaded.variables);
  actionsBefore = copy(loaded.actions);

  assert.equal(loaded.context.xtoysBridgeHandle('{'), 0);
  assert.equal(loaded.context.xtoysBridgeHandle(new Array(32770).join('x')), 0);
  assert.deepEqual(copy(loaded.variables), variablesBefore);
  assert.deepEqual(copy(loaded.actions), actionsBefore);
});

test('built public handler processes 500 timed update commands with deterministic batched debug output', function () {
  var loaded = publicSubject('debug');
  var index;
  loaded.context.xtoysBridgeInit();
  loaded.actions.length = 0;
  loaded.logs.length = 0;

  assert.equal(loaded.context.xtoysBridgeHandle(payload('play', {
    source: 'acceptance-density',
    eventId: 'dense',
    sequence: 0,
    targets: [target('clitoris', {
      intensity: 20, frequency: 55, durationMs: 1000,
      rampUpMs: 200, rampDownMs: 300
    })]
  })), 1);

  for (index = 1; index <= 500; index += 1) {
    loaded.setNow(index);
    assert.equal(loaded.context.xtoysBridgeHandle(payload('update', {
      source: 'acceptance-density',
      eventId: 'dense',
      sequence: index,
      targets: [target('clitoris', {
        intensity: index % 2 === 0 ? 80 : 20,
        frequency: 55,
        durationMs: 1000,
        rampUpMs: 200,
        rampDownMs: 300
      })]
    })), 1);
  }

  assert.equal(loaded.actions.length, 1000);
  assert.equal(loaded.actions.some(function (action) {
    return action.job === 'xthb-output-03';
  }), false);
  assert.deepEqual(slotVariables(loaded, 1), {
    value: 40, frequency: 55, rampSeconds: 0.2, directionCode: 0, generation: 502
  });
  assert.deepEqual(slotVariables(loaded, 2), {
    value: 20, frequency: 0, rampSeconds: 0.2, directionCode: 0, generation: 502
  });
  assert.deepEqual(slotVariables(loaded, 3), {
    value: 0, frequency: 0, rampSeconds: 0, directionCode: 0, generation: 1
  });
  assert.equal(loaded.logs.length, 10);
  loaded.logs.forEach(function (entry) {
    assert.equal(entry, 'XTHB debug: 100 successful slot updates.');
  });
});

test('runtime reports retained-state capacity rejection before expiry or dispatch', function () {
  var subject = createSubject(0);
  var before;
  var rejected;
  var stopped;
  var index;

  for (index = 0; index < 128; index += 1) {
    assert.equal(subject.runtime.handle(payload('play', {
      eventId: 'capacity-' + index,
      sequence: 1,
      targets: [target('clitoris', { intensity: 40, durationMs: 600000 })]
    })).ok, true);
  }
  before = subject.runtime.snapshot();
  subject.calls.length = 0;
  rejected = subject.runtime.handle(payload('play', {
    eventId: 'capacity-128',
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, durationMs: 600000 })]
  }));

  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'state_capacity_exceeded');
  assert.deepEqual(copy(subject.runtime.snapshot()), copy(before));
  assert.deepEqual(subject.calls, []);

  stopped = subject.runtime.handle(payload('stop_all'));
  assert.equal(stopped.ok, true);
});

test('unchanged handle and tick paths avoid deep-copying logical state', function () {
  var subject = createSubject(0);
  var originalCopy = subject.loaded.XTHB.copyObject;
  var stateCopies = 0;
  var before;

  subject.runtime.handle(payload('play', {
    eventId: 'long-lived',
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, durationMs: 1000 })]
  }));
  before = copy(subject.runtime.snapshot());
  subject.calls.length = 0;
  subject.loaded.XTHB.copyObject = function (value) {
    var keys;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys = Object.keys(value);
      if (keys.length > 0 && Array.isArray(value[keys[0]]) &&
          value[keys[0]].length > 0 && value[keys[0]][0].target !== undefined) {
        stateCopies += 1;
      }
    }
    return originalCopy(value);
  };

  subject.runtime.handle(payload('update', {
    eventId: 'long-lived',
    sequence: 1,
    targets: [target('clitoris', { intensity: 80, durationMs: 1000 })]
  }));
  assert.equal(stateCopies, 0);
  assert.deepEqual(subject.calls, []);

  stateCopies = 0;
  subject.runtime.tick();
  assert.equal(stateCopies, 0);
  assert.deepEqual(subject.calls, []);

  subject.loaded.XTHB.copyObject = originalCopy;
  assert.deepEqual(copy(subject.runtime.snapshot()), before);
});
