# Xtoys Aruna External Probe

This is the Aruna side first implementation path for the Aruna and the Labyrinth of SealedLewd bridge work.

The probe is an external read-only diagnostic tool. It does not inject a DLL, does not install UE4SS, does not patch game files, and does not send data to XToys yet. The purpose of this phase is to find stable HUD text anchors and nearby memory regions from outside the game process.

## What It Scans

The current catalog scans both UTF8 and UTF16LE encodings for HUD labels visible in game:

- Core
- Shell
- Energy
- 累計絶頂
- 絶頂
- 感度
- 吸着
- 開発度
- 口腔
- 乳房
- 陰核
- フタナリ
- 尿道
- 膣
- 肛門

These labels are not treated as final gameplay variables. They are anchors for locating the UI strings or data structures that may lead us to the real character values.

## Run

Start the game first and wait until the HUD is visible. Then run:

```powershell
dotnet run --project src\ArunaProbe.External\ArunaProbe.External.csproj -- --once
```

For a longer scan:

```powershell
dotnet run --project src\ArunaProbe.External\ArunaProbe.External.csproj -- --duration-seconds 30 --interval-ms 1000 --max-region-mb 64
```

Useful options:

- `--process-name ArunaLOSL.exe`
- `--once`
- `--duration-seconds 30`
- `--interval-ms 1000`
- `--max-region-mb 64`
- `--max-matches-per-pattern 80`
- `--include-low-priority`
- `--include-hud-values`
- `--scan-development-values`
- `--log-dir <directory>`

Logs are written to `logs\aruna_external_probe_yyyyMMdd_HHmmss.log` by default.

By default the scan focuses on high-priority Japanese HUD and body-part labels. `Core`, `Shell`, and `Energy` are low-priority anchors because they produce many unrelated hits; include them only with `--include-low-priority`.

Each encoded pattern has a per-pattern cap so short text cannot hide more useful Japanese anchors. The end of each pass prints a Match summary.

Use `--include-hud-values` to also scan text forms of visible HUD numbers such as `000.00`, `49990`, `9999.0`, `20/20`, and `8/8`. These value anchors are still diagnostic text candidates, not confirmed variable addresses.

Use `--scan-development-values` to focus on the development values shown in the body-part panel: `8.77`, `9.59`, `8.47`, `8.52`, `8.53`, `8.19`, and `8.27`. This mode scans `Float32`, `Float64`, and `Int32` candidates only in `MEM_PRIVATE` writable regions. For a display value such as `8.77`, it tries direct and transformed variants such as `877`, `8770`, `87700`, `0.0877`, and `87.7`.

## Expected Workflow

1. Run the probe while the HUD page is visible.
2. Check the log for repeated matches of the Japanese HUD anchors.
3. Change one in-game value if possible, scan again, and compare nearby addresses.
4. Once stable addresses or object layouts are identified, add a second phase that reads candidate numeric values.
5. Only after Aruna-side values are reliable should the bridge add XToys routing.
