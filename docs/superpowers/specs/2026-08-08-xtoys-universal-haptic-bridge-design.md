# XToys Universal Game Haptic Bridge Design

Date: 2026-08-08  
Status: Awaiting written-spec review

## 1. Purpose

Build one reusable XToys Script template that accepts a stable, device-independent game haptics protocol. New games implement only a game-side Bridge that translates their combat and status systems into this protocol. They do not require new XToys routing or device-control scripts.

The system must support:

- Different engines and combat models.
- Fine-grained body parts such as breast versus nipple and clitoris versus vulva versus vagina.
- Several devices and independently addressable subchannels.
- Several body parts sharing one physical channel when there are fewer devices than logical parts.
- Per-target intensity, duration, E-Stim frequency, rotation speed, rotation direction, ramps, and pulse timing computed by the game Bridge.
- Persistent baseline output for game states such as heat or aphrodisiac effects.
- Temporary attacks that remain perceptible above a baseline and return to it when they finish.

## 2. Non-goals

The first version will not:

- Replace XToys device discovery, connection, or device protocol support.
- Detect whether a game process is running.
- Automatically start or stop the XToys Script.
- Track game sessions, heartbeats, or connection leases.
- Modify the XToys maximum-intensity setting of any device.
- Modify the XToys maximum-rotation-speed setting of any device.
- Apply separate script-side E-Stim safety caps.
- Execute JavaScript supplied by a webhook message.
- Fully combine several concurrent transient attack waveforms on one physical channel.
- Select XToys rotation Patterns or invent automatic direction changes that were not requested by the game Bridge.

The user manually starts and stops the XToys Script. Script Initial and Final Actions set every output to zero.

## 3. System boundary

~~~text
Game runtime
  -> game-specific Bridge
  -> XToys webhook
  -> one XToys Global Trigger
  -> one global ES5 JavaScript dispatcher
  -> logical body-part state
  -> routing and physical-output arbitration
  -> physical output-slot Jobs
  -> XToys-connected devices and subchannels
~~~

### 3.1 Game Bridge responsibilities

Each game Bridge discovers and interprets game-specific state. It emits complete but device-independent haptic intent:

- Body part or virtual body-part group.
- Intensity from 0 to 100.
- Total effect duration.
- Normalized E-Stim frequency from 0 to 100.
- Desired rotation speed from 0 to 100 and an explicit clockwise or counterclockwise direction.
- Ramp-up and ramp-down durations.
- Pulse on/off timing.
- Effect priority.
- Transient blending intent.
- Baseline blending intent.
- Event identity and update ordering.

The Bridge may use arbitrary game logic to produce these values, including damage, EP, attack animation length, combo timing, restraint phase, climax state, and abnormal status effects.

The Bridge must not know XToys channel names, connected device models, the number of connected devices, physical body-part assignments, or the user's XToys maximum-intensity and maximum-rotation-speed settings.

### 3.2 XToys template responsibilities

The XToys template:

- Parses and validates the common protocol.
- Stores persistent baseline and finite transient states per logical part.
- Expands virtual groups to leaf parts.
- Routes logical parts to configured physical output slots.
- Selects the winning baseline and transient contribution for each output slot.
- Mixes the winning transient with the winning baseline.
- Translates winning rotation intent into XToys rotation-speed and direction Actions.
- Starts or refreshes output-slot Jobs.
- Returns outputs to baseline or zero when transient effects finish.
- Sets all outputs to zero when the XToys Script stops.

### 3.3 XToys device responsibilities

XToys remains responsible for physical connection, reconnection, device compatibility, device-specific calibration, and enforcing the user's configured maximum intensity and maximum rotation speed.

The universal script controls current output parameters only. It never calls an Action that changes a device's maximum-intensity or maximum-rotation-speed setting.

## 4. XToys integration shape

XToys Custom Code Actions can only use trigger values explicitly mapped into the Action. Functions cannot be defined in an inline Custom Code Action; reusable functions live in the Script's global JavaScript page.

