# XToys Runtime Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound retained protocol state, replace hot-path full JSON clones with ES5 copy-on-write state, and suppress XToys Job calls when physical output is unchanged.

**Architecture:** Keep protocol parsing, logical state, routing, runtime dispatch, and XToys adaptation in their existing ES5 modules. Add validation and capacity rejection at the earliest owning layer, use immutable-by-convention entries plus top-level map copy-on-write, give routing a private read-only state view, and compare physical output independently from logical generation while preserving pending retries and forced zero output.

**Tech Stack:** Dependency-free ES5 runtime, XToys JS-Interpreter host functions, Node.js built-in test runner, PowerShell deterministic distribution builder.

## Global Constraints

- The built XToys runtime remains dependency-free ES5 and pasteable as one global JavaScript file.
- Do not use `Object.assign`, `Object.hasOwn`, destructuring, promises, async functions, JavaScript-created timers, or third-party immutable-data libraries.
- Keep the 0.1-second `xthb-scheduler` Job as the only time scheduler.
- Preserve protocol v1 boost, pulse, ramp, arbitration, preview, retry, reload, manual-test, and forced-zero semantics.
- `stop_all` must remain usable even when configuration or retained-state capacity is invalid.
- Public snapshots and previews remain defensive deep copies.
- Every production behavior change follows RED, observed RED, minimal GREEN, focused regression, then commit.
- The equal-output retrigger envelope remains deferred until after this plan.

## File map

- `src/XToysUniversalBridge/00-namespace.es5.js`: shared protocol and retained-state limits.
- `src/XToysUniversalBridge/10-protocol.es5.js`: identifier and state-label storage validation.
- `src/XToysUniversalBridge/20-state.es5.js`: capacity admission, atomic publication, entry factories, copy-on-write maps, and private state view.
- `src/XToysUniversalBridge/40-runtime.es5.js`: capacity rejection propagation, private-view routing, and physical tuple suppression.
- `tests/XToysUniversalBridge.Tests/protocol.test.js`: stored-string boundary behavior.
- `tests/XToysUniversalBridge.Tests/state.test.js`: capacity, atomicity, structural sharing, and expiry fast-path behavior.
- `tests/XToysUniversalBridge.Tests/runtime.test.js`: public rejection, dispatch suppression, dense updates, and complete acceptance flow.
- `tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js`: public global capacity/error and lifecycle regressions when required.
- `scripts/Benchmark-XToysRuntime.js`: non-gating diagnostic benchmark with a small test mode.
- `tests/XToysUniversalBridge.Tests/benchmark.test.js`: executes the real benchmark CLI and validates its output contract without timing thresholds.
- `docs/xtoys-protocol-v1.md`: new storage and retained-state limits.
- `README.md`: benchmark command and deferred retrigger pointer.
- `dist/xtoys-universal-runtime.es5.js`: rebuilt concatenated release artifact.

---

### Task 1: Bound stored protocol strings

**Files:**
- Modify: `src/XToysUniversalBridge/00-namespace.es5.js:4-9`
- Modify: `src/XToysUniversalBridge/10-protocol.es5.js:322-441`
- Test: `tests/XToysUniversalBridge.Tests/protocol.test.js`
- Modify: `docs/xtoys-protocol-v1.md:18-57`

**Interfaces:**
- Consumes: `XTHB.parseMessage(payloadText, config)` and the existing command-specific parser flow.
- Produces: `XTHB.MAX_IDENTIFIER_LENGTH = 128`, `XTHB.MAX_STATE_LABEL_LENGTH = 128`, and validation codes `identifier_too_long` and `state_label_too_long`.

- [ ] **Step 1: Write failing protocol boundary tests**

Add one table-driven test using literal boundary lengths. It must prove that 128-character stored values are accepted, 129-character `source`/`eventId` values are rejected for non-emergency commands, and a 129-character state label is rejected. Add a separate emergency-stop assertion:

```js
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
```

The production mutation this test catches is accepting strings that can be retained indefinitely, or accidentally blocking emergency stop because of a storage-only limit.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/protocol.test.js
```

Expected: the 129-character non-emergency cases are accepted instead of returning the new codes.

- [ ] **Step 3: Implement minimal parser limits**

Add constants in `00-namespace.es5.js`. In `parseMessage`, retain the existing type/count validation, skip per-string storage limits only for `stop_all`, and reject overlong non-emergency values before target normalization. Do not change the 32 KiB payload limit or blank-string behavior.

- [ ] **Step 4: Verify focused and full protocol/state compatibility**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/protocol.test.js tests/XToysUniversalBridge.Tests/state.test.js
```

