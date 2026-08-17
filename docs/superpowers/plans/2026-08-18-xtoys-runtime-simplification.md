# XToys Runtime Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove XToys-side physical generation, retry/resync, reload rollback, and zero-before-reverse behavior while preserving logical arbitration, adaptive haptic feel, per-slot call isolation, duplicate suppression, and independent stop safety.

**Architecture:** Keep protocol parsing, state ownership, cadence, and routing unchanged. Simplify the runtime to calculate only the latest output for each of at most sixteen slots, cache one four-field tuple after an XToys call completes without a synchronous exception, and immediately replace a rotation winner without a zero-speed gate. The adapter/global layer exposes four Script variables, five globals, native XToys stop-edit-start configuration lifecycle, and an explicit-direction manual test helper.

**Tech Stack:** ES5 JavaScript executed by JS-Interpreter, XToys `getVariable`/`setVariable`/`callAction`, Node.js built-in test runner, PowerShell build scripts, Markdown documentation, Git.

## Global Constraints

- ES5 syntax only: no `let`, `const`, classes, arrow functions, async/await, `eval`, or `Function` construction.
- Keep exactly sixteen configured output slots; haptic-envelope state remains bounded to at most one record per slot.
- Keep logical generation in protocol/state/routing ownership; remove only the physical XToys dispatch generation.
- Each physical tuple contains exactly `value`, `frequency`, `direction`, and `rampSeconds`.
- Each enabled slot performs at most one `updateJob` call per handle/tick pass.
- A normal JavaScript return means only “XToys call completed without a synchronous exception”; it is never device acknowledgement.
- A thrown slot call cannot block later slots and cannot update that slot's duplicate-suppression tuple.
- Never retain or replay an obsolete failed tuple; the next pass recalculates the latest logical winner and phase.
- An opposite-direction rotation winner takes effect immediately with its own effective `rampUpMs`; no intermediate zero and no old `rampDownMs` wait.
- Only loss of every successor uses the departing winner's `rampDownMs` to reach zero.
- Keep Initial/Final XToys UI zero Actions; do not modify device maximum intensity or maximum rotation speed.
- Rebuild `dist/xtoys-universal-runtime.es5.js` after every runtime-source change and commit it with its sources.
- Use RED-GREEN-REFACTOR for every behavior change and run `git diff --check` before each commit.

---

## File Structure

- `src/XToysUniversalBridge/40-runtime.es5.js`: latest-state slot calculation, adaptive envelopes, four-field tuple cache, per-slot XToys call isolation, StopAll, cache invalidation.
- `src/XToysUniversalBridge/50-xtoys-adapter.es5.js`: four XToys variables, direction encoding, `updateJob`, accurate call-level logging.
- `src/XToysUniversalBridge/90-global-entry.es5.js`: five public globals, config initialization, message/tick/stop wrappers, explicit-direction manual slot testing.
- `tests/XToysUniversalBridge.Tests/runtime.test.js`: rotation transitions, current-state-after-exception behavior, StopAll, adaptive phase regressions.
- `tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js`: adapter operation order, public globals, lifecycle, manual testing, partial calls, logging semantics.
- `tests/XToysUniversalBridge.Tests/build.test.js`: committed artifact, ES5/global contract, and removed-symbol release gates.
- `tests/XToysUniversalBridge.Tests/benchmark.test.js`: deterministic sixteen-slot hot-path bounds.
- `scripts/Benchmark-XToysRuntime.js`: structural counters used by the benchmark test only if an existing counter needs renaming after tuple simplification.
- `dist/xtoys-universal-runtime.es5.js`: deterministic concatenated release artifact.
- `README.md`: current feature summary and lifecycle wording.
- `docs/xtoys-protocol-v1.md`: immediate direction replacement and call-error semantics.
- `docs/xtoys-template-setup.md`: four-variable Jobs, direction-before-speed order, five globals, manual helper, migration and hardware checklist.
- `docs/superpowers/specs/2026-08-10-xtoys-runtime-performance-hardening-design.md`: supersession notice for removed physical reliability requirements.
- `docs/superpowers/specs/2026-08-10-adaptive-haptic-retrigger-design.md`: supersession notice for zero-before-reverse and exact failed-phase replay.

