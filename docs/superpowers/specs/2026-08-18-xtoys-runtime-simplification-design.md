# XToys Runtime Simplification and Immediate Rotation Design

**Status:** Approved in conversation on 2026-08-18
**Supersedes:** the physical-dispatch generation, retry/resync, live reload, and zero-before-reverse portions of the earlier universal-runtime, performance-hardening, and adaptive-retrigger designs.

## 1. Purpose

Simplify the XToys-side ES5 runtime by removing reliability mechanisms that cannot observe the device and do not improve the actual haptic result. Keep only state that is required for protocol arbitration, adaptive haptic timing, duplicate-call suppression, manual testing, and independent per-slot exception isolation.

The main behavioral change is rotation reversal: when a new winning rotation attack requests the opposite direction, the new direction takes effect immediately. The runtime must not insert a zero-speed phase or wait for the old attack's ramp-down.

## 2. Reality boundary

XToys exposes synchronous JavaScript functions such as `setVariable(...)` and `callAction(...)`. Their normal return means only that the JavaScript call did not throw synchronously. It does **not** prove that:

- the XToys Job executed;
- the external device received the command;
- the device reached a requested speed or intensity;
- a ramp completed;
- a direction change physically occurred.

The implementation and documentation must therefore avoid terms such as “device confirmed”, “adapter-confirmed zero”, or “physical dispatch succeeded”. The accurate terms are “XToys call completed without a synchronous exception” and “XToys call threw”.

## 3. State that remains

### 3.1 Logical state

The existing protocol/state engine remains responsible for:

- baselines and finite events;
- source, event ID, sequence, acceptance time, expiry, and priority;
- same-part adaptive ownership and bounded cadence records;
- routing and shared-channel arbitration;
- logical generation used internally to order and identify state.

Logical generation remains entirely inside JavaScript. It must continue preventing removed or replaced logical events from regaining ownership. It is not written to XToys variables.

### 3.2 Bounded haptic state

The runtime retains at most one haptic envelope record per output slot, with a fixed maximum of sixteen records. A record may contain only the current logical owner, fall/rise/texture phase, phase timing, and primitive values needed to calculate the next current output.

This state is retained because adaptive fall/rise and texture directly affect the haptic experience. It must not contain a queue of previously failed physical commands.

### 3.3 Last completed call tuple

Each enabled slot may retain its last XToys-call tuple:

```text
value
frequency
direction
rampSeconds
```

This tuple exists only to suppress duplicate calls. It is updated only after all four `setVariable(...)` calls and the final `callAction(...)` return without a synchronous exception.

`rampSeconds` remains part of equality. The same target may arrive while an earlier physical ramp is still in progress, and a changed ramp parameter may need another Job start. Logical winner metadata is maintained separately from this primitive tuple.

## 4. State and APIs that are removed

Remove the following runtime mechanisms and their tests/documentation:

- physical generation and `xthb-slot-NN-generation`;
- generation floors and manual physical-generation reservation;
- ordinary pending-dispatch maps;
- haptic exact-tuple pending/retry maps;
- resync pending maps;
- `forceResync()`;
- `reserveSlotGeneration()`;
- persistent `recentFailures` state;
- reload rollback and old-runtime restoration;
- `stopRetryPending` and stopped/retry restoration state;
- live `xtoysBridgeReloadConfig()`;
- zero-before-reverse, release-only reversal, old-direction floor, and confirmation terminology;
- texture fields whose only purpose is replaying a failed old physical phase.

Current-call exceptions are logged immediately and do not require a retained failure collection or a failure-history API.

## 5. Rotation behavior

### 5.1 Winning output changes

When the winning logical identity of a rotation slot changes, including a higher-sequence update of the same event:

1. adopt the new winner's explicit direction immediately;
2. adopt the new winner's current resolved speed;
3. use the new winner's effective `rampUpMs` (the ordinary target value, or the adaptively shortened value when retriggering is active);
4. start the slot Job once for that scheduler/handle pass;
5. do not send an intermediate zero-speed command;
6. do not use or wait for the previous winner's `rampDownMs`.

This rule applies even when the new resolved speed is numerically lower than the previous speed. Winner replacement, rather than numeric comparison alone, selects the transition.

If the new winner has the opposite direction, direction and speed are delivered in the same Job refresh. No device acknowledgement is inferred.

### 5.2 No successor

