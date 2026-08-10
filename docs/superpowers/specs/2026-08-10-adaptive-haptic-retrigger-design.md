# Adaptive Haptic Retrigger Design

**Date:** 2026-08-10

**Status:** Approved in conversation; pending written-spec review

**Base:** XToys universal runtime after the runtime performance-hardening work

## 1. Goal

Make every explicitly marked discrete attack perceptible even when:

- a previous attack on the same logical part is still active;
- the new attack resolves to the same physical actuator tuple;
- the new attack is weaker than an attack already using the same physical channel;
- attack cadence is not known in advance; or
- attack cadence becomes too high for a separate full baseline-to-target envelope per hit.

The game Bridge continues to own game-specific intensity, duration, E-Stim frequency, rotation speed, rotation direction, and attack-profile selection. The XToys runtime owns cadence observation, current-baseline knowledge, physical-slot routing, shared-channel foreground arbitration, and execution of the resulting envelope.

This feature must remain bounded and efficient in XToys' ES5 JS-Interpreter. A perceptual improvement that causes scheduler backlog is not acceptable.

## 2. Non-goals

This work does not:

- change the existing `boost`, `replace`, or `max` formulas for ordinary events;
- change events that do not explicitly include a retrigger profile;
- add one XToys Job, Queue, Timer, or callback per attack;
- control device maximum intensity or maximum rotation speed;
- automatically invent rotation direction changes;
- combine several complete transient waveforms numerically on one physical channel;
- migrate DominatePlan or Aruna to protocol v1 in the same implementation change; or
- claim real-device acceptance without a user-assisted XToys and hardware test.

## 3. Compatibility and protocol shape

Protocol version remains `1`. A normalized transient target may contain an optional `retrigger` object:

```json
{
  "part": "clitoris",
  "effect": "hold",
  "intensity": 60,
  "durationMs": 500,
  "rampUpMs": 180,
  "rampDownMs": 80,
  "retrigger": {
    "mode": "adaptive",
    "minDropPercent": 25,
    "maxDropPercent": 100,
    "minRampUpMs": 30,
    "minRampDownMs": 20,
    "textureThresholdMs": 150,
    "quietResetMs": 600
  }
}
```

The game Bridge should define named profiles such as light, normal, or heavy in its own code, select one using game logic, and serialize the selected resolved values into each applicable attack target. XToys does not store game-specific named profiles.

The fields mean:

| Field | Meaning |
| --- | --- |
| `mode` | Must be `adaptive`. |
| `minDropPercent` | Shallowest drop used at rapid cadence, from 0 through 100. |
| `maxDropPercent` | Deepest drop used after a long interval, from `minDropPercent` through 100. |
| `minRampUpMs` | Shortest permitted rise time at rapid cadence. |
| `minRampDownMs` | Shortest permitted fall time at rapid cadence. |
| `textureThresholdMs` | Enter continuous-texture behavior below this observed average interval. Must be at least 100 ms. |
| `quietResetMs` | Forget cadence history after this quiet interval. Must be greater than `textureThresholdMs`. |

All seven fields in `retrigger` are required. This avoids runtime defaults that differ silently between game Bridges. A Bridge may still hide the complete values behind its own named profile constants.

The target's existing `rampUpMs` and `rampDownMs` are the longest rise and fall times used after a long interval. The retrigger minimums must not exceed those target values. All time fields remain finite and within the existing 0 through 600,000 ms protocol bound.

An adaptive retrigger target must use `effect: "hold"`. Combining explicit `effect: "pulse"` with `retrigger` is rejected as `invalid_retrigger_effect`, because two independent waveform clocks would otherwise compete.

The parser rejects an internally inconsistent profile as `invalid_retrigger`. If the minimum fall, one 100 ms scheduler allowance, and minimum rise cannot fit within `durationMs`, it rejects the target as `invalid_retrigger_timing`. A rejected message cannot change logical state, cadence state, envelope state, or physical output.

An older protocol-v1 runtime safely ignores the new optional object and retains its old state-oriented behavior. A new runtime preserves exact old behavior when `retrigger` is absent.

## 4. Ownership boundaries

### 4.1 Game Bridge

The game Bridge:

- detects the attack;
- chooses the logical target part;
- computes target intensity, duration, E-Stim frequency, rotation speed, and direction;
- selects a retrigger profile; and
- sends a higher sequence for an update or a new event identity for a play.

The Bridge does not know XToys slot IDs, device models, route weights, the current winning physical baseline, or which logical parts share a physical channel.

### 4.2 Logical cadence and same-part replacement

Cadence identity is the composite key `source + target.part`. It uses the exact protocol part name. A virtual group such as `genitals` and a leaf such as `clitoris` are different logical cadence identities even when they later contribute to the same physical slot.

When an accepted `play` or `update` target includes adaptive retrigger:

- it supersedes older transient entries from the same source with the same exact target part;
- superseded entries for that part are removed rather than merely losing arbitration;
- other targets retained by the older event remain active; and
- a superseded same-part attack cannot resume after the new attack expires.

This replacement rule is opt-in. A target without `retrigger` retains existing protocol-v1 coexistence and arbitration behavior.

### 4.3 Physical foreground ownership

Each of the sixteen physical slots can have at most one adaptive foreground owner. The newest accepted active retrigger target contributing to a slot owns that foreground regardless of ordinary transient priority or effective value. This makes a weaker new attack perceptible.

Targets for other logical parts remain in logical state. When the foreground owner stops or expires, routing recomputes the slot and restores the newest still-active retrigger target for a different part, or otherwise returns to ordinary priority/value arbitration and then baseline.

No explicit stack is required. Existing bounded event state plus deterministic accepted-time and generation ordering is the source of truth.

## 5. Bounded runtime state

The implementation adds two bounded state categories.

### 5.1 Cadence records

Each active or recently quiet `source + part` record stores only scalar values:

```text
lastAttackAt
averageInterval
mode
lastGeneration
```

No interval history array is retained. For a non-quiet subsequent attack:

```text
first observed interval: averageInterval = interval
later intervals: averageInterval = averageInterval * 0.75 + interval * 0.25
```

After `quietResetMs`, the next hit behaves as a new single hit and replaces the previous cadence estimate.

The cadence record uses the most recently accepted adaptive target's thresholds. Replacing a profile therefore affects the new attack immediately without rewriting earlier event data.

Cadence records are capped at `MAX_ACTIVE_EVENT_TARGETS` (currently 256). Before inserting at capacity, the runtime removes records beyond their quiet window, then deterministically evicts the oldest record that has no active transient target. Auxiliary cadence capacity must never reject an otherwise valid attack.

### 5.2 Slot envelopes

Envelope state is a fixed sixteen-entry structure keyed by output slot ID. A slot record contains only the current owner identity, generation, phase, phase deadline, resolved drop ratio, and primitive target/floor metadata required for the next transition.

Envelope state cannot grow with event count. A newer generation replaces the slot's pending phase; no old phase may later write over it.

## 6. Adaptive envelope calculation

Let `I` be the cadence record's average interval. For a new cadence record or `I >= quietResetMs`, use ratio `1`. Otherwise, outside texture mode:

```text
ratio = clamp(
  (I - textureThresholdMs) / (quietResetMs - textureThresholdMs),
  0,
  1
)

dropPercent = minDropPercent
  + (maxDropPercent - minDropPercent) * ratio

riseMs = minRampUpMs
  + (rampUpMs - minRampUpMs) * ratio

fallMs = minRampDownMs
  + (rampDownMs - minRampDownMs) * ratio
```

If the desired fall, scheduler allowance, and rise do not fit into the remaining transient lifetime, fall and rise are proportionally reduced but never below their declared minimums. The parser has already guaranteed that the minimum envelope can fit.

For a resolved physical attack target `T`, resolved winning baseline `B`, and normalized drop `D = dropPercent / 100`:

- `boost` floor: `B + (T - B) * (1 - D)`;
- `replace` floor: `T * (1 - D)`; and
- `max` floor: use the winning baseline anchor, with the documented limitation that a target not above baseline cannot be guaranteed perceptible.

A game Bridge that requires every discrete hit to be perceptible must use `boost` or `replace` for that profile. `max` remains accepted for compatibility, but it cannot create physical separation when its resolved target equals baseline without temporarily violating the requested baseline.

Values are clamped to 0 through 100 after routing and calculation.