---

### Task 1: Make Rotation Winner Replacement Immediate

**Files:**
- Modify: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Modify: `src/XToysUniversalBridge/40-runtime.es5.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: routed slot fields `foregroundWinner`, `transientWinner`, `baselineWinner`, `value`, `direction`, `rampUpMs`, and `rampDownMs`; `XTHB.envelopePlan(target, cadence)`.
- Produces: `transitionFor(slot, expiredParts)` and `prepareHapticSlot(slot, atMs)` behavior in which a changed rotation winner immediately emits the new direction/speed with the new winner's effective rise time.

- [ ] **Step 1: Replace zero-before-reverse tests with immediate-replacement RED tests**

In `runtime.test.js`, remove the tests named:

```text
failed rotation zero does not switch direction
stopping an adaptive rotation confirms zero before restoring the opposite baseline direction
adaptive rotation expiry reaches zero before restoring the opposite baseline direction
```

Add these tests using the existing `createSubject`, `payload`, `target`, `adaptiveValues`, `callsFor`, and `lastCall` helpers:

```js
test('opposite rotation attack immediately adopts the new direction and effective rise', function () {
  var subject = createSubject(1000);
  var call;
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise-fast', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 80, rotateDirection: 'clockwise'
    }))]
  }));
  subject.calls.length = 0;
  subject.loaded.setNow(1400);
  subject.runtime.handle(payload('play', {
    eventId: 'counterclockwise-slow', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 40, rotateDirection: 'counterclockwise'
    }))]
  }));
  assert.equal(callsFor(subject, 3).length, 1);
  call = lastCall(subject, 3);
  assert.equal(call.slot.value, 20);
  assert.equal(call.slot.direction, 'counterclockwise');
  assert.equal(Math.abs(call.transition.rampSeconds - 0.11333333333333334) < 1e-12, true);
});

test('stopping rotation immediately restores an opposite baseline with its rise', function () {
  var subject = createSubject(1000);
  subject.runtime.handle(payload('set_baseline', {
    sequence: 1,
    targets: [target('vagina', {
      rotateSpeed: 30, rotateDirection: 'counterclockwise', rampUpMs: 120
    })]
  }));
  subject.runtime.handle(payload('play', {
    eventId: 'clockwise-stop', sequence: 1,
    targets: [target('vagina', adaptiveValues({
      intensity: 0, rotateSpeed: 60, rotateDirection: 'clockwise'
    }))]
  }));
  subject.calls.length = 0;
  subject.loaded.setNow(1200);
  subject.runtime.handle(payload('stop', { eventId: 'clockwise-stop' }));
  assert.equal(callsFor(subject, 3).length, 1);
  assert.equal(lastCall(subject, 3).slot.value, 15);
  assert.equal(lastCall(subject, 3).slot.direction, 'counterclockwise');
  assert.equal(lastCall(subject, 3).transition.rampSeconds, 0.12);
});

test('rotation with no successor uses the departing ramp down to zero', function () {
  var subject = createSubject(0);
  subject.runtime.handle(payload('play', {
    eventId: 'only-rotation', sequence: 1,
    targets: [target('vagina', {
      rotateSpeed: 60, rotateDirection: 'clockwise', durationMs: 1000,
      rampUpMs: 100, rampDownMs: 700
    })]
  }));
  subject.calls.length = 0;
  subject.loaded.setNow(100);
  subject.runtime.handle(payload('stop', { eventId: 'only-rotation' }));
  assert.equal(callsFor(subject, 3).length, 1);
  assert.equal(lastCall(subject, 3).slot.value, 0);
  assert.equal(lastCall(subject, 3).slot.direction, null);
  assert.equal(lastCall(subject, 3).transition.rampSeconds, 0.7);
});
```

- [ ] **Step 2: Run the focused rotation tests and verify RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test --test-name-pattern "opposite rotation|stopping rotation|rotation with no successor|same-direction rotation" tests/XToysUniversalBridge.Tests/runtime.test.js
```

