# Adaptive Haptic Retrigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, cadence-adaptive retrigger envelopes that make explicitly marked attacks perceptible while preserving ordinary protocol-v1 behavior and XToys scheduler performance.

**Architecture:** Extend normalized targets with an optional immutable retrigger profile, keep cadence and same-part ownership in the logical state engine, isolate deterministic cadence/envelope math in a new ES5 module, expose adaptive foreground metadata from routing, and let the runtime execute at most one generation-safe physical phase per slot per scheduler pass. Cadence is capped at 256 scalar records and physical envelope state is fixed at sixteen slots.

**Tech Stack:** ES5 JavaScript for XToys JS-Interpreter, Node.js `node:test`, PowerShell deterministic build, existing C#/.NET and Lua validation scripts.

## Global Constraints

- Protocol remains version `1`; targets without `retrigger` must preserve exact current behavior.
- XToys runtime source must remain ES5: no `let`, `const`, `class`, arrow functions, promises, `async`, or `await`.
- Keep the existing single 0.1-second `xthb-scheduler`; create no per-event Job, Queue, timer, or callback.
- Cadence records are bounded to `MAX_ACTIVE_EVENT_TARGETS` (`256`); slot-envelope state is fixed to sixteen entries.
- Normal `handle` and `tick` paths must not deep-copy logical state; each slot may dispatch at most once per tick.
- `stop_all`, Final Actions, forced safety zero, reload rollback, and adapter retry retain priority over haptic envelopes.
- The runtime controls current output only and never changes device maximum intensity or maximum rotation speed.
- Use test-driven development for every production-code task: observe the focused RED before implementing GREEN.
- Rebuild `dist/xtoys-universal-runtime.es5.js` whenever a runtime source file changes, but do not let tests silently replace an incorrect committed artifact before the committed-artifact assertion.

---

## File Structure

- Create `src/XToysUniversalBridge/25-haptics.es5.js`: pure cadence, timing, floor, and texture-phase calculations; no adapter or XToys globals.
- Create `tests/XToysUniversalBridge.Tests/haptics.test.js`: deterministic fake-clock tests for the new pure module.
- Modify `src/XToysUniversalBridge/00-namespace.es5.js`: expose scheduler/cadence constants.
- Modify `src/XToysUniversalBridge/10-protocol.es5.js`: validate and normalize the optional retrigger object.
- Modify `src/XToysUniversalBridge/20-state.es5.js`: bounded cadence records, same-part ownership index, supersession, and cleanup.
- Modify `src/XToysUniversalBridge/30-routing.es5.js`: select the latest adaptive foreground and expose baseline actuator metadata.
- Modify `src/XToysUniversalBridge/40-runtime.es5.js`: fixed slot-envelope phases, success-confirmed transitions, texture, and rotation reversal.
- Modify focused tests under `tests/XToysUniversalBridge.Tests/`: protocol, state, routing, runtime, adapter, benchmark, and build coverage.
- Modify `scripts/Benchmark-XToysRuntime.js`: add deterministic adaptive high-frequency and maximum-envelope workloads.
- Modify `README.md`, `docs/xtoys-protocol-v1.md`, and `docs/xtoys-template-setup.md`: document opt-in profiles, timing limits, and manual acceptance.
- Rebuild `dist/xtoys-universal-runtime.es5.js`: exact concatenation of all sorted ES5 modules.

---

### Task 1: Normalize and validate adaptive retrigger profiles

**Files:**
- Modify: `src/XToysUniversalBridge/00-namespace.es5.js`
- Modify: `src/XToysUniversalBridge/10-protocol.es5.js`
- Modify: `tests/XToysUniversalBridge.Tests/protocol.test.js`

**Interfaces:**
- Consumes: existing `numberValue`, `optionalNumber`, normalized transient target, `ns.MAX_TIME_MS`.
- Produces: `ns.SCHEDULER_INTERVAL_MS = 100`, `ns.MAX_CADENCE_RECORDS = ns.MAX_ACTIVE_EVENT_TARGETS`, and normalized `target.retrigger` equal to `null` or the exact seven-field object from the design.

- [ ] **Step 1: Add the normalized-shape and boundary tests**

Add a helper and focused cases to `protocol.test.js`:

```js
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

test('rejects incomplete incompatible and impossible retrigger profiles atomically', function () {
  var runtime = loadRuntime();
  var payload = validPlay();
  payload.targets[0].durationMs = 500;
  payload.targets[0].rampUpMs = 180;
  payload.targets[0].rampDownMs = 80;
  payload.targets[0].retrigger = retrigger();
  delete payload.targets[0].retrigger.quietResetMs;
  assert.equal(parse(runtime, payload).code, 'invalid_retrigger');

  payload.targets[0].retrigger = retrigger();
  payload.targets[0].effect = 'pulse';
  assert.equal(parse(runtime, payload).code, 'invalid_retrigger_effect');

  payload.targets[0].effect = 'hold';
  payload.targets[0].durationMs = 149;
  payload.targets[0].retrigger = retrigger({ minRampUpMs: 30, minRampDownMs: 20 });
  assert.equal(parse(runtime, payload).code, 'invalid_retrigger_timing');

  var baseline = readFixture('baseline.json');
  baseline.targets[0].retrigger = retrigger();
  assert.equal(parse(runtime, baseline).code, 'invalid_retrigger');
});
```

Update the existing complete normalized-target assertion so ordinary targets include `retrigger: null`.

