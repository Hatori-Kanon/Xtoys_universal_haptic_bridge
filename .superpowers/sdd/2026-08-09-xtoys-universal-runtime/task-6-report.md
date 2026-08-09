# Task 6 report: XToys host adapter and public global functions

## RED

- Added adapter/global contract tests before production modules existed.
- The first targeted run had 3 failures: two reported `XTHB.createXToysAdapter is not a function`, and the global-entry test found `XTHB.MODULE_GLOBAL_ENTRY` undefined.
- Added lifecycle and failure-contract tests after the initial adapter/global surface was green. The second RED had 7 expected failures against the placeholder globals.
- Added focused RED cases for debug preview logging and atomic reload when an old slot cannot be zeroed; each failed for the missing behavior before its minimal implementation.

## GREEN

- Added `50-xtoys-adapter.es5.js`. Every slot application writes value, frequency, ramp seconds, direction code, and generation in that order before starting `xthb-output-NN` with `updateJob`.
- Added `90-global-entry.es5.js` with one private runtime/config/adapter set and all six true global functions.
- Init/reload are the only readers of `xthb-config-json`. Init validates, creates the adapter/runtime, and starts every enabled zeroed output Job once.
- Reload validates before replacement, zeros outputs removed by the new configuration, preserves the old runtime if that safety zero fails, and does not let invalid JSON/configuration damage the active runtime.
- Global calls catch host/runtime/logging failures. Handle returns `1` for accepted or safely ignored input and `0` for invalid input. Adapter failures remain per-slot retryable through tick.
- `xtoysBridgeStopAll()` is idempotent. Manual slot testing clamps to 0-100, emits zero frequency/ramp and no direction, and rejects disabled/out-of-range/invalid selections. Protocol `test` remains preview-only.
- Logging honors `off`, `errors`, and `debug`; errors are immediate, successful slot updates are emitted in batches of 100, and console failures are contained.

## Verification

- `node --test tests/XToysUniversalBridge.Tests/xtoys-adapter.test.js` — 12 passed, 0 failed.
- `node --test tests/XToysUniversalBridge.Tests/*.test.js` — 59 passed, 0 failed.
- Three additional consecutive full-suite repetitions each passed 58/58 before the final reload-safety regression was added.
- Two consecutive `scripts/Build-XToysRuntime.ps1` runs produced identical SHA-256 `431D02DAB3B2C8EDF576439286710EE5E2DEB69EC0F809230900566741953B52`.
- Forbidden Action/ES6 scan found no `updateComponent`, `setMaxVolume`, `setMaxRotationSpeed`, other prohibited control calls, or ES6 syntax.
- `git diff --check` and `git diff --cached --check` passed.

## Commit

- `f729583 feat: integrate universal runtime with XToys Jobs`

## Self-review and concerns

- The adapter never changes XToys device maximum intensity or maximum rotation speed; all hardware routing uses prebuilt output Jobs.
- A single transient full-suite run observed `XTHB` undefined while independent test files were concurrently rebuilding the checked-in distribution. Three immediate full-suite repetitions and the final full suite passed. This appears to be the existing build script's direct-write race and was not expanded into Task 6 build-infrastructure work.
- Real XToys/JS-Interpreter and hardware validation remains user-assisted acceptance work; no hardware success is claimed here.

## Formal review round 1

### RED

- Added global regressions for explicit and protocol `stop_all` failures. Both showed the public layer marking the runtime stopped after a partial zero, so a second stop returned `0` instead of retrying the failed slot.
- Added a two-removed-slot reload regression. After slot 01 was zeroed and slot 02 failed, reload kept the old logical runtime but did not redispatch its cached slot 01 value.
- Added a one-shot manual test regression. After manual output, the next tick returned `0` because the selected runtime tuple remained cached.
- Added coercion cases for booleans, arrays, objects, null, blanks, NaN, and infinities. The old `Number(value)` path accepted coercive values such as `true`.
- Added runtime API contracts for deep-copied recent failures, selected-slot cache invalidation, and complete forced resynchronization. The APIs were absent.
- Added a deterministic build-structure test. The old script failed immediately because it had no cross-process Mutex, unique temporary publisher, atomic replacement, or guaranteed cleanup.
- The first combined focused RED had 27 passes and 8 failures, each corresponding to one of these missing contracts.

### GREEN