Expected: all focused tests pass with no warnings from the runtime.

- [ ] **Step 5: Document and commit the protocol boundary**

Add the two per-string limits to `docs/xtoys-protocol-v1.md`, including the `stop_all` exception. Run `git diff --check`, stage the four files, and commit:

```text
feat: bound retained XToys protocol strings
```

---

### Task 2: Enforce atomic retained-state capacity

**Files:**
- Modify: `src/XToysUniversalBridge/00-namespace.es5.js:4-12`
- Modify: `src/XToysUniversalBridge/20-state.es5.js:50-336`
- Modify: `src/XToysUniversalBridge/40-runtime.es5.js:192-237`
- Test: `tests/XToysUniversalBridge.Tests/state.test.js`
- Test: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Test: `tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js`

**Interfaces:**
- Produces constants `MAX_ACTIVE_EVENTS = 128`, `MAX_ACTIVE_EVENT_TARGETS = 256`, `MAX_BASELINE_SOURCES = 64`, and `MAX_BASELINE_TARGETS = 256`.
- Produces state rejection shape `{ changed: false, rejected: { code: 'state_capacity_exceeded', detail: string }, changedParts: [] }`; every non-rejected state result contains `rejected: null`.
- `runtime.handle(payloadText)` translates state rejection into `{ ok: false, code, detail }` before expiry or physical dispatch.

- [ ] **Step 1: Write failing transient-capacity tests**

Add state tests that fill 128 distinct live events with one target each, prove event 129 is rejected without snapshot mutation, then stop one identity and prove the immediately following play succeeds without tick. Add a target-count test with eight 32-target events and reject the next target. Use literal expected counts and keys rather than production counting helpers.

Also prove these boundary cases:

```js
assert.equal(engine.applyMessage(stopOne, 10, false).changed, true);
assert.equal(engine.applyMessage(replacementPlay, 10, false).rejected, null);
assert.equal(Object.keys(engine.snapshot().events).length, 128);
```

Create an expiry case where 128 old events expire at `nowMs = 100`, then a new play at the same `nowMs` is accepted without a preceding `engine.expire()` call.

- [ ] **Step 2: Write failing baseline-capacity tests**

Fill 64 baseline sequence sources with an empty or one-target complete snapshot, reject source 65, and prove an existing source can clear/replace at capacity. Fill 256 baseline target entries across existing sources and atomically reject a target that would exceed the total. Assert before/after snapshots are deeply equal on every rejection.

- [ ] **Step 3: Write failing public rejection and emergency-stop tests**

At runtime/public-global level, reach capacity, capture variables/actions, submit one excessive play, and assert:

```js
assert.equal(loaded.context.xtoysBridgeHandle(excessPayload), 0);
assert.deepEqual(copy(loaded.variables), variablesBefore);
assert.deepEqual(copy(loaded.actions), actionsBefore);
assert.equal(loaded.context.xtoysBridgeHandle(stopAllPayload), 1);
```

The production mutations caught are off-by-one admission, non-atomic partial publication, stale capacity after stop/expiry, and capacity checks blocking stop-all.

- [ ] **Step 4: Run focused suites and observe RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: new capacity assertions fail because current state is unbounded and runtime has no rejection propagation.

- [ ] **Step 5: Implement read-only capacity calculation and one-step publication**

Count only entries with `expiresAt > nowMs`. For event replacement, exclude the complete existing key before adding the proposed target count. For baseline replacement, exclude entries belonging to the same source before adding the proposed complete snapshot. Perform all counting and candidate construction in local variables; call `publish(...)` once only after validation succeeds.

Do not mutate `events`, `baseline`, or `baselineSequences` before capacity checks finish. `stop`, `stop_all`, expiry, and clearing an existing baseline never call an admission guard.

- [ ] **Step 6: Propagate capacity rejection without output**

In `runtime.handle`, inspect `applied.rejected` immediately after `applyMessage`. Return `ok: false` with the exact code/detail before calling expiry or dispatch. Existing global-entry input-error handling will log according to configured level and return `0`.

- [ ] **Step 7: Verify focused and full Node suites**

Run the focused command from Step 4, then:

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: every existing and new test passes.

- [ ] **Step 8: Commit bounded retained state**

Run `git diff --check`, stage the namespace, state, runtime, and three test files, and commit:

```text
feat: bound XToys runtime state capacity
```

---

### Task 3: Convert logical state to ES5 copy-on-write