- [ ] **Step 2: Run the focused protocol test and confirm RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/protocol.test.js
```

Expected: the new shape test fails because `retrigger` is absent, and invalid profiles are incorrectly accepted or ignored.

- [ ] **Step 3: Implement strict normalization**

Add the constants in `00-namespace.es5.js`:

```js
ns.SCHEDULER_INTERVAL_MS = 100;
ns.MAX_CADENCE_RECORDS = ns.MAX_ACTIVE_EVENT_TARGETS;
```

In `10-protocol.es5.js`, add a required-field helper and normalize only after duration/ramp fields are known:

```js
function normalizedRetrigger(raw, target) {
  var required = [
    'mode', 'minDropPercent', 'maxDropPercent', 'minRampUpMs',
    'minRampDownMs', 'textureThresholdMs', 'quietResetMs'
  ];
  var index;
  var value;
  var result = {};
  if (raw === undefined) {
    return { ok: true, value: null };
  }
  if (!isObject(raw)) {
    return fail('invalid_retrigger', 'Retrigger must be an object.');
  }
  for (index = 0; index < required.length; index += 1) {
    if (!hasOwn.call(raw, required[index])) {
      return fail('invalid_retrigger', 'Every retrigger field is required.');
    }
  }
  if (raw.mode !== 'adaptive') {
    return fail('invalid_retrigger', 'Unsupported retrigger mode.');
  }
  if (target.effect !== 'hold') {
    return fail('invalid_retrigger_effect', 'Adaptive retrigger requires hold effect.');
  }
  value = numberValue(raw.minDropPercent, 'invalid_retrigger');
  if (!value.ok) { return value; }
  result.minDropPercent = value.value;
  value = numberValue(raw.maxDropPercent, 'invalid_retrigger');
  if (!value.ok) { return value; }
  result.maxDropPercent = value.value;
  value = numberValue(raw.minRampUpMs, 'invalid_retrigger');
  if (!value.ok) { return value; }
  result.minRampUpMs = value.value;
  value = numberValue(raw.minRampDownMs, 'invalid_retrigger');
  if (!value.ok) { return value; }
  result.minRampDownMs = value.value;
  value = numberValue(raw.textureThresholdMs, 'invalid_retrigger');
  if (!value.ok) { return value; }
  result.textureThresholdMs = value.value;
  value = numberValue(raw.quietResetMs, 'invalid_retrigger');
  if (!value.ok) { return value; }
  result.quietResetMs = value.value;
  if (result.minDropPercent < 0 || result.maxDropPercent > 100 ||
      result.minDropPercent > result.maxDropPercent ||
      result.minRampUpMs < 0 || result.minRampUpMs > target.rampUpMs ||
      result.minRampDownMs < 0 || result.minRampDownMs > target.rampDownMs ||
      result.textureThresholdMs < ns.SCHEDULER_INTERVAL_MS ||
      result.quietResetMs <= result.textureThresholdMs) {
    return fail('invalid_retrigger', 'Retrigger ranges are inconsistent.');
  }
  if (result.minRampDownMs + ns.SCHEDULER_INTERVAL_MS +
      result.minRampUpMs > target.durationMs) {
    return fail('invalid_retrigger_timing', 'Minimum retrigger envelope exceeds duration.');
  }
  result.mode = 'adaptive';
  return { ok: true, value: result };
}
```

Implement the exact checks from the spec: drops `0..100`, min drop not above max drop, minimum ramps not above target ramps, threshold at least `100`, quiet reset greater than threshold, and `minRampDownMs + 100 + minRampUpMs <= durationMs`. Store `target.retrigger` as an owned plain object.

Call `normalizedRetrigger` only for transient `play`/`update` targets. If a baseline, stop selector, or test target supplies `retrigger`, return `invalid_retrigger`; otherwise normalize its field to `null` so every target retains one stable shape.

- [ ] **Step 4: Run focused and regression protocol tests**

Run the same build and focused test, then:

```powershell
node --test tests/XToysUniversalBridge.Tests/build.test.js tests/XToysUniversalBridge.Tests/protocol.test.js
```

Expected: all selected tests pass; the build recognizes the same protocol version and exact source distribution.

- [ ] **Step 5: Commit the protocol slice**

```powershell
git add src/XToysUniversalBridge/00-namespace.es5.js src/XToysUniversalBridge/10-protocol.es5.js tests/XToysUniversalBridge.Tests/protocol.test.js dist/xtoys-universal-runtime.es5.js
git commit -m "feat: validate adaptive retrigger profiles"
```

---

### Task 2: Add deterministic cadence and envelope math

**Files:**
- Create: `src/XToysUniversalBridge/25-haptics.es5.js`
- Create: `tests/XToysUniversalBridge.Tests/haptics.test.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: normalized `target.retrigger`, `target.durationMs`, `target.rampUpMs`, `target.rampDownMs`, `ns.clamp`, scheduler interval constant.
- Produces:
  - `ns.nextCadence(previous, target, nowMs, generation) -> cadenceRecord`
  - `ns.envelopePlan(target, cadenceRecord) -> {mode, dropPercent, fallMs, riseMs}`
  - `ns.hapticFloor(baselineValue, targetValue, blend, dropPercent) -> number`
  - `ns.textureTargetPhase(cadenceRecord, nowMs) -> boolean`

- [ ] **Step 1: Write pure-math tests with exact values**

Create `haptics.test.js` with a build helper and these assertions:

```js
test('cadence resets after quiet and enters texture without resetting its phase on updates', function () {
  var first = runtime.nextCadence(null, target(), 1000, 1);
  var second = runtime.nextCadence(first, target(), 1400, 2);
  var texturePrevious = {
    lastAttackAt: 1500,
    averageInterval: 100,
    mode: 'texture',
    lastGeneration: 3,
    textureStartedAt: 1450,
    quietResetMs: 600
  };
  var rapidUpdate = runtime.nextCadence(texturePrevious, target(), 1580, 4);
  var reset = runtime.nextCadence(rapidUpdate, target(), 2300, 5);

  assert.equal(first.averageInterval, null);
  assert.equal(second.averageInterval, 400);
  assert.equal(rapidUpdate.averageInterval, 95);
  assert.equal(rapidUpdate.mode, 'texture');
  assert.equal(rapidUpdate.textureStartedAt, 1450);
  assert.equal(reset.averageInterval, null);
});

test('envelope plan interpolates and fits without crossing declared minimums', function () {
  var cadence = { averageInterval: 375, mode: 'adaptive' };
  assert.deepEqual(plain(runtime.envelopePlan(target(), cadence)), {
    mode: 'adaptive', dropPercent: 62.5, fallMs: 50, riseMs: 105
  });
  assert.equal(runtime.hapticFloor(30, 44, 'boost', 50), 37);
  assert.equal(runtime.hapticFloor(30, 60, 'replace', 50), 30);
});

test('texture phase has a 200ms lower-bound cycle and deterministic halves', function () {
  var cadence = { averageInterval: 80, textureStartedAt: 1000 };
  assert.equal(runtime.textureTargetPhase(cadence, 1000), true);
  assert.equal(runtime.textureTargetPhase(cadence, 1100), false);
  assert.equal(runtime.textureTargetPhase(cadence, 1200), true);
});
```

Use a target fixture with the exact profile from the design and `durationMs: 500`, `rampUpMs: 180`, `rampDownMs: 80`.

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/haptics.test.js
```

Expected: FAIL because the four `XTHB` haptic functions do not exist.

- [ ] **Step 3: Implement the pure ES5 module**

Create `25-haptics.es5.js`:

```js
(function (ns) {
  ns.MODULE_HAPTICS = true;

  ns.nextCadence = function (previous, target, nowMs, generation) {
    var interval;
    var average;
    var mode = 'single';
    var textureStartedAt = null;
    if (previous !== null && nowMs - previous.lastAttackAt < target.retrigger.quietResetMs) {
      interval = nowMs - previous.lastAttackAt;
      average = previous.averageInterval === null
        ? interval
        : previous.averageInterval * 0.75 + interval * 0.25;
      mode = average < target.retrigger.textureThresholdMs ? 'texture' : 'adaptive';
      textureStartedAt = mode === 'texture'
        ? (previous.mode === 'texture' ? previous.textureStartedAt : nowMs)
        : null;
    } else {
      average = null;
    }
    return {
      lastAttackAt: nowMs,
      averageInterval: average,
      mode: mode,
      lastGeneration: generation,
      textureStartedAt: textureStartedAt,
      quietResetMs: target.retrigger.quietResetMs
    };
  };

  ns.envelopePlan = function (target, cadence) {
    var profile = target.retrigger;
    var ratio = cadence.averageInterval === null ? 1 : ns.clamp(
      (cadence.averageInterval - profile.textureThresholdMs) /
        (profile.quietResetMs - profile.textureThresholdMs), 0, 1);
    var desiredFall = profile.minRampDownMs +
      (target.rampDownMs - profile.minRampDownMs) * ratio;
    var desiredRise = profile.minRampUpMs +
      (target.rampUpMs - profile.minRampUpMs) * ratio;
    var minimumTotal = profile.minRampDownMs + profile.minRampUpMs;
    var available = target.durationMs - ns.SCHEDULER_INTERVAL_MS;
    var desiredTotal = desiredFall + desiredRise;
    var fit;
    if (desiredTotal > available && desiredTotal > minimumTotal) {
      fit = (available - minimumTotal) / (desiredTotal - minimumTotal);
      desiredFall = profile.minRampDownMs +
        (desiredFall - profile.minRampDownMs) * fit;
      desiredRise = profile.minRampUpMs +
        (desiredRise - profile.minRampUpMs) * fit;
    }
    return {
      mode: cadence.mode,
      dropPercent: profile.minDropPercent +
        (profile.maxDropPercent - profile.minDropPercent) * ratio,
      fallMs: desiredFall,
      riseMs: desiredRise
    };
  };

  ns.hapticFloor = function (baselineValue, targetValue, blend, dropPercent) {
    var anchor = blend === 'replace' ? 0 : baselineValue;
    return ns.clamp(anchor + (targetValue - anchor) *
      (1 - dropPercent / 100), 0, 100);
  };

  ns.textureTargetPhase = function (cadence, nowMs) {
    var period = Math.max(200, 2 * cadence.averageInterval);
    var elapsed = nowMs - cadence.textureStartedAt;
    return elapsed < 0 || elapsed % period < period / 2;
  };
}(XTHB));
```

`envelopePlan` uses ratio `1` for `averageInterval === null`, the design interpolation otherwise, and proportionally reduces desired fall/rise toward minimums when `fall + 100 + rise > durationMs`. `textureTargetPhase` uses `max(200, 2 * averageInterval)` and equal halves.

- [ ] **Step 4: Run focused math and build tests**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/haptics.test.js tests/XToysUniversalBridge.Tests/build.test.js
```

Expected: all selected tests pass, and module ordering places `25-haptics` between state and routing.

- [ ] **Step 5: Commit the pure calculation slice**

```powershell
git add src/XToysUniversalBridge/25-haptics.es5.js tests/XToysUniversalBridge.Tests/haptics.test.js dist/xtoys-universal-runtime.es5.js
git commit -m "feat: calculate adaptive haptic cadence"
```

---

### Task 3: Add bounded cadence state and same-part supersession

