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

function fixtureConfig() {
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function payload(command, values) {
  var data = values || {};
  var result = {
    protocolVersion: 1,
    command: command,
    source: data.source || 'adapter-test'
  };
  var key;
  for (key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && key !== 'source') {
      result[key] = data[key];
    }
  }
  return JSON.stringify(result);
}

function adaptiveTarget(part, values) {
  var data = values || {};
  var result = {
    part: part,
    intensity: 60,
    frequency: 70,
    durationMs: 1000,
    rampUpMs: 180,
    rampDownMs: 80,
    retrigger: {
      mode: 'adaptive', minDropPercent: 25, maxDropPercent: 100,
      minRampUpMs: 30, minRampDownMs: 20,
      textureThresholdMs: 150, quietResetMs: 600
    }
  };
  var key;
  for (key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      result[key] = data[key];
    }
  }
  return result;
}

function enabledJobNames(actions) {
  return actions.map(function (action) { return action.job; });
}

test('adapter writes all five slot variables before starting the output Job', function () {
  var loaded = loadRuntime();
  var operations = [];
  var adapter;

  loaded.context.setVariable = function (name, value) {
    operations.push({ type: 'variable', name: name, value: value });
  };
  loaded.context.callAction = function (action) {
    operations.push({ type: 'action', action: plain(action) });
  };
  adapter = loaded.XTHB.createXToysAdapter('errors');
  adapter.applySlot({
    id: 1,
    value: 42,
    frequency: 73,
    direction: 'clockwise',
    generation: 9
  }, { rampSeconds: 1.25 });

  assert.deepEqual(operations, [
    { type: 'variable', name: 'xthb-slot-01-value', value: 42 },
    { type: 'variable', name: 'xthb-slot-01-frequency', value: 73 },
    { type: 'variable', name: 'xthb-slot-01-ramp-seconds', value: 1.25 },
    { type: 'variable', name: 'xthb-slot-01-direction-code', value: 1 },
    { type: 'variable', name: 'xthb-slot-01-generation', value: 9 },
    {
      type: 'action',
      action: { type: 'updateJob', job: 'xthb-output-01', action: 'start' }
    }
  ]);
});

test('adapter maps directions and rejects output slot ids outside 01 through 16', function () {
  var loaded = loadRuntime();
  var directions = [];
  var adapter;

  loaded.context.setVariable = function (name, value) {
    if (/-direction-code$/.test(name)) {
      directions.push(value);
    }
  };
  adapter = loaded.XTHB.createXToysAdapter('off');
  adapter.applySlot({ id: 16, value: 1, frequency: 0, direction: 'counterclockwise', generation: 1 }, { rampSeconds: 0 });
  adapter.applySlot({ id: 1, value: 0, frequency: 0, direction: null, generation: 2 }, { rampSeconds: 0 });

  assert.deepEqual(directions, [-1, 0]);
  assert.throws(function () {
    adapter.applySlot({ id: 0, value: 0, frequency: 0, direction: null, generation: 0 }, { rampSeconds: 0 });
  }, /slot/i);
  assert.throws(function () {
    adapter.applySlot({ id: 17, value: 0, frequency: 0, direction: null, generation: 0 }, { rampSeconds: 0 });
  }, /slot/i);
});

test('built distribution exposes the global-entry marker and six true global functions', function () {
  var loaded = loadRuntime({ variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) } });
  var names = [
    'xtoysBridgeInit',
    'xtoysBridgeHandle',
    'xtoysBridgeTick',
    'xtoysBridgeStopAll',
    'xtoysBridgeReloadConfig',
    'xtoysBridgeTestSlot'
  ];

  assert.equal(loaded.XTHB.MODULE_GLOBAL_ENTRY, true);
  names.forEach(function (name) {
    assert.equal(typeof loaded.context[name], 'function', name);
  });
});

