'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var path = require('node:path');
var test = require('node:test');
var loadRuntime = require('./harness').loadRuntime;

var repositoryRoot = path.resolve(__dirname, '..', '..');
var buildScript = path.join(repositoryRoot, 'scripts', 'Build-XToysRuntime.ps1');
var separator = '\u001f';

function buildAndCreateEngine() {
  childProcess.execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  return loadRuntime().XTHB.createStateEngine();
}

function target(part, durationMs) {
  return {
    part: part,
    effect: 'hold',
    intensity: 40,
    frequency: 0,
    rotateSpeed: null,
    rotateDirection: null,
    durationMs: durationMs === undefined ? 1000 : durationMs,
    rampUpMs: 0,
    rampDownMs: 0,
    pulseOnMs: 0,
    pulseOffMs: 0,
    priority: 0,
    blend: 'replace',
    baselineBlend: 'boost'
  };
}

function message(command, values) {
  var data = values || {};
  return {
    command: command,
    source: data.source || 'bridge-a',
    eventId: data.eventId === undefined ? null : data.eventId,
    sequence: data.sequence === undefined ? null : data.sequence,
    states: data.states || [],
    targets: data.targets || []
  };
}

function eventKey(source, eventId) {
  return source + separator + eventId;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('play records an active event target with acceptance and expiry times', function () {
  var engine = buildAndCreateEngine();
  var result = engine.applyMessage(message('play', {
    eventId: 'attack',
    sequence: 1,
    targets: [target('vagina', 250)]
  }), 1000, false);
  var entry = engine.snapshot().events[eventKey('bridge-a', 'attack')][0];

  assert.equal(result.changed, true);
  assert.deepEqual(plain(result.changedParts), ['vagina']);
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), {
    source: 'bridge-a',
    eventId: 'attack',
    sequence: 1,
    acceptedAt: 1000,
    expiresAt: 1250,
    generation: 1,
    target: target('vagina', 250)
  });
});

test('a newer update replaces an event target snapshot and advances generation', function () {
  var engine = buildAndCreateEngine();
  var updateResult;
  var entries;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [target('vagina')]
  }), 10, false);
  updateResult = engine.applyMessage(message('update', {
    eventId: 'attack', sequence: 2, targets: [target('clitoris', 300)]
  }), 20, false);
  entries = engine.snapshot().events[eventKey('bridge-a', 'attack')];

  assert.equal(updateResult.changed, true);
  assert.deepEqual(plain(updateResult.changedParts), ['vagina', 'clitoris']);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].target.part, 'clitoris');
  assert.equal(entries[0].acceptedAt, 20);
  assert.equal(entries[0].expiresAt, 320);
  assert.equal(entries[0].generation, 2);
});

test('duplicate and older event updates leave the accepted event unchanged', function () {
  var engine = buildAndCreateEngine();
  var duplicate;
  var older;
  var entry;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 3, targets: [target('vagina')]
  }), 10, false);
  duplicate = engine.applyMessage(message('update', {
    eventId: 'attack', sequence: 3, targets: [target('clitoris')]
  }), 20, false);
  older = engine.applyMessage(message('update', {
    eventId: 'attack', sequence: 2, targets: [target('anus')]
  }), 30, false);
  entry = engine.snapshot().events[eventKey('bridge-a', 'attack')][0];

  assert.equal(duplicate.changed, false);
  assert.equal(older.changed, false);
  assert.equal(entry.sequence, 3);
  assert.equal(entry.target.part, 'vagina');
  assert.equal(entry.generation, 1);
});

test('stop by event id removes only the matching source-scoped event', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    source: 'bridge-a', eventId: 'shared', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  engine.applyMessage(message('play', {
    source: 'bridge-b', eventId: 'shared', sequence: 1, targets: [target('anus')]
  }), 0, false);
  engine.applyMessage(message('stop', { source: 'bridge-a', eventId: 'shared' }), 10, false);
  snapshot = engine.snapshot();

  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.events, eventKey('bridge-a', 'shared')), false);
  assert.equal(snapshot.events[eventKey('bridge-b', 'shared')][0].target.part, 'anus');
});

test('stop by event id and targets removes only those event parts', function () {
  var engine = buildAndCreateEngine();
  var entries;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [target('vagina'), target('clitoris')]
  }), 0, false);
  engine.applyMessage(message('stop', {
    eventId: 'attack', targets: [target('vagina', 0)]
  }), 10, false);
  entries = engine.snapshot().events[eventKey('bridge-a', 'attack')];

  assert.equal(entries.length, 1);
  assert.equal(entries[0].target.part, 'clitoris');
});