If the slot is already at its resolved baseline and has no transient actuator output, the runtime skips an artificial baseline-to-baseline fall and immediately dispatches the attack target with its calculated rise. Otherwise it dispatches the floor immediately, records a rise deadline, and begins the rise on the first `handle` or scheduler `tick` at or after that deadline.

The 0.1-second scheduler remains the only time scheduler. No per-envelope timer is created.

## 7. Continuous texture

When `averageInterval < textureThresholdMs`, the cadence record and contributing slot enter texture mode.

Texture mode:

- alternates between the current resolved attack tuple and the `minDropPercent` floor tuple;
- uses `periodMs = max(200, 2 * averageInterval)` with equal target and floor halves;
- is sampled by the existing 100 ms scheduler, so physical transitions occur on the next tick and the fastest representable full cycle is approximately 200 ms;
- updates target strength, frequency, direction, expiry, and cadence when new attacks arrive;
- does not create or queue one envelope for every Webhook; and
- retains tuple suppression, so a sampled phase that resolves to the already-applied tuple produces no XToys Job call.

`textureStartedAt` is recorded once when the cadence identity enters texture mode. Same-part updates refresh target data and expiry without resetting its phase, preventing rapid Webhooks from pinning the texture permanently to its first half. Leaving texture mode, changing foreground to another part, stop, or expiry discards that phase origin.

An interval at or above the texture threshold exits texture mode and processes that new hit as an ordinary adaptive retrigger. If attacks stop, the foreground event expires normally; after the quiet window, cadence history is removed and the next attack starts as a single hit.

Input frequency beyond what a 100 ms scheduler can resolve saturates at the approximately 200 ms physical cycle. The runtime must not attempt to catch up by replaying missed hits.

## 8. Actuator-specific behavior

### 8.1 Intensity and E-Stim frequency

During a floor phase:

- intensity uses the calculated floor;
- frequency uses the current winning baseline frequency; and
- frequency is zero when there is no baseline or the slot does not enable frequency.

During the target phase, intensity and frequency use the foreground attack tuple. The runtime continues to control only current output and never device maximum intensity.

### 8.2 Rotation

Rotation speed uses the same adaptive depth and timing rules.

If the new attack direction equals the currently applied direction, the slot falls to its calculated speed floor and rises again without changing direction.

If direction changes:

1. the fall floor is forced to speed zero;
2. the fall retains the current direction;
3. the rise changes to the new explicit direction; and
4. the slot accelerates to the new target speed.

Texture mode varies speed without inventing alternating directions. A new opposite-direction attack replaces the old texture envelope, performs the zero-speed reversal sequence, and may then establish texture for the new direction.

The runtime never selects XToys rotation Patterns or changes maximum rotation speed.

## 9. Baseline, stop, failure, and reload behavior

Envelope drop is stored as a ratio, not as an irrevocable absolute baseline value. A `set_baseline` accepted during an envelope causes subsequent resolution to use the newest winning baseline. Clearing baseline changes the applicable anchor to zero.

`stop` removes the selected logical target and invalidates its envelope generation. The affected slot immediately recomputes and restores another valid foreground, ordinary transient winner, baseline, or zero using the applicable release behavior.

`stop_all`, XToys Script Final Actions, and safety zero-output paths take precedence over all envelopes and texture phases. They clear cadence and envelope state and force zero output with the existing zero-ramp stop semantics.

An adapter failure retains the exact failed physical tuple and transition as pending. A later tick retries it without advancing the logical envelope as though the physical step succeeded. A failed floor cannot silently advance to rise, and a failed rise cannot be marked applied. Existing per-slot failure isolation and generation floors remain in force.

Reload rollback must preserve or safely invalidate cadence and envelope generations in the same way it preserves current logical and physical runtime state. Invalid replacement configuration cannot leave a partially migrated envelope active.

## 10. Performance requirements

The feature is acceptable only if all of the following remain true:

- one existing 0.1-second scheduler Job is the only scheduler;
- there are no per-event XToys Jobs, Queues, timers, callbacks, or dynamically growing histories;
- cadence state is bounded to 256 records and normally cleaned after quiet windows;
- physical envelope state is fixed to sixteen slots;
- normal ticks do not request defensive logical snapshots or perform JSON deep copies;
- cadence and phase calculation use only constant scalar arithmetic per relevant record or slot;
- same-part supersession uses a composite-key ownership index rather than scanning unbounded history;
- each physical slot performs at most one adapter dispatch during one tick;
- a new adaptive hit performs at most one immediate floor dispatch per affected slot, with its later rise handled by the existing scheduler;
- identical physical tuples continue to be suppressed except for explicit forced safety and retry paths; and
- success logging remains aggregated rather than per attack or per phase.