Expected: the first two new tests fail because the existing runtime emits an old-direction zero phase; the no-successor and same-direction characterizations pass.

- [ ] **Step 3: Implement immediate rotation replacement**

In `40-runtime.es5.js`:

- remove `reversesDirection(...)` and every branch that creates `zeroBeforeReverse`, `releaseOnly`, or an old-direction zero floor;
- when `resolvedWinnerKey(slot)` changes for a rotation slot and the new resolved winner is non-null, select the new winner's effective rise time regardless of whether speed rises or falls;
- clear an old rotation texture envelope when its owner loses arbitration;
- retain the normal `rampDownMs` path only when the recomputed slot has no baseline or transient successor and resolves to zero.

Select `effectiveRiseMs` from exactly one current source: `slot.rampUpMs` for an ordinary winner/baseline, `plan.riseMs` for a new adaptive/retrigger winner, or the existing `restoredRiseMs(winner, plan, atMs)` result when an older adaptive winner is being restored with limited lifetime.

Use a dedicated helper with this exact contract:

```js
function replacementRampSeconds(previous, current, winnerChanged, effectiveRiseMs) {
  if (current.type === 'rotation' && winnerChanged && current.value > 0) {
    return ns.clamp(effectiveRiseMs / 1000, 0, 600);
  }
  return null;
}
```

Call it before numeric rise/fall comparison. A non-null result overrides the generic transition. Do not add timers, device feedback, or a replacement queue.

- [ ] **Step 4: Build and run runtime regression tests**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/haptics.test.js tests/XToysUniversalBridge.Tests/routing.test.js tests/XToysUniversalBridge.Tests/runtime.test.js
```

Expected: all tests pass; no runtime test expects a zero tuple between opposite rotation winners.

- [ ] **Step 5: Verify the source no longer contains reversal-gate symbols**

Run:

```powershell
rg -n "zeroBeforeReverse|releaseOnly|reversesDirection|rotation zero failed|confirmed zero" src/XToysUniversalBridge/40-runtime.es5.js tests/XToysUniversalBridge.Tests/runtime.test.js
```

Expected: exit code `1` with no matches.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add -- src/XToysUniversalBridge/40-runtime.es5.js tests/XToysUniversalBridge.Tests/runtime.test.js dist/xtoys-universal-runtime.es5.js
git diff --cached --check
git commit -m "feat: switch rotation winners immediately"
```

---

### Task 2: Remove the Physical Reliability Layer and Simplify the Global Contract