test('init reads configuration once and initializes each enabled Job exactly once', function () {
  var reads = 0;
  var variables = {};
  var loaded;
  Object.defineProperty(variables, 'xthb-config-json', {
    configurable: true,
    get: function () {
      reads += 1;
      return JSON.stringify(fixtureConfig());
    }
  });
  loaded = loadRuntime({ variables: variables });

  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  assert.equal(reads, 1);
  assert.deepEqual(enabledJobNames(loaded.actions), [
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
  [1, 2, 3].forEach(function (id) {
    var suffix = id < 10 ? '0' + id : String(id);
    assert.equal(variables['xthb-slot-' + suffix + '-value'], 0);
    assert.equal(variables['xthb-slot-' + suffix + '-frequency'], 0);
    assert.equal(variables['xthb-slot-' + suffix + '-ramp-seconds'], 0);
    assert.equal(variables['xthb-slot-' + suffix + '-direction-code'], 0);
    assert.equal(typeof variables['xthb-slot-' + suffix + '-generation'], 'number');
  });

  loaded.context.xtoysBridgeTick();
  loaded.context.xtoysBridgeStopAll();
  loaded.context.xtoysBridgeTestSlot(1, 25);
  loaded.context.xtoysBridgeHandle('{');
  assert.equal(reads, 1);
});

test('handle returns contract status, catches failures, and protocol test never drives hardware', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var actionsBefore;

  assert.equal(loaded.context.xtoysBridgeHandle('{'), 1);
  assert.equal(loaded.context.xtoysBridgeTick(), 0);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 20), 0);
  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  loaded.actions.length = 0;
  assert.equal(loaded.context.xtoysBridgeHandle('{'), 0);
  assert.deepEqual(loaded.actions, []);

  assert.equal(loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'accepted',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 100 }]
  })), 1);
  actionsBefore = loaded.actions.length;
  assert.equal(loaded.context.xtoysBridgeHandle(payload('update', {
    eventId: 'accepted',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 100, durationMs: 100 }]
  })), 1);
  assert.equal(loaded.actions.length, actionsBefore);

  loaded.actions.length = 0;
  assert.equal(loaded.context.xtoysBridgeHandle(payload('test', {
    targets: [{ part: 'clitoris', intensity: 100 }]
  })), 1);
  assert.deepEqual(loaded.actions, []);

  loaded.context.console.log = function () { throw new Error('console unavailable'); };
  assert.doesNotThrow(function () { loaded.context.xtoysBridgeHandle('{'); });
});

test('adapter apply failures are isolated and retry on tick without changing handle acceptance', function () {
  var loaded = loadRuntime({ variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) } });
  var calls = [];
  var failSlotTwo = false;
  loaded.context.callAction = function (action) {
    calls.push(plain(action));
    if (action.job === 'xthb-output-02' && failSlotTwo) {
      failSlotTwo = false;
      throw new Error('slot two failed');
    }
  };
  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  calls.length = 0;
  failSlotTwo = true;

  assert.equal(loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'failure',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 1000 }]
  })), 1);
  assert.deepEqual(enabledJobNames(calls), ['xthb-output-01', 'xthb-output-02']);
  calls.length = 0;
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assert.deepEqual(enabledJobNames(calls), ['xthb-output-02']);
});

test('stopAll is idempotent after output and a repeated init safely resets the runtime', function () {
  var loaded = loadRuntime({ variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) } });
  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'active',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 1000 }]
  }));
  loaded.actions.length = 0;

  assert.equal(loaded.context.xtoysBridgeStopAll(), 3);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);
  assert.equal(loaded.actions.length, 3);
  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  assert.equal(loaded.actions.length, 6);
});

test('stopAll remains retryable until every enabled slot is zeroed', function () {
  var loaded = loadRuntime({ variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) } });
  var calls = [];
  var failStopSlotTwo = false;
  loaded.context.callAction = function (action) {
    calls.push(plain(action));
    if (failStopSlotTwo && action.job === 'xthb-output-02') {
      failStopSlotTwo = false;
      throw new Error('slot two stop failed');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'active-stop',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 1000 }]
  }));
  calls.length = 0;
  failStopSlotTwo = true;

  assert.equal(loaded.context.xtoysBridgeStopAll(), 2);
  assert.deepEqual(enabledJobNames(calls), [
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
  calls.length = 0;
  assert.equal(loaded.context.xtoysBridgeStopAll(), 1);
  assert.deepEqual(enabledJobNames(calls), ['xthb-output-02']);
  calls.length = 0;
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);
  assert.deepEqual(calls, []);
});