**Files:**
- Modify: `src/XToysUniversalBridge/20-state.es5.js:16-336`
- Modify: `src/XToysUniversalBridge/40-runtime.es5.js:159-190`
- Test: `tests/XToysUniversalBridge.Tests/state.test.js`
- Test: `tests/XToysUniversalBridge.Tests/runtime.test.js`

**Interfaces:**
- Produces `engine.readState()` as an internal read-only view `{ baseline, events, generation }`; only runtime routing and structural tests consume it.
- Keeps `engine.snapshot()` and `runtime.snapshot()` as defensive deep-copy APIs.
- Produces factories `copyTarget(target)`, `createEventEntries(message, nowMs, generation)`, and `createBaselineEntry(message, target)` inside the state module.
- Live operations omit `result.snapshot`; dry runs and protocol `test` previews include it.

- [ ] **Step 1: Write failing structural-sharing and input-isolation tests**

Create two active events, retain `before = engine.readState()`, update only the first, and retain `after`. Assert the top-level events map changed, the affected event array changed, the unaffected array is reference-equal, and serializing `before` still yields the old values. Mutate the original message target after acceptance and prove `engine.snapshot()` remains unchanged.

Expected initial RED: `engine.readState` is undefined.

- [ ] **Step 2: Write failing no-change expiry tests**

With a long-lived event, capture the internal events map, call `engine.expire()` before its boundary several times, and assert every `readState().events` reference is identical. Add runtime coverage showing both `handle` and `tick` preserve output and state while sharing the same engine fast path. Do not assert elapsed milliseconds.

- [ ] **Step 3: Run state/runtime tests and observe RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/runtime.test.js
```

Expected: failures identify the missing read-only view and current full-copy publication behavior.

- [ ] **Step 4: Implement entry factories and shallow map copying**

Add an ES5 `copyOwnMap` loop using cached `hasOwnProperty`. Targets are flat normalized records, so `copyTarget` copies own scalar properties without JSON serialization. New event/baseline factories take ownership only of copied targets. Never mutate retained arrays or entries.

- [ ] **Step 5: Make each mutation copy only changed paths**

- `applyEvent`: construct the replacement array once and shallow-copy the events map once.
- `applyStop`: delay map copying until the first matching event; allocate arrays only for partially retained events.
- `applyBaseline`: shallow-copy baseline and sequence maps, replacing only the source snapshot.
- `expire`: read-only first pass; if nothing expires, return without cloning or publishing; otherwise shallow-copy once and replace only affected arrays.
- `clearAll`: publish fresh empty maps while preserving baseline sequence fences.

- [ ] **Step 6: Remove live-result snapshots from hot paths**

Build result metadata without a snapshot for ordinary live operations. Include a defensive proposed snapshot for `dryRun === true` and for `test` preview. Add `engine.readState()` returning direct references with an internal-read-only comment. Change runtime dispatch from `engine.snapshot()` to `engine.readState()`; leave public snapshot functions unchanged.

- [ ] **Step 7: Run focused, full, and build regressions**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/runtime.test.js
node --test tests/XToysUniversalBridge.Tests/*.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
```

Expected: all tests pass and the distribution rebuild succeeds.

- [ ] **Step 8: Commit copy-on-write state**

Run `git diff --check`, stage both source modules, both test files, and the rebuilt distribution, then commit:

```text
perf: use copy-on-write XToys state
```

---

### Task 4: Suppress unchanged physical output

**Files:**
- Modify: `src/XToysUniversalBridge/40-runtime.es5.js:6-135`
- Test: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Test: `tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js`
- Modify: `docs/xtoys-template-setup.md:71-104`

**Interfaces:**
- Physical equality is exactly `value`, `frequency`, normalized `direction`, and `rampSeconds`.
- Logical generation and winner metadata continue updating even when no adapter call is needed.
- Pending failed dispatches, `forceResync`, manual test invalidation, and `stopAll` bypass normal suppression.

- [ ] **Step 1: Replace the generation-driven test with failing physical-equality behavior**

Change the existing test named `tuple comparison includes generation...` to prove that a higher-sequence update with the same resolved actuator tuple does not call the adapter again, while `runtime.snapshot().generation` advances and the latest event metadata controls its later expiry/ramp behavior.

- [ ] **Step 2: Add a failing unrelated-slot and dense-update assertion**

Record calls per slot. After initialization, process one play plus 500 same-event updates affecting only the two intensity slots. Assert the unrelated zero-valued rotation slot receives zero calls during that sequence. For the existing fixture, assert the hand-derived totals: 1000 `updateJob` actions, 10 aggregated debug messages, final generation 502 for slots 1 and 2, and the initialization generation 1 retained for unchanged slot 3.

