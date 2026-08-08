# XToys Universal Haptic Bridge

This repository develops a reusable bridge between game-specific event plugins and XToys-connected devices. The goal is to keep combat and status interpretation in each game's plugin while using one common XToys template for body-part routing, shared-channel arbitration, baseline output, and physical device actions.

## Status

The universal protocol and XToys-side architecture are currently design-complete and ready for implementation planning. The approved design supports:

- Fine-grained logical body parts and virtual groups.
- Sixteen independently configured physical output slots.
- Several logical parts sharing one physical channel.
- Persistent abnormal-state baselines with transient attack boosting.
- Game-computed intensity, duration, E-Stim frequency, ramps, and pulse timing.
- Game-computed rotation speed and direction, routed to XToys Rotate outputs.
- Manual XToys Script lifecycle without game-process detection or heartbeat logic.

See the [approved universal bridge specification](docs/superpowers/specs/2026-08-08-xtoys-universal-haptic-bridge-design.md).

## Repository layout

- `src/`: Existing game adapters and diagnostic probes used to derive the universal design.
- `tests/`: Source-level validators and core behavior tests for those adapters.
- `docs/`: Architecture notes, handoff documents, approved specifications, and implementation plans.

The current game-specific adapters are reference implementations. New development should converge on the common protocol rather than add game-specific XToys control scripts.

## Safety boundary

The universal script controls current output values only. It does not change XToys device maximum intensity or maximum rotation speed. Device connection, calibration, and physical limits remain under the user's XToys configuration. The user manually starts and stops the XToys Script; its Initial and Final Actions must set every connected output to zero.

## Local-only files

This development workspace may contain complete game directories, reverse-engineering artifacts, build output, logs, payload captures, archives, and local device configuration. The repository uses an allowlist-style `.gitignore` so these files remain local and are not published.

Do not commit a populated XToys webhook ID. The checked-in Aruna configuration is intentionally disabled and has an empty webhook value.

