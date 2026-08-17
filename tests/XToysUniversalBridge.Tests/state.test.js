'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var path = require('node:path');
var test = require('node:test');
var loadRuntime = require('./harness').loadRuntime;

var repositoryRoot = path.resolve(__dirname, '..', '..');
var buildScript = path.join(repositoryRoot, 'scripts', 'Build-XToysRuntime.ps1');

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
    baselineBlend: 'boost',
    retrigger: null
  };
}

function adaptiveTarget(part, durationMs) {
  var value = target(part, durationMs);
  value.retrigger = {
    mode: 'adaptive',
    minDropPercent: 25,
    maxDropPercent: 100,
    minRampUpMs: 0,
    minRampDownMs: 0,
    textureThresholdMs: 150,
    quietResetMs: 600
  };
  return value;
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
  return JSON.stringify([source, eventId]);
}

function partKey(source, part) {
  return JSON.stringify([source, part]);
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
    target: target('vagina', 250),
    cadence: null
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

test('accepted adaptive updates advance cadence while duplicate and older sequences do not', function () {
  var engine = buildAndCreateEngine();
  var cadence;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 3, targets: [adaptiveTarget('clitoris')]
  }), 1000, false);
  engine.applyMessage(message('update', {
    eventId: 'attack', sequence: 3, targets: [adaptiveTarget('clitoris')]
  }), 1100, false);
  engine.applyMessage(message('update', {
    eventId: 'attack', sequence: 2, targets: [adaptiveTarget('clitoris')]
  }), 1200, false);
  engine.applyMessage(message('update', {
    eventId: 'attack', sequence: 4, targets: [adaptiveTarget('clitoris')]
  }), 1300, false);
  cadence = engine.snapshot().events[eventKey('bridge-a', 'attack')][0].cadence;

  assert.equal(cadence.averageInterval, 300);
  assert.equal(cadence.lastAttackAt, 1300);
  assert.equal(cadence.lastGeneration, 2);
  assert.deepEqual(plain(cadence), plain(
    engine.hapticSnapshot().cadenceRecords[partKey('bridge-a', 'clitoris')]
  ));
});

test('adaptive play removes older ordinary and adaptive same-source same-part entries only', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'old', sequence: 1,
    targets: [adaptiveTarget('clitoris'), target('vagina')]
  }), 1000, false);
  engine.applyMessage(message('play', {
    eventId: 'ordinary', sequence: 1,
    targets: [target('clitoris'), target('anus')]
  }), 1100, false);
  engine.applyMessage(message('play', {
    eventId: 'new', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }), 1300, false);
  snapshot = engine.snapshot();

  assert.deepEqual(plain(snapshot.events[eventKey('bridge-a', 'old')].map(function (entry) {
    return entry.target.part;
  })), ['vagina']);
  assert.deepEqual(plain(snapshot.events[eventKey('bridge-a', 'ordinary')].map(function (entry) {
    return entry.target.part;
  })), ['anus']);
  assert.equal(snapshot.events[eventKey('bridge-a', 'new')][0].cadence.averageInterval, 300);
});

test('adaptive ownership is source scoped and virtual groups remain exact identities', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    source: 'bridge-a', eventId: 'leaf-a', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }), 0, false);
  engine.applyMessage(message('play', {
    source: 'bridge-b', eventId: 'leaf-b', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }), 10, false);
  engine.applyMessage(message('play', {
    source: 'bridge-a', eventId: 'group', sequence: 1,
    targets: [adaptiveTarget('genitals')]
  }), 20, false);
  engine.applyMessage(message('play', {
    source: 'bridge-a', eventId: 'replacement', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }), 30, false);
  snapshot = engine.snapshot();

  assert.equal(snapshot.events[eventKey('bridge-b', 'leaf-b')].length, 1);
  assert.equal(snapshot.events[eventKey('bridge-a', 'group')].length, 1);
  assert.equal(snapshot.events[eventKey('bridge-a', 'replacement')].length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.events, eventKey('bridge-a', 'leaf-a')), false);
});

