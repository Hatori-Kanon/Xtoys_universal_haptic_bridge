# Aruna UE4SS Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a UE4SS Lua diagnostic probe for Aruna that discovers candidate Unreal objects/functions and writes deduplicated local logs without sending XToys webhook traffic.

**Architecture:** The probe is a source-only UE4SS Lua mod under `src/ArunaProbe.UE4SS`, with a PowerShell static validation script under `tests/ArunaProbe.UE4SS.Tests`. Validation is intentionally static because runtime verification requires UE4SS installed and the game launched manually.

**Tech Stack:** UE4SS Lua mod structure, Lua 5-style script, PowerShell validation, local Markdown documentation.

---

## File Structure

- Create `src/ArunaProbe.UE4SS/README.md`: install and usage instructions for the probe.
- Create `src/ArunaProbe.UE4SS/Mods/XtoysArunaProbe/enabled.txt`: UE4SS mod enable marker.
- Create `src/ArunaProbe.UE4SS/Mods/XtoysArunaProbe/scripts/main.lua`: UE4SS Lua probe.
- Create `tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1`: static validation for expected probe behavior.

## Task 1: Static Validation Harness

**Files:**
- Create: `tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1`

- [ ] **Step 1: Write the failing static validation script**

```powershell
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$probeRoot = Join-Path $root "src\ArunaProbe.UE4SS"
$mainLua = Join-Path $probeRoot "Mods\XtoysArunaProbe\scripts\main.lua"
$readme = Join-Path $probeRoot "README.md"
$enabled = Join-Path $probeRoot "Mods\XtoysArunaProbe\enabled.txt"

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Assert-Contains([string]$Text, [string]$Needle, [string]$Message) {
    Assert-True ($Text.Contains($Needle)) $Message
}

Assert-True (Test-Path -LiteralPath $mainLua) "main.lua is missing"
Assert-True (Test-Path -LiteralPath $readme) "README.md is missing"
Assert-True (Test-Path -LiteralPath $enabled) "enabled.txt is missing"

$lua = Get-Content -Raw -LiteralPath $mainLua
$doc = Get-Content -Raw -LiteralPath $readme

foreach ($keyword in @("Aruna", "Damage", "Hit", "Grab", "Worm", "Attach", "Orgasm", "Climax", "Milk", "Nipple", "Suit", "Core", "Energy", "Shell", "Health")) {
    Assert-Contains $lua ('"' + $keyword + '"') "keyword missing from main.lua: $keyword"
}

foreach ($label in @("F6", "F7", "F9")) {
    Assert-Contains $lua $label "hotkey label missing from main.lua: $label"
    Assert-Contains $doc $label "hotkey label missing from README.md: $label"
}

foreach ($api in @("RegisterKeyBind", "ForEachUObject", "NotifyOnNewObject")) {
    Assert-Contains $lua $api "expected UE4SS API missing from main.lua: $api"
}

Assert-Contains $lua "xtoys_aruna_probe_log.txt" "probe log filename missing"
Assert-Contains $lua "[READY]" "READY log category missing"
Assert-Contains $lua "[OBJECT]" "OBJECT log category missing"
Assert-Contains $lua "[FUNCTION]" "FUNCTION log category missing"
Assert-Contains $lua "[PLAYER]" "PLAYER log category missing"
Assert-Contains $lua "[ERROR]" "ERROR log category missing"

foreach ($forbidden in @("webhook.xtoys.app", "http://", "https://", "RegisterHook(")) {
    Assert-True (-not $lua.Contains($forbidden)) "forbidden runtime behavior found in main.lua: $forbidden"
}

Assert-Contains $doc "ArunaLOSL\Binaries\Win64" "README install path missing"
Assert-Contains $doc "Mods\XtoysArunaProbe" "README mod path missing"
Assert-Contains $doc "xtoys_aruna_probe_log.txt" "README log filename missing"

Write-Host "Aruna UE4SS probe static validation passed"
```

- [ ] **Step 2: Run validation to verify it fails**

Run: `powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.UE4SS.Tests\Validate-ArunaProbe.ps1`

Expected: FAIL with `main.lua is missing`.

## Task 2: Probe Mod Files