**Files:**
- Modify: `src/XToysUniversalBridge/20-state.es5.js`
- Modify: `tests/XToysUniversalBridge.Tests/state.test.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: `ns.nextCadence`, `ns.MAX_CADENCE_RECORDS`, normalized `target.retrigger`.
- Produces:
  - event entry field `cadence`, either `null` or an owned cadence record;
  - internal `cadenceRecords` and `partOwners` maps keyed with `ns.compositeKey([source, part])`; each `partOwners` record contains a bounded `eventKeys` membership map plus the current adaptive owner event/generation;
  - `engine.hapticSnapshot() -> {cadenceRecords, partOwners}` for defensive testing/diagnostics only.

- [ ] **Step 1: Add supersession, isolation, cleanup, and capacity tests**

Extend the state target helper with `retrigger: null`. Add an `adaptiveTarget(part)` helper and tests:

```js
test('adaptive play removes only the older same-source same-part entry', function () {
  var engine = buildAndCreateEngine();
  engine.applyMessage(message('play', {
    eventId: 'old', sequence: 1,
    targets: [adaptiveTarget('clitoris'), target('vagina')]
  }), 1000, false);
  engine.applyMessage(message('play', {
    eventId: 'new', sequence: 1,
    targets: [adaptiveTarget('clitoris')]
  }), 1300, false);
  var snapshot = engine.snapshot();
  assert.deepEqual(snapshot.events[eventKey('bridge-a', 'old')].map(function (entry) {
    return entry.target.part;
  }), ['vagina']);
  assert.equal(snapshot.events[eventKey('bridge-a', 'new')][0].cadence.averageInterval, 300);
});