test('cadence records are bounded cleaned after quiet and cleared by stop all', function () {
  var engine = buildAndCreateEngine();
  var index;

  for (index = 0; index < 128; index += 1) {
    engine.applyMessage(message('play', {
      source: 'source-' + index,
      eventId: 'event-' + index,
      sequence: 1,
      targets: [
        adaptiveTarget('clitoris', 100),
        adaptiveTarget('vagina', 100)
      ]
    }), 0, false);
  }
  assert.equal(Object.keys(engine.hapticSnapshot().cadenceRecords).length, 256);
  engine.expire(100, false);
  engine.applyMessage(message('play', {
    source: 'fresh', eventId: 'fresh', sequence: 1,
    targets: [adaptiveTarget('anus', 100)]
  }), 1000, false);
  assert.equal(Object.keys(engine.hapticSnapshot().cadenceRecords).length, 1);
  engine.clearAll(false);
  assert.deepEqual(plain(engine.hapticSnapshot()), {
    cadenceRecords: {}, partOwners: {}
  });
});

test('quiet cleanup drops cadence even while the owning event duration remains active', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'long', sequence: 1,
    targets: [adaptiveTarget('clitoris', 1000)]
  }), 0, false);
  assert.equal(engine.expire(600, false).changed, false);
  snapshot = engine.hapticSnapshot();

  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.cadenceRecords, partKey('bridge-a', 'clitoris')), false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.partOwners, partKey('bridge-a', 'clitoris')), true);
});

test('expired ordinary attacks cannot grow one part membership without bound', function () {
  var engine = buildAndCreateEngine();
  var owner;
  var index;

  for (index = 0; index < 300; index += 1) {
    assert.equal(engine.applyMessage(message('play', {
      eventId: 'event-' + index,
      sequence: 1,
      targets: [target('clitoris', 1)]
    }), index * 2, false).rejected, null);
  }
  owner = engine.hapticSnapshot().partOwners[partKey('bridge-a', 'clitoris')];

  assert.equal(Object.keys(owner.eventKeys).length, 1);
  assert.equal(Object.keys(engine.snapshot().events).length, 1);
});

test('expired ordinary attacks cannot grow the owner map beyond target capacity', function () {
  var engine = buildAndCreateEngine();
  var index;

  for (index = 0; index < 300; index += 1) {
    assert.equal(engine.applyMessage(message('play', {
      source: 'source-' + index,
      eventId: 'event-' + index,
      sequence: 1,
      targets: [target('part-' + index, 1)]
    }), index * 2, false).rejected, null);
  }

  assert.equal(Object.keys(engine.hapticSnapshot().partOwners).length, 1);
  assert.equal(Object.keys(engine.snapshot().events).length, 1);
});

test('duplicate and older sequence early returns do not publish expired cleanup', function () {
  var engine = buildAndCreateEngine();
  var beforeLogical;
  var beforeHaptic;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 3, targets: [target('clitoris', 1)]
  }), 0, false);
  beforeLogical = engine.snapshot();
  beforeHaptic = engine.hapticSnapshot();

  assert.equal(engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 3, targets: [target('vagina', 100)]
  }), 2, false).changed, false);
  assert.equal(engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 2, targets: [target('anus', 100)]
  }), 2, false).changed, false);
  assert.deepEqual(plain(engine.snapshot()), plain(beforeLogical));
  assert.deepEqual(plain(engine.hapticSnapshot()), plain(beforeHaptic));
});

test('capacity rejection does not publish its expired cleanup candidate', function () {
  var engine = buildAndCreateEngine();
  var wideTargets = [];
  var rejected;
  var beforeLogical;
  var beforeHaptic;
  var index;

  engine.applyMessage(message('play', {
    eventId: 'expired', sequence: 1, targets: [target('clitoris', 1)]
  }), 0, false);
  for (index = 0; index < 127; index += 1) {
    engine.applyMessage(message('play', {
      eventId: 'active-' + index,
      sequence: 1,
      targets: [target('vagina', 1000), target('anus', 1000)]
    }), 0, false);
  }
  wideTargets.push(target('vulva', 1000));
  wideTargets.push(target('urethra', 1000));
  wideTargets.push(target('butt', 1000));
  beforeLogical = engine.snapshot();
  beforeHaptic = engine.hapticSnapshot();
  rejected = engine.applyMessage(message('play', {
    eventId: 'rejected', sequence: 1, targets: wideTargets
  }), 2, false);

  assert.equal(rejected.rejected.code, 'state_capacity_exceeded');
  assert.deepEqual(plain(engine.snapshot()), plain(beforeLogical));
  assert.deepEqual(plain(engine.hapticSnapshot()), plain(beforeHaptic));
});