**Files:**
- Create: `src/ArunaProbe.UE4SS/README.md`
- Create: `src/ArunaProbe.UE4SS/Mods/XtoysArunaProbe/enabled.txt`
- Create: `src/ArunaProbe.UE4SS/Mods/XtoysArunaProbe/scripts/main.lua`
- Test: `tests/ArunaProbe.UE4SS.Tests/Validate-ArunaProbe.ps1`

- [ ] **Step 1: Create README.md**

```markdown
# XtoysArunaProbe

`XtoysArunaProbe` is a UE4SS Lua diagnostic mod for `Aruna and the Labyrinth of SealedLewd1.207`.

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

- `F6`: dump candidate UObject/function summary.
- `F7`: dump player/controller/pawn context when discoverable.
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
```

- [ ] **Step 2: Create enabled.txt**

```text
1
```

- [ ] **Step 3: Create main.lua**

```lua
local PROBE_VERSION = "0.1.0"
local LOG_FILE = "xtoys_aruna_probe_log.txt"

local KEY_F6 = 0x75
local KEY_F7 = 0x76
local KEY_F9 = 0x78

local KEYWORDS = {
    "Aruna", "Damage", "Hit", "Grab", "Grapple", "Catch", "Worm",
    "Attach", "Detach", "Orgasm", "Climax", "Ejac", "Milk", "Nipple",
    "Suit", "Break", "Core", "Energy", "Shell", "HP", "Health"
}

local seen = {}
local candidateObjects = {}
local candidateFunctions = {}
local logPath = nil

local function now()
    return os.date("%H:%M:%S")
end

local function safeToString(value)
    local ok, result = pcall(function()
        if value == nil then
            return "nil"
        end
        return tostring(value)
    end)
    if ok then
        return result
    end
    return "<tostring failed>"
end

local function appendFile(path, line)
    local file = io.open(path, "a")
    if file == nil then
        return false
    end
    file:write(line)
    file:write("\n")
    file:close()
    return true
end

local function resetFile(path)
    local file = io.open(path, "w")
    if file == nil then
        return false
    end
    file:close()
    return true
end

local function chooseLogPath()
    if logPath ~= nil then
        return logPath
    end

    local preferred = LOG_FILE
    if resetFile(preferred) then
        logPath = preferred
        return logPath
    end

    logPath = "Mods/XtoysArunaProbe/" .. LOG_FILE
    resetFile(logPath)
    return logPath
end

local function logLine(kind, message)
    local path = chooseLogPath()
    local line = string.format("[%s] [%s] %s", now(), kind, message)
    if not appendFile(path, line) then
        print("[XtoysArunaProbe] log write failed: " .. line)
    end
end

local function logOnce(key, kind, message)
    if seen[key] then
        return
    end
    seen[key] = true
    logLine(kind, message)
end

local function lower(value)
    return string.lower(safeToString(value))
end

local function matchesKeyword(text)
    local textLower = lower(text)
    for _, keyword in ipairs(KEYWORDS) do
        if string.find(textLower, string.lower(keyword), 1, true) then
            return true
        end
    end
    return false
end

local function callMethod(object, methodName)
    if object == nil then
        return nil
    end

    local ok, result = pcall(function()
        local member = object[methodName]
        if type(member) == "function" then
            return member(object)
        end
        return nil
    end)

    if ok then
        return result
    end
    return nil
end

local function objectName(object)
    return safeToString(callMethod(object, "GetFullName") or callMethod(object, "GetName") or object)
end

local function className(object)
    local class = callMethod(object, "GetClass")
    if class ~= nil then
        return objectName(class)
    end
    return "<class unavailable>"
end

local function rememberCandidate(object)
    local name = objectName(object)
    local class = className(object)
    local combined = class .. " " .. name

    if not matchesKeyword(combined) then
        return
    end

    local key = "object:" .. combined
    candidateObjects[key] = string.format("class=%s name=%s", class, name)
    logOnce(key, "OBJECT", candidateObjects[key])

    if string.find(lower(class), "function", 1, true) or string.find(lower(name), "function", 1, true) then
        candidateFunctions[key] = string.format("owner=%s function=%s", class, name)
        logOnce("function:" .. combined, "FUNCTION", candidateFunctions[key])
    end
end

local function scanObjects(reason)
    logLine("SCAN", "begin reason=" .. reason)
    local count = 0

    local ok, err = pcall(function()
        ForEachUObject(function(object)
            count = count + 1
            rememberCandidate(object)
        end)
    end)

    if ok then
        logLine("SCAN", "end reason=" .. reason .. " objectsVisited=" .. tostring(count))
    else
        logLine("ERROR", "ForEachUObject failed: " .. safeToString(err))
    end
end

local function dumpSummary()
    local objectCount = 0
    for _, message in pairs(candidateObjects) do
        objectCount = objectCount + 1
        logLine("OBJECT", message)
    end

    local functionCount = 0
    for _, message in pairs(candidateFunctions) do
        functionCount = functionCount + 1
        logLine("FUNCTION", message)
    end

    logLine("SUMMARY", "candidateObjects=" .. tostring(objectCount) .. " candidateFunctions=" .. tostring(functionCount))
end

local function dumpPlayerContext()
    local classes = {
        "PlayerController",
        "Pawn",
        "Character",
        "Aruna",
        "GameState",
        "PlayerState"
    }

    for _, class in ipairs(classes) do
        local ok, objects = pcall(function()
            return FindAllOf(class)
        end)

        if ok and objects ~= nil then
            for index, object in ipairs(objects) do
                logLine("PLAYER", "class=" .. class .. " index=" .. tostring(index) .. " name=" .. objectName(object) .. " objectClass=" .. className(object))
            end
        else
            logOnce("player-miss:" .. class, "PLAYER", "class=" .. class .. " unavailable")
        end
    end
end

local function resetProbeLog()
    seen = {}
    candidateObjects = {}
    candidateFunctions = {}
    resetFile(chooseLogPath())
    logLine("READY", "Xtoys Aruna Probe ready version=" .. PROBE_VERSION .. " log=" .. chooseLogPath())
end

local function registerHotkey(keyCode, label, callback)
    local ok, err = pcall(function()
        RegisterKeyBind(keyCode, function()
            logLine("HOTKEY", label)
            callback()
        end)
    end)

    if ok then
        logLine("HOTKEY", label .. " registered")
    else
        logLine("ERROR", "RegisterKeyBind failed for " .. label .. ": " .. safeToString(err))
    end
end

local function registerNewObjectProbe()
    if NotifyOnNewObject == nil then
        logLine("ERROR", "NotifyOnNewObject API unavailable")
        return
    end

    local ok, err = pcall(function()
        NotifyOnNewObject("/Script/CoreUObject.Object", function(object)
            rememberCandidate(object)
        end)
    end)

    if ok then
        logLine("READY", "NotifyOnNewObject registered")
    else
        logLine("ERROR", "NotifyOnNewObject failed: " .. safeToString(err))
    end
end

resetProbeLog()
registerHotkey(KEY_F6, "F6 dump candidates", function()
    scanObjects("F6")
    dumpSummary()
end)
registerHotkey(KEY_F7, "F7 dump player context", dumpPlayerContext)
registerHotkey(KEY_F9, "F9 reset probe log", resetProbeLog)
registerNewObjectProbe()
scanObjects("startup")
```

