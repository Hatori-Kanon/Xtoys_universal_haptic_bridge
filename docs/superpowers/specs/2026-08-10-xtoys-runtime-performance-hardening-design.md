# XToys Runtime Performance Hardening Design

## Goal

Bound the runtime's worst-case state size, remove repeated full-state serialization from hot paths, and avoid XToys Job calls when the physical actuator tuple did not change. The optimized runtime must preserve protocol v1 output, pulse, ramp, arbitration, retry, preview, and stop safety semantics.

## Platform constraints

- The built XToys runtime remains dependency-free ES5 and pasteable as one global JavaScript file.
- Do not use `Object.assign`, `Object.hasOwn`, destructuring, promises, async functions, timers created in JavaScript, or third-party immutable-data libraries.
- The existing 0.1-second `xthb-scheduler` Job remains the only time scheduler.
- `stop_all`, Script Final Actions, and failed zero-output retries retain priority over throughput optimizations.
- Public `snapshot()` and preview results remain defensive deep copies. Callers must never receive mutable references to live state.

## 1. Bounded retained state

Add these protocol/runtime constants:

| Constant | Value | Scope |
| --- | ---: | --- |
| `MAX_IDENTIFIER_LENGTH` | 128 characters | Stored `source` and `eventId` values |
| `MAX_STATE_LABEL_LENGTH` | 128 characters | Each optional diagnostic state label |
| `MAX_ACTIVE_EVENTS` | 128 | Distinct active `source + eventId` identities |
| `MAX_ACTIVE_EVENT_TARGETS` | 256 | Active transient target entries across all events |
| `MAX_BASELINE_SOURCES` | 64 | Sources retaining a baseline sequence fence |
| `MAX_BASELINE_TARGETS` | 256 | Persistent baseline target entries across all sources |

For every command except `stop_all`, the parser rejects an overlong `source`, `eventId`, or state label with a specific validation code. `stop_all` continues to require only the existing payload length, JSON object, protocol version, supported command, nonblank source, and optional `states` array containing at most 32 strings; it does not enforce the new per-string storage limits because none of those values are retained for an emergency stop.

Capacity checks are atomic and occur in the state engine before publication:

- Expired transient entries do not count toward active-event or active-target capacity.
- Replacing an existing event subtracts its currently active entries before evaluating the replacement.
- An `update` for an absent or fully expired event remains safely ignored.
- A new `play` or growing `update` that would exceed either transient limit is rejected with `state_capacity_exceeded` and cannot change logical or physical output.
- Replacing a source baseline subtracts that source's previous targets before applying the proposed complete snapshot.
- Existing baseline sources may continue to replace or clear their snapshot. A new baseline source beyond the source limit, or any snapshot exceeding the total baseline-target limit, is rejected atomically with `state_capacity_exceeded`.
- `stop`, `stop_all`, expiry, and clearing an existing baseline are never blocked by capacity limits.

The public global handler reports a capacity rejection as invalid input (`0`) and logs it according to the configured error level, matching other non-mutating protocol rejections.

## 2. ES5 copy-on-write state

State entries and normalized targets become immutable by convention after construction. No runtime code mutates an existing entry, target, or event array in place.

Use small ES5 helpers that copy only own properties:

- A shallow map copy copies the top-level map while sharing unchanged immutable values.
- `copyTarget(target)` is the only target-copy boundary used when state takes ownership of normalized message data.
- `createEventEntries(message, nowMs, generation)` and `createBaselineEntry(message, target)` are the only factories for retained state entries.
- A changed event receives a newly constructed target-entry array.
- A partial stop or expiry creates a new array only for the affected event.
- Baseline replacement creates new entries only for the replaced source.
- `completeEvent` constructs a replacement event exactly once.

Capacity evaluation and state construction are read-only until both succeed. Each operation computes totals and candidate maps in local variables, then calls `publish(...)` once. A rejection or construction error must leave the live maps, generation, snapshots, and physical output unchanged.

`expire(nowMs)` first performs a read-only scan. If nothing expired, it returns `changed: false` without cloning the event map or publishing state. If entries expired, it shallow-copies the event map once and replaces or deletes only affected arrays.

The state engine exposes an internal read-only state view for routing. The runtime uses this view for `computeSlots`; it does not request a defensive JSON snapshot on every handle or tick. The view is not exposed through any XToys global function. Public `engine.snapshot()`, `runtime.snapshot()`, dry-run results, and test previews continue to return deep copies.

Live state-operation results contain change metadata and error/rejection metadata but omit a full snapshot unless the caller requested a dry run or preview. This removes repeated `JSON.stringify`/`JSON.parse` passes from normal `play`, `update`, `stop`, baseline, expiry, and tick paths.

`runtime.handle` retains its current expiry safety semantics. Expiry may be combined with state application or made allocation-free when no entry expired, but it is not removed in favor of relying exclusively on the scheduler.