test('accepted cleanup and replacement retain the new sequence fence', function () {
  var engine = buildAndCreateEngine();
  var stale;
  var entry;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 5, targets: [target('clitoris', 1)]
  }), 0, false);
  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 6, targets: [target('vagina', 100)]
  }), 2, false);
  stale = engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 5, targets: [target('anus', 100)]
  }), 3, false);
  entry = engine.snapshot().events[eventKey('bridge-a', 'attack')][0];

  assert.equal(stale.changed, false);
  assert.equal(entry.sequence, 6);
  assert.equal(entry.target.part, 'vagina');
});

test('cadence capacity evicts the oldest inactive record and rejects atomically when none are inactive', function () {
  var engine = buildAndCreateEngine();
  var beforeLogical;
  var before;
  var rejected;
  var snapshot;
  var index;

  for (index = 0; index < 128; index += 1) {
    engine.applyMessage(message('play', {
      source: 'source-' + index,
      eventId: 'event-' + index,
      sequence: 1,
      targets: [
        adaptiveTarget('clitoris', 100),
        adaptiveTarget('vagina', 100)
      ]
    }), 0, false);
  }
  beforeLogical = engine.snapshot();
  before = engine.hapticSnapshot();
  rejected = engine.applyMessage(message('play', {
    source: 'full', eventId: 'full', sequence: 1,
    targets: [adaptiveTarget('anus', 100)]
  }), 1, false);
  assert.equal(rejected.rejected.code, 'state_capacity_exceeded');
  assert.deepEqual(plain(engine.snapshot()), plain(beforeLogical));
  assert.deepEqual(plain(engine.hapticSnapshot()), plain(before));

  engine.expire(100, false);
  engine.applyMessage(message('play', {
    source: 'fresh', eventId: 'fresh', sequence: 1,
    targets: [adaptiveTarget('anus', 100)]
  }), 101, false);
  snapshot = engine.hapticSnapshot();
  assert.equal(Object.keys(snapshot.cadenceRecords).length, 256);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.cadenceRecords, partKey('fresh', 'anus')), true);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.cadenceRecords, partKey('source-0', 'clitoris')), false);
});

test('stop and expiry clean generation-owned memberships while cadence survives until quiet', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'stopped', sequence: 1, targets: [adaptiveTarget('clitoris', 100)]
  }), 0, false);
  snapshot = engine.hapticSnapshot();
  assert.equal(snapshot.partOwners[partKey('bridge-a', 'clitoris')]
    .eventKeys[eventKey('bridge-a', 'stopped')], 1);
  assert.equal(snapshot.partOwners[partKey('bridge-a', 'clitoris')]
    .adaptiveGeneration, 1);
  engine.applyMessage(message('stop', {
    eventId: 'stopped', targets: [target('clitoris', 0)]
  }), 10, false);
  snapshot = engine.hapticSnapshot();
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.partOwners, partKey('bridge-a', 'clitoris')), false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.cadenceRecords, partKey('bridge-a', 'clitoris')), true);

  engine.applyMessage(message('play', {
    eventId: 'expiring', sequence: 1, targets: [adaptiveTarget('clitoris', 100)]
  }), 100, false);
  assert.equal(engine.snapshot().events[eventKey('bridge-a', 'expiring')][0]
    .cadence.averageInterval, 100);
  engine.expire(200, false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    engine.hapticSnapshot().partOwners, partKey('bridge-a', 'clitoris')), false);
});

test('haptic snapshots are defensive copies', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [adaptiveTarget('clitoris')]
  }), 0, false);
  snapshot = engine.hapticSnapshot();
  snapshot.cadenceRecords[partKey('bridge-a', 'clitoris')].mode = 'mutated';
  snapshot.partOwners[partKey('bridge-a', 'clitoris')].adaptiveEventKey = 'mutated';

  assert.equal(engine.hapticSnapshot()
    .cadenceRecords[partKey('bridge-a', 'clitoris')].mode, 'single');
  assert.equal(engine.hapticSnapshot()
    .partOwners[partKey('bridge-a', 'clitoris')].adaptiveEventKey,
  eventKey('bridge-a', 'attack'));
});