test('stop by targets removes matching parts from every event of that source', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'one', sequence: 1, targets: [target('vagina'), target('clitoris')]
  }), 0, false);
  engine.applyMessage(message('play', {
    eventId: 'two', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  engine.applyMessage(message('play', {
    source: 'bridge-b', eventId: 'one', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  engine.applyMessage(message('stop', { targets: [target('vagina', 0)] }), 10, false);
  snapshot = engine.snapshot();

  assert.equal(snapshot.events[eventKey('bridge-a', 'one')][0].target.part, 'clitoris');
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.events, eventKey('bridge-a', 'two')), false);
  assert.equal(snapshot.events[eventKey('bridge-b', 'one')][0].target.part, 'vagina');
});

test('set baseline replaces the complete source snapshot and empty targets clear it', function () {
  var engine = buildAndCreateEngine();
  var first;
  var replaced;

  engine.applyMessage(message('set_baseline', {
    sequence: 1, targets: [target('vagina', 0), target('clitoris', 0)]
  }), 0, false);
  first = engine.snapshot();
  engine.applyMessage(message('set_baseline', {
    sequence: 2, targets: [target('anus', 0)]
  }), 10, false);
  replaced = engine.snapshot();

  assert.deepEqual(Object.keys(first.baseline).sort(), [
    eventKey('bridge-a', 'clitoris'), eventKey('bridge-a', 'vagina')
  ]);
  assert.deepEqual(Object.keys(replaced.baseline), [eventKey('bridge-a', 'anus')]);
  assert.equal(replaced.baseline[eventKey('bridge-a', 'anus')].sequence, 2);
  assert.equal(replaced.baseline[eventKey('bridge-a', 'anus')].target.part, 'anus');

  engine.applyMessage(message('set_baseline', { sequence: 3, targets: [] }), 20, false);
  assert.deepEqual(Object.keys(engine.snapshot().baseline), []);
});

test('stop all clears both logical maps and advances the global generation', function () {
  var engine = buildAndCreateEngine();
  var result;
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  engine.applyMessage(message('set_baseline', {
    sequence: 1, targets: [target('clitoris', 0)]
  }), 0, false);
  result = engine.applyMessage(message('stop_all'), 10, false);
  snapshot = engine.snapshot();

  assert.equal(result.changed, true);
  assert.deepEqual(plain(snapshot.baseline), {});
  assert.deepEqual(plain(snapshot.events), {});
  assert.equal(snapshot.generation, 3);
});

test('test returns a state preview without replacing live state', function () {
  var engine = buildAndCreateEngine();
  var before;
  var result;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  before = engine.snapshot();
  result = engine.applyMessage(message('test', { targets: [target('clitoris')] }), 10, false);

  assert.equal(result.changed, false);
  assert.deepEqual(plain(result.changedParts), ['clitoris']);
  assert.deepEqual(plain(result.snapshot), plain(before));
  assert.deepEqual(plain(engine.snapshot()), plain(before));
});

test('dry runs return a proposed snapshot and do not mutate live state', function () {
  var engine = buildAndCreateEngine();
  var result;

  result = engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [target('vagina')]
  }), 0, true);

  assert.equal(result.changed, true);
  assert.equal(result.snapshot.events[eventKey('bridge-a', 'attack')][0].generation, 1);
  assert.deepEqual(plain(engine.snapshot().events), {});
  assert.equal(engine.snapshot().generation, 0);
});

test('expire removes only events at or beyond their expiry boundary', function () {
  var engine = buildAndCreateEngine();
  var result;
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'short', sequence: 1, targets: [target('vagina', 100)]
  }), 0, false);
  engine.applyMessage(message('play', {
    eventId: 'long', sequence: 1, targets: [target('clitoris', 200)]
  }), 0, false);
  result = engine.expire(100);
  snapshot = engine.snapshot();

  assert.equal(result.changed, true);
  assert.deepEqual(plain(result.changedParts), ['vagina']);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.events, eventKey('bridge-a', 'short')), false);
  assert.equal(snapshot.events[eventKey('bridge-a', 'long')][0].target.part, 'clitoris');
  assert.equal(engine.expire(200).changed, true);
  assert.deepEqual(plain(engine.snapshot().events), {});
});

test('snapshots are deep copies that cannot mutate the engine', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  snapshot = engine.snapshot();
  snapshot.events[eventKey('bridge-a', 'attack')][0].target.intensity = 99;

  assert.equal(engine.snapshot().events[eventKey('bridge-a', 'attack')][0].target.intensity, 40);
});