## 3. Physical dispatch suppression

Separate logical generation from physical actuator equality.

The physical tuple used to decide whether to call the adapter contains:

~~~text
value
frequency
direction
rampSeconds
~~~

A logical generation change alone does not restart an XToys output Job. When the physical tuple is unchanged, the runtime still updates its latest logical winner/ramp metadata so a later expiry or stop uses the correct ramp and winner identity.

Generation remains monotonic for actual adapter attempts, manual slot tests, retries, and forced resynchronization. A pending failed dispatch always bypasses normal duplicate suppression. `stopAll()` continues to force a zero tuple to every enabled slot, even if the cache believes that slot is already zero.

This pass continues to recompute all sixteen slots. Scheduler ticks need that behavior because pulse phase can change without logical state mutation, and the fixed slot count makes slot computation secondary to host-call suppression. A later measured optimization may use `changedParts` for normal messages, but it is explicitly outside this pass so failure retry and pulse behavior stay simple.

The dense-update acceptance test must no longer expect every logical generation to restart every enabled Job. It must prove that an unrelated unchanged rotation slot receives no repeated Job calls while affected intensity slots still produce the exact final values, ramps, frequency, ordering, and deterministic logs.

## 4. Failure and safety behavior

- Adapter exceptions remain isolated per slot; later slots still dispatch.
- Failed slots remain pending and retry on the next scheduler tick.
- A failed stop-to-zero is never circuit-broken or silently abandoned.
- Debug/error logging remains bounded and cannot interrupt output handling.
- No optimization may make an invalid or capacity-rejected message increase output.
- Configuration reload, manual test, force-resync, and partial-stop rollback keep their existing generation and retry guarantees.

Lifecycle naming may be simplified later, but this performance change does not alter public lifecycle functions or require a new health-check API.

## 5. Verification

Each optimization is implemented as an independent red-green-refactor cycle.

Required automated coverage:

1. Identifier and state-label length boundaries, including permissive `stop_all` behavior.
2. Exact transient event and target capacity boundaries; replacement, expiry, stop, and stop-all recovery at capacity.
3. Exact baseline source and target capacity boundaries; replacement and clearing at capacity.
4. Snapshot and preview mutation isolation after copy-on-write conversion.
5. No-allocation expiry fast path verified through deterministic state/view identity or injected copy counters rather than fragile wall-clock assertions.
6. Dense same-event updates suppress unrelated physical Job calls.
7. Multiple unique concurrent events remain deterministic at the configured maximum.
8. All existing pulse, ramp, rotation, retry, reload, manual-test, generation, and stop tests remain green.
9. The rebuilt distribution remains exact-source, LF-only, ES5-only, and free of forbidden direct hardware actions.
10. At transient event capacity, a successful `stop` immediately frees one event slot so the next `handle(play)` succeeds without an intervening tick; an expired event likewise does not create a false-full rejection.
11. Copy-on-write structural sharing: an old internal read-only view remains unchanged, an unaffected event array keeps its identity, an affected event array is replaced, and mutating the original message after acceptance cannot mutate retained state.
12. Both `handle` and `tick` use the same no-allocation expiry fast path when no event expired.

Add a non-gating Node benchmark command that reports same-event update throughput, unique-event admission throughput, and tick cost at several active-event counts. Timing numbers are diagnostic only because XToys runs through JS-Interpreter; correctness tests enforce structural bounds and dispatch counts instead of machine-dependent millisecond thresholds.

## 6. Explicitly excluded changes

- Changing the default `boost` formula or its three supported modes.
- Replacing ES5 own-property checks with modern syntax.
- Promise-based or asynchronous XToys adapters.
- Removing handle-time expiry safety.
- Pausing failed zero-output retries through a circuit breaker.
- Adding arbitrary unvalidated body-part names as part of this performance pass.

## 7. Deferred follow-up: perceptible equal-output retrigger

Protocol v1 is state-oriented. If one transient has already reached its target and a newly winning stimulus requests the same physical tuple, re-sending the same target with a different `rampSeconds` does not make XToys return to baseline first. The new stimulus can therefore be physically imperceptible even though its event identity is new.

This is a haptic-behavior feature, not a performance optimization, and must be designed after this hardening pass. The follow-up design will add an explicit optional retrigger envelope computed by the game Bridge, conceptually:

~~~text
current transient output
-> current winning baseline (or zero when absent)
-> optional baseline hold interval
-> new transient target using its ramp-up interval
~~~

The follow-up must define protocol fields, duration accounting, pulse interaction, rapid repeated-event cancellation, generation safety, intensity and rotation behavior, and the scheduler's 0.1-second resolution. Ordinary events will retain state-oriented duplicate suppression; only an explicit retrigger request may create the baseline-to-attack envelope.