To avoid mapping every protocol field in the XToys UI, the webhook uses a two-field envelope:

~~~json
{
  "action": "xtoys_game_bridge",
  "payload": "{...escaped inner JSON...}"
}
~~~

The Global Trigger filters on the fixed "xtoys_game_bridge" action. Its Custom Code Action maps only:

~~~text
payload = {trigger-payload}
~~~

The inline Custom Code passes payload to a global handler. The global handler uses JSON.parse and never uses eval.

The fixed outer action is a transport namespace, not a gameplay event. Gameplay meaning is carried by the inner command and target fields. Protocol upgrades use protocolVersion, so the XToys Trigger does not need to change.

## 5. Inner protocol

### 5.1 Common message fields

The decoded payload object contains:

| Field | Type | Meaning |
| --- | --- | --- |
| protocolVersion | number | Must be 1 for this design. |
| command | string | play, update, stop, stop_all, set_baseline, or test. |
| source | string | Stable game/Bridge identifier used for logging. |
| eventId | string | Identity of a finite transient event when applicable. |
| sequence | number | Monotonic revision within an event or baseline stream. |
| states | array of strings | Optional diagnostic labels for abnormal states. |
| targets | array | Target effect definitions. |

No game-process lifecycle or session identifier is required. Event IDs must be unique enough that a new event is not confused with a recently active event.

### 5.2 Target fields

Each target contains:

| Field | Type | Range/default | Meaning |
| --- | --- | --- | --- |
| part | string | Required | Leaf part or supported virtual group. |
| effect | string | hold | Semantic/debug label; hold and pulse are executable v1 shapes. |
| intensity | number | 0-100 | Game-computed desired intensity. |
| durationMs | number | Required for transient commands | Total transient lifetime. |
| frequency | number | 0-100, default 0 | Normalized frequency for frequency-capable outputs. |
| rotateSpeed | number | 0-100, optional | Desired speed for rotation outputs. When absent, the target does not contribute to a rotation output. It is not inferred from intensity. |
| rotateDirection | string | Required when rotateSpeed is greater than 0 | clockwise or counterclockwise. The game Bridge explicitly chooses the direction. |
| rampUpMs | number | Default 0 | Time to reach the target contribution. |
| rampDownMs | number | Default 0 | Time to release the target contribution. |
| pulseOnMs | number | Default 0 | Pulse-on interval. |
| pulseOffMs | number | Default 0 | Pulse-off interval. |
| priority | number | Default 0 | Transient arbitration priority. |
| blend | string | replace | How an update to the same event/part combines with its previous transient target; v1 supports replace and max. |
| baselineBlend | string | boost | How the winning transient combines with baseline: boost, replace, or max. |

All values are desired protocol values. XToys device configuration performs final physical scaling.

The game Bridge directly owns rotation-speed and direction logic. To reverse a running rotation, it sends an update for the same eventId with a higher sequence and the new rotateDirection. The XToys dispatcher does not implement rotateReverseMs, implicit alternation, or Pattern selection.

### 5.3 Commands

- play creates or replaces a finite transient event. durationMs starts when XToys accepts the message.
- update changes an existing transient event identified by eventId. A lower or duplicate sequence is ignored.
- stop removes transient state and applies the relevant ramp-down behavior. With eventId alone it removes that complete event. With eventId plus targets it removes only the listed parts from that event. Without eventId it removes all transient events affecting the listed target parts.
- stop_all removes all transient and baseline state and sends every output slot to zero. It always takes precedence over normal priority.
- set_baseline replaces the complete persistent baseline snapshot. Parts missing from the new snapshot no longer have baseline output. An empty targets array clears baseline output.
- test parses, validates, expands, routes, and logs a message without starting a physical output Job.

## 6. Body-part model

The initial leaf-part vocabulary is:

~~~text
mouth
breast
nipple
armpit
clitoris
vulva
vagina
urethra
anus
butt
penis
prostate
~~~

The initial virtual groups are:

~~~text
genitals
lower_body
double_hole
whole_body
mixed
~~~

A game Bridge emits a leaf part whenever the game provides reliable detail. It emits a group only when the game cannot distinguish the affected leaf parts.

Group expansion is user-configurable in XToys. A group maps to leaf parts with weights. Group weights are applied before leaf-to-output routing weights.

The vocabulary can be extended in later protocol versions without renaming existing keys. Left/right variants are deferred until a target game or device layout requires them.

## 7. Baseline model

Abnormal game states such as heat, aphrodisiac effects, curses, or persistent arousal are represented by a complete baseline snapshot.

The game Bridge combines all game-specific abnormal states into the final baseline target values. XToys does not need to understand or stack the meaning of individual status names. The optional states array is diagnostic only.

Baseline state persists until:

- A later set_baseline snapshot replaces it.
- An empty baseline snapshot clears it.
- stop_all is received.
- The user stops the XToys Script.

There is no heartbeat or lease for baseline state in v1.

## 8. Physical output slots and routing

The template prebuilds 16 physical output slots. Unused slots are disabled.

Each independently controllable device actuator or subchannel connects to exactly one output slot. A dual-channel E-Stim unit therefore consumes two output slots when both channels are controlled independently. A device with independently controlled vibration and rotation also consumes separate output slots for those actuators.

One output slot may:

- Subscribe to one or more leaf parts.
- Assign a routing weight to each subscribed part.
- Connect to several devices when those devices should receive the exact same output.
- Declare its output type: intensity or rotation.
- For an intensity output, declare whether it accepts frequency output.

Example:

~~~text
Output-1 -> vibrator A
  nipple: 1.00
  breast: 0.75

Output-2 -> E-Stim channel A
  clitoris: 1.00
  vulva: 0.80
  vagina: 0.60

Output-3 -> rotator A
  vagina: 1.00
~~~

An intensity slot reads intensity and optional frequency. A rotation slot reads rotateSpeed and rotateDirection. A single logical target may contain both kinds of fields and therefore drive independently routed intensity and rotation slots without knowing their XToys channel names.

For a rotation slot, the dispatcher emits the confirmed XToys speed Action shape:

~~~json
{
  "type": "updateComponent",
  "channel": "<configured-rotation-channel>",
  "action": "setVolume",
  "rampTime": 0.5,
  "percentVolume": "60"
}
~~~

Protocol ramp milliseconds are divided by 1000 for rampTime, and the clamped rotation speed is serialized as percentVolume. Direction uses a separate updateComponent/setDirection Action. The protocol vocabulary remains clockwise/counterclockwise; the adapter maps those values to the exact XToys Action literals. Stopping rotation sends setVolume with percentVolume "0" and the applicable ramp time. The dispatcher never emits XToys setMaxRotationSpeed.

The same physical subchannel must not be connected to several output slots. Shared-part behavior is implemented in the routing matrix and output arbitration, not by sending competing Jobs to the same device channel.

## 9. Arbitration and mixing

### 9.1 Effective output value

Before arbitration, each logical contribution is multiplied by its group-expansion weight and leaf-to-output routing weight. Intensity slots use intensity; rotation slots use rotateSpeed.

~~~text
effective value = protocol value * group weight * routing weight
~~~

The result is clamped to the protocol range 0-100.

### 9.2 Baseline selection

If several baseline parts map to the same output slot, the slot chooses the baseline candidate with the highest effective value. For an intensity slot, that candidate supplies intensity, frequency, and ramp parameters. For a rotation slot, it supplies rotation speed, direction, and ramp parameters.

### 9.3 Transient selection

If several transient events map to the same output slot:

1. Choose the highest priority.
2. Among equal priorities, choose the highest effective value for that output type.
3. On a remaining tie, choose the higher sequence or newer accepted update.