**Files:**
- Modify: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Modify: `tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js`
- Modify: `src/XToysUniversalBridge/40-runtime.es5.js`
- Modify: `src/XToysUniversalBridge/50-xtoys-adapter.es5.js`
- Modify: `src/XToysUniversalBridge/90-global-entry.es5.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: `XTHB.createRuntime(config, adapter, clock)`, `adapter.applySlot(slot, transition)`, normalized config slots, and existing state/routing APIs.
- Produces: adapter slot `{ id, value, frequency, direction }`; transition `{ rampSeconds }`; runtime methods `handle`, `tick`, `stopAll`, `snapshot`, `hapticSnapshot`, `invalidateSlot`; globals `xtoysBridgeInit`, `xtoysBridgeHandle`, `xtoysBridgeTick`, `xtoysBridgeStopAll`, `xtoysBridgeTestSlot(slotId, value, direction)`.
- Removes: `recentFailures`, `reserveSlotGeneration`, `forceResync`, `xtoysBridgeReloadConfig`, physical generation fields, retained failed tuples, stop/reload retry state.

- [ ] **Step 1: Rewrite runtime failure tests to require latest-state recomputation**

Replace the test named `a failed middle-slot dispatch does not block later slots and retries only the failure` with:

```js
test('a thrown slot call is isolated and the next pass uses only the latest state', function () {
  var failuresRemaining = 2;
  var subject = createSubject(0, function (slotOutput) {
    if (slotOutput.id === 2 && failuresRemaining > 0) {
      failuresRemaining -= 1;
      throw new Error('slot 2 unavailable');
    }
  });
  var result;
  subject.runtime.handle(payload('play', {
    eventId: 'latest-only', sequence: 1,
    targets: [target('clitoris', { intensity: 80, durationMs: 1000 })]
  }));
  result = subject.runtime.handle(payload('update', {
    eventId: 'latest-only', sequence: 2,
    targets: [target('clitoris', { intensity: 20, durationMs: 1000 })]
  }));
  assert.equal(result.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'dispatchFailures'), false);
  subject.calls.length = 0;
  subject.runtime.tick();
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [2]);
  assert.equal(subject.calls[0].slot.value, 5);
  subject.calls.length = 0;
  subject.runtime.tick();
  assert.deepEqual(subject.calls, []);
  assert.deepEqual(subject.logs.filter(function (entry) {
    return entry.type === 'xtoys_call_error';
  }).map(function (entry) { return entry.slotId; }), [2, 2]);
});
```

Replace the StopAll retry test with:

```js
test('repeated stopAll is a fresh best-effort zero call for every enabled slot', function () {
  var subject = createSubject(0);
  subject.runtime.handle(payload('play', {
    eventId: 'active', sequence: 1,
    targets: [target('clitoris', { intensity: 80, durationMs: 1000 })]
  }));
  subject.calls.length = 0;
  assert.equal(subject.runtime.stopAll(), 3);
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [1, 2, 3]);
  subject.calls.length = 0;
  assert.equal(subject.runtime.stopAll(), 3);
  assert.deepEqual(subject.calls.map(function (call) { return call.slot.id; }), [1, 2, 3]);
  subject.calls.forEach(function (call) {
    assert.equal(call.slot.value, 0);
    assert.equal(call.slot.frequency, 0);
    assert.equal(call.slot.direction, null);
    assert.equal(call.transition.rampSeconds, 0);
  });
});
```

Delete runtime tests dedicated to physical generation, exact failed-tuple replay, `recentFailures`, `forceResync`, and generation floors. Preserve tests for logical generation in `snapshot()` and state arbitration, but remove every assertion of `call.slot.generation`.

- [ ] **Step 2: Rewrite adapter/global tests for four variables and five globals**

Change the first adapter test to assert this exact operation list:

```js
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
```

Change the public-global assertion to exactly:

```js
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
```

Delete every reload/rollback/resync/stop-retry test. Replace generation-based manual tests with these behaviors:

```js
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
```

- [ ] **Step 3: Run the two focused files and verify RED**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: failures identify retained generation fields/APIs, reload global, exact retry state, old log type, and two-argument rotation testing.

- [ ] **Step 4: Simplify the runtime dispatcher**

In `40-runtime.es5.js`:

- delete `copyToken`, failure-copy helpers, physical generation from `copyTuple`, `actuatorSlot`, and `coreTuple`;
- delete `pendingDispatches`, `hapticPendingDispatches`, `resyncPendingDispatches`, `generationFloors`, and `recentFailures`;
- delete `retainHapticFailure`, failure-array return paths, `recentFailures`, `reserveSlotGeneration`, and `forceResync` public methods;
- retain `lastSlots`, `lastTuples`, `slotEnvelopes`, and `invalidateSlot`;
- rename `confirmHapticDispatch` to `completeHapticPhase` and call it only for tuple suppression or a call that returns normally;
- make a thrown call return `completed: false` without advancing the envelope;
- let the next pass prepare the current phase from current time/state without consulting a stored tuple.

Use this result shape inside the runtime:

```js
function reportCallError(slotId, error) {
  if (typeof outputAdapter.log !== 'function') {
    return;
  }
  try {
    outputAdapter.log({
      type: 'xtoys_call_error',
      slotId: slotId,
      detail: error && error.message !== undefined ? String(error.message) : String(error)
    });
  } catch (ignored) {
    /* Logging cannot block another output slot. */
  }
}

