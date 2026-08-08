# Dominate Plan Bridge Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current `ドミネートプラン` BepInEx probe into a working XToys bridge that sends body-hit payloads containing part value/percentage and independent climax payloads. Do not send `ep` payloads.

**Architecture:** Keep the testable `DominatePlanBridge.Core` library responsible for mapping, hit cooldowns, payload JSON, and bridge decisions. Add a Unity adapter layer that hooks the now-verified `BattleStatus.KuchiPlus/MunePlus/KabuPlus/KethuPlus` methods, reads `KuchiSt/MuneSt/KabuSt/KethuSt` plus visible percentages, watches `OrgNow` or `SearchMain.OrgasmCountPlus`, and dispatches payloads through a small webhook client. Leave probe logging available behind config so runtime mapping can be audited without changing gameplay.

**Tech Stack:** C# `netstandard2.0`, BepInEx 5.4, HarmonyX, Unity 2019 Mono assemblies, local console tests via `dotnet run`.

---

## Evidence From Probe Logs

The bridge should rely on the following verified method/field mapping:

```text
BattleStatus.KuchiPlus -> mouth / 口
BattleStatus.MunePlus  -> chest / 胸
BattleStatus.KabuPlus  -> lower / 下部
BattleStatus.KethuPlus -> butt / 尻
```

The body value fields are:

```text
KuchiSt -> mouth numeric value
MuneSt  -> chest numeric value
KabuSt  -> lower numeric value
KethuSt -> butt numeric value
```

The visible percentage UI mapping is:

```text
Ku_H/Num -> mouth percentage
Mu_H/Num -> chest percentage
Ka_H/Num -> lower percentage
Ke_H/Num -> butt percentage
```

Climax/pollution candidates observed in `BattleStatus` snapshots:

```text
OrgNow=1
EnemyGaugeNum=100
OrgasmCount / SearchMain.OrgasmCountPlus
```

## File Structure

- Modify: `src/DominatePlanBridge.Core/PartMapper.cs`
  - Add direct Unity method names to the existing part map.
- Modify: `src/DominatePlanBridge.Core/WebhookPayload.cs`
  - Keep existing slim fields; optionally add `partValue` and `partPercent` only if tests require them.
- Create: `src/DominatePlanBridge.Core/BodyMetricTracker.cs`
  - Tracks/normalizes body metric values for inclusion in `hit` payloads; no `ep` payload is sent.
- Modify: `src/DominatePlanBridge.Core/BridgeState.cs`
  - Add a hit method that includes part value and percentage while preserving existing climax behavior.
- Modify: `tests/DominatePlanBridge.Core.Tests/Program.cs`
  - Add tests for direct Unity method mapping and part-value increase decisions.
- Create: `src/DominatePlanBridge.BepInEx/Hooks/BridgeHooks.cs`
  - Formal bridge hooks for `BattleStatus.*Plus`, separated from diagnostic `ProbeHooks`.
- Create: `src/DominatePlanBridge.BepInEx/WebhookClient.cs`
  - Posts `WebhookPayload.ToJson()` to XToys when `WebhookId` is configured.
- Modify: `src/DominatePlanBridge.BepInEx/Plugin.cs`
  - Add config flags, patch formal bridge hooks, keep probe mode optional.
- Modify: `src/DominatePlanBridge.BepInEx/Hooks/ProbeSnapshot.cs`
  - Guard null Unity objects to remove end-of-battle `NullReferenceException` noise.

---

### Task 1: Core Mapping And Body Metric Decisions

**Files:**
- Modify: `src/DominatePlanBridge.Core/PartMapper.cs`
- Create: `src/DominatePlanBridge.Core/BodyMetricTracker.cs`
- Modify: `src/DominatePlanBridge.Core/BridgeState.cs`
- Modify: `tests/DominatePlanBridge.Core.Tests/Program.cs`

- [ ] **Step 1: Write failing tests for Unity method mapping**

Add assertions to `tests/DominatePlanBridge.Core.Tests/Program.cs`:

```csharp
AssertEqual("mouth", PartMapper.Map("KuchiPlus"), "KuchiPlus maps to mouth");
AssertEqual("chest", PartMapper.Map("MunePlus"), "MunePlus maps to chest");
AssertEqual("lower", PartMapper.Map("KabuPlus"), "KabuPlus maps to lower");
AssertEqual("butt", PartMapper.Map("KethuPlus"), "KethuPlus maps to butt");
AssertEqual("mouth", PartMapper.Map("BattleStatus.KuchiPlus"), "qualified KuchiPlus maps to mouth");
AssertEqual("chest", PartMapper.Map("BattleStatus.MunePlus"), "qualified MunePlus maps to chest");
AssertEqual("lower", PartMapper.Map("BattleStatus.KabuPlus"), "qualified KabuPlus maps to lower");
AssertEqual("butt", PartMapper.Map("BattleStatus.KethuPlus"), "qualified KethuPlus maps to butt");
```

