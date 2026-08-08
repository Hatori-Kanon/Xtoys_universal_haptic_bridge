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

foreach ($keyword in @("Capture", "Converter", "MainGame", "GameData")) {
    Assert-Contains $lua ('"' + $keyword + '"') "0.1.2 keyword missing from main.lua: $keyword"
}

foreach ($label in @("F5", "F6", "F7", "F8", "F9")) {
    Assert-Contains $lua $label "hotkey label missing from main.lua: $label"
    Assert-Contains $doc $label "hotkey label missing from README.md: $label"
}

foreach ($api in @("RegisterKeyBindAsync", "ForEachUObject", "NotifyOnNewObject")) {
    Assert-Contains $lua $api "expected UE4SS API missing from main.lua: $api"
}

foreach ($keyName in @("Key.F6", "Key.F7", "Key.F9")) {
    Assert-Contains $lua $keyName "UE4SS key enum missing from main.lua: $keyName"
}
Assert-Contains $lua "Key.F5" "UE4SS key enum missing from main.lua: Key.F5"

Assert-Contains $lua "xtoys_aruna_probe_log.txt" "probe log filename missing"
Assert-Contains $lua "[READY]" "READY log category missing"
Assert-Contains $lua "[OBJECT]" "OBJECT log category missing"
Assert-Contains $lua "[FUNCTION]" "FUNCTION log category missing"
Assert-Contains $lua "[PLAYER]" "PLAYER log category missing"
Assert-Contains $lua "[CLASS]" "CLASS log category missing"
Assert-Contains $lua "[PROPERTY]" "PROPERTY log category missing"
Assert-Contains $lua "[VALUE]" "VALUE log category missing"
Assert-Contains $lua "[ERROR]" "ERROR log category missing"
Assert-Contains $lua "[BINDING]" "BINDING log category missing"
Assert-Contains $lua "MAX_SCAN_PER_CLASS" "targeted scan limit missing"
Assert-Contains $lua "scanInProgress" "scan reentrancy guard missing"
Assert-Contains $lua "unsafe global ForEachUObject scan disabled" "unsafe global scan warning missing"
Assert-Contains $lua '"/Script/Engine.PlayerController"' "narrow NotifyOnNewObject class missing"
Assert-Contains $lua 'PROBE_VERSION = "0.1.19"' "probe version should be 0.1.19"
Assert-Contains $lua "TARGET_BLUEPRINT_CLASSES" "target blueprint list missing"
Assert-Contains $lua "/Game/0LDAC" "game path filter missing"
Assert-Contains $lua "dumpTargetBlueprints" "target blueprint scanner missing"
Assert-Contains $lua "sampleConverterValues" "converter value sampler missing"
Assert-Contains $lua "sampleTimelineValues" "timeline value sampler missing"
Assert-Contains $lua "dumpUiTextSnapshot" "UI text snapshot dumper missing"
Assert-Contains $lua "KIND_UITEXT" "UI text log category missing"
Assert-Contains $lua "UI_SNAPSHOT_MARKERS" "UI snapshot marker list missing"
Assert-Contains $lua "TARGETED_UI_TEXT_NAMES" "targeted UI text allowlist missing"
Assert-Contains $lua "BINDING_SOURCE_KEYWORDS" "binding source keyword list missing"
Assert-Contains $lua "MAX_BINDING_SOURCE_LINES" "binding source log limit missing"
Assert-Contains $lua "isRuntimeUiTextObject" "runtime UI text guard missing"
Assert-Contains $lua "targetedUiObjects" "targeted UI object cache missing"
Assert-Contains $lua "rememberTargetedUiObject" "targeted UI object remember helper missing"
Assert-Contains $lua "dumpTargetedUiTextReadings" "targeted UI text read dumper missing"
Assert-Contains $lua "mode=target-read-begin" "targeted text read begin log missing"
Assert-Contains $lua "UI_TEXT_GETTERS_DISABLED" "UI text getter kill switch missing"
Assert-Contains $lua "mode=target-read-disabled" "targeted text getter disabled log missing"
Assert-Contains $lua "dumpConverterBindingSources" "converter binding source dumper missing"
Assert-Contains $lua "dumpBindingProperties" "binding property dumper missing"
Assert-Contains $lua "dumpBindingFunctions" "binding function dumper missing"
Assert-Contains $lua "TARGET_BINDING_FUNCTION_NAMES" "targeted binding function list missing"
Assert-Contains $lua "FUNCTION_PROPERTY_KEYWORDS" "function property keyword list missing"
Assert-Contains $lua "MAX_FUNCTION_PROPERTY_LINES" "function property log limit missing"
Assert-Contains $lua "dumpBindingFunctionProperties" "binding function property dumper missing"
Assert-Contains $lua "kind=function-property" "binding function property log marker missing"
Assert-Contains $lua "kind=function-property-summary" "binding function property summary marker missing"
Assert-Contains $lua "functionObject:ForEachProperty" "targeted UFunction property scan missing"
foreach ($functionName in @("UpdateWGConverter", "UpdateStatus", "UpdateBC", "ExecuteUbergraph_WG_Converter")) {
    Assert-Contains $lua ('"' + $functionName + '"') "targeted binding function missing: $functionName"
}
Assert-Contains $lua "ForEachFunction" "binding source scan should enumerate functions by name only"
Assert-Contains $lua "TEMP_MINIMAL_SENSITIVITY_ONLY" "temporary minimal sensitivity mode flag missing"
Assert-Contains $lua "dumpSensitivityOnly" "single sensitivity field dumper missing"
Assert-Contains $lua "TEMP_MINIMAL_SENSITIVITY_ONLY = false" "minimal sensitivity-only mode should be disabled"
Assert-Contains $lua 'dumpUiTextSnapshot("F5")' "F5 should dump cached UI snapshot after sensitivity-only test"
Assert-Contains $lua 'dumpConverterBindingSources("F6")' "F6 should dump converter binding sources"
Assert-True (-not $lua.Contains('dumpSensitivityOnly("F5")')) "F5 should no longer be sensitivity-only"
Assert-True (-not $lua.Contains("minimal-sensitivity-only-disabled")) "disabled hotkey marker should be removed from restored hotkeys"
Assert-True (-not $lua.Contains("collectUiReadings")) "F5 should not call TextBlock getter collection"
Assert-True (-not $lua.Contains('methodTextValue(object, "GetText")')) "F5 should not call TextBlock:GetText"
Assert-True (-not $lua.Contains('numericMethodValue(object, "GetPercent")')) "F5 should not call TextBlock:GetPercent"
Assert-True (-not $lua.Contains('numericMethodValue(object, "GetValue")')) "F5 should not call TextBlock:GetValue"
Assert-Contains $lua "mode=target-skip" "non-runtime target skip log missing"
Assert-Contains $lua "TextBlock_Sensitivity" "sensitivity TextBlock target missing"
Assert-Contains $lua "TextBlock_OrgasmNum" "orgasm count TextBlock control target missing"
Assert-Contains $lua "TextBlock_TotalOrgasmNum" "total orgasm count TextBlock control target missing"
Assert-Contains $lua "MAX_UI_TEXT_LINES" "UI text log limit missing"
Assert-Contains $lua '"/Script/UMG.TextBlock"' "TextBlock NotifyOnNewObject class missing"
Assert-Contains $lua '"/Script/UMG.RichTextBlock"' "RichTextBlock NotifyOnNewObject class missing"
Assert-Contains $lua '"/Script/UMG.ProgressBar"' "ProgressBar NotifyOnNewObject class missing"
Assert-True (-not $lua.Contains("UI_TEXT_CLASSES")) "F5 should not enumerate broad UI widget classes"
Assert-True (-not $lua.Contains("source=FindAllOf")) "F5 UI snapshot should not emit broad UI FindAllOf scan results"
Assert-True (-not $lua.Contains('sampleTimelineValues("F5")')) "F5 should not run the long sensitivity timeline"
Assert-True (-not $lua.Contains('FindAllOf("TextBlock")')) "F5 should not broad-scan TextBlock objects"
Assert-True (-not $lua.Contains('FindAllOf("RichTextBlock")')) "F5 should not broad-scan RichTextBlock objects"
Assert-True (-not $lua.Contains('FindAllOf("ProgressBar")')) "F5 should not broad-scan ProgressBar objects"
Assert-Contains $lua "dumpSensitivityCandidateObjects" "F5 should dump sensitivity candidates for all converter instances"
Assert-True (-not $lua.Contains('dumpTimelineObjects(reason, sampleIndex,')) "F5 sensitivity hunt should not emit confirmed timeline variables"
Assert-Contains $lua "KIND_CANDIDATE" "sensitivity candidate log category missing"
Assert-Contains $lua "dumpSensitivityCandidates" "sensitivity candidate scanner missing"
Assert-Contains $lua "dumpSensitivityHuntSummary" "sensitivity hunt summary missing"
Assert-Contains $lua "dumpRawSensitivityFields" "raw sensitivity field logger missing"
Assert-Contains $lua "CONFIRMED_TIMELINE_FIELD_SET" "confirmed timeline field exclusion set missing"
Assert-Contains $lua "MAX_SENSITIVITY_CANDIDATES_PER_SAMPLE" "sensitivity candidate sample limit missing"
Assert-Contains $lua "SENSITIVITY_CANDIDATE_MAX = 3.0" "sensitivity candidate max range missing"
Assert-Contains $lua "WATCHED_CONVERTER_FIELDS" "watched converter field list missing"
Assert-Contains $lua "TIMELINE_CONVERTER_FIELDS" "timeline converter field list missing"
Assert-Contains $lua "SENSITIVITY_HUNT_DURATION_SECONDS = 10" "sensitivity hunt duration should be 10 seconds"
Assert-Contains $lua "TIMELINE_SAMPLE_COUNT = 101" "timeline sample count should cover a 10 second window"
Assert-Contains $lua "TIMELINE_SAMPLE_INTERVAL_MS = 100" "timeline sample interval should be 100ms"
Assert-Contains $lua "ExecuteWithDelay" "timeline sampler should use ExecuteWithDelay"