test('protocol stop_all leaves the public stop retryable when dispatch is incomplete', function () {
  var loaded = loadRuntime({ variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) } });
  var calls = [];
  var failStopSlotTwo = false;
  loaded.context.callAction = function (action) {
    calls.push(plain(action));
    if (failStopSlotTwo && action.job === 'xthb-output-02') {
      failStopSlotTwo = false;
      throw new Error('protocol stop failed');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'protocol-active',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 1000 }]
  }));
  calls.length = 0;
  failStopSlotTwo = true;

  assert.equal(loaded.context.xtoysBridgeHandle(payload('stop_all')), 1);
  calls.length = 0;
  assert.equal(loaded.context.xtoysBridgeStopAll(), 1);
  assert.deepEqual(enabledJobNames(calls), ['xthb-output-02']);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);
});

test('lifecycle stop_all immediately zeros texture and starts later cadence from empty state', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ now: 1000, variables: variables });
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 40, frequency: 20 }]
  }));
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'texture-before-stop-1', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }));
  loaded.setNow(1100);
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'texture-before-stop-2', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }));
  loaded.actions.length = 0;

  assert.equal(loaded.context.xtoysBridgeHandle(payload('stop_all')), 1);
  assert.deepEqual(enabledJobNames(loaded.actions), [
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
  [1, 2, 3].forEach(function (slotId) {
    var suffix = '0' + slotId;
    assert.equal(variables['xthb-slot-' + suffix + '-value'], 0);
    assert.equal(variables['xthb-slot-' + suffix + '-frequency'], 0);
    assert.equal(variables['xthb-slot-' + suffix + '-ramp-seconds'], 0);
    assert.equal(variables['xthb-slot-' + suffix + '-direction-code'], 0);
  });

  loaded.actions.length = 0;
  assert.equal(loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'first-after-stop', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  })), 1);
  assert.equal(variables['xthb-slot-01-value'], 30);
  assert.equal(variables['xthb-slot-01-frequency'], 70);
  assert.equal(variables['xthb-slot-01-ramp-seconds'], 0.18);
});

test('reload rejects bad configuration atomically and safely zeros outputs removed by a valid config', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var nextConfig;
  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  loaded.actions.length = 0;

  variables['xthb-config-json'] = '{';
  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 0);
  assert.deepEqual(loaded.actions, []);
  assert.equal(loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 2,
    targets: [{ part: 'clitoris', intensity: 60 }]
  })), 1);
  assert.deepEqual(enabledJobNames(loaded.actions), [
    'xthb-output-01', 'xthb-output-02'
  ]);

  nextConfig = fixtureConfig();
  nextConfig.slots[0].enabled = false;
  nextConfig.slots[2].enabled = false;
  variables['xthb-config-json'] = JSON.stringify(nextConfig);
  loaded.actions.length = 0;
  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 1);
  assert.deepEqual(enabledJobNames(loaded.actions).sort(), [
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
  assert.equal(variables['xthb-slot-01-value'], 0);
  assert.equal(variables['xthb-slot-03-value'], 0);

  loaded.actions.length = 0;
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  assert.deepEqual(enabledJobNames(loaded.actions), ['xthb-output-02']);
});

test('lifecycle valid reload clears texture output and installs a stopped empty runtime', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ now: 1000, variables: variables });
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'reload-texture-1', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }));
  loaded.setNow(1100);
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'reload-texture-2', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }));
  loaded.actions.length = 0;

  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 1);
  assert.deepEqual(enabledJobNames(loaded.actions), [
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
  assert.equal(variables['xthb-slot-01-value'], 0);
  assert.equal(variables['xthb-slot-01-frequency'], 0);
  loaded.actions.length = 0;
  assert.equal(loaded.context.xtoysBridgeTick(), 0);
  assert.deepEqual(loaded.actions, []);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);

  assert.equal(loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'first-after-reload', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  })), 1);
  assert.equal(variables['xthb-slot-01-value'], 30);
  assert.equal(variables['xthb-slot-01-frequency'], 70);
});

