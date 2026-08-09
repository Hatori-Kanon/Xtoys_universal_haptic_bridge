# XToys Universal Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the device-independent protocol runtime and one reusable XToys template that routes game events to 16 physical output slots without game-specific XToys JavaScript.

**Architecture:** ES5 source files extend one `XTHB` namespace and are concatenated into a single paste-ready XToys global JavaScript file. A pure protocol/state/routing engine is isolated from a thin XToys adapter so Node's built-in test runner can verify behavior with mocked `getVariable`, `setVariable`, and `callAction`; one scheduler Job calls the runtime tick, while 16 generic output Jobs apply variables to user-wired XToys blocks.

**Tech Stack:** ES5 JavaScript, XToys JS-Interpreter APIs, Node.js 24 built-in `node:test`/`assert`/`vm`, PowerShell build script, JSON fixtures.

## Global Constraints

- XToys runtime source uses ES5 syntax only and must not access the DOM.
- The fixed outer webhook action is `xtoys_game_bridge`; gameplay meaning remains inside the string `payload` JSON.
- Protocol v1 commands are `play`, `update`, `stop`, `stop_all`, `set_baseline`, and `test`.
- Payload limit is 32 KiB, with at most 32 targets, at most 32 state labels, and timing values clamped to 0-600,000 ms.
- Intensity, E-Stim frequency, and rotation speed are normalized to 0-100.
- The game Bridge explicitly supplies `rotateSpeed` and `rotateDirection`; XToys does not infer speed, alternate direction, or select a Pattern.
- XToys never changes device maximum intensity or maximum rotation speed.
- The user manually starts and stops the XToys Script; Initial and Final Actions zero every connected output.
- A game Bridge never sends XToys channel names, device models, or physical body-part assignments.
- The first milestone does not migrate Repetition, Dominate Plan, or Aruna; each adapter migration receives a separate plan after the runtime passes its acceptance suite.

## File structure

```text
src/XToysUniversalBridge/
  00-namespace.es5.js       namespace, constants, helpers, default config
  10-protocol.es5.js        JSON parsing, normalization, validation, group expansion
  20-state.es5.js           command semantics and logical baseline/transient state
  30-routing.es5.js         slot candidates, arbitration, baseline/transient mixing
  40-runtime.es5.js         clock ticks, pulse phases, expiry, generation-safe dispatch
  50-xtoys-adapter.es5.js   XToys variables, output Job restarts, logging
  90-global-entry.es5.js    public functions called by XToys Custom JavaScript Actions
scripts/
  Build-XToysRuntime.ps1    deterministic concatenation and ES5 guard
dist/
  xtoys-universal-runtime.es5.js
tests/XToysUniversalBridge.Tests/
  harness.js
  protocol.test.js
  state.test.js
  routing.test.js
  runtime.test.js
  xtoys-adapter.test.js
  build.test.js
  fixtures/config.json
  fixtures/play.json
  fixtures/baseline.json
docs/
  xtoys-protocol-v1.md
  xtoys-template-setup.md
```

---

### Task 1: Buildable ES5 namespace and test harness

**Files:**
- Modify: `.gitignore`
- Create: `src/XToysUniversalBridge/00-namespace.es5.js`
- Create: `scripts/Build-XToysRuntime.ps1`
- Create: `tests/XToysUniversalBridge.Tests/harness.js`
- Create: `tests/XToysUniversalBridge.Tests/build.test.js`
- Create: `tests/XToysUniversalBridge.Tests/fixtures/config.json`
- Create: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: XToys host functions `getVariable(name)`, `setVariable(name, value)`, `callAction(json)` and `console.log(text)` supplied by XToys or test mocks.
- Produces: global namespace `XTHB`, helper functions `XTHB.clamp`, `XTHB.copyObject`, `XTHB.createDefaultConfig`, `XTHB.nowMs`, and deterministic test function `loadRuntime(options)`.

- [ ] **Step 1: Write the failing build test**

