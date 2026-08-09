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
    targets: [target('clitoris', { intensity: 100 })]
  }));

  assert.equal(result.ok, true);
  assert.ok(result.preview);
  assert.equal(subject.logs.length, 1);
  assert.deepEqual(subject.calls, []);
  assert.deepEqual(copy(subject.runtime.snapshot()), before);
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

test('tuple comparison includes generation and suppresses an identical tick with null and zero fields', function () {
  var subject = createSubject(0);
  var firstCall;
  var callsAfterPlay;

  subject.runtime.handle(payload('play', {
    eventId: 'tuple',
    sequence: 1,
    targets: [target('clitoris', {
      intensity: 80, frequency: 0, durationMs: 1000, rampUpMs: 700000
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
      intensity: 80, frequency: 0, durationMs: 1000, rampUpMs: 700000
    })]
  }));
  assert.equal(callsFor(subject, 1).length, callsAfterPlay + 1);
  assert.equal(lastCall(subject, 1).slot.generation, 2);
  assert.equal(firstCall.slot.generation, 1);
  assert.equal(firstCall.transition.rampSeconds, 600);
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
