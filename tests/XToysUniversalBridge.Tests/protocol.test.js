'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var loadRuntime = require('./harness').loadRuntime;

var fixtures = path.join(__dirname, 'fixtures');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validConfig() {
  return readFixture('config.json');
}

function validPlay() {
  return readFixture('play.json');
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

function parse(runtime, payload, config) {
  return runtime.XTHB.parseMessage(JSON.stringify(payload), config || validConfig());
}

function assertRejectedRetrigger(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'message'), false);
}

test('parses a valid play message into the complete normalized target shape', function () {
  var runtime = loadRuntime();
  var result = parse(runtime, validPlay());

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.message.targets[0])), {
    part: 'vagina',
    effect: 'hold',
    intensity: 40,
    hasIntensity: true,
    frequency: 0,
    hasFrequency: false,
    rotateSpeed: null,
    hasRotateSpeed: false,
    rotateDirection: null,
    durationMs: 1000,
    rampUpMs: 0,
    rampDownMs: 0,
    pulseOnMs: 0,
    pulseOffMs: 0,
    priority: 0,
    blend: 'replace',
    baselineBlend: 'boost',
    retrigger: null
  });
});

test('normalizes a complete adaptive retrigger profile without changing protocol version', function () {
  var runtime = loadRuntime();
  var payload = validPlay();
  payload.targets[0].durationMs = 500;
  payload.targets[0].rampUpMs = 180;
  payload.targets[0].rampDownMs = 80;
  payload.targets[0].retrigger = retrigger();
  var result = parse(runtime, payload);
  assert.equal(result.ok, true);
  assert.equal(result.message.protocolVersion, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.message.targets[0].retrigger)), retrigger());
});

test('accepts adaptive retrigger values at inclusive boundaries', function () {
  var runtime = loadRuntime();
  var payload = validPlay();
  var result;

  payload.targets[0].durationMs = 150;
  payload.targets[0].rampUpMs = 30;
  payload.targets[0].rampDownMs = 20;
  payload.targets[0].retrigger = retrigger({
    minDropPercent: 0,
    maxDropPercent: 100,
    minRampUpMs: 30,
    minRampDownMs: 20,
    textureThresholdMs: 100,
    quietResetMs: 101
  });
  result = parse(runtime, payload);

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.message.targets[0].retrigger)), {
    mode: 'adaptive',
    minDropPercent: 0,
    maxDropPercent: 100,
    minRampUpMs: 30,
    minRampDownMs: 20,
    textureThresholdMs: 100,
    quietResetMs: 101
  });
});

test('accepts retrigger timing thresholds at the protocol maximum', function () {
  var runtime = loadRuntime();
  var payload = validPlay();
  var result;

  payload.targets[0].durationMs = 150;
  payload.targets[0].rampUpMs = 30;
  payload.targets[0].rampDownMs = 20;
  payload.targets[0].retrigger = retrigger({
    minRampUpMs: 30,
    minRampDownMs: 20,
    textureThresholdMs: 599999,
    quietResetMs: 600000
  });
  result = parse(runtime, payload);

  assert.equal(result.ok, true);
  assert.equal(result.message.targets[0].retrigger.textureThresholdMs, 599999);
  assert.equal(result.message.targets[0].retrigger.quietResetMs, 600000);
});