Create `build.test.js` with a test that invokes the PowerShell build script, asserts the distribution file exists, checks module markers appear in numeric filename order, and rejects non-ES5 tokens:

```js
test('build emits one ES5 runtime in module order', function () {
  var output = buildRuntime();
  assert.match(output, /var XTHB =/);
  assert.match(output, /XTHB.MODULE_NAMESPACE/);
  assert.doesNotMatch(output, /\b(let|const|class|async|await)\b|=>/);
});
```

Task 1 verifies only modules that exist in Task 1. The Global Entry marker and public functions are added and tested in Task 6, after their dependencies exist.

- [ ] **Step 2: Run the test and confirm the build is missing**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/build.test.js
```

Expected: FAIL because `Build-XToysRuntime.ps1` and the distribution file do not exist.

- [ ] **Step 3: Add repository allowlist entries**

Modify `.gitignore` root allowlist to include `/scripts/` and `/dist/`. Keep archive, binary, log, payload, `bin/`, and `obj/` exclusions unchanged.

- [ ] **Step 4: Implement namespace and deterministic build**

Start the namespace file with ES5-safe initialization and constants:

```js
var XTHB = typeof XTHB === 'undefined' ? {} : XTHB;
(function (ns) {
  ns.MODULE_NAMESPACE = true;
  ns.VERSION = '1.0.0';
  ns.PROTOCOL_VERSION = 1;
  ns.MAX_PAYLOAD_LENGTH = 32768;
  ns.MAX_TARGETS = 32;
  ns.MAX_STATES = 32;
  ns.MAX_TIME_MS = 600000;
  ns.clamp = function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };
  ns.copyObject = function (value) {
    return value === null || typeof value !== 'object'
      ? value
      : JSON.parse(JSON.stringify(value));
  };
  ns.nowMs = function () { return new Date().getTime(); };
}(XTHB));
```

`XTHB.createDefaultConfig()` returns `logLevel:'errors'`, `globalMultiplier:1`, all five supported virtual groups with empty route maps, and exactly 16 disabled slots numbered 1-16. The disabled default ensures a missing XToys configuration cannot start hardware output.

`Build-XToysRuntime.ps1` must sort `src/XToysUniversalBridge/*.es5.js` by filename, concatenate UTF-8 text with one separator newline, reject the ES6 token pattern used by the test, and write `dist/xtoys-universal-runtime.es5.js` as UTF-8 without a byte-order mark.

- [ ] **Step 5: Implement the VM harness**

`loadRuntime(options)` creates a `vm` context containing deterministic mocks and returns captured state:

```js
{
  context: context,
  variables: variables,
  actions: actions,
  logs: logs,
  setNow: function (value) { now = value; }
}
```

Replace `XTHB.nowMs` after loading with a function returning the harness clock. Do not expose Node APIs inside the runtime context.

- [ ] **Step 6: Run the build test**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/build.test.js
```

Expected: PASS with one test and no ES5 guard errors.

- [ ] **Step 7: Commit the scaffold**

```powershell
git add .gitignore src/XToysUniversalBridge scripts tests/XToysUniversalBridge.Tests dist
git commit -m "build: scaffold XToys ES5 runtime"
```

### Task 2: Protocol parser and atomic validation

**Files:**
- Create: `src/XToysUniversalBridge/10-protocol.es5.js`
- Create: `tests/XToysUniversalBridge.Tests/protocol.test.js`
- Create: `tests/XToysUniversalBridge.Tests/fixtures/play.json`
- Create: `tests/XToysUniversalBridge.Tests/fixtures/baseline.json`

**Interfaces:**
- Consumes: configuration objects passed to `XTHB.validateConfig(config)` and payload strings passed to `XTHB.parseMessage(payloadText, config)`.
- Produces: `{ ok: true, config: normalizedConfig }` for valid configuration; `{ ok: true, message: normalizedMessage }` for valid messages; or `{ ok: false, code: string, detail: string }`; validation never mutates runtime state.

- [ ] **Step 1: Write parser and validation tests**

Cover one valid configuration and one valid `play` message. Configuration failures cover a slot count other than 16, duplicate/missing IDs, unsupported slot type, non-boolean frequency flag, unknown routed leaf part, route/group weights outside 0-1, unknown group keys, non-finite or negative global multiplier, and unsupported log level. Message failures cover oversized string, malformed JSON, wrong protocol version, unsupported command, more than 32 targets, more than 32 state labels, unknown part, non-finite numeric input, and missing `rotateDirection` when `rotateSpeed > 0`. Assert clamping of intensity/frequency/rotateSpeed to 0-100 and time fields to 0-600000.

```js
test('rotation requires an explicit direction', function () {
  var result = runtime.XTHB.parseMessage(JSON.stringify({
    protocolVersion: 1,
    command: 'play',
    source: 'fixture',
    eventId: 'attack-1',
    sequence: 1,
    targets: [{ part: 'vagina', intensity: 0, rotateSpeed: 60, durationMs: 1000 }]
  }), config);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_rotate_direction');
});
```

- [ ] **Step 2: Run tests and confirm the API is absent**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/protocol.test.js
```

Expected: FAIL because `XTHB.parseMessage` is undefined.

- [ ] **Step 3: Implement normalized target parsing**

Implement `XTHB.validateConfig` first. Require exactly the group keys `genitals`, `lower_body`, `double_hole`, `whole_body`, and `mixed`; each maps only known leaf parts to finite weights in 0-1. Require exactly 16 uniquely numbered slots, each with `enabled`, `type`, `frequencyEnabled`, and a leaf-only routes map. Return a normalized copy rather than retaining the caller's object.

Define the leaf-part lookup for `mouth`, `breast`, `nipple`, `armpit`, `clitoris`, `vulva`, `vagina`, `urethra`, `anus`, `butt`, `penis`, and `prostate`. Accept configured virtual-group keys. Normalize each target to this complete shape:

```js
{
  part: 'vagina', effect: 'hold', intensity: 40, frequency: 0,
  rotateSpeed: null, rotateDirection: null,
  durationMs: 1000, rampUpMs: 0, rampDownMs: 0,
  pulseOnMs: 0, pulseOffMs: 0, priority: 0,
  blend: 'replace', baselineBlend: 'boost'
}
```

Use `Number(value)` plus global `isFinite`; reject rather than silently convert empty strings to timing or output values. Validate the entire message before returning success. A parsed, version-valid `stop_all` bypasses target validation so it can always clear output.

- [ ] **Step 4: Implement command requirements**

Require `source` for every command; require non-empty `eventId`, finite `sequence`, positive `durationMs`, and at least one target for `play`/`update`; require a finite sequence and targets array for `set_baseline`; apply the stop selector rules from the design. Unknown optional fields are ignored.

- [ ] **Step 5: Run parser tests and the full suite**

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: all parser and scaffold tests pass.

- [ ] **Step 6: Commit protocol validation**

```powershell
git add src/XToysUniversalBridge/10-protocol.es5.js tests/XToysUniversalBridge.Tests
git commit -m "feat: validate universal haptic protocol"
```

### Task 3: Logical command state and sequence handling

**Files:**
- Create: `src/XToysUniversalBridge/20-state.es5.js`
- Create: `tests/XToysUniversalBridge.Tests/state.test.js`

**Interfaces:**
- Consumes: normalized messages through `engine.applyMessage(message, nowMs, dryRun)`.
- Produces: `XTHB.createStateEngine()` with `baseline`, `events`, `applyMessage`, `expire`, `clearAll`, and `snapshot`.

- [ ] **Step 1: Write state-transition tests**

Test the following independent transitions:

```text
play -> active event with acceptedAt/expiresAt
newer update -> complete target replacement and new generation
duplicate/older update -> ignored
stop(eventId) -> remove complete source-scoped event
stop(eventId + targets) -> remove listed parts only
stop(targets) -> remove source-scoped events affecting those parts
set_baseline -> complete snapshot replacement
empty set_baseline -> clear baseline
stop_all -> clear baseline and all events
test -> return preview without mutating state
expire -> remove only events whose expiresAt <= now
```

Use `source + '\u001f' + eventId` as the transient key so unrelated Bridges cannot collide.

- [ ] **Step 2: Run state tests and confirm failure**

```powershell
node --test tests/XToysUniversalBridge.Tests/state.test.js
```

Expected: FAIL because `XTHB.createStateEngine` is undefined.

- [ ] **Step 3: Implement state storage without host calls**

Create plain-object maps with `Object.prototype.hasOwnProperty.call` checks. Store each transient target as:

```js
{
  source: source,
  eventId: eventId,
  sequence: sequence,
  acceptedAt: nowMs,
  expiresAt: nowMs + durationMs,
  generation: nextGeneration,
  target: target
}
```

Baseline entries store the complete normalized target and their accepted sequence. `snapshot()` returns a deep copy suitable for assertions and debug logging.

- [ ] **Step 4: Implement command semantics atomically**

Build the next baseline/event maps first and replace live maps only after the command succeeds. `dryRun=true` returns the proposed snapshot and changed logical parts without replacing live maps. `stop_all` increments the global generation after clearing both maps.

- [ ] **Step 5: Run state and full tests**

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit logical state**

```powershell
git add src/XToysUniversalBridge/20-state.es5.js tests/XToysUniversalBridge.Tests/state.test.js
git commit -m "feat: add haptic command state engine"
```

### Task 4: Group expansion, routing, arbitration, and mixing

**Files:**
- Create: `src/XToysUniversalBridge/30-routing.es5.js`
- Create: `tests/XToysUniversalBridge.Tests/routing.test.js`
- Modify: `tests/XToysUniversalBridge.Tests/fixtures/config.json`

**Interfaces:**
- Consumes: engine snapshot plus validated config through `XTHB.computeSlots(snapshot, config, nowMs)`.
- Produces: a 16-element array of resolved slot outputs with winner metadata and actuator values.

- [ ] **Step 1: Define a complete fixture configuration**

The fixture must contain exactly 16 slot records. Disabled slots remain present. Use this slot schema:

```json
{
  "id": 1,
  "enabled": true,
  "type": "intensity",
  "frequencyEnabled": true,
  "routes": { "clitoris": 1, "vulva": 0.8 }
}
```

Rotation slots use `"type":"rotation"` and `frequencyEnabled:false`. Group config maps every supported group key to leaf-part weights in 0-1.

- [ ] **Step 2: Write routing and arbitration tests**

Cover leaf-to-slot weight application, group-weight then route-weight order, disabled slots, missing actuator fields, multiple parts sharing one slot, two slots running independently, and deterministic transient tie-breaking by priority, effective value, then sequence/newness.

Add exact boost assertions:

```js
assert.equal(XTHB.mixValue(30, 20, 'boost'), 44);
assert.equal(XTHB.mixValue(30, 20, 'max'), 30);
assert.equal(XTHB.mixValue(30, 20, 'replace'), 20);
```

For rotation, assert that speed uses the same formulas while direction comes from the winning transient during its on phase and from baseline otherwise.

- [ ] **Step 3: Run routing tests and confirm failure**

```powershell
node --test tests/XToysUniversalBridge.Tests/routing.test.js
```

Expected: FAIL because `XTHB.computeSlots` and `XTHB.mixValue` are undefined.

- [ ] **Step 4: Implement group expansion and effective values**

Expand groups before routing. Deduplicate contributions by retaining their original event/part identity, then calculate:

```text
effective value = protocol value * group weight * route weight * global multiplier
```

Clamp once after multiplication. An intensity slot ignores a target without intensity; a rotation slot ignores a target without rotateSpeed and never infers it from intensity.

- [ ] **Step 5: Implement winners and resolved output schema**

Return each slot as:

```js
{
  id: 1, enabled: true, type: 'intensity',
  value: 44, frequency: 65, direction: null,
  rampUpMs: 300, rampDownMs: 500,
  pulseOnMs: 0, pulseOffMs: 0,
  baselineWinner: winnerOrNull,
  transientWinner: winnerOrNull,
  generation: generation
}
```

Baseline winner is highest effective value. Transient winner is highest priority, then effective value, then sequence, acceptedAt, and generation. `boost`, `replace`, and `max` apply only between the winning baseline and winning transient.

- [ ] **Step 6: Run routing and full tests**

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit routing and mixing**

```powershell
git add src/XToysUniversalBridge/30-routing.es5.js tests/XToysUniversalBridge.Tests
git commit -m "feat: route and arbitrate physical output slots"
```

### Task 5: Pulse scheduler, expiry, and generation-safe dispatch

**Files:**
- Create: `src/XToysUniversalBridge/40-runtime.es5.js`
- Create: `tests/XToysUniversalBridge.Tests/runtime.test.js`

**Interfaces:**
- Consumes: `XTHB.createRuntime(config, adapter, clock)`; normalized messages through `runtime.handle(payloadText)`; scheduler calls through `runtime.tick()`.
- Produces: adapter calls `applySlot(slotOutput, transition)` only when a physical output tuple changes.

- [ ] **Step 1: Write deterministic clock tests**

Use the harness clock to verify:

- A play command dispatches immediately.
- `tick()` at expiry returns to current baseline, not stale baseline or zero.
- Pulse on uses mixed transient output and pulse off uses baseline.
- Pulse boundaries use `(nowMs - acceptedAt) % (pulseOnMs + pulseOffMs)`.
- A newer generation cannot be zeroed by an older expiry.
- Clearing baseline with no transient sends zero.
- Two slots can have different expiry and pulse phases.
- Direction changes only after an explicit higher-sequence update.
- `test` produces a preview/log but no adapter output.
- Invalid messages never increase or change output.

- [ ] **Step 2: Run runtime tests and confirm failure**

```powershell
node --test tests/XToysUniversalBridge.Tests/runtime.test.js
```

Expected: FAIL because `XTHB.createRuntime` is undefined.

- [ ] **Step 3: Implement output tuple comparison**

Compare normalized physical fields rather than object identity:

```js
value, frequency, direction, rampSeconds, generation
```

Choose `rampUpMs / 1000` when value rises and `rampDownMs / 1000` when value falls or an event expires. Clamp ramp seconds to 0-600. Suppress repeated adapter calls when the tuple is unchanged.

- [ ] **Step 4: Implement runtime handle and tick**

`handle(payloadText)` parses, applies state, expires already-stale events, computes all affected slots, and dispatches changes. `tick()` expires events and recomputes pulse state for all slots. `stopAll()` clears state and dispatches zero with zero ramp to every enabled slot.

- [ ] **Step 5: Run runtime and full tests**

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit runtime scheduling**

```powershell
git add src/XToysUniversalBridge/40-runtime.es5.js tests/XToysUniversalBridge.Tests/runtime.test.js
git commit -m "feat: schedule pulses and event expiry"
```

### Task 6: XToys host adapter and public global functions

**Files:**
- Create: `src/XToysUniversalBridge/50-xtoys-adapter.es5.js`
- Create: `src/XToysUniversalBridge/90-global-entry.es5.js`
- Create: `tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js`

**Interfaces:**
- Consumes: XToys variable `xthb-config-json`; output Jobs named `xthb-output-01` through `xthb-output-16`.
- Produces: global functions `xtoysBridgeInit()`, `xtoysBridgeHandle(payloadText)`, `xtoysBridgeTick()`, `xtoysBridgeStopAll()`, `xtoysBridgeReloadConfig()`, and `xtoysBridgeTestSlot(slotId, value)`.

- [ ] **Step 1: Write adapter contract tests**

Assert that applying intensity slot 1 writes these exact variables before starting its Job:

```text
xthb-slot-01-value
xthb-slot-01-frequency
xthb-slot-01-ramp-seconds
xthb-slot-01-direction-code
xthb-slot-01-generation
```

The final action must be:

```js
{
  type: 'updateJob',
  job: 'xthb-output-01',
  action: 'start'
}
```

Direction codes are `1` for clockwise, `-1` for counterclockwise, and `0` when no direction action should run. Verify slot IDs outside 1-16 are rejected.

Load the rebuilt distribution and assert that `XTHB.MODULE_GLOBAL_ENTRY` is present and that all six public functions named in this task's Interfaces section exist as global functions. This is the first task that requires the Global Entry module.

- [ ] **Step 2: Run adapter tests and confirm failure**

```powershell
node --test tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
```

Expected: FAIL because the XToys adapter and globals do not exist.

- [ ] **Step 3: Implement the XToys adapter**

Read and parse `xthb-config-json` only during init/reload. `applySlot` sets all five variables before calling `updateJob`. Aggregate debug success counts and write errors immediately through `console.log`; respect `off`, `errors`, and `debug` log levels. Do not call `updateComponent`, `setMaxVolume`, or `setMaxRotationSpeed` from runtime code.

- [ ] **Step 4: Implement public globals**

Use one private global runtime reference. `xtoysBridgeInit()` validates configuration, creates the adapter/runtime, zeroes enabled slot variables, and starts each output Job once. `xtoysBridgeHandle(payloadText)` catches all exceptions and returns `1` for accepted or safely ignored input and `0` for invalid input. `xtoysBridgeTick()` returns the number of changed slots. `xtoysBridgeStopAll()` is idempotent.

- [ ] **Step 5: Implement dry-run slot testing**

`xtoysBridgeTestSlot(slotId, value)` clamps value to 0-100 and applies it only to the selected configured slot with zero frequency and zero ramp. This manual control is separate from protocol command `test`, which never drives hardware.

- [ ] **Step 6: Run adapter and full tests**

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
```

Expected: all tests pass and the distribution file rebuilds without differences on a second run.

- [ ] **Step 7: Commit the host adapter**

```powershell
git add src/XToysUniversalBridge tests/XToysUniversalBridge.Tests dist
git commit -m "feat: integrate universal runtime with XToys Jobs"
```

### Task 7: Protocol and one-time XToys template documentation

**Files:**
- Create: `docs/xtoys-protocol-v1.md`
- Create: `docs/xtoys-template-setup.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: public globals and variable/Job names from Task 6.
- Produces: exact setup steps for the single reusable XToys template and exact payload examples for game Bridge authors.

- [ ] **Step 1: Document protocol messages**

Include the fixed outer envelope, every target field, command semantics, limits, source/event/sequence behavior, and copyable examples for play, direction update, stop, baseline snapshot, baseline clearing, stop_all, and test. Every outer example must show the inner JSON escaped as a string.

- [ ] **Step 2: Document Global Trigger wiring**

Specify one Webhook Global Trigger filtered to action `xtoys_game_bridge`, map only:

```text
payload = {trigger-payload}
```

and run this inline Custom JavaScript:

```js
xtoysBridgeHandle(payload);
```

- [ ] **Step 3: Document the scheduler Job**

Create Job `xthb-scheduler` with one `START` step. Its Custom JavaScript Action calls `xtoysBridgeTick();`. A 0.1-second timed Trigger goes to the same `START` step, causing the action to run again. Initial Actions call `xtoysBridgeInit();` and start this Job; Final Actions stop this Job after calling `xtoysBridgeStopAll();`.

- [ ] **Step 4: Document all 16 output Jobs**

For each `xthb-output-NN` Job, the user adds the relevant block actions once:

- Intensity/rotation speed value: `{xthb-slot-NN-value}`.
- Ramp time: `{xthb-slot-NN-ramp-seconds}`.
- Optional E-Stim frequency: `{xthb-slot-NN-frequency}`.
- Clockwise direction Action only if `{xthb-slot-NN-direction-code} == 1`.
- Counterclockwise direction Action only if `{xthb-slot-NN-direction-code} == -1`.

State that independently controlled vibration and rotation actuators use separate slots. Several devices may be attached to one slot only when they must receive identical output.

- [ ] **Step 5: Document lifecycle safety actions**

List explicit Initial and Final block Actions that set every intensity/rotation speed and every frequency output to zero. State that these UI Actions are required even though the JavaScript also zeroes variables, because Final Actions remain a hardware-stop backstop if JavaScript throws.

- [ ] **Step 6: Update README and verify names**

Link the protocol and setup guides. Run:

```powershell
rg -n "xthb-(scheduler|output-|slot-|config-json)|xtoysBridge" README.md docs src/XToysUniversalBridge tests/XToysUniversalBridge.Tests
```

Compare every documented name with Task 6 tests; no alias or alternate spelling is allowed.

- [ ] **Step 7: Commit documentation**

```powershell
git add README.md docs/xtoys-protocol-v1.md docs/xtoys-template-setup.md
git commit -m "docs: add XToys universal template guide"
```

### Task 8: End-to-end acceptance suite and release artifact verification

**Files:**
- Modify: `tests/XToysUniversalBridge.Tests/runtime.test.js`
- Modify: `tests/XToysUniversalBridge.Tests/build.test.js`
- Modify: `dist/xtoys-universal-runtime.es5.js`

**Interfaces:**
- Consumes: built runtime exactly as a user pastes it into XToys.
- Produces: evidence that the first milestone satisfies the approved specification before any game adapter migration begins.

- [ ] **Step 1: Add a full webhook sequence test**

Load the built distribution file, initialize the 16-slot fixture, then send this sequence through `xtoysBridgeHandle`: baseline snapshot, two concurrent attacks on different parts, direction update on one rotation event, partial stop, expiry ticks, baseline clearing, and stop_all. Assert captured Job actions and variables after every step.

- [ ] **Step 2: Add failure and density tests**

Send malformed/oversized payloads and confirm captured output does not change. Send at least 500 valid updates over simulated time, assert deterministic final state, and assert success logs are aggregated rather than emitted once per message.

- [ ] **Step 3: Run all project validation**

```powershell
node --test tests/XToysUniversalBridge.Tests/*.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaBridge.UE4SS.Tests/Validate-ArunaBridge.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1
dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj
```

Expected: every command exits 0 with no failed tests.

- [ ] **Step 4: Verify the release artifact and safety boundary**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
git diff --exit-code -- dist/xtoys-universal-runtime.es5.js
rg -n "setMax|eval\(|Function\(|rotateReverse|setPattern|=>|\b(let|const|class|async|await)\b" dist/xtoys-universal-runtime.es5.js
```

Expected: deterministic build has no diff; the safety/ES6 search returns no matches.

- [ ] **Step 5: Commit acceptance coverage**

```powershell
git add tests/XToysUniversalBridge.Tests dist/xtoys-universal-runtime.es5.js
git commit -m "test: verify universal runtime acceptance flow"
```

- [ ] **Step 6: Prepare the user-assisted XToys smoke test**

Add a final checklist to `docs/xtoys-template-setup.md` covering: paste the built runtime into the XToys global JavaScript page; create one intensity slot and one rotation slot; start the Script; send the documented baseline/play/direction-update/stop_all examples; confirm intensity, ramp, direction, baseline restoration, and Final Action zeroing. Automated Task 8 completion records this checklist as pending user-assisted hardware validation rather than claiming real-device success. After the user performs it, record the tested XToys Script revision and any action-JSON differences before beginning game-adapter migrations.
