# Final fix wave report — universal runtime review findings

## Status

The five Important final-review findings and the README status finding are addressed in one consolidated wave. Automated host-side behavior is covered; user-assisted validation in XToys and on real hardware remains pending, and no hardware success is claimed.

## RED evidence

The adversarial tests were added before production changes and run together:

```text
node --test tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
60 tests: 54 passed, 6 failed
```

The six expected failures proved:

- protocol `test` produced zero-value slots with no winners and no ephemeral state entry;
- an absent `update` returned `changed: true` and created an event/output;
- `('a', 'b\u001fc')` and `('a\u001fb', 'c')` collapsed into one event;
- a partially failed pulse-off dispatch was forgotten when the next desired tuple equaled the last successful tuple;
- a partially failed manual slot test left `xtoysBridgeStopAll()` short-circuited;
- the state-level preview snapshot lacked the requested target.

## GREEN implementation and evidence

- `test` targets are represented by a generation-new ephemeral event in the returned snapshot, then routed normally. Exact group-expanded values, actuator fields, and transient winners are asserted for slots 1–3. The live state, adapter calls, and following tick remain untouched.
- `update` now requires a live, unexpired source/event identity. Missing, stopped, and expired events are ignored without producing output; higher-sequence replacement of an active event remains covered.
- Composite storage keys, baseline sequence keys, stop lookup, and routing tie identities use JSON-encoded arrays. This is ES5-safe, unambiguous, and cannot produce prototype property names.
- Tuple suppression is allowed only when no dispatch is pending. Pending state is removed only after `applySlot` returns successfully, preserving retry and generation-floor behavior after partial observable writes.
- A failed manual slot attempt leaves the runtime cache dirty and clears the public stopped guard, so immediate `xtoysBridgeStopAll()` force-writes complete zero tuples.
- README status now records the implemented/passing automated milestone and explicitly leaves real XToys/hardware validation pending.

Focused GREEN:

```text
node --test tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
60 passed, 0 failed

node --test tests/XToysUniversalBridge.Tests/protocol.test.js tests/XToysUniversalBridge.Tests/state.test.js tests/XToysUniversalBridge.Tests/routing.test.js tests/XToysUniversalBridge.Tests/runtime.test.js tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js
80 passed, 0 failed
```

The pre-commit complete Node run was 86/87. Its only failure was the intentional committed-artifact assertion comparing the modified sources with `HEAD:dist`; the post-commit result is recorded below.

## Project validation

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaBridge.UE4SS.Tests/Validate-ArunaBridge.ps1
Aruna UE4SS bridge static validation passed

powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1
Aruna external probe static validation passed

powershell -NoProfile -ExecutionPolicy Bypass -File tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1
Aruna UE4SS probe static validation passed

dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj
All tests passed
```

Two consecutive builds were byte-identical. SHA-256:

```text
CE5F37053F5BCCF0105F140D6A6353BDFB848648CF23461C3EF7C05824C73A9B
```

The forbidden hardware/ES6 scan and production `\u001f` scan both returned zero matches. `git diff --check` exited 0.

## Committed-artifact verification

The initial consolidated commit candidate was `f1ee87d`. With the runtime and distribution present in `HEAD`, the complete Node command passed its committed and worktree artifact checks:

```text
node --test tests/XToysUniversalBridge.Tests/*.test.js
87 passed, 0 failed
```

The report-only amendment does not alter runtime sources or the distribution. The final handoff records the amended commit SHA and a fresh final verification run.

## Concerns

- Snapshot object keys intentionally change from delimiter-concatenated strings to JSON array encodings. Consumers should treat snapshot maps as opaque identity maps and use entry metadata for source/event information.
- Protocol `test` preview winners use `eventId: null` and never publish to the live engine.
- Real XToys UI Action JSON compatibility and physical device behavior remain pending the documented user-assisted smoke test.