- Runtime now exposes copied recent failures, per-slot cache invalidation, and forced full enabled-slot resynchronization without direct host calls. Existing numeric `stopAll()` return behavior is unchanged.
- Global stop state remains retryable while stop dispatch failures exist. A second explicit stop or a stop following protocol `stop_all` retries the pending zero and becomes idempotent only after all failures clear.
- Failed reload installation forces the old runtime to redispatch its current complete snapshot, restoring any earlier removed-slot zero that succeeded before a later failure. Restoration failures stay isolated and retryable.
- Successful manual slot tests invalidate only the selected runtime tuple, making the control one-shot; the next tick restores protocol-computed state. Failed manual applies do not invalidate runtime state.
- Manual slot inputs now accept only finite numbers or nonblank numeric strings before range/integer validation and value clamping.
- Build publication now uses a named cross-process Mutex, a GUID `.tmp`, a nonempty unique `.bak`, `File.Replace`, and `finally` cleanup plus Mutex release/disposal. UTF-8 output remains BOM-free and deterministic.
- Windows replacement can make the path transiently return ENOENT/EBUSY. Every test reader call therefore uses a bounded retry and must ultimately obtain source containing the actual `ns.MODULE_GLOBAL_ENTRY` marker and execute it successfully in a VM; raw unreadable results are never counted as success.

### Verification

- Focused build suite: 4 passed, 0 failed, including 12 concurrent PowerShell builders with continuous complete-dist reads and VM execution.
- Focused runtime/adapter suites: 32 passed, 0 failed.
- Final full suite: 69 passed, 0 failed on each of three consecutive runs. Every run included the concurrent build/read stress.
- Two final builds produced identical SHA-256 `4EE272807300279CBB4CB1B356DB12EEAC4AEB17EC2F20F13E7CC9A84E68E248`.
- UTF-8 BOM check passed; no `.tmp` or `.bak` files remained.
- Forbidden Action/ES6 scan and both working-tree and staged diff checks passed.

### Commit

- `e05cc23 fix: harden XToys lifecycle synchronization`

### Concerns

- No known automated-contract gaps remain from review round 1.
- Real XToys/JS-Interpreter and hardware behavior still requires the planned user-assisted acceptance test; no device validation is claimed.

## Formal review round 2

### RED

- Preserved the 160-line Round 2 test patch already present in `build.test.js` and `xtoys-adapter.test.js` and ran it before production changes.
- The first focused run had 43 tests: 36 passed and 7 failed. The failures covered build cleanup, stale-but-complete distribution rejection, two partial-stop reload outcomes, and three manual-generation reservation outcomes.
- The stale-distribution fixture's `ns.VERSION = '1.0.0';` marker matched the current source; its initial `distributionMatchesSources is not a function` error was the expected missing-helper RED, not a fixture typo.

### GREEN

- Runtime now owns a per-slot physical generation floor. Manual writes reserve through the runtime, invalidate the selected logical tuple even when the manual adapter call fails, and every recovery/retry/logical update after a reservation advances beyond the latest physical generation without a magic constant.
- Failed reload rollback now preserves both `stopped` and pending-stop intent. A successful forced resync completes a prior partial stop, a failed resync retains its retry, and an ordinary active rollback remains active.
- Build publication records the original build failure and the first cleanup failure while independently attempting temporary and backup deletion. Nested `finally` blocks always attempt Mutex release and disposal, with the original build error taking precedence.
- The harness reconstructs the exact expected distribution from the current sorted ES5 sources and compares exact content plus SHA-256 under bounded retry. The concurrent reader uses that helper and still executes the accepted distribution in a VM.

### Verification

- Focused runtime/adapter suites: 37 passed, 0 failed.
- Focused build suite: 6 passed, 0 failed, including 12 concurrent builders with exact-current-source reads and VM execution.
- Full suite: 76 passed, 0 failed in the requested single Round 2 run.
- Two consecutive builds produced identical SHA-256 `3745E880B3F04683961E6E5AA126F28CB52C2DB5ED13D870B778B222017AC999` and matched the exact current source reconstruction.
- UTF-8 BOM check passed; no `.tmp` or `.bak` files remained; forbidden Action scan and `git diff --check` passed.

### Commit

- `fix: preserve monotonic XToys generations`

### Concerns

- No known automated-contract gaps remain from formal review round 2.
- Cleanup failure control flow is contract-tested and normal/concurrent publication is exercised; an operating-system-level forced file-deletion failure is not injected by the suite.
- Real XToys/JS-Interpreter and hardware validation remains user-assisted acceptance work; no device validation is claimed.