- [ ] **Step 3: Run runtime/adapter tests and observe RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: current generation-inclusive tuple comparison restarts unchanged slots and violates the new counts.

- [ ] **Step 4: Implement physical equality without losing logical metadata**

Add a comparison that ignores generation but includes the four physical fields. In `apply`, when no pending dispatch exists and the physical tuple is equal, update `lastSlots[slot.id]` and the logical tuple metadata without calling `applySlot`. Use actuator equality without generation when preserving the prior ramp for an unchanged target.

Before every actual adapter attempt, reserve a physical generation greater than the slot's prior attempted generation floor. Store the attempted physical generation in pending/success metadata. Do not clear a pending failure merely because a later logical tuple resolves to the same values.

- [ ] **Step 5: Verify every safety bypass**

Run focused tests covering failed middle-slot retry, partial pulse retry, stop-all retry, force-resync, manual test, failed manual apply, reload rollback, and monotonic generations. Fix production logic rather than weakening those assertions.

- [ ] **Step 6: Update generation documentation and run full tests**

Clarify in `docs/xtoys-template-setup.md` that the generation variable is a monotonically increasing physical-dispatch token and does not itself force a Job restart. Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: all tests pass; dense-update Job calls are lower while final actuator values are unchanged.

- [ ] **Step 7: Rebuild and commit dispatch suppression**

Rebuild the distribution, run `git diff --check`, stage source/test/docs/dist, and commit:

```text
perf: suppress unchanged XToys output jobs
```

---

### Task 5: Add diagnostic benchmark and release verification

**Files:**
- Create: `scripts/Benchmark-XToysRuntime.js`
- Create: `tests/XToysUniversalBridge.Tests/benchmark.test.js`
- Modify: `README.md`
- Modify: `docs/xtoys-protocol-v1.md`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- `node scripts/Benchmark-XToysRuntime.js` prints one JSON document shaped as `{ nodeVersion, sameEvent: { updates, milliseconds }, uniqueEvents: [{ requested, accepted, rejected, milliseconds }], ticks: { activeEvents, iterations, milliseconds } }`. Unique-event rows cover 32, 64, 128, and 129 requested events so the last row proves one bounded rejection.
- `node scripts/Benchmark-XToysRuntime.js --test` uses small deterministic workloads suitable for the test suite.
- No benchmark result is a pass/fail millisecond threshold.

- [ ] **Step 1: Write a failing real-CLI benchmark test**

Execute the script with `--test`, parse stdout as JSON, and assert literal workload counts, zero rejected admissions below capacity, one rejection beyond capacity, and finite nonnegative timing fields. The expected RED is `MODULE_NOT_FOUND` because the script does not exist.

- [ ] **Step 2: Implement the smallest benchmark CLI**

Load the built distribution in a VM with a no-op adapter and the existing 16-slot fixture. Measure with `process.hrtime.bigint()`. Use stable event IDs for same-event updates and unique IDs for capacity growth. Print only JSON on stdout; route errors to stderr and set nonzero exit status.

- [ ] **Step 3: Run benchmark test and diagnostic benchmark**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/benchmark.test.js
node scripts/Benchmark-XToysRuntime.js
```

Expected: test passes and the diagnostic command reports results without claiming XToys hardware timing.

- [ ] **Step 4: Document the benchmark and final protocol limits**

Add the command and interpretation caveat to README. Ensure `docs/xtoys-protocol-v1.md` lists all per-message, per-string, active-event, active-target, baseline-source, and baseline-target limits plus the capacity rejection behavior.

- [ ] **Step 5: Run complete project validation**

Run exactly:

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaBridge.UE4SS.Tests/Validate-ArunaBridge.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1
dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj
```

Expected: every command exits zero.

- [ ] **Step 6: Verify deterministic release artifact**

Run the build twice, record both SHA-256 hashes, require equality, require `git diff --exit-code -- dist/xtoys-universal-runtime.es5.js`, scan source and dist for forbidden ES6/direct-action tokens, and run `git diff --check`. The forbidden scan must find zero matches for:

```text
setMax|eval\(|Function\(|rotateReverse|setPattern|=>|\b(let|const|class|async|await)\b
```

- [ ] **Step 7: Commit the benchmark and release documentation**

Stage benchmark, test, README, protocol guide, and final distribution; commit:

```text
test: benchmark hardened XToys runtime
```

- [ ] **Step 8: Request final code review**

Use `superpowers:requesting-code-review` against the complete performance-hardening diff. Resolve every Critical, Important, and valid Minor finding with a fresh failing regression test before declaring completion.