- [ ] **Step 2: Write failing tests for body-value increase payloads**

Add these assertions:

```csharp
var metrics = new BodyMetricTracker();
AssertNull(metrics.TryIncrease("mouth", 1000, 0.0m), "first observation seeds mouth value");
var mouthGain = AssertNotNull(metrics.TryIncrease("mouth", 1012, 1.5m), "mouth value increase produces payload");
AssertEqual("ep", mouthGain.Action, "body metric payload uses ep action");
AssertEqual("mouth", mouthGain.Part, "body metric payload keeps part");
AssertEqual(12, mouthGain.EpGain, "body metric gain is delta");
AssertEqual(1012, mouthGain.EpStock, "body metric stock is current body value");
AssertNull(metrics.TryIncrease("mouth", 1012, 1.5m), "same value is ignored");
AssertNull(metrics.TryIncrease("mouth", 1008, 1.0m), "decrease is ignored");
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
dotnet run --project tests\DominatePlanBridge.Core.Tests\DominatePlanBridge.Core.Tests.csproj
```

Expected: build fails because `BodyMetricTracker` does not exist or method mapping is incomplete.

- [ ] **Step 4: Implement direct method mapping**

Update `PartMapper.Map` so it accepts both bare and qualified method names. Minimal implementation rule:

```csharp
var normalized = sourceName;
var lastDot = normalized.LastIndexOf('.');
if (lastDot >= 0 && lastDot + 1 < normalized.Length)
{
    normalized = normalized.Substring(lastDot + 1);
}
```

Then map `KuchiPlus`, `MunePlus`, `KabuPlus`, and `KethuPlus` to `mouth`, `chest`, `lower`, and `butt`.

- [ ] **Step 5: Implement `BodyMetricTracker`**

Create `src/DominatePlanBridge.Core/BodyMetricTracker.cs`:

```csharp
using System.Collections.Generic;

namespace DominatePlanBridge.Core;

public sealed class BodyMetricTracker
{
    private readonly Dictionary<string, int> _lastValues = new Dictionary<string, int>();

    public WebhookPayload? TryIncrease(string part, int currentValue, decimal currentPercent)
    {
        if (!_lastValues.TryGetValue(part, out var previousValue))
        {
            _lastValues[part] = currentValue;
            return null;
        }

        if (currentValue <= previousValue)
        {
            return null;
        }

        _lastValues[part] = currentValue;
        return WebhookPayload.Ep(part, currentValue - previousValue, currentValue);
    }
}
```

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```powershell
dotnet run --project tests\DominatePlanBridge.Core.Tests\DominatePlanBridge.Core.Tests.csproj
```

Expected: `All tests passed`.

---

### Task 2: Webhook Client With Dry-Run Safety

**Files:**
- Create: `src/DominatePlanBridge.BepInEx/WebhookClient.cs`
- Modify: `src/DominatePlanBridge.BepInEx/Plugin.cs`

- [ ] **Step 1: Add config model in `Plugin.cs`**

Bind these config values:

```csharp
var webhookId = Config.Bind("XToys", "WebhookId", string.Empty, "XToys webhook ID.");
var enableDispatch = Config.Bind("XToys", "EnableDispatch", false, "When false, logs payloads but does not POST to XToys.");
var enableProbe = Config.Bind("Diagnostics", "EnableProbe", true, "When true, writes diagnostic probe snapshots.");
```

- [ ] **Step 2: Create `WebhookClient`**

Implement:

```csharp
using DominatePlanBridge.Core;
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace DominatePlanBridge.BepInEx;

internal sealed class WebhookClient
{
    private readonly Plugin _plugin;
    private readonly string _webhookId;
    private readonly bool _enabled;

    public WebhookClient(Plugin plugin, string webhookId, bool enabled)
    {
        _plugin = plugin;
        _webhookId = webhookId;
        _enabled = enabled && !string.IsNullOrWhiteSpace(webhookId);
    }

    public void Dispatch(WebhookPayload payload)
    {
        var json = payload.ToJson();
        _plugin.Log("PAYLOAD", json);
        if (!_enabled)
        {
            return;
        }

        Task.Run(() => PostAsync(json));
    }

    private async Task PostAsync(string json)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("https://webhook.xtoys.app/" + _webhookId);
            request.Method = "POST";
            request.ContentType = "application/json";
            var bytes = Encoding.UTF8.GetBytes(json);
            using (var stream = await request.GetRequestStreamAsync())
            {
                await stream.WriteAsync(bytes, 0, bytes.Length);
            }

            using (var response = (HttpWebResponse)await request.GetResponseAsync())
            {
                _plugin.Log("POST", ((int)response.StatusCode).ToString());
            }
        }
        catch (Exception ex)
        {
            _plugin.Log("POST_ERROR", ex.GetType().Name + " " + ex.Message);
        }
    }
}
```

