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

function parse(runtime, payload, config) {
  return runtime.XTHB.parseMessage(JSON.stringify(payload), config || validConfig());
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
    baselineBlend: 'boost'
  });
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
