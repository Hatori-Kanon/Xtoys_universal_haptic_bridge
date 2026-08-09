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
