$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bridgeRoot = Join-Path $root "src\ArunaBridge.UE4SS"
$mainLua = Join-Path $bridgeRoot "Mods\XtoysArunaBridge\scripts\main.lua"
$readme = Join-Path $bridgeRoot "README.md"
$enabled = Join-Path $bridgeRoot "Mods\XtoysArunaBridge\enabled.txt"
$config = Join-Path $bridgeRoot "Mods\XtoysArunaBridge\xtoys_aruna_bridge_config.txt"
$payloadKeep = Join-Path $bridgeRoot "Mods\XtoysArunaBridge\payloads\.keep"

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
Assert-True (Test-Path -LiteralPath $config) "packaged config is missing"
Assert-True (Test-Path -LiteralPath $payloadKeep) "packaged payload directory marker is missing"

$lua = Get-Content -Raw -LiteralPath $mainLua
$doc = Get-Content -Raw -LiteralPath $readme
$cfg = Get-Content -Raw -LiteralPath $config

foreach ($fieldName in @("BDValue", "OrgasmNum", "TotalOrgasmNum", "ShellOrgasmStrength", "EnergyOrgasmStrength", "ShellAlpha", "EnergyAlpha", "Core")) {
    Assert-Contains $lua ('"' + $fieldName + '"') "safe field missing from main.lua: $fieldName"
    Assert-Contains $doc $fieldName "safe field missing from README.md: $fieldName"
}

foreach ($fieldName in @("BodyDevelopmentName", "BodyDevelopmentValue", "DevelopmentPartsText", "Clitoris", "Penis")) {
    Assert-True (-not $lua.Contains('"' + $fieldName + '"')) "unsafe converter field should not be read: $fieldName"
}

foreach ($part in @("oral", "breast", "clit_penis", "futanari", "urethra", "vagina", "anus")) {
    Assert-Contains $lua ('key = "' + $part + '"') "part mapping missing: $part"
    Assert-Contains $doc $part "README part mapping missing: $part"
}

foreach ($api in @("FindAllOf", "ExecuteWithDelay", "RegisterKeyBind", "RegisterKeyBindAsync")) {
    Assert-Contains $lua $api "expected UE4SS API missing: $api"
}

foreach ($text in @("xtoys_aruna_bridge_config.txt", "xtoys_aruna_bridge_log.txt", "xtoys_worker.ps1", "xtoys_worker.vbs", "xtoys_worker_config.txt", "webhook.xtoys.app", "buildHitPayload", "normalizeWebhook")) {
    Assert-Contains $lua $text "bridge feature missing: $text"
}

foreach ($text in @("webhook=", "enabled=false", "sampleIntervalMs=100", "batchWindowMs=250", "quietWindowMs=1200", "secondaryPartMinWeight=0.02", "secondaryWeightExponent=0.5", "maxSecondaryParts=3", "unavailableLogIntervalMs=5000")) {
    Assert-Contains $cfg $text "packaged config default missing: $text"
}

foreach ($label in @("F6", "F7", "F8", "F9")) {
    Assert-Contains $lua $label "hotkey label missing from main.lua: $label"
    Assert-Contains $doc $label "hotkey label missing from README.md: $label"
}

Assert-True (-not $lua.Contains("RegisterHook(")) "initial bridge should poll rather than hook unknown functions"
Assert-True (-not $lua.Contains("ForEachUObject(")) "bridge should not use unsafe global UObject scans"
Assert-Contains $lua 'BRIDGE_VERSION = "0.1.1"' "bridge version should be 0.1.1"
Assert-Contains $lua "minDominantRatio" "dominant ratio tuning missing"
Assert-Contains $lua "quietWindowMs" "quiet window tuning missing"
Assert-Contains $lua "batchWindowMs" "batch window tuning missing"
Assert-Contains $lua "logPayloads" "payload logging toggle missing"
Assert-Contains $lua "unavailableLogIntervalMs" "unavailable log throttle missing"
Assert-Contains $lua "secondaryPartMinWeight" "secondary part weight threshold missing"
Assert-Contains $lua "secondaryWeightExponent" "secondary part weight curve missing"
Assert-Contains $lua "maxSecondaryParts" "secondary part count limit missing"
Assert-True (-not $lua.Contains("math.pow")) "UE4SS Lua runtime does not provide math.pow; use ^ instead"
Assert-True (-not $lua.Contains("computeOrgasmLevel")) "orgasm delta should be sent as raw delta, not a thresholded level"
Assert-True (-not $lua.Contains("orgasmDeltaLevel1Threshold")) "orgasm level threshold should be removed"
Assert-True (-not $lua.Contains("orgasmDeltaLevel2Threshold")) "orgasm level threshold should be removed"
Assert-Contains $lua "hidden worker launch requested" "hidden worker launch log missing"
Assert-True (-not $lua.Contains('start "" /B powershell.exe')) "bridge should not start powershell per payload"
Assert-True (-not $lua.Contains('mkdir "Mods\\XtoysArunaBridge\\payloads"')) "bridge should not call cmd mkdir in the payload path"
foreach ($removedPayloadField in @('"source"', '"batched"', '"windowMs"', '"partLabel"', '"partValue"', '"partDelta"', '"maxDelta"', '"totalDelta"', '"dominantRatio"', '"shellStrength"', '"energyStrength"', '"action":"climax"')) {
    Assert-True (-not $lua.Contains($removedPayloadField)) "removed payload field should not be emitted: $removedPayloadField"
}

Write-Host "Aruna UE4SS bridge static validation passed"