test('accepted adaptive targets own their nested retrigger profile', function () {
  var engine = buildAndCreateEngine();
  var attack = message('play', {
    eventId: 'attack', sequence: 1, targets: [adaptiveTarget('clitoris')]
  });

  engine.applyMessage(attack, 0, false);
  attack.targets[0].retrigger.quietResetMs = 1;

  assert.equal(engine.snapshot().events[eventKey('bridge-a', 'attack')][0]
    .target.retrigger.quietResetMs, 600);
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

test('composite event identities cannot collide or stop across sources', function () {
  var engine = buildAndCreateEngine();
  var snapshot;
  var entries;

  engine.applyMessage(message('play', {
    source: 'a', eventId: 'b\u001fc', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  engine.applyMessage(message('play', {
    source: 'a\u001fb', eventId: 'c', sequence: 1, targets: [target('anus')]
  }), 0, false);
  snapshot = engine.snapshot();
  entries = Object.keys(snapshot.events).map(function (key) {
    return snapshot.events[key][0];
  });

  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(function (entry) {
    return [entry.source, entry.eventId, entry.target.part];
  }).sort(), [
    ['a', 'b\u001fc', 'vagina'],
    ['a\u001fb', 'c', 'anus']
  ].sort());

  engine.applyMessage(message('stop', { source: 'a', eventId: 'b\u001fc' }), 10, false);
  snapshot = engine.snapshot();
  entries = Object.keys(snapshot.events).map(function (key) {
    return snapshot.events[key][0];
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, 'a\u001fb');
  assert.equal(entries[0].eventId, 'c');
  assert.equal(entries[0].target.part, 'anus');
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

test('rejects a stale baseline sequence when the source is __proto__', function () {
  var engine = buildAndCreateEngine();
  var snapshot;

  engine.applyMessage(message('set_baseline', {
    source: '__proto__', sequence: 2, targets: [target('vagina', 0)]
  }), 0, false);
  engine.applyMessage(message('set_baseline', {
    source: '__proto__', sequence: 1, targets: [target('anus', 0)]
  }), 10, false);
  snapshot = plain(engine.snapshot());

  assert.deepEqual(Object.keys(snapshot.baseline), [eventKey('__proto__', 'vagina')]);
  assert.equal(snapshot.baseline[eventKey('__proto__', 'vagina')].sequence, 2);
  assert.equal(snapshot.baseline[eventKey('__proto__', 'vagina')].target.part, 'vagina');
});

test('adaptive __proto__ identities own and clean event cadence and part maps', function () {
  var engine = buildAndCreateEngine();
  var adaptiveEventKey = eventKey('__proto__', '__proto__');
  var adaptivePartKey = partKey('__proto__', 'clitoris');
  var snapshot;

  engine.applyMessage(message('play', {
    source: '__proto__', eventId: '__proto__', sequence: 1,
    targets: [adaptiveTarget('clitoris', 100)]
  }), 0, false);
  snapshot = engine.hapticSnapshot();
  assert.equal(Object.prototype.hasOwnProperty.call(
    engine.snapshot().events, adaptiveEventKey), true);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.cadenceRecords, adaptivePartKey), true);
  assert.equal(snapshot.partOwners[adaptivePartKey].eventKeys[adaptiveEventKey], 1);

  engine.applyMessage(message('stop', {
    source: '__proto__', eventId: '__proto__'
  }), 50, false);
  snapshot = engine.hapticSnapshot();
  assert.equal(Object.prototype.hasOwnProperty.call(
    engine.snapshot().events, adaptiveEventKey), false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.partOwners, adaptivePartKey), false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    snapshot.cadenceRecords, adaptivePartKey), true);

  engine.expire(600, false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    engine.hapticSnapshot().cadenceRecords, adaptivePartKey), false);
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

test('test adds requested targets to an ephemeral snapshot without replacing live state', function () {
  var engine = buildAndCreateEngine();
  var before;
  var result;
  var previewEntries;

  engine.applyMessage(message('play', {
    eventId: 'attack', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  before = engine.snapshot();
  result = engine.applyMessage(message('test', { targets: [target('clitoris')] }), 10, false);
  previewEntries = Object.keys(result.snapshot.events).map(function (key) {
    return result.snapshot.events[key];
  });

  assert.equal(result.changed, false);
  assert.deepEqual(plain(result.changedParts), ['clitoris']);
  assert.equal(previewEntries.length, 2);
  assert.equal(previewEntries.some(function (entries) {
    return entries[0].source === 'bridge-a' && entries[0].eventId === null &&
      entries[0].target.part === 'clitoris' && entries[0].acceptedAt === 10;
  }), true);
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

test('bounds active event identities atomically and reuses capacity after stop or expiry', function () {
  var engine = buildAndCreateEngine();
  var before;
  var rejected;
  var replacement;
  var index;

  for (index = 0; index < 128; index += 1) {
    assert.equal(engine.applyMessage(message('play', {
      eventId: 'event-' + index,
      sequence: 1,
      targets: [target('vagina', 1000)]
    }), 0, false).rejected, null);
  }
  before = engine.snapshot();
  rejected = engine.applyMessage(message('play', {
    eventId: 'event-128',
    sequence: 1,
    targets: [target('vagina', 1000)]
  }), 10, false);

  assert.equal(rejected.changed, false);
  assert.equal(rejected.rejected.code, 'state_capacity_exceeded');
  assert.deepEqual(plain(rejected.changedParts), []);
  assert.deepEqual(plain(engine.snapshot()), plain(before));

  assert.equal(engine.applyMessage(message('stop', {
    eventId: 'event-0'
  }), 10, false).changed, true);
  replacement = engine.applyMessage(message('play', {
    eventId: 'event-128',
    sequence: 1,
    targets: [target('vagina', 1000)]
  }), 10, false);
  assert.equal(replacement.rejected, null);
  assert.equal(Object.keys(engine.snapshot().events).length, 128);

  engine = buildAndCreateEngine();
  for (index = 0; index < 128; index += 1) {
    engine.applyMessage(message('play', {
      eventId: 'expiring-' + index,
      sequence: 1,
      targets: [target('vagina', 100)]
    }), 0, false);
  }
  replacement = engine.applyMessage(message('play', {
    eventId: 'after-expiry',
    sequence: 1,
    targets: [target('vagina', 1000)]
  }), 100, false);
  assert.equal(replacement.rejected, null);
});

test('bounds total active event targets and leaves state unchanged on rejection', function () {
  var engine = buildAndCreateEngine();
  var targets = [];
  var before;
  var rejected;
  var eventIndex;
  var targetIndex;

  for (targetIndex = 0; targetIndex < 32; targetIndex += 1) {
    targets.push(target('vagina', 1000));
  }
  for (eventIndex = 0; eventIndex < 8; eventIndex += 1) {
    assert.equal(engine.applyMessage(message('play', {
      eventId: 'wide-' + eventIndex,
      sequence: 1,
      targets: targets
    }), 0, false).rejected, null);
  }
  before = engine.snapshot();
  rejected = engine.applyMessage(message('play', {
    eventId: 'one-too-many',
    sequence: 1,
    targets: [target('vagina', 1000)]
  }), 1, false);

  assert.equal(rejected.changed, false);
  assert.equal(rejected.rejected.code, 'state_capacity_exceeded');
  assert.deepEqual(plain(engine.snapshot()), plain(before));
});

test('bounds baseline sources while allowing an existing source to replace or clear', function () {
  var engine = buildAndCreateEngine();
  var before;
  var rejected;
  var index;

  for (index = 0; index < 64; index += 1) {
    assert.equal(engine.applyMessage(message('set_baseline', {
      source: 'baseline-' + index,
      sequence: 1,
      targets: []
    }), 0, false).rejected, null);
  }
  before = engine.snapshot();
  rejected = engine.applyMessage(message('set_baseline', {
    source: 'baseline-64',
    sequence: 1,
    targets: []
  }), 0, false);
  assert.equal(rejected.rejected.code, 'state_capacity_exceeded');
  assert.deepEqual(plain(engine.snapshot()), plain(before));

  assert.equal(engine.applyMessage(message('set_baseline', {
    source: 'baseline-0',
    sequence: 2,
    targets: [target('vagina', 0)]
  }), 0, false).rejected, null);
  assert.equal(engine.applyMessage(message('set_baseline', {
    source: 'baseline-0',
    sequence: 3,
    targets: []
  }), 0, false).rejected, null);
});

test('bounds total baseline targets and rejects replacement atomically', function () {
  var engine = buildAndCreateEngine();
  var parts = ['vagina', 'clitoris', 'vulva', 'anus'];
  var before;
  var rejected;
  var sourceIndex;

  for (sourceIndex = 0; sourceIndex < 64; sourceIndex += 1) {
    assert.equal(engine.applyMessage(message('set_baseline', {
      source: 'source-' + sourceIndex,
      sequence: 1,
      targets: parts.map(function (part) { return target(part, 0); })
    }), 0, false).rejected, null);
  }
  before = engine.snapshot();
  rejected = engine.applyMessage(message('set_baseline', {
    source: 'source-0',
    sequence: 2,
    targets: parts.concat(['urethra']).map(function (part) { return target(part, 0); })
  }), 0, false);

  assert.equal(rejected.changed, false);
  assert.equal(rejected.rejected.code, 'state_capacity_exceeded');
  assert.deepEqual(plain(engine.snapshot()), plain(before));
});

test('copy-on-write updates only the changed event path and owns accepted targets', function () {
  var engine = buildAndCreateEngine();
  var firstMessage = message('play', {
    eventId: 'first', sequence: 1, targets: [target('vagina')]
  });
  var firstKey = eventKey('bridge-a', 'first');
  var secondKey = eventKey('bridge-a', 'second');
  var before;
  var after;

  engine.applyMessage(firstMessage, 0, false);
  engine.applyMessage(message('play', {
    eventId: 'second', sequence: 1, targets: [target('clitoris')]
  }), 0, false);
  before = engine.readState();
  firstMessage.targets[0].intensity = 99;
  engine.applyMessage(message('update', {
    eventId: 'first', sequence: 2, targets: [target('anus')]
  }), 10, false);
  after = engine.readState();

  assert.notStrictEqual(after.events, before.events);
  assert.notStrictEqual(after.events[firstKey], before.events[firstKey]);
  assert.strictEqual(after.events[secondKey], before.events[secondKey]);
  assert.strictEqual(after.baseline, before.baseline);
  assert.equal(before.events[firstKey][0].sequence, 1);
  assert.equal(before.events[firstKey][0].target.intensity, 40);
  assert.equal(after.events[firstKey][0].sequence, 2);
  assert.equal(after.events[firstKey][0].target.part, 'anus');
});

test('expiry keeps the internal events map when no entry reaches its boundary', function () {
  var engine = buildAndCreateEngine();
  var events;

  engine.applyMessage(message('play', {
    eventId: 'long', sequence: 1, targets: [target('vagina', 1000)]
  }), 0, false);
  events = engine.readState().events;

  assert.equal(engine.expire(1, false).changed, false);
  assert.strictEqual(engine.readState().events, events);
  assert.equal(engine.expire(500, false).changed, false);
  assert.strictEqual(engine.readState().events, events);
  assert.equal(engine.expire(999, false).changed, false);
  assert.strictEqual(engine.readState().events, events);
});

test('live state operations omit snapshots while dry runs and previews retain them', function () {
  var engine = buildAndCreateEngine();
  var live = engine.applyMessage(message('play', {
    eventId: 'live', sequence: 1, targets: [target('vagina')]
  }), 0, false);
  var ignored = engine.applyMessage(message('update', {
    eventId: 'live', sequence: 1, targets: [target('anus')]
  }), 1, false);
  var dryRun = engine.applyMessage(message('play', {
    eventId: 'dry', sequence: 1, targets: [target('anus')]
  }), 1, true);
  var preview = engine.applyMessage(message('test', {
    targets: [target('clitoris')]
  }), 1, false);

  assert.equal(Object.prototype.hasOwnProperty.call(live, 'snapshot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(ignored, 'snapshot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(engine.expire(1, false), 'snapshot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dryRun, 'snapshot'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(preview, 'snapshot'), true);
});
