# Aruna XToys Bridge Observations

This file records confirmed probe findings for `Aruna and the Labyrinth of SealedLewd` before building the XToys bridge.

## Confirmed Active Object

- Runtime class: `WG_Converter_C`
- Path: `/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C`
- In repeated Aruna `1.206` tests, `instance=2` was the active gameplay instance.
- `instance=1` stayed mostly static with `BDValue` all zero and `Core=50000`; bridge code should prefer the instance with non-zero development deltas, non-static `Core`, or changing orgasm/strength values.

## Body Development Fields

Confirmed stable fields:

- `DevelopmentParts`: array of localized body part names.
- `BDValue`: array of cumulative development values.
- `DevelopmentPairs[index]`: probe-emitted pairing of `DevelopmentParts[index]` and `BDValue[index]`.

Confirmed index mapping:

| Index | Part name | Bridge key |
| --- | --- | --- |
| 1 | 口腔 | `oral` |
| 2 | 乳房 | `breast` |
| 3 | クリトリスペニス | `clit_penis` |
| 4 | フタナリ | `futanari` |
| 5 | 尿道 | `urethra` |
| 6 | 膣 | `vagina` |
| 7 | 肛門 | `anus` |

Important behavior:

- `BDValue` is cumulative. Use delta between samples for current stimulation; do not use absolute non-zero as an active-state flag.
- Full-body attacks increase all seven parts together.
- Single breast-focused attack strongly favored index 2. In one test, final values were:

```text
oral        0.000117625
breast      0.010586250
clit_penis  0.000470500
futanari    0.000117625
urethra     0.000235250
vagina      0.000117625
anus        0.000117625
```

- In that breast-focused sample, breast delta was roughly 90x the baseline linked parts, `clit_penis` roughly 4x, and `urethra` roughly 2x.
- Bridge part selection should use the largest positive `BDValue` delta, with optional secondary weights from `delta / maxDelta`.

## Confirmed Orgasm And Core Fields

Confirmed stable fields:

- `OrgasmNum`: rising orgasm/session counter or progress value.
- `TotalOrgasmNum`: cumulative orgasm total.
- `ShellOrgasmStrength`: real-time shell-related stimulation/afterglow strength candidate.
- `EnergyOrgasmStrength`: real-time energy-related stimulation/afterglow strength candidate.
- `ShellAlpha`: UI/phase alpha candidate for shell state.
- `EnergyAlpha`: UI/phase alpha candidate for energy state.
- `Core`: decreases during sustained attacks and climax-like phases.

Observed behavior:

- `ShellOrgasmStrength` and `EnergyOrgasmStrength` rise during attacks and climax-like phases.
- `OrgasmNum` and `TotalOrgasmNum` are better event/delta sources than continuous vibration sources.
- `Core` is useful as an auxiliary danger/damage/state signal, but not a primary XToys intensity source.
- After escaping an attack, `OrgasmNum` and `Core` can continue changing for a short time, so the bridge should stop output based on strength decay or a quiet window rather than a single post-escape sample.

## User-Observed Variables To Probe Next

The following UI variables are not yet fully mapped to safe runtime fields:

- Sensitivity: displayed as `x1.0` initially and can rise toward `x2.0` while attacked.
- Climax/Orgasm count: displayed as a value that increases on Shell or Energy climax and rises faster when both climax together.
- Shell bar: Shell-specific bar that changes during stimulation, changes color after climax, then recovers over time.
- Energy bar: Energy-specific bar with behavior similar to Shell.
- Shell pink bar: under the Shell bar; grows during attack and slowly falls when not attacked.
- Energy pink bar: under the Energy bar; grows during attack and slowly falls when not attacked.

Working hypothesis:

- `ShellOrgasmStrength` and `EnergyOrgasmStrength` likely correspond to the two pink bars under the Shell/Energy bars.
- Those strength values may influence the recovery speed or duration of the post-climax Shell/Energy state.
- The visible sensitivity multiplier may be stored in a field near the previously discovered `Sensitivity` UI/property area, but the safe numeric backing field still needs confirmation.
- The visible climax count may correspond to `OrgasmNum`/`TotalOrgasmNum`, but this should be verified by sampling around single Shell climax, single Energy climax, and simultaneous climax.

## Unsafe Or Avoided Fields

These fields caused or strongly correlated with UE4SS native crashes or unstable widget references and should not be read in the bridge loop:

- `BodyDevelopmentName`
- `BodyDevelopmentValue`
- `DevelopmentPartsText`
- `Clitoris`
- `Penis`

## Bridge Direction

Initial bridge logic should:

1. Find active `WG_Converter_C` instance by changing state.
2. Read `BDValue`, `DevelopmentParts`, `OrgasmNum`, `TotalOrgasmNum`, `ShellOrgasmStrength`, `EnergyOrgasmStrength`, `ShellAlpha`, `EnergyAlpha`, and `Core`.
3. Compute body-part deltas from `BDValue`.
4. Use max positive body-part delta to choose the dominant part.
5. Use `max(ShellOrgasmStrength, EnergyOrgasmStrength)` as the main continuous intensity.
6. Use positive `OrgasmNum` or `TotalOrgasmNum` deltas for climax pulses.
7. Add decay/quiet-window handling after attack escape.