The winning transient supplies its complete actuator tuple. For intensity slots this is intensity, frequency, ramps, and pulse timing. For rotation slots it is rotation speed, direction, ramps, and pulse timing. Several transient waveforms are not numerically added in v1.

### 9.4 Baseline/transient mixing

The default baselineBlend is boost. Let B be the winning effective baseline intensity and A the winning effective transient intensity:

~~~text
output = B + A * (100 - B) / 100
~~~

This preserves baseline, makes every non-zero attack perceptible, and uses only the remaining protocol headroom.

| Baseline | Attack | Boost output |
| ---: | ---: | ---: |
| 0 | 20 | 20 |
| 30 | 20 | 44 |
| 30 | 65 | 75.5 |
| 80 | 20 | 84 |
| 80 | 100 | 100 |

Other modes:

- replace: output is A; the transient completely owns the output while active.
- max: output is max(B, A).

The same formulas apply to normalized rotation speed. Rotation direction is not numerically mixed: while a transient owns a rotation slot, the slot uses the winning transient's explicit direction; during pulse-off intervals and after the transient ends, it returns to the winning baseline direction. If there is no applicable rotation contribution, speed is zero.

While a boost pulse is on, its transient contribution is mixed with baseline. During its off interval, output returns to baseline. The frequency and other waveform parameters follow the transient during the on interval and the baseline during the off interval. When the transient ends, the slot returns to baseline using the applicable ramp behavior.

## 10. Runtime state and Job behavior

JavaScript stores logical state separately from physical output state.

Each transient records:

~~~text
eventId
sequence
part
effect parameters
accepted time
expiry time
generation
~~~

Each baseline part records its latest complete target definition.

Each physical output slot records:

~~~text
enabled
route configuration
winning baseline
winning transient
current intensity
current frequency
current rotation speed
current rotation direction
generation
~~~

An output slot follows this conceptual state machine:

~~~text
IDLE -> RAMP_UP -> ACTIVE/PULSING -> RAMP_DOWN -> IDLE
~~~

Whenever logical state changes, the dispatcher recomputes affected output slots. A generation counter prevents an old timer or Job step from turning off a newer output state.

The precise XToys Action sequence used to restart or refresh an already-running Job will be selected by an implementation experiment. Regardless of whether XToys supports direct restart or requires stop/start or Queue control, it must satisfy these invariants:

- A new accepted generation replaces the old timing state.
- An old generation cannot zero a newer generation.
- Expired transient state returns to the current baseline, not necessarily zero.
- Clearing baseline while no transient is active returns to zero.

## 11. Manual lifecycle

The XToys Script is manually controlled.

Initial Actions:

- Reset JavaScript state.
- Set all intensity output slots to zero.
- Set all frequency outputs to zero.
- Set all rotation speeds to zero.

Final Actions:

- Set all intensity output slots to zero.
- Set all frequency outputs to zero.
- Set all rotation speeds to zero.
- Stop or clear output-slot Jobs and Queues.

The template does not infer whether a game has started or stopped.

## 12. Validation and failure behavior

The global handler validates messages before modifying state. Version 1 uses a maximum outer payload string length of 32 KiB, at most 32 targets per message, at most 32 diagnostic state labels, and a maximum finite transient duration or individual timing field of 600,000 ms.

Validation proceeds as follows:

1. Reject an envelope payload beyond 32 KiB.
2. Catch JSON.parse errors.
3. Require protocolVersion 1.
4. Require a supported command.
5. Limit target count to 32 and diagnostic state labels to 32.
6. Require supported leaf parts or groups.
7. Convert numeric inputs and reject non-finite values.
8. Clamp intensity, frequency, and rotateSpeed to 0-100.
9. Require rotateDirection to be clockwise or counterclockwise whenever rotateSpeed is greater than zero.
10. Clamp time fields to 0-600,000 ms.
11. Ignore duplicate or older event revisions.

