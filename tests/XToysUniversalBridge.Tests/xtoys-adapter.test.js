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
  assert.deepEqual(enabledJobNames(calls), ['xthb-output-01', 'xthb-output-02', 'xthb-output-03']);
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
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
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
    'xthb-output-01', 'xthb-output-02', 'xthb-output-03'
  ]);
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