- [ ] **Step 4: Run validation to verify it passes**

Run: `powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.UE4SS.Tests\Validate-ArunaProbe.ps1`

Expected: PASS with `Aruna UE4SS probe static validation passed`.

## Task 3: Runtime Handoff Notes

**Files:**
- Modify: `src/ArunaProbe.UE4SS/README.md`

- [ ] **Step 1: Add runtime verification notes**

Append:

```markdown
## Runtime Verification

1. Start the game normally after UE4SS and this mod are installed.
2. Confirm the log contains `[READY] Xtoys Aruna Probe ready`.
3. Enter gameplay, then press `F6`.
4. Trigger damage, grab, attachment, and climax-like gameplay events if available.
5. Press `F7` while controlling the player.
6. Close the game and inspect `xtoys_aruna_probe_log.txt`.

The useful lines for the next bridge stage are `[OBJECT]`, `[FUNCTION]`, and `[PLAYER]`.
```

- [ ] **Step 2: Re-run validation**

Run: `powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.UE4SS.Tests\Validate-ArunaProbe.ps1`

Expected: PASS with `Aruna UE4SS probe static validation passed`.

## Self-Review

- Spec coverage: the plan creates the source mod, log behavior, keyword filtering, hotkeys, README, and static validation requested by the design.
- Placeholder scan: no placeholders are used.
- Runtime limit: this plan does not launch the game and does not install UE4SS runtime files.