test('adaptive ownership is source scoped and virtual groups remain exact identities', function () {
  var engine = buildAndCreateEngine();
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
  var snapshot = engine.snapshot();
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
```

Also assert a higher-sequence update carrying adaptive retrigger records a new cadence hit, while duplicate/older sequences do not.

- [ ] **Step 2: Run the focused state test and confirm RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/state.test.js
```

Expected: FAIL because entries have no cadence metadata, same-part events coexist, and `hapticSnapshot` is undefined.

- [ ] **Step 3: Implement copy-on-write cadence and owner maps**

Inside `createStateEngine`, add:

```js
var cadenceRecords = {};
var partOwners = {};

function partKey(source, part) {
  return ns.compositeKey([source, part]);
}
```

Before publishing an accepted adaptive target:

1. Reject duplicate/older event sequence using the existing early return before touching cadence.
2. Copy `events`, `cadenceRecords`, and `partOwners` only once.
3. Maintain every transient target, adaptive or ordinary, in `partOwners[key].eventKeys`. For every new adaptive target, iterate only that bounded membership map, copy the referenced event arrays, remove all older matching `source + exact part` entries, and delete an event key if empty.
4. Compute `ns.nextCadence` and attach an owned cadence object to the new event entry.
5. Add the new event key to the membership map and set `adaptiveEventKey` plus `adaptiveGeneration` on that part record.
6. Publish all logical and haptic maps together only after capacity checks succeed.

Update stop, expiry, event replacement, and clear-all paths so owner entries are removed only when their stored generation matches the removed event entry. Add an allocation-free quiet-record scan; copy the cadence map only if a record is actually removed. At capacity, evict the oldest inactive record, breaking ties by composite key.

Keep public `snapshot()` unchanged except for the new `cadence` field inside transient entries. Expose deep-copied auxiliary maps only through `hapticSnapshot()`.

- [ ] **Step 4: Run state, protocol, and copy-on-write regressions**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/protocol.test.js tests/XToysUniversalBridge.Tests/haptics.test.js tests/XToysUniversalBridge.Tests/state.test.js
```

Expected: all selected tests pass, including existing structural-sharing and zero-allocation expiry assertions.

- [ ] **Step 5: Commit logical haptic state**

```powershell
git add src/XToysUniversalBridge/20-state.es5.js tests/XToysUniversalBridge.Tests/state.test.js dist/xtoys-universal-runtime.es5.js
git commit -m "feat: supersede adaptive attacks by body part"
```

---

### Task 4: Route adaptive foregrounds and baseline actuator metadata

**Files:**
- Modify: `src/XToysUniversalBridge/30-routing.es5.js`
- Modify: `tests/XToysUniversalBridge.Tests/routing.test.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: event entry `cadence`, target `retrigger`, existing effective route weights.
- Produces each resolved slot with new fields:
  - `foregroundWinner`: newest adaptive winner metadata or `null`;
  - `baselineValue`: effective baseline value or `0`;
  - `baselineFrequency`: winning baseline frequency or `0`;
  - `baselineDirection`: winning baseline direction or `null`.
- Preserves `transientWinner` as the physically selected foreground when present, otherwise the existing ordinary winner.

- [ ] **Step 1: Write foreground and schema tests**

Add routing fixtures whose transient helper accepts `retrigger` and `cadence`. The two exact additions are:

```js
// Inside target()'s returned object:
retrigger: data.retrigger === undefined ? null : data.retrigger

// Inside transient()'s returned object, beside generation and target:
cadence: data.cadence === undefined ? null : data.cadence
```

```js
test('newest adaptive foreground beats a stronger ordinary transient on a shared slot', function () {
  var state = snapshot({}, {
    strong: [transient('vagina', { intensity: 90, priority: 100, acceptedAt: 1000 })],
    weak: [transient('clitoris', {
      eventId: 'weak', intensity: 20, priority: 0, acceptedAt: 1100,
      retrigger: retrigger(), cadence: cadence(300)
    })]
  });
  var slot = slotsFor(runtime, state, validatedConfig(), 1100)[0];
  assert.equal(slot.foregroundWinner.eventId, 'weak');
  assert.equal(slot.transientWinner.target.part, 'clitoris');
  assert.equal(slot.value, 10);
});

test('resolved slot exposes the winning baseline actuator tuple', function () {
  var slot = slotsFor(runtime, snapshot({
    base: baseline('clitoris', {
      intensity: 60, frequency: 45, rotateDirection: 'clockwise'
    })
  }), validatedConfig())[0];
  assert.equal(slot.baselineValue, 30);
  assert.equal(slot.baselineFrequency, 45);
  assert.equal(slot.baselineDirection, null);
});
```

Update the exact resolved-schema test with all four new keys. Add a test proving removal/expiry of the latest adaptive event reveals the still-active different-part event on recomputation.

- [ ] **Step 2: Run routing tests and confirm RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/routing.test.js
```

Expected: FAIL because `foregroundWinner` and baseline actuator fields are absent and ordinary priority still wins.

- [ ] **Step 3: Implement deterministic foreground selection**

Add a separate candidate and comparator:

```js
function newerForeground(next, current) {
  if (current === null) {
    return true;
  }
  if (next.entry.acceptedAt !== current.entry.acceptedAt) {
    return next.entry.acceptedAt > current.entry.acceptedAt;
  }
  if (next.entry.generation !== current.entry.generation) {
    return next.entry.generation > current.entry.generation;
  }
  return next.identity < current.identity;
}
```

While scanning transient candidates, consider entries with non-null `target.retrigger` for foreground ownership. Select foreground first; when present, use it as the active transient regardless of ordinary priority/value. Continue calculating the ordinary winner in the same single scan so fallback requires no second pass. Return flat baseline actuator values to avoid allocating another tuple object per slot.

- [ ] **Step 4: Run routing and state regressions**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/routing.test.js
```

Expected: all selected tests pass, including existing pulse and stable tie-break behavior for ordinary events.

- [ ] **Step 5: Commit foreground routing**

```powershell
git add src/XToysUniversalBridge/30-routing.es5.js tests/XToysUniversalBridge.Tests/routing.test.js dist/xtoys-universal-runtime.es5.js
git commit -m "feat: route adaptive foreground attacks"
```

---

### Task 5: Execute direct-rise and ordinary adaptive envelopes

**Files:**
- Modify: `src/XToysUniversalBridge/40-runtime.es5.js`
- Modify: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: routed foreground/baseline fields, `ns.envelopePlan`, `ns.hapticFloor`, existing adapter pending-dispatch and generation logic.
- Produces fixed `slotEnvelopes[1..16]`; each record contains `ownerKey`, `ownerGeneration`, `phase`, `riseAt`, `floorApplied`, `dropPercent`, `fallMs`, and `riseMs`.
- Adds no public XToys global. `runtime.hapticSnapshot()` returns a defensive copy with exact shape `{cadenceRecords, partOwners, slotEnvelopes}` for tests only.

- [ ] **Step 1: Write direct-rise, equal-output, shared-resume, and failure tests**

Add these runtime-test helpers, then use the fake clock already supplied by `createSubject`:

```js
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

function playAdaptive(subject, eventId, part, intensity) {
  return subject.runtime.handle(payload('play', {
    eventId: eventId, sequence: 1,
    targets: [target(part, adaptiveValues({ intensity: intensity }))]
  }));
}
```

```js
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
  var subject = createSubject(1000, function (slot) {
    if (failFloor && slot.id === 1 && slot.value < 30) {
      throw new Error('floor failed');
    }
  });
  playAdaptive(subject, 'first', 'clitoris', 60);
  subject.loaded.setNow(1400);
  failFloor = true;
  playAdaptive(subject, 'second', 'clitoris', 60);
  var failedFloor = lastCall(subject, 1).slot.value;
  failFloor = false;
  subject.loaded.setNow(1500);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, failedFloor);
  subject.loaded.setNow(1600);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
});
```

Add a shared-slot test: a strong vagina event, then a weaker clitoris adaptive event, then expiry; assert the clitoris envelope owns temporarily and the still-valid vagina output returns.

- [ ] **Step 2: Run runtime tests and confirm RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/runtime.test.js
```

Expected: new tests fail because the runtime dispatches only the final target and has no envelope snapshot or floor confirmation.

- [ ] **Step 3: Implement fixed slot-envelope orchestration**

Inside `createRuntime`, add `slotEnvelopes = {}` and helpers with these exact responsibilities:

```js
function foregroundKey(slot) {
  var winner = slot.foregroundWinner;
  return winner === null ? null : ns.compositeKey([
    winner.source, winner.eventId, winner.target.part, winner.generation
  ]);
}

function prepareHapticSlot(slot, atMs) {
  var key = foregroundKey(slot);
  var envelope = slotEnvelopes[slot.id];
  var previous = lastSlots[slot.id];
  var winner = slot.foregroundWinner;
  var plan;
  var physical;
  if (key === null) {
    delete slotEnvelopes[slot.id];
    return { slot: slot, transition: null, token: null };
  }
  if (envelope === undefined || envelope.ownerKey !== key) {
    plan = ns.envelopePlan(winner.target, winner.cadence);
    if (previous === undefined ||
        (previous.transientWinner === null && previous.value === slot.baselineValue)) {
      slotEnvelopes[slot.id] = {
        ownerKey: key, ownerGeneration: winner.generation,
        phase: 'target', riseAt: atMs, floorApplied: true,
        dropPercent: plan.dropPercent, fallMs: plan.fallMs, riseMs: plan.riseMs
      };
      return {
        slot: slot,
        transition: { rampSeconds: plan.riseMs / 1000 },
        token: { slotId: slot.id, ownerGeneration: winner.generation, phase: 'target' }
      };
    }
    physical = copy(slot);
    physical.value = ns.hapticFloor(slot.baselineValue, slot.value,
      winner.target.baselineBlend, plan.dropPercent);
    physical.frequency = slot.baselineFrequency;
    slotEnvelopes[slot.id] = {
      ownerKey: key, ownerGeneration: winner.generation,
      phase: 'fall', riseAt: atMs + plan.fallMs, floorApplied: false,
      dropPercent: plan.dropPercent, fallMs: plan.fallMs, riseMs: plan.riseMs
    };
    return {
      slot: physical,
      transition: { rampSeconds: plan.fallMs / 1000 },
      token: { slotId: slot.id, ownerGeneration: winner.generation, phase: 'fall' }
    };
  }
  if (envelope.phase === 'fall' && envelope.floorApplied && atMs >= envelope.riseAt) {
    envelope.phase = 'target';
    return {
      slot: slot,
      transition: { rampSeconds: envelope.riseMs / 1000 },
      token: { slotId: slot.id, ownerGeneration: winner.generation, phase: 'target' }
    };
  }
  if (envelope.phase === 'fall') {
    physical = copy(slot);
    physical.value = ns.hapticFloor(slot.baselineValue, slot.value,
      winner.target.baselineBlend, envelope.dropPercent);
    physical.frequency = slot.baselineFrequency;
    return {
      slot: physical,
      transition: { rampSeconds: envelope.fallMs / 1000 },
      token: { slotId: slot.id, ownerGeneration: winner.generation, phase: 'fall' }
    };
  }
  return {
    slot: slot,
    transition: { rampSeconds: envelope.riseMs / 1000 },
    token: { slotId: slot.id, ownerGeneration: winner.generation, phase: 'target' }
  };
}

function confirmHapticDispatch(token) {
  var envelope = slotEnvelopes[token.slotId];
  if (envelope !== undefined && envelope.ownerGeneration === token.ownerGeneration &&
      token.phase === 'fall') {
    envelope.floorApplied = true;
  }
}
```

Call `prepareHapticSlot` once per enabled slot inside `dispatch`. Pass its returned slot and transition into `apply`. Confirm the token whenever `applied.failure === null`, including a tuple-suppressed no-op; do not confirm on adapter failure. A falling envelope may advance only when `floorApplied === true` and `atMs >= riseAt`.

Use the prepared transition only when it is non-null; otherwise call the existing `transitionFor` path. Never calculate or apply both transitions for one slot dispatch. Expose the combined diagnostic snapshot without changing the public XToys globals:

```js
runtime.hapticSnapshot = function () {
  var logical = engine.hapticSnapshot();
  return {
    cadenceRecords: copy(logical.cadenceRecords),
    partOwners: copy(logical.partOwners),
    slotEnvelopes: copy(slotEnvelopes)
  };
};
```

When foreground identity disappears, delete that slot envelope before normal ramp calculation so stop/expiry restores the currently recomputed winner. `runtime.stopAll()` clears `slotEnvelopes` before forced zero output. `reserveSlotGeneration`, `invalidateSlot`, and `forceResync` retain their current contracts.

- [ ] **Step 4: Run runtime, routing, and adapter regressions**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/routing.test.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: all selected tests pass; existing stop, partial failure, manual test, and force-resync behavior stays green.

- [ ] **Step 5: Commit ordinary envelope execution**

```powershell
git add src/XToysUniversalBridge/40-runtime.es5.js tests/XToysUniversalBridge.Tests/runtime.test.js dist/xtoys-universal-runtime.es5.js
git commit -m "feat: execute adaptive attack envelopes"
```

---

### Task 6: Add continuous texture, rotation reversal, and lifecycle coverage

**Files:**
- Modify: `src/XToysUniversalBridge/40-runtime.es5.js`
- Modify: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Modify: `tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: `ns.textureTargetPhase`, cadence metadata on foreground entries, baseline frequency/direction, fixed slot envelopes.
- Produces texture phases that reuse one slot envelope and rotation reversal that reaches zero before a new explicit direction is applied. Task 6 extends each envelope with `textureStartedAt` plus the three fixed pending-texture fields; state remains bounded to the same sixteen slot records.

- [ ] **Step 1: Write exact texture and actuator tests**

Add tests with fake clock boundaries:

```js
test('rapid same-part hits enter one phase-stable texture without queued catch-up', function () {
  var subject = createSubject(1000);
  playAdaptive(subject, 'hit-1', 'clitoris', 60);
  subject.loaded.setNow(1100);
  playAdaptive(subject, 'hit-2', 'clitoris', 60);
  subject.loaded.setNow(1180);
  playAdaptive(subject, 'hit-3', 'clitoris', 60);
  var phaseOrigin = subject.runtime.hapticSnapshot().slotEnvelopes['1'].textureStartedAt;
  subject.loaded.setNow(1260);
  playAdaptive(subject, 'hit-4', 'clitoris', 60);
  assert.equal(subject.runtime.hapticSnapshot().slotEnvelopes['1'].textureStartedAt, phaseOrigin);
  subject.loaded.setNow(phaseOrigin + 300);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value < 30, true);
  subject.loaded.setNow(phaseOrigin + 400);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
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

test('failed texture phase is retried before sampling the current later phase', function () {
  var failFloor = false;
  var subject = createSubject(1000, function (slot) {
    if (failFloor && slot.id === 1 && slot.frequency === 20) {
      throw new Error('texture floor failed');
    }
  });
  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('clitoris', { intensity: 40, frequency: 20 })]
  }));
  playAdaptive(subject, 'hit-1', 'clitoris', 60);
  subject.loaded.setNow(1100);
  playAdaptive(subject, 'hit-2', 'clitoris', 60);
  var phaseOrigin = subject.runtime.hapticSnapshot()
    .slotEnvelopes['1'].textureStartedAt;
  failFloor = true;
  subject.loaded.setNow(phaseOrigin + 300);
  subject.runtime.tick();
  var failed = lastCall(subject, 1).slot;
  failFloor = false;
  subject.loaded.setNow(phaseOrigin + 400);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, failed.value);
  assert.equal(lastCall(subject, 1).slot.frequency, failed.frequency);
  subject.loaded.setNow(phaseOrigin + 600);
  subject.runtime.tick();
  assert.equal(lastCall(subject, 1).slot.value, 30);
  assert.equal(lastCall(subject, 1).slot.frequency, 70);
});
```

Add adapter/global tests proving `stop_all` clears texture immediately, a failed config reload force-resyncs the old envelope without losing its generation, and a valid reload installs a stopped empty runtime.

- [ ] **Step 2: Run focused runtime and adapter tests and confirm RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: texture phases do not alternate, rotation changes direction before a zero floor, or lifecycle snapshots retain envelope state incorrectly.

- [ ] **Step 3: Implement phase-stable texture and reversal**

In `prepareHapticSlot`, initialize or replace the envelope for the current owner first. When `winner.cadence.mode === 'texture'`, set `envelope.textureStartedAt = winner.cadence.textureStartedAt`; this origin comes from the source-and-part cadence record and therefore survives rapid same-part generations. Discard pending fields from an older owner generation. Execute the following texture branch before Task 5's ordinary fall/rise branch:

```js
if (winner.cadence.mode === 'texture') {
  if (envelope.pendingTextureSlot !== null) {
    return {
      slot: copy(envelope.pendingTextureSlot),
      transition: copy(envelope.pendingTextureTransition),
      token: { slotId: slot.id, ownerGeneration: winner.generation,
        phase: envelope.pendingTexturePhase }
    };
  }
  targetPhase = ns.textureTargetPhase(winner.cadence, atMs);
  physical = copy(slot);
  if (!targetPhase) {
    physical.value = ns.hapticFloor(slot.baselineValue, slot.value,
      winner.target.baselineBlend, winner.target.retrigger.minDropPercent);
    physical.frequency = slot.baselineFrequency;
  }
  return {
    slot: physical,
    transition: { rampSeconds: targetPhase
      ? winner.target.retrigger.minRampUpMs / 1000
      : winner.target.retrigger.minRampDownMs / 1000 },
    token: { slotId: slot.id, ownerGeneration: winner.generation,
      phase: targetPhase ? 'target' : 'floor' }
  };
}
```

Extend each texture envelope with the fixed fields `pendingTexturePhase`, `pendingTextureSlot`, and `pendingTextureTransition`, initially `null`. Store the selected texture tuple and transition before calling the adapter. If the adapter rejects that phase, keep those fields and retry the exact failed phase on later ticks even when the wall clock has crossed another phase boundary. Clear them only from `confirmHapticDispatch` after successful application (including a tuple-suppressed success). The next tick then samples the current clock once; it does not replay missed phases.

Do not loop over missed texture phases. Outside a pending retry, sample exactly once at `atMs` and allow ordinary tuple suppression to remove unchanged output. This keeps failure recovery correct without adding queues, timers, or unbounded history.

For rotation, compare the last successfully applied direction to the new foreground direction. When both are non-null and different, force floor speed to `0`, keep the old direction in the floor tuple, and set the new direction only in the confirmed target phase. A direction-changing hit replaces an old texture envelope and may enter new texture only after its zero floor succeeds.

Ensure `set_baseline` recomputation updates floor values/frequency from the newest baseline. Clear cadence/envelopes on stop-all; preserve the old runtime object untouched during a failed reload and let existing `forceResync()` reassert its current physical phase.

- [ ] **Step 4: Run all XToys Node tests**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: zero failures, including all legacy public-global, reload, retry, pulse, manual-test, and build-race cases.

- [ ] **Step 5: Commit texture and rotation behavior**

```powershell
git add src/XToysUniversalBridge/40-runtime.es5.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js dist/xtoys-universal-runtime.es5.js
git commit -m "feat: add adaptive texture and rotation reversal"
```

---

### Task 7: Enforce haptic performance and capacity budgets

**Files:**
- Modify: `scripts/Benchmark-XToysRuntime.js`
- Modify: `tests/XToysUniversalBridge.Tests/benchmark.test.js`
- Modify: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Modify: `tests/XToysUniversalBridge.Tests/state.test.js`

**Interfaces:**
- Consumes: complete adaptive runtime and existing no-op benchmark adapter.
- Produces benchmark JSON sections `adaptiveSamePart` and `envelopes`, plus structural assertions for bounded state, dispatch counts, and zero deep-copy ticks.

- [ ] **Step 1: Add deterministic benchmark workload assertions**

Extend benchmark output:

```js
adaptiveSamePart: benchmarkAdaptiveSamePart(namespace, config, testMode ? 20 : 2000),
envelopes: benchmarkEnvelopes(namespace, config, testMode ? 10 : 1000)
```

Return structural counters with timings:

```js
{
  updates: updates,
  cadenceRecords: Object.keys(runtime.hapticSnapshot().cadenceRecords || {}).length,
  envelopeSlots: Object.keys(runtime.hapticSnapshot().slotEnvelopes || {}).length,
  adapterCalls: adapterCalls,
  milliseconds: milliseconds(started)
}
```

In `benchmark.test.js`, assert finite timings without machine-specific thresholds, `cadenceRecords === 1` for repeated same-part hits, `envelopeSlots <= 16`, and adapter calls do not exceed one immediate call per enabled affected slot plus one per slot per tick.

- [ ] **Step 2: Run benchmark and structural tests; record any RED budget violations**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/benchmark.test.js tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/runtime.test.js
```

Expected before final optimization: tests may fail if cadence cleanup grows, a tick dispatches a slot twice, or haptic snapshots/deep copies leak into hot paths.

- [ ] **Step 3: Make only measured structural optimizations**

Keep the design boundaries while fixing any failing budget:

- move defensive snapshots out of `handle`/`tick` into explicit diagnostic methods;
- reuse fixed slot-envelope objects where safe instead of allocating phase-history arrays;
- make cadence quiet cleanup a read-only scan followed by one shallow copy only when removal occurs;
- ensure routing runs once per dispatch and phase transformation consumes that result; and
- rely on `sameTuple` rather than adding forced output for ordinary phase samples.

Do not add affected-slot caching, a second scheduler, or asynchronous abstractions unless a new approved design explicitly calls for them.

- [ ] **Step 4: Run benchmark test and print the diagnostic report**

```powershell
node --test tests/XToysUniversalBridge.Tests/benchmark.test.js
node scripts/Benchmark-XToysRuntime.js
```

Expected: the test passes; the report contains finite diagnostic milliseconds, one retained same-part cadence record, no more than sixteen envelope slots, and bounded call counts.

- [ ] **Step 5: Commit performance gates**

```powershell
git add scripts/Benchmark-XToysRuntime.js tests/XToysUniversalBridge.Tests/benchmark.test.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/state.test.js
git commit -m "test: bound adaptive haptic runtime cost"
```

---

### Task 8: Document, build, and validate the release candidate

**Files:**
- Modify: `README.md`
- Modify: `docs/xtoys-protocol-v1.md`
- Modify: `docs/xtoys-template-setup.md`
- Modify: `tests/XToysUniversalBridge.Tests/build.test.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: final normalized protocol and runtime behavior.
- Produces: user-facing JSON examples, profile guidance, timing/texture/rotation caveats, manual XToys checklist, deterministic release artifact.

- [ ] **Step 1: Add release-boundary assertions before rebuilding**

Extend `build.test.js` so the committed artifact must contain the new module marker and remain forbidden-token clean:

```js
assert.match(committed, /ns\.MODULE_HAPTICS/);
assert.doesNotMatch(committed, /\b(?:let|const|class|async|await)\b|=>/);
assert.doesNotMatch(committed, /"action":"setMax(?:Intensity|RotationSpeed)"/);
```

The `ns.MODULE_HAPTICS = true` marker was introduced with the module in Task 2. Run this assertion against the checked-in distribution before rebuilding; if it fails, stop and report that the committed artifact is stale instead of letting the build hide the mismatch.

- [ ] **Step 2: Update protocol and setup documentation**

Document the exact seven-field JSON object, all error codes, same-part cancellation, different-part shared-channel restoration, EMA behavior, 100 ms sampling, 200 ms texture saturation, E-Stim frequency phases, and zero-before-reverse rotation.

Replace README's planned-follow-up paragraph with a shipped opt-in feature description. Add manual checklist items to `xtoys-template-setup.md` for:

```text
[ ] Equal-output second hit visibly falls and rises.
[ ] Rapid hits enter bounded texture and stop cleanly after expiry.
[ ] Shared-channel different-part hit restores the previous still-active part.
[ ] Rotation reaches zero before an opposite direction is applied.
[ ] XToys scheduler shows no visible backlog during the high-frequency test.
```

- [ ] **Step 3: Rebuild twice and verify deterministic output**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
$first = (Get-FileHash dist/xtoys-universal-runtime.es5.js -Algorithm SHA256).Hash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
$second = (Get-FileHash dist/xtoys-universal-runtime.es5.js -Algorithm SHA256).Hash
if ($first -ne $second) { throw "Non-deterministic runtime build: $first != $second" }
```

Expected: identical hashes and LF-only UTF-8 without BOM.

- [ ] **Step 4: Run the complete automated acceptance matrix**

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaBridge.UE4SS.Tests/Validate-ArunaBridge.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1
dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj
git diff --check
git diff --exit-code -- dist/xtoys-universal-runtime.es5.js
```

Then run the forbidden scan:

```powershell
rg -n '\b(let|const|class|async|await)\b|=>|updateComponent|setMaxIntensity|setMaxRotationSpeed' src/XToysUniversalBridge dist/xtoys-universal-runtime.es5.js
```

Expected: all test commands exit `0`; the final `rg` exits `1` with no matches. Record exact test counts and the final SHA-256 in the implementation report.

- [ ] **Step 5: Record manual acceptance as pending and commit**

Do not claim hardware success. Record which of intensity, E-Stim frequency, shared channel, and rotation remain pending user-assisted XToys testing.

```powershell
git add README.md docs/xtoys-protocol-v1.md docs/xtoys-template-setup.md tests/XToysUniversalBridge.Tests/build.test.js dist/xtoys-universal-runtime.es5.js
git commit -m "docs: publish adaptive haptic retrigger runtime"
```

After the commit, rerun `git status --short --branch` and `git diff --check HEAD^..HEAD`; both must be clean before requesting review.

---

## Execution Completion Gate

Before calling the feature complete:

1. Request a formal code review against `docs/superpowers/specs/2026-08-10-adaptive-haptic-retrigger-design.md`.
2. Address every Critical or Important finding with a focused RED/GREEN cycle and re-review.
3. Re-run the complete Task 8 acceptance matrix after the final production change.
4. Keep user-assisted XToys/hardware checks explicitly pending until the user performs them.
5. Only after automated approval should DominatePlan migration begin as a separate design and plan.