test('rejects every adaptive retrigger value beyond its boundary', function () {
  var runtime = loadRuntime();
  var cases = [
    { name: 'minimum drop below zero', values: { minDropPercent: -1 }, code: 'invalid_retrigger' },
    { name: 'maximum drop above one hundred', values: { maxDropPercent: 101 }, code: 'invalid_retrigger' },
    { name: 'minimum drop above maximum drop', values: { minDropPercent: 51, maxDropPercent: 50 }, code: 'invalid_retrigger' },
    { name: 'minimum ramp up below zero', values: { minRampUpMs: -1 }, code: 'invalid_retrigger' },
    { name: 'minimum ramp up above target ramp', values: { minRampUpMs: 31 }, code: 'invalid_retrigger' },
    { name: 'minimum ramp down below zero', values: { minRampDownMs: -1 }, code: 'invalid_retrigger' },
    { name: 'minimum ramp down above target ramp', values: { minRampDownMs: 21 }, code: 'invalid_retrigger' },
    { name: 'texture threshold below scheduler interval', values: { textureThresholdMs: 99 }, code: 'invalid_retrigger' },
    { name: 'texture threshold above protocol time maximum', values: { textureThresholdMs: 600001, quietResetMs: 600002 }, code: 'invalid_retrigger' },
    { name: 'quiet reset equal to texture threshold', values: { textureThresholdMs: 100, quietResetMs: 100 }, code: 'invalid_retrigger' },
    { name: 'quiet reset above protocol time maximum', values: { quietResetMs: 600001 }, code: 'invalid_retrigger' },
    { name: 'minimum envelope longer than duration', values: {}, durationMs: 149, code: 'invalid_retrigger_timing' }
  ];

  cases.forEach(function (item) {
    var payload = validPlay();
    var result;
    payload.targets[0].durationMs = item.durationMs === undefined ? 150 : item.durationMs;
    payload.targets[0].rampUpMs = 30;
    payload.targets[0].rampDownMs = 20;
    payload.targets[0].retrigger = retrigger(item.values);
    result = parse(runtime, payload);
    assertRejectedRetrigger(result, item.code);
  });
});

test('rejects incomplete incompatible and impossible retrigger profiles atomically', function () {
  var runtime = loadRuntime();
  var payload = validPlay();
  var result;
  payload.targets[0].durationMs = 500;
  payload.targets[0].rampUpMs = 180;
  payload.targets[0].rampDownMs = 80;
  payload.targets[0].retrigger = retrigger();
  delete payload.targets[0].retrigger.quietResetMs;
  assertRejectedRetrigger(parse(runtime, payload), 'invalid_retrigger');

  payload.targets[0].retrigger = retrigger();
  payload.targets[0].effect = 'pulse';
  assertRejectedRetrigger(parse(runtime, payload), 'invalid_retrigger_effect');

  payload.targets[0].effect = 'hold';
  payload.targets[0].durationMs = 149;
  payload.targets[0].retrigger = retrigger({ minRampUpMs: 30, minRampDownMs: 20 });
  assertRejectedRetrigger(parse(runtime, payload), 'invalid_retrigger_timing');

  var baseline = readFixture('baseline.json');
  baseline.targets[0].retrigger = retrigger();
  assertRejectedRetrigger(parse(runtime, baseline), 'invalid_retrigger');

  payload = validPlay();
  payload.targets.push(copy(payload.targets[0]));
  payload.targets[1].retrigger = retrigger();
  delete payload.targets[1].retrigger.quietResetMs;
  result = parse(runtime, payload);
  assertRejectedRetrigger(result, 'invalid_retrigger');
});

test('normalizes retrigger to null for baseline stop selector and test targets', function () {
  var runtime = loadRuntime();
  var baseline = readFixture('baseline.json');
  var stop = {
    protocolVersion: 1,
    command: 'stop',
    source: 'fixture',
    targets: [copy(validPlay().targets[0])]
  };
  var preview = {
    protocolVersion: 1,
    command: 'test',
    source: 'fixture',
    targets: [copy(validPlay().targets[0])]
  };

  [baseline, stop, preview].forEach(function (payload) {
    var result = parse(runtime, payload);
    assert.equal(result.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result.message.targets[0], 'retrigger'), true);
    assert.equal(result.message.targets[0].retrigger, null);
  });
});

test('rejects supplied retrigger profiles for stop selectors and test targets', function () {
  var runtime = loadRuntime();
  var stop = {
    protocolVersion: 1,
    command: 'stop',
    source: 'fixture',
    targets: [copy(validPlay().targets[0])]
  };
  var preview = {
    protocolVersion: 1,
    command: 'test',
    source: 'fixture',
    targets: [copy(validPlay().targets[0])]
  };

  stop.targets[0].retrigger = retrigger();
  preview.targets[0].retrigger = retrigger();
  assertRejectedRetrigger(parse(runtime, stop), 'invalid_retrigger');
  assertRejectedRetrigger(parse(runtime, preview), 'invalid_retrigger');
});