test('reload keeps the old runtime when an output removed by the new config cannot be zeroed', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var nextConfig = fixtureConfig();
  var calls = [];
  loaded.context.xtoysBridgeInit();
  nextConfig.slots[0].enabled = false;
  variables['xthb-config-json'] = JSON.stringify(nextConfig);
  loaded.context.callAction = function (action) {
    calls.push(plain(action));
    if (action.job === 'xthb-output-01') {
      throw new Error('cannot zero old slot');
    }
  };

  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 0);
  loaded.context.callAction = function (action) { calls.push(plain(action)); };
  calls.length = 0;
  assert.equal(loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  })), 1);
  assert.deepEqual(enabledJobNames(calls), [
    'xthb-output-01', 'xthb-output-02'
  ]);
});

test('failed multi-slot reload restores outputs zeroed before the failure', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var nextConfig = fixtureConfig();
  var calls = [];
  var failRemovedSlotTwo = false;
  loaded.context.callAction = function (action) {
    calls.push(plain(action));
    if (failRemovedSlotTwo && action.job === 'xthb-output-02') {
      failRemovedSlotTwo = false;
      throw new Error('second removed slot failed');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  nextConfig.slots[0].enabled = false;
  nextConfig.slots[1].enabled = false;
  variables['xthb-config-json'] = JSON.stringify(nextConfig);
  calls.length = 0;
  failRemovedSlotTwo = true;

  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 0);
  assert.deepEqual(enabledJobNames(calls), [
    'xthb-output-01', 'xthb-output-02',
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
  assert.equal(variables['xthb-slot-01-value'], 40);
  assert.equal(variables['xthb-slot-02-value'], 20);
});

test('lifecycle failed reload reasserts the physical texture tuple and retries an exact failed resync', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ now: 1000, variables: variables });
  var nextConfig = fixtureConfig();
  var failRemovedSlotTwo = false;
  var failRestoreSlotOne = false;
  var physical;
  var failedGeneration;
  var originalCallAction = loaded.context.callAction;
  loaded.context.callAction = function (action) {
    originalCallAction(action);
    if (failRemovedSlotTwo && action.job === 'xthb-output-02') {
      failRemovedSlotTwo = false;
      throw new Error('removed slot zero failed');
    }
    if (failRestoreSlotOne && action.job === 'xthb-output-01') {
      failRestoreSlotOne = false;
      throw new Error('old texture resync failed');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 40, frequency: 20 }]
  }));
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'failed-reload-texture-1', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }));
  loaded.setNow(1100);
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'failed-reload-texture-2', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }));
  physical = {
    value: variables['xthb-slot-01-value'],
    frequency: variables['xthb-slot-01-frequency'],
    direction: variables['xthb-slot-01-direction-code'],
    ramp: variables['xthb-slot-01-ramp-seconds'],
    generation: variables['xthb-slot-01-generation']
  };
  nextConfig.slots[1].enabled = false;
  variables['xthb-config-json'] = JSON.stringify(nextConfig);
  loaded.setNow(1200);
  failRemovedSlotTwo = true;
  failRestoreSlotOne = true;

  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 0);
  assert.equal(variables['xthb-slot-01-value'], physical.value);
  assert.equal(variables['xthb-slot-01-frequency'], physical.frequency);
  assert.equal(variables['xthb-slot-01-direction-code'], physical.direction);
  assert.equal(variables['xthb-slot-01-ramp-seconds'], physical.ramp);
  failedGeneration = variables['xthb-slot-01-generation'];
  assert.ok(failedGeneration > physical.generation);

  loaded.actions.length = 0;
  loaded.setNow(1300);
  assert.equal(loaded.context.xtoysBridgeTick() > 0, true);
  assert.equal(variables['xthb-slot-01-value'], physical.value);
  assert.equal(variables['xthb-slot-01-frequency'], physical.frequency);
  assert.equal(variables['xthb-slot-01-direction-code'], physical.direction);
  assert.equal(variables['xthb-slot-01-ramp-seconds'], physical.ramp);
  assert.ok(variables['xthb-slot-01-generation'] > failedGeneration);

  loaded.actions.length = 0;
  loaded.setNow(1400);
  loaded.context.xtoysBridgeTick();
  assert.equal(variables['xthb-slot-01-value'], 38);
  assert.equal(variables['xthb-slot-01-frequency'], 20);
  loaded.setNow(1500);
  loaded.context.xtoysBridgeTick();
  assert.equal(variables['xthb-slot-01-value'], 44);
  assert.equal(variables['xthb-slot-01-frequency'], 70);
});