Unknown optional fields are ignored for forward compatibility. Unknown required semantics cause the target or message to be dropped.

Payload contents are data only. The handler never evaluates payload strings as JavaScript.

Any error must not increase output. Invalid messages leave the last valid state unchanged, except an independently valid stop_all command, which always clears output.

Logging supports off, errors, and debug. High-frequency success logging is aggregated to avoid slowing JS-Interpreter.

## 13. User configuration

The XToys template exposes:

- Global enable state through manual Script start/stop.
- Optional global haptic multiplier.
- Log level.
- Sixteen output-slot enabled toggles.
- Per-output-slot body-part routing configuration and weights.
- Per-output-slot output type and XToys channel binding.
- Per-intensity-slot frequency-capability toggle.
- Virtual-group expansion weights.
- Manual output-slot test controls.

There is no script-side per-device maximum-intensity or maximum-rotation-speed setting. Both limits remain configured in XToys device settings.

## 14. Verification plan

### 14.1 Protocol ingress

- Confirm a Webhook Trigger exposes an arbitrary string as {trigger-payload}.
- Confirm quotes, backslashes, Unicode, and nested target arrays survive outer JSON escaping.
- Confirm malformed or oversized payloads are rejected without output changes.
- Confirm protocol-version and command dispatch.

### 14.2 Routing and arbitration

- Route one leaf part to one output.
- Route one group to several leaf parts and outputs.
- Route several parts to one physical output slot.
- Confirm routing weights are applied once in the correct order.
- Confirm priority, effective-output-value, and sequence tie-breaking.
- Confirm rotation slots arbitrate on effective rotateSpeed rather than intensity.
- Confirm a winning transient falls back to the next active transient or baseline when it ends.

### 14.3 Baseline

- Apply a baseline snapshot.
- Replace it with a different complete snapshot.
- Clear omitted parts and an empty snapshot.
- Confirm baseline persists until updated or the Script stops.
- Confirm a transient boost is perceptible when its raw intensity is below baseline.
- Confirm pulse off intervals return to baseline.

### 14.4 Concurrency and timing

- Run intensity and rotation output slots simultaneously with different durations, frequencies, directions, and pulse timing.
- Refresh a running event and verify old timers cannot stop the new generation.
- Reverse a running rotation through an update with the same eventId and a higher sequence.
- Confirm XToys does not reverse direction unless the game Bridge explicitly requests it.
- Send dense updates representative of Dominate Plan and Aruna.
- Confirm the inline Custom Code remains short and non-blocking.

### 14.5 Lifecycle and output behavior

- Confirm Script Initial Actions set all outputs to zero.
- Confirm Script Final Actions set all outputs and frequencies to zero.
- Confirm zero-speed, ramped stopping, clockwise, and counterclockwise rotation Actions.
- Confirm stop, baseline clearing, and stop_all behavior.
- Confirm the script never calls an Action that modifies XToys device maximum intensity.
- Confirm the script never calls an Action that modifies XToys maximum rotation speed.
- Confirm test performs a dry run unless the user explicitly uses an output-slot test control.

## 15. Acceptance criteria

The design is successfully implemented when:

1. Repetition, Dominate Plan, and Aruna can emit the same protocol despite different internal combat logic.
2. A single XToys template handles all three without game-specific JavaScript branches.
3. At least two physical output slots run independently and concurrently.
4. Several logical parts can safely share one physical channel through deterministic arbitration.
5. Persistent abnormal-state baseline output is boosted by attacks and resumes afterward.
6. Device maximum intensity and maximum rotation speed remain exclusively controlled by XToys device settings.
7. Stopping the XToys Script reliably zeros all connected outputs.
8. Adding a new game requires only a Bridge adapter and protocol mapping, not a new XToys control script.
9. A game Bridge can directly set and update logical rotation speed and direction while the universal XToys template performs physical routing and shared-channel arbitration.