test('preserves optional actuator presence separately from normalized defaults', function () {
  var runtime = loadRuntime();
  var payload = validPlay();
  var result;

  delete payload.targets[0].intensity;
  payload.targets[0].rotateSpeed = 60;
  payload.targets[0].rotateDirection = 'clockwise';
  result = parse(runtime, payload);

  assert.equal(result.ok, true);
  assert.equal(result.message.targets[0].intensity, 0);
  assert.equal(result.message.targets[0].hasIntensity, false);
  assert.equal(result.message.targets[0].rotateSpeed, 60);
  assert.equal(result.message.targets[0].hasRotateSpeed, true);
});

test('validates and copies a complete sixteen-slot configuration', function () {
  var runtime = loadRuntime();
  var config = validConfig();
  var result = runtime.XTHB.validateConfig(config);

  assert.equal(result.ok, true);
  assert.notEqual(result.config, config);
  assert.notEqual(result.config.slots, config.slots);
  config.slots[0].enabled = false;
  assert.equal(result.config.slots[0].enabled, true);
});

test('rejects malformed configurations before any message parsing', function () {
  var runtime = loadRuntime();
  var cases = [
    {
      name: 'slot count other than sixteen',
      mutate: function (config) { config.slots.pop(); }
    },
    {
      name: 'duplicate slot ids',
      mutate: function (config) { config.slots[15].id = 1; }
    },
    {
      name: 'unsupported slot type',
      mutate: function (config) { config.slots[0].type = 'pattern'; }
    },
    {
      name: 'non boolean frequency flag',
      mutate: function (config) { config.slots[0].frequencyEnabled = 'false'; }
    },
    {
      name: 'unknown routed leaf part',
      mutate: function (config) { config.slots[0].routes.ear = 1; }
    },
    {
      name: 'route weight outside the allowed range',
      mutate: function (config) { config.slots[0].routes.vagina = 1.1; }
    },
    {
      name: 'group weight outside the allowed range',
      mutate: function (config) { config.groups.genitals.vagina = -0.1; }
    },
    {
      name: 'unknown group key',
      mutate: function (config) { config.groups.unknown = {}; }
    },
    {
      name: 'non finite global multiplier',
      mutate: function (config) { config.globalMultiplier = 'Infinity'; }
    },
    {
      name: 'negative global multiplier',
      mutate: function (config) { config.globalMultiplier = -1; }
    },
    {
      name: 'unsupported log level',
      mutate: function (config) { config.logLevel = 'verbose'; }
    }
  ];

  cases.forEach(function (item) {
    var config = validConfig();
    item.mutate(config);
    assert.equal(runtime.XTHB.validateConfig(config).ok, false, item.name);
  });
});

test('rejects invalid protocol envelopes and target limits', function () {
  var runtime = loadRuntime();
  var invalidJson = runtime.XTHB.parseMessage('{', validConfig());
  var wrongVersion = validPlay();
  var unsupportedCommand = validPlay();
  var tooManyTargets = validPlay();
  var tooManyStates = validPlay();

  wrongVersion.protocolVersion = 2;
  unsupportedCommand.command = 'vibrate';
  tooManyTargets.targets = Array(33).fill(copy(validPlay().targets[0]));
  tooManyStates.states = Array(33).fill('state');

  assert.equal(runtime.XTHB.parseMessage('x'.repeat(32769), validConfig()).code, 'payload_too_large');
  assert.equal(invalidJson.code, 'invalid_json');
  assert.equal(parse(runtime, wrongVersion).code, 'unsupported_protocol_version');
  assert.equal(parse(runtime, unsupportedCommand).code, 'unsupported_command');
  assert.equal(parse(runtime, tooManyTargets).code, 'too_many_targets');
  assert.equal(parse(runtime, tooManyStates).code, 'too_many_states');
});