test('failed reload completing a prior partial stop becomes fully stopped after resync', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var nextConfig = fixtureConfig();
  var failSlotTwoCount = 0;
  loaded.context.callAction = function (action) {
    if (action.job === 'xthb-output-02' && failSlotTwoCount > 0) {
      failSlotTwoCount -= 1;
      throw new Error('slot two unavailable');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'reload-stop', sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 1000 }]
  }));
  failSlotTwoCount = 1;
  assert.equal(loaded.context.xtoysBridgeStopAll(), 2);
  nextConfig.slots[0].enabled = false;
  nextConfig.slots[1].enabled = false;
  variables['xthb-config-json'] = JSON.stringify(nextConfig);
  failSlotTwoCount = 1;

  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 0);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);
});

test('failed reload preserves partial-stop retry state when resync still fails', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var nextConfig = fixtureConfig();
  var failSlotTwoCount = 0;
  loaded.context.callAction = function (action) {
    if (action.job === 'xthb-output-02' && failSlotTwoCount > 0) {
      failSlotTwoCount -= 1;
      throw new Error('slot two unavailable');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'reload-stop-fail', sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 1000 }]
  }));
  failSlotTwoCount = 1;
  loaded.context.xtoysBridgeStopAll();
  nextConfig.slots[0].enabled = false;
  nextConfig.slots[1].enabled = false;
  variables['xthb-config-json'] = JSON.stringify(nextConfig);
  failSlotTwoCount = 2;

  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 0);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 1);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);
});

test('failed reload of a fully stopped runtime becomes stopped after its resync retry succeeds', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var nextConfig = fixtureConfig();
  var failSlotOneCount = 0;
  loaded.context.callAction = function (action) {
    if (action.job === 'xthb-output-01' && failSlotOneCount > 0) {
      failSlotOneCount -= 1;
      throw new Error('slot one unavailable');
    }
  };
  loaded.context.xtoysBridgeInit();
  nextConfig.slots[0].enabled = false;
  variables['xthb-config-json'] = JSON.stringify(nextConfig);
  failSlotOneCount = 2;

  assert.equal(loaded.context.xtoysBridgeReloadConfig(), 0);
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 0);
});

test('manual slot testing clamps value and applies only an enabled configured slot', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  loaded.context.xtoysBridgeInit();
  loaded.actions.length = 0;

  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 150), 1);
  assert.equal(variables['xthb-slot-01-value'], 100);
  assert.equal(variables['xthb-slot-01-frequency'], 0);
  assert.equal(variables['xthb-slot-01-ramp-seconds'], 0);
  assert.equal(variables['xthb-slot-01-direction-code'], 0);
  assert.deepEqual(enabledJobNames(loaded.actions), ['xthb-output-01']);
  assert.equal(loaded.context.xtoysBridgeTestSlot(4, 50), 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot(17, 50), 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 'not-a-number'), 0);
  assert.equal(loaded.actions.length, 1);

  assert.equal(loaded.context.xtoysBridgeTestSlot(1, -20), 1);
  assert.equal(variables['xthb-slot-01-value'], 0);
});

test('manual slot testing is one-shot and the next tick reasserts protocol state', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  loaded.actions.length = 0;

  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 100), 1);
  assert.equal(variables['xthb-slot-01-value'], 100);
  loaded.actions.length = 0;
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assert.deepEqual(enabledJobNames(loaded.actions), ['xthb-output-01']);
  assert.equal(variables['xthb-slot-01-value'], 40);
});

