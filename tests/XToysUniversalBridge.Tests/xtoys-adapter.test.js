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

test('adapter writes all four slot variables before starting the output Job', function () {
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
    direction: 'clockwise'
  }, { rampSeconds: 1.25 });

  assert.deepEqual(operations, [
    { type: 'variable', name: 'xthb-slot-01-value', value: 42 },
    { type: 'variable', name: 'xthb-slot-01-frequency', value: 73 },
    { type: 'variable', name: 'xthb-slot-01-ramp-seconds', value: 1.25 },
    { type: 'variable', name: 'xthb-slot-01-direction-code', value: 1 },
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
  adapter.applySlot({ id: 16, value: 1, frequency: 0, direction: 'counterclockwise' }, { rampSeconds: 0 });
  adapter.applySlot({ id: 1, value: 0, frequency: 0, direction: null }, { rampSeconds: 0 });

  assert.deepEqual(directions, [-1, 0]);
  assert.throws(function () {
    adapter.applySlot({ id: 0, value: 0, frequency: 0, direction: null }, { rampSeconds: 0 });
  }, /slot/i);
  assert.throws(function () {
    adapter.applySlot({ id: 17, value: 0, frequency: 0, direction: null }, { rampSeconds: 0 });
  }, /slot/i);
});

test('built distribution exposes the global-entry marker and five true global functions', function () {
  var loaded = loadRuntime({ variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) } });

  assert.equal(loaded.XTHB.MODULE_GLOBAL_ENTRY, true);
  [
    'xtoysBridgeInit',
    'xtoysBridgeHandle',
    'xtoysBridgeTick',
    'xtoysBridgeStopAll',
    'xtoysBridgeTestSlot'
  ].forEach(function (name) {
    assert.equal(typeof loaded.context[name], 'function', name);
  });
  assert.equal(loaded.context.xtoysBridgeReloadConfig, undefined);
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

  assert.equal(loaded.context.xtoysBridgeHandle('{'), 0);
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

test('stopAll and repeated init each issue fresh best-effort zeros', function () {
  var loaded = loadRuntime({ variables: { 'xthb-config-json': JSON.stringify(fixtureConfig()) } });
  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  loaded.context.xtoysBridgeHandle(payload('play', {
    eventId: 'active',
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80, durationMs: 1000 }]
  }));
  loaded.actions.length = 0;

  assert.equal(loaded.context.xtoysBridgeStopAll(), 3);
  assert.equal(loaded.context.xtoysBridgeStopAll(), 3);
  assert.equal(loaded.actions.length, 6);
  assert.equal(loaded.context.xtoysBridgeInit(), 1);
  assert.equal(loaded.actions.length, 9);
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

test('manual rotation testing requires an explicit direction and next tick restores state', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var loaded = loadRuntime({ variables: variables });
  loaded.context.xtoysBridgeInit();
  assert.equal(loaded.context.xtoysBridgeTestSlot(3, 60), 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot(3, 60, 'sideways'), 0);
  assert.equal(loaded.context.xtoysBridgeTestSlot(3, 60, 'clockwise'), 1);
  assert.equal(variables['xthb-slot-03-value'], 60);
  assert.equal(variables['xthb-slot-03-direction-code'], 1);
  assert.equal(loaded.context.xtoysBridgeTestSlot(3, 40, 'counterclockwise'), 1);
  assert.equal(variables['xthb-slot-03-direction-code'], -1);
  loaded.context.xtoysBridgeTick();
  assert.equal(variables['xthb-slot-03-value'], 0);
  assert.equal(variables['xthb-slot-03-direction-code'], 0);
});
test('partial manual call invalidates only that slot and next tick reasserts current protocol state', function () {
  var variables = { 'xthb-config-json': JSON.stringify(fixtureConfig()) };
  var failFrequency = false;
  var loaded = loadRuntime({ variables: variables });
  loaded.context.setVariable = function (name, value) {
    variables[name] = value;
    if (failFrequency && name === 'xthb-slot-01-frequency') {
      failFrequency = false;
      throw new Error('partial manual write');
    }
  };
  loaded.context.xtoysBridgeInit();
  loaded.context.xtoysBridgeHandle(payload('set_baseline', {
    sequence: 1,
    targets: [{ part: 'clitoris', intensity: 80 }]
  }));
  failFrequency = true;
  assert.equal(loaded.context.xtoysBridgeTestSlot(1, 100), 0);
  assert.equal(loaded.context.xtoysBridgeTick(), 1);
  assert.equal(variables['xthb-slot-01-value'], 40);
  assert.equal(variables['xthb-slot-01-frequency'], 0);
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
    adapter.applySlot({ id: 1, value: index, frequency: 0, direction: null }, { rampSeconds: 0 });
  }
  assert.deepEqual(loaded.logs, []);
  adapter.applySlot({ id: 1, value: 100, frequency: 0, direction: null }, { rampSeconds: 0 });
  assert.equal(loaded.logs.length, 1);
  assert.equal(loaded.logs[0], 'XTHB debug: 100 XToys slot calls completed without exception.');
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