function apply(slot, transition, force) {
  var tuple = coreTuple(slot);
  tuple.rampSeconds = transition.rampSeconds;
  if (!force && sameTuple(lastTuples[slot.id], tuple)) {
    lastSlots[slot.id] = copySlot(slot);
    return { changed: false, completed: true };
  }
  try {
    outputAdapter.applySlot(actuatorSlot(slot), copyTransition(transition));
  } catch (error) {
    reportCallError(slot.id, error);
    return { changed: false, completed: false };
  }
  lastTuples[slot.id] = copyTuple(tuple);
  lastSlots[slot.id] = copySlot(slot);
  return { changed: true, completed: true };
}
```

`dispatch(...)` must continue through all enabled slots, increment `changedSlots` only for `changed === true`, and call `completeHapticPhase(token, atMs)` only when `completed === true`.

`runtime.stopAll()` must clear engine state and envelopes, then call `apply(zeroSlot, { rampSeconds: 0 }, true)` once for each enabled slot on every invocation.

- [ ] **Step 5: Simplify the adapter to four variables**

In `50-xtoys-adapter.es5.js`, make `applySlot` exactly follow this sequence:

```js
setVariable('xthb-slot-' + suffix + '-value', slot.value);
setVariable('xthb-slot-' + suffix + '-frequency', slot.frequency);
setVariable('xthb-slot-' + suffix + '-ramp-seconds', transition.rampSeconds);
setVariable('xthb-slot-' + suffix + '-direction-code', directionCode(slot.direction));
callAction({ type: 'updateJob', job: 'xthb-output-' + suffix, action: 'start' });
```

Rename `successfulApplies` to `completedCalls`. At each batch of 100 debug calls, log:

```text
XTHB debug: 100 XToys slot calls completed without exception.
```

Do not catch inside `applySlot`; the runtime/global caller owns per-slot isolation.

- [ ] **Step 6: Replace the global lifecycle and manual helper**

In `90-global-entry.es5.js`:

- remove the `xtoysBridgeReloadConfig` declaration and assignment;
- remove `stopped`, `stopRetryPending`, `hasRecentFailures`, `restoreActiveRuntime`, and live candidate replacement logic;
- let `xtoysBridgeInit()` read/validate config, construct adapter/runtime, call the new runtime's `stopAll()`, and install it;
- let `Handle`, `Tick`, and `StopAll` catch only their own runtime-level exceptions and return the spec's primitive values;
- do not convert a slot-call exception into protocol rejection;
- keep `finiteNumber` validation for manual numeric inputs.

Implement manual direction validation with this helper:

```js
function manualDirection(slot, value, direction) {
  if (slot.type !== 'rotation') {
    return { ok: true, value: null };
  }
  if (value === 0 && (direction === undefined || direction === null || direction === '')) {
    return { ok: true, value: null };
  }
  if (direction === 'clockwise' || direction === 'counterclockwise') {
    return { ok: true, value: direction };
  }
  return { ok: false, value: null };
}
```

Before calling the adapter in `xtoysBridgeTestSlot`, execute:

```js
parsedDirection = manualDirection(selected, numericValue, direction);
if (!parsedDirection.ok) {
  return 0;
}
runtime.invalidateSlot(numericSlot);
```

Then call the adapter with:

```js
adapter.applySlot({
  id: numericSlot,
  value: ns.clamp(numericValue, 0, 100),
  frequency: 0,
  direction: parsedDirection.value
}, { rampSeconds: 0 });
```

Log a thrown manual call as `xtoys_call_error` with the slot ID and return `0`.

- [ ] **Step 7: Build and run focused GREEN verification**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: both files pass; built globals number five; all adapter operation arrays contain four variable writes plus one `updateJob`.

- [ ] **Step 8: Run protocol/state/routing regression tests**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/protocol.test.js tests/XToysUniversalBridge.Tests/haptics.test.js tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/routing.test.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: all pass; logical-generation tests remain intact while physical-generation assertions are gone.

- [ ] **Step 9: Commit Task 2**

Run:

```powershell
git add -- src/XToysUniversalBridge/40-runtime.es5.js src/XToysUniversalBridge/50-xtoys-adapter.es5.js src/XToysUniversalBridge/90-global-entry.es5.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js dist/xtoys-universal-runtime.es5.js
git diff --cached --check
git commit -m "refactor: remove XToys physical retry state"
```

---

### Task 3: Add Release and Performance Gates for the Simplified Runtime

**Files:**
- Modify: `tests/XToysUniversalBridge.Tests/build.test.js`
- Modify: `tests/XToysUniversalBridge.Tests/benchmark.test.js`
- Modify if required by renamed counters: `scripts/Benchmark-XToysRuntime.js`

**Interfaces:**
- Consumes: committed `dist/xtoys-universal-runtime.es5.js`, `runtimeHarness.expectedDistribution()`, benchmark JSON `adaptiveTick16`.
- Produces: deterministic tests that reject removed physical-state symbols and retain sixteen-slot hot-path bounds without rejecting logical generation.

- [ ] **Step 1: Write the removed-symbol and five-global RED gate**

In `build.test.js`, change the committed artifact global list to the five names from Task 2 and add:

```js
test('release artifact excludes removed physical reliability state', function () {
  var source = runtimeHarness.expectedDistribution();
  assert.doesNotMatch(source, /-generation['"]/);
  assert.doesNotMatch(source, /\b(?:generationFloors|pendingDispatches|hapticPendingDispatches|resyncPendingDispatches|recentFailures|stopRetryPending)\b/);
  assert.doesNotMatch(source, /\b(?:forceResync|reserveSlotGeneration|xtoysBridgeReloadConfig|zeroBeforeReverse|releaseOnly|confirmHapticDispatch)\b/);
  assert.match(source, /xtoysBridgeTestSlot/);
  assert.match(source, /directionCode/);
});
```

The regex deliberately does not reject the word `generation` by itself because logical generation remains required.

- [ ] **Step 2: Strengthen the existing sixteen-slot benchmark assertions**

In `benchmark.test.js`, retain the existing copy counters and make the call bound explicit:

```js
assert.equal(result.adaptiveTick16.enabledSlots, 16);
assert.equal(result.adaptiveTick16.adapterCalls >= 0, true);
assert.equal(result.adaptiveTick16.adapterCalls <= 16, true);
assert.equal(result.adaptiveTick16.deepCopies, 0);
assert.equal(result.adaptiveTick16.fullWinnerCopies, 0);
assert.equal(result.adaptiveTick16.fullSlotCopies, 0);
```

If `Benchmark-XToysRuntime.js` still reads physical `slot.generation`, remove only that read and keep winner detection based on `value.target !== undefined`. Do not add runtime introspection APIs.

- [ ] **Step 3: Run build and benchmark tests**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/build.test.js tests/XToysUniversalBridge.Tests/benchmark.test.js
```

Expected: all tests pass. If the committed-artifact test alone fails before commit, confirm its only difference is the current Task's not-yet-committed test/script change; do not weaken that test.

- [ ] **Step 4: Run a direct forbidden-symbol scan**

Run:

```powershell
rg -n -- "-generation|generationFloors|pendingDispatches|hapticPendingDispatches|resyncPendingDispatches|recentFailures|stopRetryPending|forceResync|reserveSlotGeneration|xtoysBridgeReloadConfig|zeroBeforeReverse|releaseOnly|confirmHapticDispatch" src/XToysUniversalBridge dist/xtoys-universal-runtime.es5.js
```

Expected: exit code `1` with no matches. Logical state/routing `generation` matches are not part of this pattern and remain allowed.

- [ ] **Step 5: Commit Task 3 and rerun the committed-artifact gate**

Run:

```powershell
git add -- tests/XToysUniversalBridge.Tests/build.test.js tests/XToysUniversalBridge.Tests/benchmark.test.js scripts/Benchmark-XToysRuntime.js
git diff --cached --check
git commit -m "test: guard simplified XToys hot path"
node --test tests/XToysUniversalBridge.Tests/build.test.js tests/XToysUniversalBridge.Tests/benchmark.test.js
```

Expected: committed artifact and benchmark tests both pass at the new commit.

---

### Task 4: Migrate Living Documentation and Mark Superseded Requirements

**Files:**
- Modify: `README.md`
- Modify: `docs/xtoys-protocol-v1.md`
- Modify: `docs/xtoys-template-setup.md`
- Modify: `docs/superpowers/specs/2026-08-10-xtoys-runtime-performance-hardening-design.md`
- Modify: `docs/superpowers/specs/2026-08-10-adaptive-haptic-retrigger-design.md`

**Interfaces:**
- Consumes: five globals, four Script variables, immediate rotation replacement, `xtoys_call_error`, native XToys stop-edit-start lifecycle, three-argument manual helper.
- Produces: one unambiguous current setup guide and protocol description; older design bodies remain historical but carry explicit supersession notices.

- [ ] **Step 1: Update protocol behavior and terminology**

In `docs/xtoys-protocol-v1.md`:

- replace the zero-before-reverse paragraph with the following meaning: an explicit newer winner immediately supplies its new direction and effective rise; no intermediate zero or old ramp-down; only no-successor release reaches zero;
- retain the statement that direction is never inferred or automatically alternated;
- replace `adapter_apply_failed` with `xtoys_call_error` and state that it means a synchronous XToys JavaScript call threw;
- keep logical generation arbitration and the rule that an older logical event cannot erase a newer event;
- do not describe any return value as hardware confirmation.

Add this exact rotation example explanation after the `update` payload:

```text
该更新被接受后，当前旋转槽在同一次输出 Job 刷新中采用 counterclockwise 与新速度，并使用该目标当前有效的 rampUpMs。运行时不会先发送零速度，也不会等待旧目标的 rampDownMs。XToys 调用返回不代表设备已经完成换向。
```

- [ ] **Step 2: Rewrite the template setup contract**

In `docs/xtoys-template-setup.md`:

- say config is read when `xtoysBridgeInit()` runs at Script start; remove every reload reference;
- list only four per-slot variables and delete the physical generation paragraphs;
- specify rotation Job Action order as direction first, then speed/ramp;
- list exactly five globals;
- document `xtoysBridgeTestSlot(slotId, value, direction)` and these examples:

```js
xtoysBridgeTestSlot(1, 50);
xtoysBridgeTestSlot(3, 60, 'clockwise');
xtoysBridgeTestSlot(3, 60, 'counterclockwise');
xtoysBridgeTestSlot(3, 0);
```

- state that config editing uses XToys' existing stop-edit-start flow and needs no runtime reload action;
- retain Initial/Final UI zero Actions;
- change the hardware checklist item from “旋转反向前先达到零值” to “反向攻击到来后，不等待旧 rampDown，直接采用新方向和新速度渐入”.

- [ ] **Step 3: Update README and supersession notices**

In `README.md`, add a concise current-runtime paragraph stating four variables, immediate explicit rotation replacement, latest-state exception recovery, and no live reload.

At the top of both older specs, add a blockquote naming the new authoritative design:

```markdown
> **Superseded in part:** Physical generation, retained failed-dispatch retry/resync, live reload rollback, and zero-before-reverse requirements are replaced by [XToys Runtime Simplification and Immediate Rotation Design](2026-08-18-xtoys-runtime-simplification-design.md). Logical generation, bounded logical state, cadence, routing, and non-reversal haptic behavior remain authoritative.
```

Do not rewrite historical implementation plans under `docs/superpowers/plans/`; they remain records of what was previously built.

- [ ] **Step 4: Scan living docs for stale claims**

Run:

```powershell
rg -n "xtoysBridgeReloadConfig|xthb-slot-NN-generation|adapter_apply_failed|confirmed zero|确认.*零|旋转反向前先达到零|失败重试|强制同步" README.md docs/xtoys-protocol-v1.md docs/xtoys-template-setup.md
```

Expected: exit code `1` with no matches.

Run:

```powershell
rg -n "direction-code|xtoysBridgeTestSlot\(slotId, value, direction\)|stop-edit-start|xtoys_call_error" README.md docs/xtoys-protocol-v1.md docs/xtoys-template-setup.md
```

Expected: matches document the new contract.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add -- README.md docs/xtoys-protocol-v1.md docs/xtoys-template-setup.md docs/superpowers/specs/2026-08-10-xtoys-runtime-performance-hardening-design.md docs/superpowers/specs/2026-08-10-adaptive-haptic-retrigger-design.md
git diff --cached --check
git commit -m "docs: migrate simplified XToys template"
```

---

### Task 5: Run the Full Acceptance Matrix and Final Review

**Files:**
- Modify only if a verification reveals a real defect: files already owned by Tasks 1-4
- Verify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: all Task 1-4 commits.
- Produces: deterministic release artifact, clean repository, full automated evidence, and an explicit pending real-XToys/hardware checklist.

- [ ] **Step 1: Run the complete XToys Node suite once**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: zero failures, including protocol, state, routing, adaptive haptics, runtime, adapter/global, build-race, benchmark, and committed artifact tests.

- [ ] **Step 2: Run all existing game-bridge validators**

Run each command separately:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaBridge.UE4SS.Tests/Validate-ArunaBridge.ps1
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1
```

```powershell
dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj
```

Expected: all three PowerShell validators exit `0`; DominatePlan prints `All tests passed` and exits `0`.

- [ ] **Step 3: Prove deterministic release output**

Run the build twice and record both hashes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
Get-FileHash -Algorithm SHA256 -LiteralPath dist/xtoys-universal-runtime.es5.js
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
Get-FileHash -Algorithm SHA256 -LiteralPath dist/xtoys-universal-runtime.es5.js
```

Expected: both SHA-256 values are identical.

- [ ] **Step 4: Run final artifact and source scans**

Run:

```powershell
git diff --exit-code -- dist/xtoys-universal-runtime.es5.js
git diff --check
git status --short
```

Expected: all commands produce no diff/status output.

Run:

```powershell
rg -n -- "-generation|generationFloors|pendingDispatches|hapticPendingDispatches|resyncPendingDispatches|recentFailures|stopRetryPending|forceResync|reserveSlotGeneration|xtoysBridgeReloadConfig|zeroBeforeReverse|releaseOnly|confirmHapticDispatch|updateComponent|setMaxVolume|setMaxRotationSpeed|eval\(|Function\(|=>|\b(let|const|class|async|await)\b" src/XToysUniversalBridge dist/xtoys-universal-runtime.es5.js
```

Expected: exit code `1` with no matches. Do not broaden the generation pattern to reject logical generation.

- [ ] **Step 5: Perform a focused code review against the approved spec**

Review the final diff and verify these exact questions:

```text
Does any opposite rotation winner emit zero before its new direction?
Can any stored failed tuple override a newer logical winner?
Does any XToys variable or adapter slot contain physical generation?
Can one thrown slot call prevent later enabled slots from running?
Does repeated StopAll freshly attempt every enabled zero slot?
Does TestSlot require explicit direction for nonzero rotation and invalidate only its slot cache?
Do docs claim only synchronous call completion, never device acknowledgement?
Do Initial and Final UI zero Actions remain documented?
```

If any answer is wrong, add one failing regression test to the owning Task's test file, observe RED, implement the minimum correction, rebuild dist, rerun the focused file, and commit with `fix: close XToys simplification review finding`.

- [ ] **Step 6: Record manual validation as pending, not passed**

In the final handoff, explicitly state that automated tests cover ES5 output shape, Job ordering, state transitions, and synchronous exception handling. Real XToys Job scheduling and physical device behavior remain pending until the user runs the updated checklist in `docs/xtoys-template-setup.md`.

Do not claim that a device confirmed direction, speed, ramp completion, intensity, or frequency.