test('manual and restored slot generations remain strictly monotonic across logical updates', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var runtimeGeneration;
  var firstManual;
  var secondManual;
  var restored;
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  runtimeGeneration = variables['xthb-slot-01-generation'];

  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 90), 1);
  firstManual = variables['xthb-slot-01-generation'];
  assert.ok(firstManual > runtimeGeneration);
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 100), 1);
  secondManual = variables['xthb-slot-01-generation'];
  assert.ok(secondManual > firstManual);
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  restored = variables['xthb-slot-01-generation'];
  assert.ok(restored > secondManual);
  assert.equal(variables['xthb-slot-01-value'], 40);

  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 2,
    targets: [{ part: 'clitoris', intensity: 60 }]
  }));
  assert.ok(variables['xthb-slot-01-generation'] > restored);
});

test('manual generation floors survive a pending restore failure and another manual write', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var failNextSlotOne = false;
  var failedRestoreGeneration;
  var secondManualGeneration;
  loaded.context.callAction = function (action) {
    if (failNextSlotOne && action.job === 'xthb-output-01') {
      failNextSlotOne = false;
      throw new Error('restore failed');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  loaded.context.xtoysBridgeTestSlot(1, 90);
  failNextSlotOne = true;
  assert.equal(loaded.context.xtoysBridgeTick(), 0);
  failedRestoreGeneration = variables['xthb-slot-01-generation'];

  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 95), 1);
  secondManualGeneration = variables['xthb-slot-01-generation'];
  assert.ok(secondManualGeneration > failedRestoreGeneration);
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assert.ok(variables['xthb-slot-01-generation'] > secondManualGeneration);
  assert.equal(variables['xthb-slot-01-value'], 40);
});

test('a failed manual apply reserves safely and the next tick reasserts protocol output', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var failManual = false;
  var reservedGeneration;
  loaded.context.callAction = function (action) {
    if (failManual && action.job === 'xthb-output-01') {
      failManual = false;
      throw new Error('manual apply failed');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  failManual = true;
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 100), 0);
  reservedGeneration = variables['xthb-slot-01-generation'];
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assert.ok(variables['xthb-slot-01-generation'] >= reservedGeneration);
  assert.equal(variables['xthb-slot-01-value'], 40);
});

test('a partial failed manual test makes immediate stopAll reassert the complete zero tuple', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var failManualFrequency = false;
  var originalSetVariable = loaded.context.setVariable;
  loaded.context.setVariable = function (name, value) {
    originalSetVariable(name, value);
    if (failManualFrequency && name === 'xthb-slot-01-frequency') {
      failManualFrequency = false;
      throw new Error('partial manual write');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.actions.length = 0;
  failManualFrequency = true;

  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 100), 0);
  assert.equal(variables['xthb-slot-01-value'], 100);
  loaded.actions.length = 0;
  assert.equal(loaded.context.xtoysBridgeStopAll(), 3);
  assert.deepEqual(enabledJobNames(loaded.actions), [
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
  assert.equal(variables['xthb-slot-01-value'], 0);
  assert.equal(variables['xthb-slot-01-frequency'], 0);
  assert.equal(variables['xthb-slot-01-ramp-seconds'], 0);
  assert.equal(variables['xthb-slot-01-direction-code'], 0);
});

test('manual reservation advances beyond a failed logical attempt and isolates other slots', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var calls = [];
  var failLogicalSlotOne = false;
  var attemptedGeneration;
  var manualGeneration;
  var slotTwoGeneration;
  loaded.context.callAction = function (action) {
    calls.push(plain(action));
    if (failLogicalSlotOne && action.job === 'xthb-output-01') {
      failLogicalSlotOne = false;
      throw new Error('logical dispatch failed');
    }
  };
  loaded.context.xtoysBridgeInit();
  calls.length = 0;
  failLogicalSlotOne = true;
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  attemptedGeneration = variables['xthb-slot-01-generation'];
  slotTwoGeneration = variables['xthb-slot-02-generation'];

  calls.length = 0;
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 90), 1);
  manualGeneration = variables['xthb-slot-01-generation'];
  assert.ok(manualGeneration > attemptedGeneration);
  assert.deepEqual(enabledJobNames(calls), ['xthb-output-01']);
  calls.length = 0;
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assert.ok(variables['xthb-slot-01-generation'] > manualGeneration);
  assert.equal(variables['xthb-slot-01-value'], 40);
  assert.equal(variables['xthb-slot-02-generation'], slotTwoGeneration);
  assert.deepEqual(enabledJobNames(calls), ['xthb-output-01']);
});