foreach ($fieldName in @("BodyDevelopmentName", "BodyDevelopmentValue", "BDValue", "DevelopmentPartsText", "DevelopmentParts", "Clitoris", "Penis")) {
    Assert-Contains $doc $fieldName "README watched converter field missing: $fieldName"
}

$watchedBlock = [regex]::Match($lua, "local WATCHED_CONVERTER_FIELDS = \{(?<body>.*?)\}", [System.Text.RegularExpressions.RegexOptions]::Singleline)
Assert-True $watchedBlock.Success "WATCHED_CONVERTER_FIELDS block missing"
foreach ($fieldName in @("BDValue", "DevelopmentParts")) {
    Assert-True (-not $watchedBlock.Groups["body"].Value.Contains('"' + $fieldName + '"')) "body development field should be excluded from watched converter fields: $fieldName"
}

foreach ($fieldName in @("BodyDevelopmentName", "BodyDevelopmentValue", "DevelopmentPartsText", "Clitoris", "Penis")) {
    Assert-True (-not $lua.Contains('"' + $fieldName + '"')) "unsafe converter field should not be sampled: $fieldName"
}

Assert-Contains $lua "dumpDevelopmentPairs" "development pair dumper missing"
Assert-Contains $lua "DevelopmentPairs" "development pair log label missing"
Assert-True (-not $lua.Contains('sampleConverterValues("F5")')) "F5 should not run full converter value sampler"
Assert-Contains $doc "0.1.19" "README 0.1.19 note missing"
Assert-Contains $doc "[UITEXT]" "README UI text log note missing"
Assert-Contains $doc "[SUMMARY]" "README summary log note missing"
Assert-Contains $doc "[CANDIDATE]" "README candidate log note missing"
Assert-Contains $doc "[BINDING]" "README binding log note missing"

foreach ($targetClass in @("PC_MainGame_C", "CHA_MyChara_C", "PWN_Laby-Ris_C", "PWN_EnemyCaptureColony_C", "GMB_MainGame_C", "ACT_GameData_C", "WG_Converter_C")) {
    Assert-Contains $lua $targetClass "target blueprint class missing: $targetClass"
    Assert-Contains $doc $targetClass "README target blueprint class missing: $targetClass"
}

foreach ($forbidden in @("webhook.xtoys.app", "http://", "https://", "RegisterHook(", 'scanObjects("startup")', 'NotifyOnNewObject("/Script/CoreUObject.Object"')) {
    Assert-True (-not $lua.Contains($forbidden)) "forbidden runtime behavior found in main.lua: $forbidden"
}

Assert-Contains $doc "ArunaLOSL\Binaries\Win64" "README install path missing"
Assert-Contains $doc "Mods\XtoysArunaProbe" "README mod path missing"
Assert-Contains $doc "xtoys_aruna_probe_log.txt" "README log filename missing"

Write-Host "Aruna UE4SS probe static validation passed"