The fixed sixteen-slot routing pass may remain until measurement proves it is the dominant cost. This design must not add a second full routing pass per tick merely for envelopes.

If user-assisted XToys testing shows a tick approaching or exceeding its 100 ms period, the implementation is rejected and must be simplified rather than increasing scheduler frequency.

## 11. Verification

### 11.1 Protocol and atomic validation

- Accept exact minimum and maximum retrigger field boundaries.
- Reject unsupported mode, invalid ranges, inverted minimum/maximum values, non-finite values, incompatible pulse, and impossible timing atomically.
- Prove old targets without `retrigger` normalize and execute exactly as before.
- Prove a built older-style payload remains valid under the new runtime.

### 11.2 Logical ownership

- Same-source, same-part adaptive play cancels the older part across different event IDs.
- Same-event higher-sequence adaptive update also counts as a new hit.
- Other targets in a multi-target old event remain active.
- Different source and exact-part identities do not cancel each other.
- A virtual group and overlapping leaf remain separate logical identities.
- Superseded generations cannot resume.

### 11.3 Envelope and shared channels

- A first attack at baseline rises directly with no useless floor dispatch.
- A physically equal new attack produces a floor followed by a rise.
- Long, medium, and rapid intervals produce exact deterministic depth and ramp values.
- A weaker new attack on another part temporarily owns a shared slot.
- The previous different-part attack resumes only if it is still active.
- Baseline replacement and clearing during fall, rise, and texture use the newest baseline.
- Expiry and explicit stop restore the correct next winner.

### 11.4 Continuous texture

- Exact entry and exit boundaries at `textureThresholdMs`.
- EMA calculation and quiet reset with a fake clock.
- Period lower bound of 200 ms and no catch-up replay.
- New hits update a running texture without increasing scheduler or envelope count.
- Identical sampled phases cause zero redundant adapter calls.

### 11.5 Actuators and safety

- E-Stim floor uses baseline frequency and target phase uses attack frequency.
- Rotation in the same direction varies speed only.
- Opposite rotation reaches zero before changing direction and rising.
- Pulse plus retrigger is rejected without output.
- Stop-all, Final Action, reload rollback, generation isolation, partial adapter failure, and retry remain safe.

### 11.6 Performance and release gates

- 128 active events and 256 active targets remain bounded.
- Sixteen simultaneous slot envelopes remain fixed-size.
- A high-frequency same-part benchmark proves no cadence or event growth.
- One thousand ticks with maximum active state perform zero logical-state deep copies.
- Job-call counts obey the per-handle and per-tick limits.
- All existing XToys, Aruna, and DominatePlan automated validators remain green.
- The ES5 runtime builds deterministically, committed `dist` exactly matches sources, and forbidden ES6/direct-device-action scans remain clean.
- User-assisted XToys tests cover at least one intensity device, one frequency-capable E-Stim output where available, one shared physical channel, and one rotation device where available. Missing hardware remains explicitly pending rather than claimed as passed.

## 12. Delivery sequence

1. Commit this design on an independent branch based on the performance-hardening branch; do not add it to Draft PR #2.
2. Add protocol validation, immutable normalized retrigger data, cadence records, and same-part ownership indexing.
3. Implement direct-rise and ordinary adaptive fall/rise envelopes with generation-safe retry.
4. Implement shared-channel foreground ownership and restoration.
5. Implement continuous texture and rotation reversal.
6. Rebuild the distribution, update protocol/template documentation, run all regression, capacity, performance, and release gates, then perform user-assisted XToys acceptance.
7. Migrate DominatePlan to universal protocol v1 first because its attacks are easier to reproduce deterministically.
8. Tune profiles using real observations, then migrate Aruna, whose haptic intent is derived from sampled deltas and batching.

Game-plugin migration is a subsequent design and implementation cycle. This specification defines the universal runtime behavior those migrations may target.