When a rotation output loses its final winner and no baseline or older still-active event replaces it, use the departing winner's `rampDownMs` to reduce speed to zero. The zero tuple uses direction code `0` because no active logical direction remains.

### 5.3 Adaptive texture

Same-direction adaptive rotation may continue varying speed through the bounded texture envelope. When a different winning identity requests the opposite direction, discard the prior texture ownership immediately and calculate only the new winner's current output. Do not replay missed texture phases or the old winner's failed phase.

### 5.4 XToys Job ordering

For every rotation Job, configure actions in this order:

1. conditional clockwise/counterclockwise direction Action using `direction-code`;
2. rotation-speed Action using `value` and `ramp-seconds`.

The adapter writes all variables before starting the Job. This ordering avoids adding a template-level delay before direction switching, although XToys and the device still provide no atomicity or completion feedback.

## 6. Intensity and E-Stim behavior

Baseline blending, pulse, adaptive fall/rise, texture, frequency routing, same-part interruption, and different-part shared-channel restoration remain unchanged.

An adaptive phase advances only after its XToys call returns without a synchronous exception or is legitimately suppressed as identical to the last completed tuple. This is a JavaScript scheduling rule, not device confirmation. If the call throws, the envelope remains logically eligible, but the next pass recalculates the latest phase and current winner rather than replaying a stored old tuple.

Slots with `frequencyEnabled: false`, including all rotation slots, continue forcing frequency to `0`.

## 7. XToys adapter contract

Each slot uses exactly four Script variables:

```text
xthb-slot-NN-value
xthb-slot-NN-frequency
xthb-slot-NN-ramp-seconds
xthb-slot-NN-direction-code
```

Direction encoding is:

- `1`: clockwise;
- `-1`: counterclockwise;
- `0`: no active direction.

The adapter writes all four variables and then calls:

```json
{"type":"updateJob","job":"xthb-output-NN","action":"start"}
```

The variable writes and Job start are not transactional. If any call throws after earlier variables were written, the runtime does not update the slot's last tuple. The next pass writes a complete tuple calculated from the then-current logical state.

Each enabled slot is wrapped independently. One slot throwing must not prevent later slots from being calculated and called in the same pass.

## 8. Exception behavior without retry queues

For each slot:

1. calculate the latest logical winner and current adaptive phase;
2. compare the four-field tuple with the last completed tuple;
3. if changed, attempt the XToys calls inside a per-slot `try/catch`;
4. on normal return, update the last tuple;
5. on throw, leave the last tuple unchanged and log `xtoys_call_error` with the slot ID and exception detail.

There is no explicit retry queue. On the next handle/tick pass, the runtime recalculates the newest correct output. This may naturally attempt the same tuple again if it is still current, but an obsolete attack, direction, floor, or texture phase is never replayed merely because it previously threw.

If `callAction(...)` starts a Job and then throws, the next pass may start that latest Job again. Without an XToys/device acknowledgement API, duplicate latest-state application is safer and more honest than pretending to know what occurred.

Debug counters and messages must say “XToys slot calls completed without exception”, not “successful device updates”.

## 9. Global lifecycle

Keep exactly these public globals:

- `xtoysBridgeInit()`;
- `xtoysBridgeHandle(payloadText)`;
- `xtoysBridgeTick()`;
- `xtoysBridgeStopAll()`;
- `xtoysBridgeTestSlot(slotId, value, direction)`.

Remove `xtoysBridgeReloadConfig()` completely. XToys only permits configuration editing while the Script is stopped, so the runtime needs no live-reload policy, repeated-init guard, rollback, or restoration design. Each Script start runs `xtoysBridgeInit()` and reads the configuration normally through the native XToys lifecycle.

`xtoysBridgeHandle(...)` returns acceptance of the protocol message, not device execution. A per-slot XToys exception is logged but does not roll back accepted logical state or prevent independent slots from running.

`xtoysBridgeTick()` and `xtoysBridgeStopAll()` may return the number of slot calls that completed without a synchronous exception. That count is diagnostic only and is not a device-success count.

## 10. Stop safety

`stop_all` and `xtoysBridgeStopAll()` retain priority over normal arbitration. They:

- clear current baselines/events as already defined by protocol v1;
- preserve the accepted per-source baseline sequence fences already required by protocol v1;
- clear cadence and all slot haptic envelopes;
- attempt an immediate zero tuple for every enabled slot;
- isolate exceptions per slot;
- keep no retry or stopped-state machine.

Calling `xtoysBridgeStopAll()` again may send zeros again. This is a fresh best-effort safety action, not a retry protocol.