test('bounds stored identifiers and labels without weakening emergency stop all', function () {
  var runtime = loadRuntime();
  var source128 = new Array(129).join('s');
  var source129 = source128 + 's';
  var event128 = new Array(129).join('e');
  var event129 = event128 + 'e';
  var label129 = new Array(130).join('l');
  var play = validPlay();
  var result;

  play.source = source128;
  play.eventId = event128;
  assert.equal(parse(runtime, play).ok, true);

  play.source = source129;
  assert.equal(parse(runtime, play).code, 'identifier_too_long');
  play.source = source128;
  play.eventId = event129;
  assert.equal(parse(runtime, play).code, 'identifier_too_long');
  play.eventId = event128;
  play.states = [label129];
  assert.equal(parse(runtime, play).code, 'state_label_too_long');

  result = runtime.XTHB.parseMessage(JSON.stringify({
    protocolVersion: 1,
    command: 'stop_all',
    source: source129,
    states: [label129]
  }), null);
  assert.equal(result.ok, true);
});

test('rejects invalid target fields and requires explicit rotation direction', function () {
  var runtime = loadRuntime();
  var unknownPart = validPlay();
  var nonFinite = validPlay();
  var nullRotateSpeed = validPlay();
  var rotation = validPlay();

  unknownPart.targets[0].part = 'ear';
  nonFinite.targets[0].intensity = 'NaN';
  nullRotateSpeed.targets[0].rotateSpeed = null;
  rotation.targets[0].rotateSpeed = 60;

  assert.equal(parse(runtime, unknownPart).code, 'unknown_part');
  assert.equal(parse(runtime, nonFinite).code, 'invalid_number');
  assert.equal(parse(runtime, nullRotateSpeed).code, 'invalid_number');
  assert.equal(parse(runtime, rotation).code, 'invalid_rotate_direction');
});

test('clamps numeric outputs and timing fields to protocol limits', function () {
  var runtime = loadRuntime();
  var payload = validPlay();
  var target = payload.targets[0];
  var result;

  target.intensity = 120;
  target.frequency = -10;
  target.rotateSpeed = 110;
  target.rotateDirection = 'clockwise';
  target.durationMs = 700000;
  target.rampUpMs = -20;
  target.rampDownMs = 700000;
  target.pulseOnMs = 700000;
  target.pulseOffMs = -10;
  result = parse(runtime, payload);

  assert.equal(result.ok, true);
  assert.equal(result.message.targets[0].intensity, 100);
  assert.equal(result.message.targets[0].frequency, 0);
  assert.equal(result.message.targets[0].rotateSpeed, 100);
  assert.equal(result.message.targets[0].durationMs, 600000);
  assert.equal(result.message.targets[0].rampUpMs, 0);
  assert.equal(result.message.targets[0].rampDownMs, 600000);
  assert.equal(result.message.targets[0].pulseOnMs, 600000);
  assert.equal(result.message.targets[0].pulseOffMs, 0);
});

test('applies command-specific requirements without accepting ambiguous stops', function () {
  var runtime = loadRuntime();
  var missingSource = validPlay();
  var missingEventId = validPlay();
  var missingSequence = validPlay();
  var missingDuration = validPlay();
  var noTargets = validPlay();
  var baseline = readFixture('baseline.json');
  var stop = {
    protocolVersion: 1,
    command: 'stop',
    source: 'fixture'
  };

  delete missingSource.source;
  missingEventId.eventId = '';
  missingSequence.sequence = 'NaN';
  delete missingDuration.targets[0].durationMs;
  noTargets.targets = [];
  baseline.sequence = 'NaN';

  assert.equal(parse(runtime, missingSource).code, 'missing_source');
  assert.equal(parse(runtime, missingEventId).code, 'missing_event_id');
  assert.equal(parse(runtime, missingSequence).code, 'invalid_sequence');
  assert.equal(parse(runtime, missingDuration).code, 'invalid_duration');
  assert.equal(parse(runtime, noTargets).code, 'missing_targets');
  assert.equal(parse(runtime, baseline).code, 'invalid_sequence');
  assert.equal(parse(runtime, stop).code, 'missing_stop_selector');
});

test('accepts a version-valid stop all without validating its targets', function () {
  var runtime = loadRuntime();
  var result = parse(runtime, {
    protocolVersion: 1,
    command: 'stop_all',
    source: 'fixture',
    targets: [{ part: 'unknown', intensity: 'NaN' }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.message.command, 'stop_all');
  assert.deepEqual(JSON.parse(JSON.stringify(result.message.targets)), []);
});
