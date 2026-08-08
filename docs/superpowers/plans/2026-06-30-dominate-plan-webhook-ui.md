# Dominate Plan Webhook UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real in-game XToys webhook configuration panel opened with F8, and make dispatch usable without editing the config file by hand.

**Architecture:** Keep combat event detection unchanged. Add a small core normalizer for webhook IDs, make `WebhookClient` reconfigurable at runtime, and add an IMGUI overlay in the BepInEx plugin that saves BepInEx config entries.

**Tech Stack:** C# netstandard2.0, BepInEx 5, Harmony, Unity IMGUI, existing console-style core tests.

---

### Task 1: Webhook ID Normalization

**Files:**
- Modify: `tests/DominatePlanBridge.Core.Tests/Program.cs`
- Create: `src/DominatePlanBridge.Core/WebhookIdNormalizer.cs`

- [ ] Write failing tests for trimming bare IDs and extracting IDs from `https://webhook.xtoys.app/<id>`.
- [ ] Run `dotnet run --project tests/DominatePlanBridge.Core.Tests/DominatePlanBridge.Core.Tests.csproj` and confirm the tests fail because `WebhookIdNormalizer` does not exist.
- [ ] Implement `WebhookIdNormalizer.Normalize(string?)`.
- [ ] Re-run the core tests and confirm they pass.

### Task 2: Runtime Webhook Client Settings

**Files:**
- Modify: `src/DominatePlanBridge.BepInEx/WebhookClient.cs`

- [ ] Change `WebhookClient` so webhook ID and dispatch enabled state can be updated after construction.
- [ ] Normalize webhook IDs before building `https://webhook.xtoys.app/<id>`.
- [ ] Add `DispatchTest()` for a simple `{"action":"test","source":"dominate_plan_bridge"}` POST.

### Task 3: F8 In-Game Panel

**Files:**
- Modify: `src/DominatePlanBridge.BepInEx/Plugin.cs`
- Modify: `src/DominatePlanBridge.BepInEx/DominatePlanBridge.BepInEx.csproj`

- [ ] Store `WebhookId` and `EnableDispatch` as plugin fields.
- [ ] Toggle a settings window with F8.
- [ ] Draw an IMGUI window with webhook ID input, dispatch toggle, Save, Test, and status text.
- [ ] Save values through BepInEx config and immediately apply them to `WebhookClient`.
- [ ] Add `UnityEngine.IMGUIModule` reference if required by the build.

### Task 4: Verification and Deployment

**Files:**
- Deploy build outputs to `ドミネートプラン/BepInEx/plugins`

- [ ] Run the core tests.
- [ ] Build `src/DominatePlanBridge.BepInEx/DominatePlanBridge.BepInEx.csproj -c Release`.
- [ ] Copy `XtoysBridgeDominatePlan.dll` and `DominatePlanBridge.Core.dll` into the game plugin folder.
- [ ] Report exact verification results and note that real XToys POST requires the user to enter an ID and enable dispatch in-game.
