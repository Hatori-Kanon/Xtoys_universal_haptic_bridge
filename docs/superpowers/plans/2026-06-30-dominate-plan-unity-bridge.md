# Dominate Plan Unity Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Unity Mono probe and XToys webhook bridge for `ドミネートプラン` while preserving the slim protocol used by `XtoysBridgeMZ.js`.

**Architecture:** Split the work into a testable core library and a Unity/BepInEx adapter. The core library owns payload creation, cooldowns, climax locking, part mapping, and webhook dispatch decisions; the adapter will later patch Unity game methods and forward observed events into the core.

**Tech Stack:** C#/.NET 6 for local tests, Unity Mono target assemblies from `ドミネートプラン_Data/Managed`, BepInEx 5 and Harmony for runtime injection once BepInEx assemblies are available.

---

### File Structure

- Create: `src/DominatePlanBridge.Core/DominatePlanBridge.Core.csproj`
- Create: `src/DominatePlanBridge.Core/XtoysEvent.cs`
- Create: `src/DominatePlanBridge.Core/BridgeConfig.cs`
- Create: `src/DominatePlanBridge.Core/BridgeState.cs`
- Create: `src/DominatePlanBridge.Core/PartMapper.cs`
- Create: `src/DominatePlanBridge.Core/WebhookPayload.cs`
- Create: `tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj`
- Create: `tests/DominatePlanBridge.Core.Tests/Program.cs`
- Later create: `src/DominatePlanBridge.BepInEx/DominatePlanBridge.BepInEx.csproj`
- Later create: `src/DominatePlanBridge.BepInEx/Plugin.cs`
- Later create: `src/DominatePlanBridge.BepInEx/Hooks/*.cs`

### Task 1: Core Payload And State

**Files:**
- Create: `src/DominatePlanBridge.Core/DominatePlanBridge.Core.csproj`
- Create: `src/DominatePlanBridge.Core/XtoysEvent.cs`
- Create: `src/DominatePlanBridge.Core/BridgeConfig.cs`
- Create: `src/DominatePlanBridge.Core/BridgeState.cs`
- Create: `src/DominatePlanBridge.Core/PartMapper.cs`
- Create: `src/DominatePlanBridge.Core/WebhookPayload.cs`
- Create: `tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj`
- Create: `tests/DominatePlanBridge.Core.Tests/Program.cs`

- [ ] **Step 1: Write failing tests**

Create a console test runner that asserts:

```csharp
var state = new BridgeState(new BridgeConfig(hitCooldownMs: 120, climaxLockMs: 8000));
var firstHit = state.TryHit("MunePlus", 0);
AssertEqual("hit", firstHit.Action, "hit action");
AssertEqual("chest", firstHit.Part, "MunePlus maps to chest");
AssertNull(state.TryHit("MunePlus", 100), "hit cooldown suppresses duplicate");
var laterHit = state.TryHit("MunePlus", 121);
AssertEqual("chest", laterHit.Part, "hit after cooldown is allowed");

var ep = state.TryEp(12, 25);
AssertEqual("ep", ep.Action, "ep action");
AssertEqual(13, ep.EpGain, "ep gain");
AssertEqual(25, ep.EpStock, "ep stock");
AssertEqual("chest", ep.Part, "ep uses last part");

AssertNull(state.TryEp(25, 24), "ep decrease is ignored");

var firstClimax = state.TryClimax(0, 1, 1000);
AssertEqual("climax", firstClimax.Action, "climax action");
AssertEqual(1, firstClimax.ClimaxCount, "climax count");
AssertNull(state.TryClimax(1, 2, 2000), "climax lock suppresses duplicate");
var laterClimax = state.TryClimax(1, 2, 9100);
AssertEqual(2, laterClimax.ClimaxCount, "climax after lock is allowed");

var payload = laterClimax.ToJson();
AssertContains("\"action\":\"climax\"", payload, "json action");
AssertContains("\"part\":\"chest\"", payload, "json part");
AssertContains("\"climaxCount\":2", payload, "json climax count");
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj
```