- [ ] **Step 3: Build**

Run:

```powershell
dotnet build src\DominatePlanBridge.BepInEx\DominatePlanBridge.BepInEx.csproj -c Release
```

Expected: build succeeds with `0 errors`.

---

### Task 3: Formal Bridge Hooks For Body Attacks

**Files:**
- Create: `src/DominatePlanBridge.BepInEx/Hooks/BridgeHooks.cs`
- Modify: `src/DominatePlanBridge.BepInEx/Plugin.cs`

- [ ] **Step 1: Add bridge state to `Plugin.cs`**

Add fields:

```csharp
private BodyMetricTracker? _bodyMetrics;
private WebhookClient? _webhookClient;

internal BodyMetricTracker BodyMetrics => _bodyMetrics ?? throw new InvalidOperationException("Body metric tracker is not initialized.");
internal WebhookClient WebhookClient => _webhookClient ?? throw new InvalidOperationException("Webhook client is not initialized.");
```

Initialize them in `Awake()` after config binding.

- [ ] **Step 2: Create `BridgeHooks`**

Create `src/DominatePlanBridge.BepInEx/Hooks/BridgeHooks.cs`:

```csharp
using DominatePlanBridge.Core;
using System;
using System.Reflection;

namespace DominatePlanBridge.BepInEx.Hooks;

internal static class BridgeHooks
{
    private static Plugin? _plugin;

    internal static void Initialize(Plugin plugin)
    {
        _plugin = plugin;
    }

    internal static void Postfix(MethodBase __originalMethod, object? __instance)
    {
        var plugin = _plugin;
        if (plugin == null || __instance == null)
        {
            return;
        }

        var source = __originalMethod.DeclaringType?.Name + "." + __originalMethod.Name;
        var part = PartMapper.Map(source);
        if (part == "unknown")
        {
            return;
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var hit = plugin.State.TryHit(source, nowMs);
        if (hit != null)
        {
            plugin.WebhookClient.Dispatch(hit);
        }

        var currentValue = ReadCurrentPartValue(__instance, part);
        if (currentValue.HasValue)
        {
            var metric = plugin.BodyMetrics.TryIncrease(part, currentValue.Value, 0m);
            if (metric != null)
            {
                plugin.WebhookClient.Dispatch(metric);
            }
        }
    }

    private static int? ReadCurrentPartValue(object instance, string part)
    {
        var fieldName = part == "mouth" ? "KuchiSt" :
            part == "chest" ? "MuneSt" :
            part == "lower" ? "KabuSt" :
            part == "butt" ? "KethuSt" : null;

        if (fieldName == null)
        {
            return null;
        }

        var field = instance.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        var raw = field?.GetValue(instance) as string;
        return int.TryParse(raw, out var value) ? value : (int?)null;
    }
}
```

- [ ] **Step 3: Patch formal bridge hooks**

In `Plugin.Patch`, allow separate patch methods or add a new `PatchBridgeMethod` that patches only `BridgeHooks.Postfix` for:

```text
BattleStatus.KuchiPlus
BattleStatus.MunePlus
BattleStatus.KabuPlus
BattleStatus.KethuPlus
```

Do not bridge `SearchUISet.*Plus` yet; keep those as diagnostics unless runtime evidence shows `BattleStatus` misses a game mode.

- [ ] **Step 4: Build and deploy**

Run:

```powershell
dotnet build src\DominatePlanBridge.BepInEx\DominatePlanBridge.BepInEx.csproj -c Release
Copy-Item -LiteralPath src\DominatePlanBridge.BepInEx\bin\Release\netstandard2.0\XtoysBridgeDominatePlan.dll -Destination ドミネートプラン\BepInEx\plugins\XtoysBridgeDominatePlan.dll -Force
Copy-Item -LiteralPath src\DominatePlanBridge.Core\bin\Release\netstandard2.0\DominatePlanBridge.Core.dll -Destination ドミネートプラン\BepInEx\plugins\DominatePlanBridge.Core.dll -Force
```

Expected: build succeeds and plugin DLL timestamps update.

- [ ] **Step 5: Dry-run gameplay verification**

Keep `XToys.EnableDispatch=false`, trigger one attack for each part, and read:

```text
ドミネートプラン/xtoys_dominate_probe_log.txt
```

Expected lines:

```json
[PAYLOAD] {"action":"hit","part":"mouth"}
[PAYLOAD] {"action":"ep","part":"mouth","epGain":...,"epStock":...}
[PAYLOAD] {"action":"hit","part":"chest"}
[PAYLOAD] {"action":"ep","part":"chest","epGain":...,"epStock":...}
[PAYLOAD] {"action":"hit","part":"lower"}
[PAYLOAD] {"action":"ep","part":"lower","epGain":...,"epStock":...}
[PAYLOAD] {"action":"hit","part":"butt"}
[PAYLOAD] {"action":"ep","part":"butt","epGain":...,"epStock":...}
```

---

### Task 4: Climax Detection

**Files:**
- Modify: `src/DominatePlanBridge.BepInEx/Hooks/BridgeHooks.cs`
- Modify: `src/DominatePlanBridge.BepInEx/Plugin.cs`
- Modify: `tests/DominatePlanBridge.Core.Tests/Program.cs` only if core climax behavior must change

- [ ] **Step 1: Use existing core climax lock**

Do not change `BridgeState.TryClimax` unless dry-run shows duplicate or missed events. It already supports increasing counts with an 8000 ms lock.

- [ ] **Step 2: Add `OrgNow` threshold read in bridge hook**

In `BridgeHooks.Postfix`, after body metric dispatch, read `OrgNow` from `BattleStatus`:

```csharp
var orgNowField = __instance.GetType().GetField("OrgNow", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
if (orgNowField?.GetValue(__instance) is float orgNow && orgNow >= 1f)
{
    var climax = plugin.State.TryClimax(plugin.LastClimaxCount, plugin.LastClimaxCount + 1, nowMs);
    if (climax != null)
    {
        plugin.LastClimaxCount++;
        plugin.WebhookClient.Dispatch(climax);
    }
}
```

Add `LastClimaxCount` as an internal integer property or field on `Plugin`.

- [ ] **Step 3: Dry-run climax verification**

Keep `XToys.EnableDispatch=false`, trigger one climax. Expected log:

```json
[PAYLOAD] {"action":"climax","part":"...","climaxCount":1}
```

The `part` should be the last touched part from `BridgeState`.

---

### Task 5: Enable Real XToys Dispatch

**Files:**
- Modify only config file generated under `ドミネートプラン/BepInEx/config/local.xtoys.dominateplan.bridge.cfg`

- [ ] **Step 1: Configure webhook ID**

Set:

```ini
[XToys]
WebhookId = <your-webhook-id>
EnableDispatch = true
```

- [ ] **Step 2: Trigger one body hit**

Expected log sequence:

```text
[PAYLOAD] {"action":"hit","part":"chest"}
[POST] 200
```

If XToys returns a non-200 status, keep the body hook code unchanged and investigate webhook ID/config/network first.

- [ ] **Step 3: Trigger one body value increase and one climax**

Expected log sequence:

```text
[PAYLOAD] {"action":"ep","part":"chest","epGain":...,"epStock":...}
[POST] 200
[PAYLOAD] {"action":"climax","part":"chest","climaxCount":1}
[POST] 200
```

---

### Task 6: Clean Diagnostics And Guard End-Of-Battle Nulls

**Files:**
- Modify: `src/DominatePlanBridge.BepInEx/Hooks/ProbeSnapshot.cs`
- Modify: `src/DominatePlanBridge.BepInEx/Plugin.cs`

- [ ] **Step 1: Gate probe snapshots behind `Diagnostics.EnableProbe`**

Only call `ProbeHooks.Initialize` and diagnostic patches when `EnableProbe=true`. Always install bridge hooks independently.

- [ ] **Step 2: Make UI text scan null-safe**

In `ProbeSnapshot.TryAddText`, return early when `text` or `text.transform` has been destroyed by Unity:

```csharp
if (text == null || text.transform == null)
{
    return;
}
```

Apply the equivalent guard for `TMP_Text`.

- [ ] **Step 3: Verify no null snapshot spam**

Run a dry gameplay session through battle end. Expected: no repeated lines like:

```text
[ERROR] snapshot failed BattleMain.PlayerAttack: NullReferenceException
```

---

## Self-Review

- The plan uses verified `BattleStatus.*Plus` hooks for formal bridge events, not guessed coroutine names.
- The plan keeps XToys network dispatch disabled until dry-run payloads are correct.
- The payload protocol remains compatible with the original MZ bridge: `hit` and `climax` actions. `hit` includes `partValue` and `partPercent`.
- The plan preserves diagnostic logging but makes it optional and quieter.
- The plan avoids modifying game assemblies directly; all runtime changes stay in BepInEx plugin DLLs.


## User Revision 2026-06-30

- Do not send p payloads from this Unity bridge.
- Every hit payload should include the body part, current part numeric value, and current part percentage when available.
- XToys-side logic will use the percentage to control output intensity.
- climax should be sent normally, but climax must not lock or suppress later hit payloads.
- Hit cooldown remains only a short same-source duplicate guard, not a post-climax lock.

