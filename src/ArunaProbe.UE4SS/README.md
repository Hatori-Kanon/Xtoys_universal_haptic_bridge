# XtoysArunaProbe

`XtoysArunaProbe` is a UE4SS Lua diagnostic mod for `Aruna and the Labyrinth of SealedLewd1.207`.
It is also intended to run on nearby builds such as `1.206`.

It only observes Unreal objects/functions and writes local logs. It does not send XToys webhook traffic and does not modify game state.

## Install

1. Install UE4SS for the game under:

```text
Aruna and the Labyrinth of SealedLewd1.207\ArunaLOSL\Binaries\Win64
```

2. Copy this folder:

```text
src\ArunaProbe.UE4SS\Mods\XtoysArunaProbe
```

to:

```text
Aruna and the Labyrinth of SealedLewd1.207\ArunaLOSL\Binaries\Win64\Mods\XtoysArunaProbe
```

3. Enable the mod in UE4SS `Mods\mods.txt` with:

```text
XtoysArunaProbe : 1
```

## Hotkeys

- `F5`: dump cached converter-related UI widget paths without calling TextBlock text getters.
- `F6`: dump candidates, target blueprint properties, `WG_Converter_C` binding names, selected UFunction property metadata, and confirmed converter values.
- `F7`: dump player/player-controller context.
- `F8`: log the unsafe global scan stub as disabled.
- `F9`: reset `xtoys_aruna_probe_log.txt`.

## Logs

The preferred log path is:

```text
Aruna and the Labyrinth of SealedLewd1.207\xtoys_aruna_probe_log.txt
```

If UE4SS cannot write there, the probe falls back to:

```text
ArunaLOSL\Binaries\Win64\Mods\XtoysArunaProbe\xtoys_aruna_probe_log.txt
```

Use this probe first, collect the log after gameplay/capture/climax-like events, then build the formal XToys bridge from confirmed event names.

## Runtime Verification

1. Start the game normally after UE4SS and this mod are installed.
2. Confirm the log contains `[READY] Xtoys Aruna Probe ready`.
3. Enter gameplay, then press `F6`.
4. Trigger damage, grab, attachment, and climax-like gameplay events if available.
5. Press `F7` while controlling the player.
6. Close the game and inspect `xtoys_aruna_probe_log.txt`.

The useful lines for the next bridge stage are `[OBJECT]`, `[FUNCTION]`, `[PROPERTY]`, `[CLASS]`, `[BINDING]`, and `[PLAYER]`.
For sensitivity UI checks, press `F5` once after the converter UI has appeared.
Use the `[UITEXT]` lines to inspect cached converter-related widget paths and identify promising child widget names without reading child widget text directly.
Version `0.1.14` keeps the cached-path snapshot and adds a narrow targeted text read for `TextBlock_Sensitivity`, with `TextBlock_OrgasmNum` and `TextBlock_TotalOrgasmNum` as controls; it still avoids broad TextBlock/RichTextBlock/ProgressBar `FindAllOf` scans.
Version `0.1.15` skips targeted reads for `/Game/...:WidgetTree` template TextBlocks after a native crash on the static `TextBlock_OrgasmNum`; only `/Engine/Transient...WidgetTree_...` runtime TextBlocks are eligible for text getter calls.
Version `0.1.16` disables automatic TextBlock text getter calls after runtime `TextBlock_TotalOrgasmNum` also crashed; F5 now logs `target-read-disabled` for targeted TextBlocks instead of calling `GetText`, `Text`, `HintText`, `GetPercent`, or `GetValue`.
Version `0.1.17` adds F6 `[BINDING]` diagnostics for `WG_Converter_C` property/function names related to sensitivity, orgasm, Shell, Energy, and targeted TextBlocks, without invoking UI text getters or game functions.
Version `0.1.18` temporarily switched F5 to a minimal `WG_Converter_C.Sensitivity` direct-field read and disabled F6/F7/F8 hotkey bodies without deleting their implementation, so Sensitivity could be tested with the smallest possible runtime surface.
Version `0.1.19` restores the normal F5/F6/F7/F8 diagnostic flow and extends F6 `[BINDING]` output with `kind=function-property` metadata for selected `WG_Converter_C` functions such as `UpdateWGConverter`, `UpdateStatus`, `UpdateBC`, and `ExecuteUbergraph_WG_Converter`; it enumerates metadata only and does not invoke those functions.
Use the `[SUMMARY]` lines to confirm how many cached UI objects were visited and emitted.
Version `0.1.1` avoids the old full `ForEachUObject` F6 scan because it can trigger an UE4SS native access violation on Aruna `1.206`.
Version `0.1.2` further filters function candidates to `/Game/0LDAC` and focuses on `PC_MainGame_C`, `CHA_MyChara_C`, `PWN_Laby-Ris_C`, `PWN_EnemyCaptureColony_C`, `GMB_MainGame_C`, `ACT_GameData_C`, and `WG_Converter_C`.
Version `0.1.3` adds `[VALUE]` sampling for `WG_Converter_C` fields such as `BodyDevelopmentName`, `BodyDevelopmentValue`, `BDValue`, `DevelopmentPartsText`, `DevelopmentParts`, `Clitoris`, and `Penis`.
Version `0.1.4` makes F5 safer after `Clitoris`/`Penis` caused a native UE4SS crash on Aruna `1.206`; it samples confirmed-safe development arrays and emits `DevelopmentPairs[index] part=... value=...`.
Version `0.1.5` removes runtime sampling of unstable widget fields such as `BodyDevelopmentName` and `BodyDevelopmentValue` after a second F5 crash; `BDValue`, `DevelopmentParts`, and `DevelopmentPairs` are the confirmed development outputs.
Version `0.1.6` changes F5 into a 10-sample timeline at 100ms intervals and temporarily excludes `BDValue`, `DevelopmentParts`, and `DevelopmentPairs` from runtime output to keep logs focused on sensitivity, climax, Shell, and Energy dynamics.
Version `0.1.7` makes each timeline sample emit all valid `WG_Converter_C` instances after `0.1.6` could select a static converter because cumulative/static fields skewed the activity score.
Version `0.1.8` adds `[CANDIDATE]` logging for scalar numeric `WG_Converter_C` properties in the sensitivity range so the bridge can identify the real x1.0-to-x2.0 multiplier without re-enabling body-development array output.
Version `0.1.9` changes F5 into a 10 seconds sensitivity-only hunt and disables the already-confirmed Shell/Energy/Orgasm/Core `[TRACE]` timeline output to keep slow sensitivity changes readable.
Version `0.1.10` adds per-second `[SUMMARY]` diagnostics and raw `Sensitivity` output so an empty candidate run shows whether objects, properties, or numeric range matching failed.
Version `0.1.11` changes F5 into a one-shot `[UITEXT]` snapshot to hunt the visible `x1.0` sensitivity text in converter-scoped UMG widgets without running a long delayed sampling loop.
Version `0.1.12` makes F5 safer after broad UI widget enumeration crashed: it no longer scans TextBlock/RichText/ProgressBar classes or calls child widget text getters, and instead emits cached converter-related object paths only.
Version `0.1.13` adds narrow `NotifyOnNewObject` listeners for `TextBlock`, `RichTextBlock`, and `ProgressBar` so F5 can show converter-scoped child widget paths without broad `FindAllOf` scans or text getter calls.