Expected: build fails because `BridgeState`, `BridgeConfig`, and `WebhookPayload` do not exist.

- [ ] **Step 3: Implement minimal core**

Implement:

```csharp
public sealed class BridgeConfig
{
    public BridgeConfig(int hitCooldownMs = 120, int climaxLockMs = 8000)
    {
        HitCooldownMs = Math.Max(0, hitCooldownMs);
        ClimaxLockMs = Math.Max(0, climaxLockMs);
    }

    public int HitCooldownMs { get; }
    public int ClimaxLockMs { get; }
}
```

```csharp
public sealed class BridgeState
{
    private readonly BridgeConfig _config;
    private readonly Dictionary<string, long> _lastHitAt = new Dictionary<string, long>();
    private long _lastClimaxAt = long.MinValue;
    private string _lastPart = "unknown";

    public BridgeState(BridgeConfig config) { _config = config; }
    public WebhookPayload? TryHit(string sourceName, long nowMs) { ... }
    public WebhookPayload? TryEp(int oldValue, int newValue) { ... }
    public WebhookPayload? TryClimax(int oldValue, int newValue, long nowMs) { ... }
}
```

```csharp
public sealed class WebhookPayload
{
    public string Action { get; }
    public string? Part { get; }
    public int? EpGain { get; }
    public int? EpStock { get; }
    public int? ClimaxCount { get; }
    public string ToJson() { ... }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj
```

Expected: `All tests passed`.

### Task 2: Unity Probe Adapter

**Files:**
- Create: `src/DominatePlanBridge.BepInEx/DominatePlanBridge.BepInEx.csproj`
- Create: `src/DominatePlanBridge.BepInEx/Plugin.cs`
- Create: `src/DominatePlanBridge.BepInEx/Hooks/ProbeHooks.cs`

- [ ] **Step 1: Add BepInEx references**

Use local BepInEx 5 assemblies once installed under:

```text
ドミネートプラン/BepInEx/core/BepInEx.dll
ドミネートプラン/BepInEx/core/0Harmony.dll
```

- [ ] **Step 2: Patch discovery candidates**

Patch these candidates first, logging method entry and selected fields:

```text
BattleMain.PlayerAttack
BattleMain.EnemySpawn
SearchMain.ShinchokuChange
SearchOrgasmP.Orgasum
EnemyAttackP.Type0..Type11
EnemyOsenP.Type0..Type2
EnemyEXAttackP.Type0..Type6
KuchiPlus
MunePlus
KabuPlus
KethuPlus
OrgasmCountPlus
EnergyGaugeDown
```

- [ ] **Step 3: Verify probe load**

Run the game and confirm:

```text
ドミネートプラン/BepInEx/LogOutput.log
ドミネートプラン/xtoys_dominate_probe_log.txt
```

contain `Xtoys Dominate Plan Probe ready`.

### Task 3: Bridge Adapter

**Files:**
- Modify: `src/DominatePlanBridge.BepInEx/Plugin.cs`
- Create: `src/DominatePlanBridge.BepInEx/Hooks/BridgeHooks.cs`

- [ ] **Step 1: Replace probe-only logging with bridge events**

Use the verified mappings from Task 2. Forward stable events to `BridgeState.TryHit`, `BridgeState.TryEp`, and `BridgeState.TryClimax`.

- [ ] **Step 2: Add webhook dispatch**

Use `System.Net.Http.HttpClient` to POST `WebhookPayload.ToJson()` to:

```text
https://webhook.xtoys.app/<WebhookId>
```

- [ ] **Step 3: Verify dispatch**

With a configured webhook ID, trigger one body attack, one contamination increase, and one climax. Confirm payloads match:

```json
{"action":"hit","part":"chest"}
{"action":"ep","part":"chest","epGain":13,"epStock":25}
{"action":"climax","part":"chest","climaxCount":2}
```

### Self-Review

- The plan covers discovery before final bridge mapping.
- The plan keeps risky Unity runtime hooks outside the testable core.
- The first implementation task is test-first and can run without BepInEx or network access.
- The BepInEx installation step is explicit because the target game does not currently contain BepInEx.