XToys Initial and Final UI Actions that explicitly zero physical outputs remain mandatory. They are the independent safety backstop when global JavaScript did not initialize or threw. They do not adjust device maximum intensity or maximum rotation speed.

## 11. Manual slot testing

The manual hardware helper becomes:

```js
xtoysBridgeTestSlot(slotId, value, direction)
```

Rules:

- `slotId` must identify an enabled configured slot;
- `value` is clamped to `0`–`100`;
- intensity slots ignore the optional direction argument and write frequency `0` with zero ramp;
- rotation slots with `value > 0` require exactly `clockwise` or `counterclockwise`;
- rotation slots with `value == 0` may omit direction and use direction code `0`;
- no direction is guessed or alternated;
- the helper affects only the selected physical slot and does not modify protocol state.

Before attempting the manual call, invalidate only that slot's last-tuple cache. The next scheduler tick therefore reasserts the latest game-controlled output even if the manual call partially writes variables or throws. This invalidation is not a resync subsystem and stores no pending command.

If the scheduler is not running, a nonzero manual test remains active until another command, an explicit zero test, `StopAll`, or XToys Final Actions changes it. No timer is added.

## 12. Performance constraints

The simplified runtime must preserve these hot-path bounds:

- at most sixteen haptic-envelope records;
- no failed-command queues or histories;
- no full logical-state deep copy during normal routing/dispatch;
- one current-output calculation per enabled slot per pass;
- at most one `updateJob` call per slot per pass;
- unchanged four-field tuples produce no variable writes or Job starts;
- no loop that replays missed adaptive or texture phases.

Removal of generation reservation, pending maps, resync maps, failure-copy arrays, and reversal phases should reduce ES5 object allocation and branching without weakening logical arbitration or Final Action safety.

## 13. Public return and logging semantics

- `xtoysBridgeInit()`: `1` when initialization completes, otherwise `0` with a configuration/runtime error log.
- `xtoysBridgeHandle(...)`: `1` when the message is valid and accepted, otherwise `0`; per-slot XToys call exceptions are logged separately.
- `xtoysBridgeTick()`: number of changed slot calls completed without a synchronous exception.
- `xtoysBridgeStopAll()`: number of zero-slot calls completed without a synchronous exception during that invocation.
- `xtoysBridgeTestSlot(...)`: `1` when the selected XToys call returns normally, otherwise `0`.

None of these values represent device acknowledgement.

## 14. Test replacement

Delete tests whose required behavior is removed: physical-generation monotonicity, exact failed-tuple replay, force-resync, reload rollback, stop-retry state, zero-before-reverse, and adapter confirmation wording.

Add or retain tests proving:

- an opposite-direction attack starts the new direction without an intermediate zero tuple;
- winner replacement uses the new winner's effective ramp-up even when its speed is lower;
- stopping/expiry immediately restores an older active attack or baseline, including the opposite direction;
- only the absence of every successor uses the departing winner's ramp-down to zero;
- opposite-direction replacement discards the old texture envelope;
- a thrown call in one slot does not block other slots;
- a thrown/partial call does not update duplicate suppression;
- the next pass calculates current state instead of replaying an obsolete command;
- repeated `StopAll` performs a fresh per-slot zero attempt without retained retry state;
- manual intensity and both rotation directions work and the next tick restores protocol state;
- the adapter writes exactly four variables before `updateJob`;
- no built artifact contains the removed global, physical generation variable, retry/resync symbols, or zero-before-reverse symbols;
- the sixteen-slot structural benchmark preserves the bounds in section 12;
- all protocol, state, routing, build, Aruna, and DominatePlan regression validators still pass.

Real XToys and hardware behavior remains a user-assisted acceptance step. Automated tests may only claim JavaScript output shape, ordering, and exception behavior.

## 15. Template migration

Existing universal XToys templates do not need new per-game Jobs. Migration consists of:

1. replace the global JavaScript with the rebuilt distribution;
2. remove all `xthb-slot-NN-generation` variables;
3. remove any Custom Action that calls `xtoysBridgeReloadConfig()`;
4. ensure every rotation Job places its conditional direction Action before its speed Action;
5. retain the scheduler, sixteen output Job names, Initial zero Actions, and Final zero Actions;
6. use the new three-argument manual helper when testing rotation slots.

Configuration editing continues through XToys' existing stop-edit-start workflow; the bridge adds no second lifecycle on top of it.