test('manual slot testing rejects coercive values but accepts finite numbers and numeric strings', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  var invalidValues = [true, false, [], [1], {}, null, '', '   ', NaN, Infinity, -Infinity];
  loaded.context.xtoysBridgeInit();
  loaded.actions.length = 0;

  invalidValues.forEach(function (value) {
    assert.equal(loaded.context.xtoysBridgeTestSlot(1, value), 0, String(value));
  });
  assert.equal(loaded.context.xtoysBridgeTestSlot(true, 50), 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot([], 50), 0);
  assert.equal(loaded.actions.length, 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot('1', '0'), 1);
  assert.equal(variables['xthb-slot-01-value'], 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 100), 1);
  assert.equal(variables['xthb-slot-01-value'], 100);
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, '101'), 1);
  assert.equal(variables['xthb-slot-01-value'], 100);
});

test('log levels suppress off/errors successes and aggregate debug success output', function () {
  var loaded = loadRuntime();
  var index;
  var adapter = loaded.XTHB.createXToysAdapter('debug');
  for (index = 0; index < 99; index += 1) {
    adapter.applySlot({ id: 1, value: index, frequency: 0, direction: null, generation: index }, { rampSeconds: 0 });
  }
  assert.deepEqual(loaded.logs, []);
  adapter.applySlot({ id: 1, value: 100, frequency: 0, direction: null, generation: 100 }, { rampSeconds: 0 });
  assert.equal(loaded.logs.length, 1);
  assert.match(loaded.logs[0], /100/);
  adapter.log({ preview: true });
  assert.equal(loaded.logs.length, 2);
  assert.match(loaded.logs[1], /preview/);
});

test('adapter logs errors immediately unless logging is off and contains console failures', function () {
  var loaded = loadRuntime();
  var errorsAdapter = loaded.XTHB.createXToysAdapter('errors');
  var offAdapter = loaded.XTHB.createXToysAdapter('off');
  errorsAdapter.log({ type: 'dispatch_error', detail: 'job failed' });
  assert.equal(loaded.logs.length, 1);
  assert.match(loaded.logs[0], /job failed/);
  offAdapter.log({ type: 'dispatch_error', detail: 'suppressed' });
  assert.equal(loaded.logs.length, 1);
  loaded.context.console.log = function () { throw new Error('console unavailable'); };
  assert.doesNotThrow(function () {
    errorsAdapter.log({ type: 'dispatch_error', detail: 'contained' });
  });
});

test('public handle rejects excess retained state without output and still accepts stop all', function () {
  var loaded = loadRuntime({
    now: 0,
    variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) }
  });
  var variablesBefore;
  var actionsBefore;
  var index;

  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  for (index = 0; index < 128; index += 1) {
    assert.equal(loaded.context.xtoysBridgeHandle(payload('play', {
      eventId: 'capacity-' + index,
      sequence: 1,
      targets: [{ part: 'clitoris', intensity: 40, durationMs: 600000 }]
    })), 1);
  }
  loaded.actions.length = 0;
  variablesBefore = plain(loaded.variables);
  actionsBefore = plain(loaded.actions);

  assert.equal(loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'capacity-128',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 40, durationMs: 600000 }]
  })), 0);
  assert.deepEqual(plain(loaded.variables), variablesBefore);
  assert.deepEqual(plain(loaded.actions), actionsBefore);
  assert.equal(loaded.context.xtoysBridgeHandle(payload('stop_all')), 1);
});
