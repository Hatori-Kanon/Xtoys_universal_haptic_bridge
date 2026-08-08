local PROBE_VERSION = "0.1.19"
local LOG_FILE = "xtoys_aruna_probe_log.txt"

local KEYWORDS = {
    "Aruna", "Damage", "Hit", "Grab", "Grapple", "Catch", "Capture",
    "Worm", "Attach", "Detach", "Orgasm", "Climax", "Ejac", "Milk",
    "Nipple", "Suit", "Break", "Core", "Energy", "Shell", "HP",
    "Health", "Converter", "Captured", "Body", "MainGame", "GameData",
    "Failed", "Failde"
}

local TARGET_SCAN_CLASSES = {
    "PlayerController",
    "Pawn",
    "Character",
    "Actor",
    "UserWidget",
    "Function",
    "DataTable",
    "CurveFloat",
    "AnimSequence",
    "SoundWave",
    "MaterialInstanceConstant",
    "MaterialInstanceDynamic"
}

local TARGET_BLUEPRINT_CLASSES = {
    {
        label = "PC_MainGame",
        className = "PC_MainGame_C",
        path = "/Game/0LDAC/00Actor/Pawn/Character/PC_MainGame.PC_MainGame_C"
    },
    {
        label = "CHA_MyChara",
        className = "CHA_MyChara_C",
        path = "/Game/0LDAC/00Actor/Pawn/Character/CHA_MyChara.CHA_MyChara_C"
    },
    {
        label = "PWN_Laby-Ris",
        className = "PWN_Laby-Ris_C",
        path = "/Game/0LDAC/00Actor/Pawn/Character/PWN_Laby-Ris.PWN_Laby-Ris_C"
    },
    {
        label = "PWN_EnemyCaptureColony",
        className = "PWN_EnemyCaptureColony_C",
        path = "/Game/0LDAC/00Actor/Pawn/NPC/Enemy/Capture/PWN_EnemyCaptureColony.PWN_EnemyCaptureColony_C"
    },
    {
        label = "GMB_MainGame",
        className = "GMB_MainGame_C",
        path = "/Game/0LDAC/Levels/GMB_MainGame.GMB_MainGame_C"
    },
    {
        label = "ACT_GameData",
        className = "ACT_GameData_C",
        path = "/Game/0LDAC/00Actor/Gimmick/GameData/ACT_GameData.ACT_GameData_C"
    },
    {
        label = "WG_Converter",
        className = "WG_Converter_C",
        path = "/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C"
    }
}

local WATCHED_CONVERTER_FIELDS = {
    "OrgasmNum",
    "TotalOrgasmNum",
    "ShellOrgasmStrength",
    "EnergyOrgasmStrength",
    "ShellAlpha",
    "EnergyAlpha",
    "Velocity",
    "Core"
}

local TIMELINE_CONVERTER_FIELDS = {
    "OrgasmNum",
    "TotalOrgasmNum",
    "ShellOrgasmStrength",
    "EnergyOrgasmStrength",
    "ShellAlpha",
    "EnergyAlpha",
    "Velocity",
    "Core",
    "Sensitivity"
}

local CONFIRMED_TIMELINE_FIELD_SET = {}
for _, fieldName in ipairs(WATCHED_CONVERTER_FIELDS) do
    CONFIRMED_TIMELINE_FIELD_SET[fieldName] = true
end

local RAW_SENSITIVITY_FIELDS = {
    "Sensitivity"
}

local NEW_OBJECT_CLASSES = {
    "/Script/Engine.PlayerController",
    "/Script/Engine.Pawn",
    "/Script/Engine.Character",
    "/Script/UMG.UserWidget",
    "/Script/UMG.TextBlock",
    "/Script/UMG.RichTextBlock",
    "/Script/UMG.ProgressBar"
}

local KIND_READY = "[READY]"
local KIND_OBJECT = "[OBJECT]"
local KIND_FUNCTION = "[FUNCTION]"
local KIND_PLAYER = "[PLAYER]"
local KIND_ERROR = "[ERROR]"
local KIND_SCAN = "[SCAN]"
local KIND_SUMMARY = "[SUMMARY]"
local KIND_HOTKEY = "[HOTKEY]"
local KIND_LIMIT = "[LIMIT]"
local KIND_CLASS = "[CLASS]"
local KIND_PROPERTY = "[PROPERTY]"
local KIND_VALUE = "[VALUE]"
local KIND_TRACE = "[TRACE]"
local KIND_CANDIDATE = "[CANDIDATE]"
local KIND_UITEXT = "[UITEXT]"
local KIND_BINDING = "[BINDING]"

local MAX_SCAN_PER_CLASS = 1500
local MAX_TOTAL_CANDIDATES = 1400
local MAX_SUMMARY_LINES = 250
local MAX_NEW_OBJECT_CANDIDATES = 150
local MAX_PROPERTIES_PER_CLASS = 180
local MAX_TARGET_OBJECTS_PER_CLASS = 40
local MAX_ARRAY_VALUES = 24
local MAX_SENSITIVITY_CANDIDATES_PER_SAMPLE = 40
local MAX_UI_TEXT_LINES = 240
local MAX_BINDING_SOURCE_LINES = 260
local MAX_FUNCTION_PROPERTY_LINES = 120
local SENSITIVITY_CANDIDATE_MIN = 0.0
local SENSITIVITY_CANDIDATE_MAX = 3.0
local SENSITIVITY_HUNT_DURATION_SECONDS = 10
local TIMELINE_SAMPLE_COUNT = 101
local TIMELINE_SAMPLE_INTERVAL_MS = 100

local UI_SNAPSHOT_MARKERS = {
    "WG_Converter",
    "WidgetTree"
}

local TARGETED_UI_TEXT_NAMES = {
    "TextBlock_Sensitivity",
    "TextBlock_OrgasmNum",
    "TextBlock_TotalOrgasmNum"
}

local BINDING_SOURCE_KEYWORDS = {
    "Sensitivity",
    "TextBlock_Sensitivity",
    "TextBlock_OrgasmNum",
    "TextBlock_TotalOrgasmNum",
    "Orgasm",
    "Text",
    "Bind",
    "Delegate",
    "Percent",
    "Shell",
    "Energy",
    "Core",
    "Velocity",
    "Stick",
    "Update",
    "Set",
    "Get",
    "Convert"
}

local TARGET_BINDING_FUNCTION_NAMES = {
    "UpdateWGConverter",
    "UpdateStatus",
    "UpdateBC",
    "ExecuteUbergraph_WG_Converter",
    "UpdateOrgasmStrength",
    "SetTextCorePoint",
    "AddChildText"
}

local FUNCTION_PROPERTY_KEYWORDS = {
    "Sensitivity",
    "Sens",
    "Magnification",
    "Rate",
    "Ratio",
    "Scale",
    "Multiply",
    "Multiplier",
    "Text",
    "Format",
    "Float",
    "Orgasm",
    "Shell",
    "Energy",
    "Core",
    "Value",
    "Num",
    "Percent",
    "Alpha",
    "Stick"
}

local UI_TEXT_GETTERS_DISABLED = true
local TEMP_MINIMAL_SENSITIVITY_ONLY = false

local seen = {}
local candidateObjects = {}
local candidateFunctions = {}
local candidateOrder = {}
local functionOrder = {}
local targetedUiObjects = {}
local targetedUiOrder = {}
local dumpedPropertyOwners = {}
local candidatePropertyCache = {}
local sensitivityCandidatePrevious = {}
local logPath = nil
local scanInProgress = false
local timelineInProgress = false
local totalCandidateLogs = 0
local newObjectCandidateLogs = 0

local function now()
    return os.date("%H:%M:%S")
end

local unpackArgs = table.unpack or unpack

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
    local line = string.format("[%s] %s %s", now(), kind, message)
    if not appendFile(path, line) then
        print("[XtoysArunaProbe] log write failed: " .. line)
    end
end

local function logOnce(key, kind, message)
    if seen[key] then
        return false
    end
    seen[key] = true
    logLine(kind, message)
    return true
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

local function isGamePath(text)
    return string.find(safeToString(text), "/Game/0LDAC", 1, true) ~= nil
end

local function isTargetFunctionCandidate(name, source)
    if source ~= "Function" then
        return true
    end

    -- Avoid filling the log with /Script/CoreUObject and engine helper functions.
    return isGamePath(name)
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

local function callGlobal(functionName, ...)
    local fn = _G[functionName]
    if type(fn) ~= "function" then
        return false, nil
    end

    local args = {...}
    local ok, result = pcall(function()
        return fn(unpackArgs(args))
    end)

    if ok then
        return true, result
    end

    return false, result
end

local function isValidObject(object)
    if object == nil then
        return false
    end

    local isValid = callMethod(object, "IsValid")
    if isValid == false then
        return false
    end

    return true
end

local function objectName(object)
    if not isValidObject(object) then
        return "<invalid>"
    end
    return safeToString(callMethod(object, "GetFullName") or callMethod(object, "GetName") or object)
end

local function className(object)
    if not isValidObject(object) then
        return "<invalid>"
    end

    local class = callMethod(object, "GetClass")
    if class ~= nil and isValidObject(class) then
        return objectName(class)
    end
    return "<class unavailable>"
end

local function propertyName(property)
    local fname = callMethod(property, "GetFName")
    if fname ~= nil then
        local text = callMethod(fname, "ToString")
        if text ~= nil then
            return safeToString(text)
        end
    end

    return objectName(property)
end

local function propertyOffset(property)
    local offset = callMethod(property, "GetOffset_Internal")
    if offset == nil then
        return "?"
    end
    return safeToString(offset)
end

local findTargetObjects

local function safeGetField(object, fieldName)
    if object == nil then
        return false, nil
    end

    local ok, result = pcall(function()
        return object[fieldName]
    end)

    if ok then
        return true, result
    end

    return false, result
end

local function unwrapValue(value)
    if value == nil then
        return nil
    end

    local ok, result = pcall(function()
        local getter = value.get
        if type(getter) == "function" then
            return getter(value)
        end
        return value
    end)

    if ok then
        return result
    end

    return value
end

local function valueText(value, depth)
    depth = depth or 0
    if depth > 2 then
        return "<max-depth>"
    end

    value = unwrapValue(value)
    if value == nil then
        return "nil"
    end

    local valueType = type(value)
    if valueType == "number" or valueType == "boolean" or valueType == "string" then
        return safeToString(value)
    end

    local text = callMethod(value, "ToString")
    if text ~= nil then
        return safeToString(text)
    end

    text = callMethod(value, "GetText")
    if text ~= nil then
        local textString = callMethod(text, "ToString")
        if textString ~= nil then
            return safeToString(textString)
        end
        return valueText(text, depth + 1)
    end

    text = callMethod(value, "GetPercent")
    if text ~= nil then
        return safeToString(text)
    end

    if isValidObject(value) then
        return objectName(value)
    end

    return safeToString(value)
end

local function arrayCount(value)
    local count = callMethod(value, "GetArrayNum")
    if count ~= nil then
        return tonumber(count)
    end
    return nil
end

local function dumpArrayValue(label, instanceIndex, fieldName, value)
    local count = arrayCount(value)
    if count == nil then
        return false
    end

    logLine(KIND_VALUE, "target=" .. label .. " instance=" .. tostring(instanceIndex) .. " field=" .. fieldName .. " kind=array count=" .. tostring(count))

    local emitted = 0
    local ok, err = pcall(function()
        value:ForEach(function(index, element)
            if emitted >= MAX_ARRAY_VALUES then
                return true
            end
            emitted = emitted + 1
            logLine(
                KIND_VALUE,
                "target=" .. label ..
                " instance=" .. tostring(instanceIndex) ..
                " field=" .. fieldName ..
                "[" .. tostring(index) .. "] value=" .. valueText(element)
            )
        end)
    end)

    if not ok then
        logLine(KIND_ERROR, "array dump failed target=" .. label .. " field=" .. fieldName .. ": " .. safeToString(err))
    elseif count > MAX_ARRAY_VALUES then
        logLine(KIND_LIMIT, "target=" .. label .. " field=" .. fieldName .. " array values truncated max=" .. tostring(MAX_ARRAY_VALUES))
    end

    return true
end

local function dumpWatchedField(object, label, instanceIndex, fieldName)
    local ok, value = safeGetField(object, fieldName)
    if not ok then
        logLine(KIND_VALUE, "target=" .. label .. " instance=" .. tostring(instanceIndex) .. " field=" .. fieldName .. " unreadable=" .. safeToString(value))
        return
    end

    value = unwrapValue(value)
    if dumpArrayValue(label, instanceIndex, fieldName, value) then
        return
    end

    logLine(
        KIND_VALUE,
        "target=" .. label ..
        " instance=" .. tostring(instanceIndex) ..
        " field=" .. fieldName ..
        " type=" .. type(value) ..
        " value=" .. valueText(value)
    )
end

local function readArraySnapshot(object, fieldName)
    local ok, value = safeGetField(object, fieldName)
    if not ok then
        return nil, "unreadable=" .. safeToString(value)
    end

    value = unwrapValue(value)
    local count = arrayCount(value)
    if count == nil then
        return nil, "not-array value=" .. valueText(value)
    end

    local values = {}
    local iterOk, iterErr = pcall(function()
        value:ForEach(function(index, element)
            if index > MAX_ARRAY_VALUES then
                return true
            end
            values[index] = valueText(element)
        end)
    end)

    if not iterOk then
        return nil, "array-read-failed=" .. safeToString(iterErr)
    end

    return values, nil
end

local function dumpDevelopmentPairs(object, instanceIndex)
    local parts, partsErr = readArraySnapshot(object, "DevelopmentParts")
    local values, valuesErr = readArraySnapshot(object, "BDValue")

    if parts == nil or values == nil then
        logLine(
            KIND_VALUE,
            "target=WG_Converter instance=" .. tostring(instanceIndex) ..
            " field=DevelopmentPairs unavailable parts=" .. safeToString(partsErr) ..
            " values=" .. safeToString(valuesErr)
        )
        return
    end

    local maxIndex = math.max(#parts, #values)
    for index = 1, maxIndex do
        logLine(
            KIND_VALUE,
            "target=WG_Converter instance=" .. tostring(instanceIndex) ..
            " field=DevelopmentPairs[" .. tostring(index) .. "] part=" .. safeToString(parts[index]) ..
            " value=" .. safeToString(values[index])
        )
    end
end

local function numberField(object, fieldName)
    local ok, value = safeGetField(object, fieldName)
    if not ok then
        return nil
    end

    value = unwrapValue(value)
    if type(value) == "number" then
        return value
    end

    local percent = callMethod(value, "GetPercent")
    if type(percent) == "number" then
        return percent
    end

    return tonumber(valueText(value))
end

local function trimText(text)
    text = safeToString(text)
    text = string.gsub(text, "^%s+", "")
    text = string.gsub(text, "%s+$", "")
    return text
end

local function parseCandidateNumber(text)
    local normalized = string.lower(trimText(text))
    if string.sub(normalized, 1, 1) == "x" then
        normalized = trimText(string.sub(normalized, 2))
    end
    return tonumber(normalized)
end

local function candidateNumberField(object, fieldName)
    local ok, value = safeGetField(object, fieldName)
    if not ok then
        return nil
    end

    value = unwrapValue(value)
    if arrayCount(value) ~= nil then
        return nil
    end

    if type(value) == "number" then
        return value
    end

    local percent = callMethod(value, "GetPercent")
    if type(percent) == "number" then
        return percent
    end

    return parseCandidateNumber(valueText(value))
end

local function shouldScanSensitivityField(fieldName)
    if fieldName == nil or fieldName == "" then
        return false
    end

    if CONFIRMED_TIMELINE_FIELD_SET[fieldName] then
        return false
    end

    local lower = string.lower(fieldName)
    if string.find(lower, "development", 1, true) ~= nil then
        return false
    end
    if string.find(lower, "body", 1, true) ~= nil then
        return false
    end
    if string.find(lower, "clit", 1, true) ~= nil then
        return false
    end
    if string.find(lower, "peni", 1, true) ~= nil then
        return false
    end
    if lower == "bdvalue" then
        return false
    end

    return true
end

local function shouldLogSensitivitySummary(sampleIndex)
    if sampleIndex == 1 or sampleIndex == TIMELINE_SAMPLE_COUNT then
        return true
    end
    return (sampleIndex - 1) % 10 == 0
end

local function sensitivityCandidatePriority(fieldName)
    local lower = string.lower(fieldName)
    local strongTerms = { "sensitivity", "sens", "feel", "pleasure", "rate", "ratio", "multi", "magnification", "scale" }
    for _, term in ipairs(strongTerms) do
        if string.find(lower, term, 1, true) ~= nil then
            return 3
        end
    end

    local usefulTerms = { "value", "num", "alpha", "strength", "gauge", "bar" }
    for _, term in ipairs(usefulTerms) do
        if string.find(lower, term, 1, true) ~= nil then
            return 1
        end
    end

    return 0
end

local function collectCandidatePropertyNames(object)
    local classObject = callMethod(object, "GetClass")
    if not isValidObject(classObject) then
        return {}
    end

    local cacheKey = objectName(classObject)
    if candidatePropertyCache[cacheKey] ~= nil then
        return candidatePropertyCache[cacheKey]
    end

    local names = {}
    local seenNames = {}
    local propertyCount = 0
    local ok, err = pcall(function()
        classObject:ForEachProperty(function(property)
            if propertyCount >= MAX_PROPERTIES_PER_CLASS then
                return true
            end

            propertyCount = propertyCount + 1
            local name = propertyName(property)
            if shouldScanSensitivityField(name) and not seenNames[name] then
                seenNames[name] = true
                table.insert(names, name)
            end
        end)
    end)

    if not ok then
        logOnce("candidate-properties:" .. cacheKey, KIND_ERROR, "candidate property enumeration failed class=" .. cacheKey .. ": " .. safeToString(err))
    end

    table.sort(names)
    candidatePropertyCache[cacheKey] = names
    return names
end

local function rawFieldText(object, fieldName)
    local ok, value = safeGetField(object, fieldName)
    if not ok then
        return "<unreadable:" .. safeToString(value) .. ">"
    end

    value = unwrapValue(value)
    if arrayCount(value) ~= nil then
        return "<array>"
    end

    return valueText(value)
end

local function dumpRawSensitivityFields(reason, sampleIndex, elapsedMs, object, instanceIndex)
    if not shouldLogSensitivitySummary(sampleIndex) then
        return 0
    end

    local emitted = 0
    for _, fieldName in ipairs(RAW_SENSITIVITY_FIELDS) do
        emitted = emitted + 1
        logLine(
            KIND_CANDIDATE,
            "reason=" .. reason ..
            " sample=" .. tostring(sampleIndex) ..
            " t=" .. string.format("%.3f", elapsedMs / 1000) ..
            " target=WG_Converter" ..
            " instance=" .. tostring(instanceIndex) ..
            " field=" .. fieldName ..
            " raw=" .. rawFieldText(object, fieldName) ..
            " mode=raw"
        )
    end

    return emitted
end

local function converterActivityScore(object)
    local score = 0
    for _, fieldName in ipairs(TIMELINE_CONVERTER_FIELDS) do
        local value = numberField(object, fieldName)
        if value ~= nil then
            if fieldName == "Core" then
                score = score + math.abs(50000 - value) / 1000
            else
                score = score + math.abs(value)
            end
        end
    end
    return score
end

local function findActiveConverterObject()
    local objects = findTargetObjects({
        label = "WG_Converter",
        className = "WG_Converter_C",
        path = "/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C"
    })

    local selected = nil
    local selectedIndex = 0
    local selectedScore = -1
    for index, object in ipairs(objects) do
        if isValidObject(object) then
            local score = converterActivityScore(object)
            if score >= selectedScore then
                selected = object
                selectedIndex = index
                selectedScore = score
            end
        end
    end

    return selected, selectedIndex, selectedScore, #objects
end

local function compactFieldText(object, fieldName)
    local ok, value = safeGetField(object, fieldName)
    if not ok then
        return fieldName .. "=<unreadable>"
    end

    value = unwrapValue(value)
    if arrayCount(value) ~= nil then
        return fieldName .. "=<array>"
    end

    return fieldName .. "=" .. valueText(value)
end

local function dumpSensitivityCandidates(reason, sampleIndex, elapsedMs, object, instanceIndex)
    local propertyNames = collectCandidatePropertyNames(object)
    local candidates = {}
    local numericMatches = 0
    local rawMatches = 0

    for _, fieldName in ipairs(propertyNames) do
        local value = candidateNumberField(object, fieldName)
        if value ~= nil and value >= SENSITIVITY_CANDIDATE_MIN and value <= SENSITIVITY_CANDIDATE_MAX then
            numericMatches = numericMatches + 1
            local key = tostring(instanceIndex) .. ":" .. fieldName
            local previous = sensitivityCandidatePrevious[key]
            sensitivityCandidatePrevious[key] = value

            local delta = nil
            local changed = false
            if previous ~= nil then
                delta = value - previous
                changed = math.abs(delta) > 0.000001
            end

            if sampleIndex == 1 or sampleIndex == TIMELINE_SAMPLE_COUNT or changed then
                table.insert(candidates, {
                    fieldName = fieldName,
                    value = value,
                    delta = delta,
                    changed = changed,
                    priority = sensitivityCandidatePriority(fieldName)
                })
            end
        end
    end

    table.sort(candidates, function(a, b)
        if a.priority ~= b.priority then
            return a.priority > b.priority
        end
        if a.changed ~= b.changed then
            return a.changed
        end
        return a.fieldName < b.fieldName
    end)

    local emitted = 0
    for _, candidate in ipairs(candidates) do
        if emitted >= MAX_SENSITIVITY_CANDIDATES_PER_SAMPLE then
            logLine(
                KIND_LIMIT,
                "reason=" .. reason ..
                " sample=" .. tostring(sampleIndex) ..
                " target=WG_Converter instance=" .. tostring(instanceIndex) ..
                " sensitivityCandidates truncated total=" .. tostring(#candidates) ..
                " max=" .. tostring(MAX_SENSITIVITY_CANDIDATES_PER_SAMPLE)
            )
            break
        end

        emitted = emitted + 1
        logLine(
            KIND_CANDIDATE,
            "reason=" .. reason ..
            " sample=" .. tostring(sampleIndex) ..
            " t=" .. string.format("%.3f", elapsedMs / 1000) ..
            " target=WG_Converter" ..
            " instance=" .. tostring(instanceIndex) ..
            " field=" .. candidate.fieldName ..
            " value=" .. string.format("%.6f", candidate.value) ..
            " delta=" .. (candidate.delta == nil and "nil" or string.format("%.6f", candidate.delta)) ..
            " priority=" .. tostring(candidate.priority)
        )
    end

    rawMatches = dumpRawSensitivityFields(reason, sampleIndex, elapsedMs, object, instanceIndex)

    return {
        properties = #propertyNames,
        numericMatches = numericMatches,
        emitted = emitted,
        rawMatches = rawMatches
    }
end

local function dumpSensitivityHuntSummary(reason, sampleIndex, elapsedMs, objectCount, validCount, propertyCount, numericMatches, candidateLines, rawMatches)
    if not shouldLogSensitivitySummary(sampleIndex) then
        return
    end

    logLine(
        KIND_SUMMARY,
        "reason=" .. reason ..
        " sample=" .. tostring(sampleIndex) ..
        " t=" .. string.format("%.3f", elapsedMs / 1000) ..
        " target=WG_Converter" ..
        " objects=" .. tostring(objectCount) ..
        " valid=" .. tostring(validCount) ..
        " properties=" .. tostring(propertyCount) ..
        " numericMatches=" .. tostring(numericMatches) ..
        " candidateLines=" .. tostring(candidateLines) ..
        " rawMatches=" .. tostring(rawMatches)
    )
end

local function dumpSensitivityCandidateObjects(reason, sampleIndex, elapsedMs)
    local objects = findTargetObjects({
        label = "WG_Converter",
        className = "WG_Converter_C",
        path = "/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C"
    })

    local emitted = 0
    local propertyCount = 0
    local numericMatches = 0
    local candidateLines = 0
    local rawMatches = 0
    for index, object in ipairs(objects) do
        if isValidObject(object) then
            emitted = emitted + 1
            local stats = dumpSensitivityCandidates(reason, sampleIndex, elapsedMs, object, index)
            propertyCount = propertyCount + stats.properties
            numericMatches = numericMatches + stats.numericMatches
            candidateLines = candidateLines + stats.emitted
            rawMatches = rawMatches + stats.rawMatches
        end
    end

    dumpSensitivityHuntSummary(reason, sampleIndex, elapsedMs, #objects, emitted, propertyCount, numericMatches, candidateLines, rawMatches)

    if emitted == 0 then
        logLine(
            KIND_CANDIDATE,
            "reason=" .. reason ..
            " sample=" .. tostring(sampleIndex) ..
            " t=" .. string.format("%.3f", elapsedMs / 1000) ..
            " target=WG_Converter unavailable objects=" .. tostring(#objects)
        )
    end
end

local function cleanLogValue(value)
    local text = safeToString(value)
    text = string.gsub(text, "[\r\n\t]", " ")
    text = string.gsub(text, "%s+", " ")
    return text
end

local function targetedUiName(fullName)
    for _, targetName in ipairs(TARGETED_UI_TEXT_NAMES) do
        if string.find(fullName, targetName, 1, true) ~= nil then
            return targetName
        end
    end
    return nil
end

local function isRuntimeUiTextObject(fullName)
    return string.find(fullName, "/Engine/Transient", 1, true) ~= nil
        and string.find(fullName, ".WidgetTree_", 1, true) ~= nil
end

local function rememberTargetedUiObject(object, source, class, name)
    name = name or objectName(object)
    if string.find(name, "WG_Converter", 1, true) == nil then
        return false
    end

    local targetName = targetedUiName(name)
    if targetName == nil then
        return false
    end

    local key = targetName .. ":" .. name
    if targetedUiObjects[key] == nil then
        table.insert(targetedUiOrder, key)
    end

    targetedUiObjects[key] = {
        object = object,
        source = source or "unknown",
        class = class or className(object),
        name = name,
        targetName = targetName,
        runtime = isRuntimeUiTextObject(name)
    }

    return true
end

local function dumpTargetedUiTextReadings(reason, maxLines)
    local emitted = 0
    local visited = 0

    for _, key in ipairs(targetedUiOrder) do
        if maxLines ~= nil and emitted >= maxLines then
            logLine(KIND_LIMIT, "targeted UI text reads truncated max=" .. tostring(maxLines))
            break
        end

        local entry = targetedUiObjects[key]
        if entry ~= nil then
            visited = visited + 1
            logLine(
                KIND_UITEXT,
                "reason=" .. reason ..
                " mode=target-read-begin" ..
                " target=" .. entry.targetName ..
                " source=" .. entry.source ..
                " class=" .. entry.class ..
                " name=" .. entry.name
            )

            local object = entry.object
            if not entry.runtime then
                emitted = emitted + 1
                logLine(
                    KIND_UITEXT,
                    "reason=" .. reason ..
                    " mode=target-skip" ..
                    " target=" .. entry.targetName ..
                    " status=non-runtime" ..
                    " name=" .. entry.name
                )
            elseif not isValidObject(object) then
                emitted = emitted + 1
                logLine(
                    KIND_UITEXT,
                    "reason=" .. reason ..
                    " mode=target-read-disabled" ..
                    " target=" .. entry.targetName ..
                    " status=invalid" ..
                    " name=" .. entry.name
                )
            else
                emitted = emitted + 1
                logLine(
                    KIND_UITEXT,
                    "reason=" .. reason ..
                    " mode=target-read-disabled" ..
                    " target=" .. entry.targetName ..
                    " status=native-getters-disabled" ..
                    " disabled=" .. tostring(UI_TEXT_GETTERS_DISABLED) ..
                    " name=" .. entry.name
                )
            end
        end
    end

    logLine(KIND_SUMMARY, "reason=" .. reason .. " targetedUiTextVisited=" .. tostring(visited) .. " targetedUiTextReads=" .. tostring(emitted))
    return emitted
end

local function dumpUiTextSnapshot(reason)
    logLine(KIND_SCAN, "begin cached UI object snapshot reason=" .. reason)

    local converterObjects = findTargetObjects({
        label = "WG_Converter",
        className = "WG_Converter_C",
        path = "/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C"
    })

    local emitted = 0
    for index, object in ipairs(converterObjects) do
        if emitted >= MAX_UI_TEXT_LINES then
            break
        end
        if isValidObject(object) then
            emitted = emitted + 1
            logLine(
                KIND_UITEXT,
                "reason=" .. reason ..
                " target=WG_Converter" ..
                " instance=" .. tostring(index) ..
                " directSensitivity=" .. cleanLogValue(rawFieldText(object, "Sensitivity")) ..
                " mode=direct-safe" ..
                " object=" .. objectName(object)
            )
        end
    end

    local visited = 0
    local matched = 0
    for _, key in ipairs(candidateOrder) do
        visited = visited + 1
        if emitted >= MAX_UI_TEXT_LINES then
            logLine(KIND_LIMIT, "cached UI object snapshot truncated max=" .. tostring(MAX_UI_TEXT_LINES))
            break
        end

        local line = candidateObjects[key]
        if line ~= nil and string.find(line, "WG_Converter", 1, true) ~= nil then
            local keep = false
            for _, marker in ipairs(UI_SNAPSHOT_MARKERS) do
                if string.find(line, marker, 1, true) ~= nil then
                    keep = true
                    break
                end
            end

            if keep then
                matched = matched + 1
                emitted = emitted + 1
                logLine(KIND_UITEXT, "reason=" .. reason .. " mode=cached " .. line)
            end
        end
    end

    local remaining = MAX_UI_TEXT_LINES - emitted
    local targetedReads = 0
    if remaining > 0 then
        targetedReads = dumpTargetedUiTextReadings(reason, remaining)
        emitted = emitted + targetedReads
    else
        logLine(KIND_LIMIT, "targeted UI text reads skipped because UI text line budget is exhausted")
    end

    logLine(KIND_SUMMARY, "reason=" .. reason .. " cachedUiVisited=" .. tostring(visited) .. " matched=" .. tostring(matched) .. " targetedReads=" .. tostring(targetedReads) .. " emitted=" .. tostring(emitted))
    logLine(KIND_SCAN, "end cached UI object snapshot reason=" .. reason)
end

local function sampleTimelineValues(reason)
    if timelineInProgress then
        logLine(KIND_SCAN, "skip sensitivity hunt reason=" .. reason .. " because timeline is already running")
        return
    end

    timelineInProgress = true
    sensitivityCandidatePrevious = {}
    logLine(
        KIND_SCAN,
        "begin sensitivity candidate hunt reason=" .. reason ..
        " samples=" .. tostring(TIMELINE_SAMPLE_COUNT) ..
        " intervalMs=" .. tostring(TIMELINE_SAMPLE_INTERVAL_MS) ..
        " durationSeconds=" .. tostring(SENSITIVITY_HUNT_DURATION_SECONDS)
    )

    local hasDelay = type(ExecuteWithDelay) == "function"
    if not hasDelay then
        logLine(KIND_ERROR, "ExecuteWithDelay unavailable; sensitivity hunt samples will run immediately")
    end

    local function tick(sampleIndex)
        dumpSensitivityCandidateObjects(reason, sampleIndex, (sampleIndex - 1) * TIMELINE_SAMPLE_INTERVAL_MS)

        if sampleIndex >= TIMELINE_SAMPLE_COUNT then
            timelineInProgress = false
            logLine(KIND_SCAN, "end sensitivity candidate hunt reason=" .. reason .. " samples=" .. tostring(TIMELINE_SAMPLE_COUNT))
            return
        end

        if hasDelay then
            ExecuteWithDelay(TIMELINE_SAMPLE_INTERVAL_MS, function()
                tick(sampleIndex + 1)
            end)
        else
            tick(sampleIndex + 1)
        end
    end

    tick(1)
end

local function sampleConverterValues(reason)
    logLine(KIND_SCAN, "begin converter value sample reason=" .. reason)

    local objects = findTargetObjects({
        label = "WG_Converter",
        className = "WG_Converter_C",
        path = "/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C"
    })

    local sampled = 0
    for index, object in ipairs(objects) do
        if isValidObject(object) then
            sampled = sampled + 1
            logLine(KIND_VALUE, "target=WG_Converter instance=" .. tostring(index) .. " object=" .. objectName(object))
            for _, fieldName in ipairs(WATCHED_CONVERTER_FIELDS) do
                dumpWatchedField(object, "WG_Converter", index, fieldName)
            end
        end
    end

    logLine(KIND_SCAN, "end converter value sample reason=" .. reason .. " instances=" .. tostring(sampled))
end

local function dumpSensitivityOnly(reason)
    logLine(KIND_SCAN, "begin minimal sensitivity-only sample reason=" .. reason)

    local objects = findTargetObjects({
        label = "WG_Converter",
        className = "WG_Converter_C",
        path = "/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C"
    })

    local sampled = 0
    for index, object in ipairs(objects) do
        if isValidObject(object) then
            sampled = sampled + 1
            logLine(KIND_VALUE, "target=WG_Converter instance=" .. tostring(index) .. " mode=sensitivity-only object=" .. objectName(object))
            dumpWatchedField(object, "WG_Converter", index, "Sensitivity")
        end
    end

    logLine(KIND_SUMMARY, "reason=" .. reason .. " mode=sensitivity-only instances=" .. tostring(sampled) .. " objects=" .. tostring(#objects))
    logLine(KIND_SCAN, "end minimal sensitivity-only sample reason=" .. reason)
end

local function findTargetClass(definition)
    local ok, object = callGlobal("StaticFindObject", definition.path)
    if ok and isValidObject(object) then
        return object, "StaticFindObject(path)"
    end

    ok, object = callGlobal("StaticFindObject", "BlueprintGeneratedClass " .. definition.path)
    if ok and isValidObject(object) then
        return object, "StaticFindObject(full)"
    end

    if type(FindObject) == "function" then
        ok, object = pcall(function()
            return FindObject(nil, nil, definition.path, false)
        end)
        if ok and isValidObject(object) then
            return object, "FindObject(path)"
        end
    end

    return nil, "unavailable"
end

function findTargetObjects(definition)
    local ok, objects = pcall(function()
        return FindAllOf(definition.className)
    end)

    if ok and objects ~= nil then
        return objects
    end

    return {}
end

local function dumpClassProperties(definition, classObject)
    if not isValidObject(classObject) then
        logLine(KIND_CLASS, "target=" .. definition.label .. " properties unavailable")
        return
    end

    local classFullName = objectName(classObject)
    local dumpKey = definition.label .. ":" .. classFullName
    if dumpedPropertyOwners[dumpKey] then
        logLine(KIND_CLASS, "target=" .. definition.label .. " properties already dumped owner=" .. classFullName)
        return
    end
    dumpedPropertyOwners[dumpKey] = true

    local propertyCount = 0
    local ok, err = pcall(function()
        classObject:ForEachProperty(function(property)
            if propertyCount >= MAX_PROPERTIES_PER_CLASS then
                return true
            end

            propertyCount = propertyCount + 1
            logLine(
                KIND_PROPERTY,
                "target=" .. definition.label ..
                " owner=" .. classFullName ..
                " index=" .. tostring(propertyCount) ..
                " offset=" .. propertyOffset(property) ..
                " type=" .. className(property) ..
                " name=" .. propertyName(property)
            )
        end)
    end)

    if ok then
        logLine(KIND_CLASS, "target=" .. definition.label .. " properties=" .. tostring(propertyCount) .. " owner=" .. classFullName)
    else
        logLine(KIND_ERROR, "ForEachProperty failed target=" .. definition.label .. ": " .. safeToString(err))
    end
end

local function matchesBindingSourceKeyword(text)
    local textLower = lower(text)
    for _, keyword in ipairs(BINDING_SOURCE_KEYWORDS) do
        if string.find(textLower, string.lower(keyword), 1, true) then
            return true
        end
    end
    return false
end

local function matchesFunctionPropertyKeyword(text)
    local textLower = lower(text)
    for _, keyword in ipairs(FUNCTION_PROPERTY_KEYWORDS) do
        if string.find(textLower, string.lower(keyword), 1, true) then
            return true
        end
    end
    return false
end

local function isTargetBindingFunctionName(functionFullName)
    local text = safeToString(functionFullName)
    for _, targetName in ipairs(TARGET_BINDING_FUNCTION_NAMES) do
        if string.find(text, targetName, 1, true) ~= nil then
            return true
        end
    end
    return false
end

local function dumpBindingFunctionProperties(reason, label, functionObject, ownerTag, emitted, functionName)
    if not isValidObject(functionObject) then
        logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " kind=function-property-summary ownerTag=" .. ownerTag .. " function=" .. cleanLogValue(functionName) .. " unavailable=invalid-function")
        return emitted
    end

    local scanned = 0
    local matched = 0
    local functionEmitted = 0
    local ok, err = pcall(function()
        functionObject:ForEachProperty(function(functionProperty)
            scanned = scanned + 1
            if emitted >= MAX_BINDING_SOURCE_LINES or functionEmitted >= MAX_FUNCTION_PROPERTY_LINES then
                return true
            end

            local name = propertyName(functionProperty)
            local propertyClass = className(functionProperty)
            local combined = name .. " " .. propertyClass
            local keywordMatched = matchesFunctionPropertyKeyword(combined)
            if keywordMatched then
                matched = matched + 1
            end

            emitted = emitted + 1
            functionEmitted = functionEmitted + 1
            logLine(
                KIND_BINDING,
                "reason=" .. reason ..
                " target=" .. label ..
                " kind=function-property" ..
                " ownerTag=" .. ownerTag ..
                " function=" .. cleanLogValue(functionName) ..
                " index=" .. tostring(scanned) ..
                " offset=" .. propertyOffset(functionProperty) ..
                " keyword=" .. tostring(keywordMatched) ..
                " type=" .. propertyClass ..
                " name=" .. name
            )
        end)
    end)

    if not ok then
        logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " kind=function-property-summary ownerTag=" .. ownerTag .. " function=" .. cleanLogValue(functionName) .. " unavailable=" .. cleanLogValue(err))
    else
        logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " kind=function-property-summary ownerTag=" .. ownerTag .. " function=" .. cleanLogValue(functionName) .. " scanned=" .. tostring(scanned) .. " emitted=" .. tostring(functionEmitted) .. " keywordMatches=" .. tostring(matched))
    end

    return emitted
end

local function dumpBindingProperties(reason, label, classObject, ownerTag, emitted)
    if not isValidObject(classObject) then
        logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " ownerTag=" .. ownerTag .. " properties unavailable")
        return emitted
    end

    local ownerName = objectName(classObject)
    local scanned = 0
    local matched = 0
    local ok, err = pcall(function()
        classObject:ForEachProperty(function(property)
            scanned = scanned + 1
            if emitted >= MAX_BINDING_SOURCE_LINES then
                return true
            end

            local name = propertyName(property)
            local propertyClass = className(property)
            local combined = name .. " " .. propertyClass
            if matchesBindingSourceKeyword(combined) then
                matched = matched + 1
                emitted = emitted + 1
                logLine(
                    KIND_BINDING,
                    "reason=" .. reason ..
                    " target=" .. label ..
                    " kind=property" ..
                    " ownerTag=" .. ownerTag ..
                    " owner=" .. ownerName ..
                    " index=" .. tostring(scanned) ..
                    " offset=" .. propertyOffset(property) ..
                    " type=" .. propertyClass ..
                    " name=" .. name
                )
            end
        end)
    end)

    if not ok then
        logLine(KIND_ERROR, "binding property scan failed target=" .. label .. " ownerTag=" .. ownerTag .. ": " .. safeToString(err))
    end

    logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " kind=property-summary ownerTag=" .. ownerTag .. " owner=" .. ownerName .. " scanned=" .. tostring(scanned) .. " matched=" .. tostring(matched))
    return emitted
end

local function dumpBindingFunctions(reason, label, classObject, ownerTag, emitted)
    if not isValidObject(classObject) then
        logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " ownerTag=" .. ownerTag .. " functions unavailable")
        return emitted
    end

    local ownerName = objectName(classObject)
    local scanned = 0
    local matched = 0
    local ok, err = pcall(function()
        classObject:ForEachFunction(function(functionObject)
            scanned = scanned + 1
            if emitted >= MAX_BINDING_SOURCE_LINES then
                return true
            end

            local name = objectName(functionObject)
            local combined = name .. " " .. className(functionObject)
            local targetFunction = isTargetBindingFunctionName(name)
            if matchesBindingSourceKeyword(combined) or targetFunction then
                matched = matched + 1
                emitted = emitted + 1
                logLine(
                    KIND_BINDING,
                    "reason=" .. reason ..
                    " target=" .. label ..
                    " kind=function" ..
                    " ownerTag=" .. ownerTag ..
                    " owner=" .. ownerName ..
                    " index=" .. tostring(scanned) ..
                    " type=" .. className(functionObject) ..
                    " name=" .. name
                )

                if targetFunction and emitted < MAX_BINDING_SOURCE_LINES then
                    emitted = dumpBindingFunctionProperties(reason, label, functionObject, ownerTag, emitted, name)
                end
            end
        end)
    end)

    if not ok then
        logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " kind=function-summary ownerTag=" .. ownerTag .. " owner=" .. ownerName .. " unavailable=" .. cleanLogValue(err))
    else
        logLine(KIND_BINDING, "reason=" .. reason .. " target=" .. label .. " kind=function-summary ownerTag=" .. ownerTag .. " owner=" .. ownerName .. " scanned=" .. tostring(scanned) .. " matched=" .. tostring(matched))
    end

    return emitted
end

local function dumpTargetedUiBindingObjects(reason, emitted)
    local visited = 0
    local matched = 0
    for _, key in ipairs(targetedUiOrder) do
        if emitted >= MAX_BINDING_SOURCE_LINES then
            logLine(KIND_LIMIT, "binding source lines truncated max=" .. tostring(MAX_BINDING_SOURCE_LINES))
            break
        end

        local entry = targetedUiObjects[key]
        if entry ~= nil then
            visited = visited + 1
            matched = matched + 1
            emitted = emitted + 1
            logLine(
                KIND_BINDING,
                "reason=" .. reason ..
                " target=WG_Converter" ..
                " kind=targeted-ui-object" ..
                " targetName=" .. entry.targetName ..
                " runtime=" .. tostring(entry.runtime) ..
                " source=" .. entry.source ..
                " class=" .. entry.class ..
                " name=" .. entry.name
            )
        end
    end

    logLine(KIND_BINDING, "reason=" .. reason .. " target=WG_Converter kind=targeted-ui-summary visited=" .. tostring(visited) .. " matched=" .. tostring(matched))
    return emitted
end

local function dumpConverterBindingSources(reason)
    logLine(KIND_SCAN, "begin converter binding sources reason=" .. reason)

    local emitted = 0
    local definition = {
        label = "WG_Converter",
        className = "WG_Converter_C",
        path = "/Game/0LDAC/00Actor/Pawn/0Component/Converter/WG_Converter.WG_Converter_C"
    }

    local classObject, classSource = findTargetClass(definition)
    if isValidObject(classObject) then
        logLine(KIND_BINDING, "reason=" .. reason .. " target=WG_Converter kind=class source=" .. classSource .. " owner=" .. objectName(classObject))
        emitted = dumpBindingProperties(reason, "WG_Converter", classObject, "blueprint-class", emitted)
        emitted = dumpBindingFunctions(reason, "WG_Converter", classObject, "blueprint-class", emitted)
    else
        logLine(KIND_BINDING, "reason=" .. reason .. " target=WG_Converter kind=class unavailable path=" .. definition.path)
    end

    local seenOwners = {}
    local objects = findTargetObjects(definition)
    for index, object in ipairs(objects) do
        if emitted >= MAX_BINDING_SOURCE_LINES then
            logLine(KIND_LIMIT, "binding source lines truncated max=" .. tostring(MAX_BINDING_SOURCE_LINES))
            break
        end

        if isValidObject(object) then
            local runtimeClass = callMethod(object, "GetClass")
            if isValidObject(runtimeClass) then
                local ownerName = objectName(runtimeClass)
                if not seenOwners[ownerName] then
                    seenOwners[ownerName] = true
                    logLine(KIND_BINDING, "reason=" .. reason .. " target=WG_Converter kind=runtime-class instance=" .. tostring(index) .. " owner=" .. ownerName .. " object=" .. objectName(object))
                    emitted = dumpBindingProperties(reason, "WG_Converter", runtimeClass, "runtime-class-" .. tostring(index), emitted)
                    emitted = dumpBindingFunctions(reason, "WG_Converter", runtimeClass, "runtime-class-" .. tostring(index), emitted)
                end
            end
        end
    end

    emitted = dumpTargetedUiBindingObjects(reason, emitted)
    logLine(KIND_SUMMARY, "reason=" .. reason .. " target=WG_Converter bindingSourceLines=" .. tostring(emitted) .. " runtimeObjects=" .. tostring(#objects))
    logLine(KIND_SCAN, "end converter binding sources reason=" .. reason)
end

local function dumpTargetBlueprints(reason)
    logLine(KIND_SCAN, "begin target blueprints reason=" .. reason .. " targets=" .. tostring(#TARGET_BLUEPRINT_CLASSES))

    for _, definition in ipairs(TARGET_BLUEPRINT_CLASSES) do
        local classObject, classSource = findTargetClass(definition)
        if isValidObject(classObject) then
            logLine(KIND_CLASS, "target=" .. definition.label .. " class=" .. objectName(classObject) .. " source=" .. classSource)
            dumpClassProperties(definition, classObject)
        else
            logLine(KIND_CLASS, "target=" .. definition.label .. " classPath=" .. definition.path .. " unavailable")
        end

        local objects = findTargetObjects(definition)
        local objectCount = 0
        for index, object in ipairs(objects) do
            objectCount = objectCount + 1
            if objectCount > MAX_TARGET_OBJECTS_PER_CLASS then
                logLine(KIND_LIMIT, "target=" .. definition.label .. " object list truncated max=" .. tostring(MAX_TARGET_OBJECTS_PER_CLASS))
                break
            end
            if isValidObject(object) then
                logLine(KIND_OBJECT, "target=" .. definition.label .. " index=" .. tostring(index) .. " class=" .. className(object) .. " name=" .. objectName(object))
                local runtimeClass = callMethod(object, "GetClass")
                if isValidObject(runtimeClass) then
                    dumpClassProperties(definition, runtimeClass)
                end
            end
        end
        logLine(KIND_CLASS, "target=" .. definition.label .. " runtimeObjects=" .. tostring(#objects))
    end

    logLine(KIND_SCAN, "end target blueprints reason=" .. reason)
end

local function rememberCandidate(object, source)
    if not isValidObject(object) then
        return false
    end

    local name = objectName(object)
    local class = className(object)
    local combined = class .. " " .. name

    rememberTargetedUiObject(object, source, class, name)

    if not isTargetFunctionCandidate(name, source) then
        return false
    end

    if not matchesKeyword(combined) then
        return false
    end

    if totalCandidateLogs >= MAX_TOTAL_CANDIDATES then
        logOnce("candidate-limit", KIND_LIMIT, "candidate log limit reached max=" .. tostring(MAX_TOTAL_CANDIDATES))
        return true
    end

    local key = "object:" .. combined
    if not candidateObjects[key] then
        candidateObjects[key] = string.format("source=%s class=%s name=%s", source or "unknown", class, name)
        table.insert(candidateOrder, key)
    end

    if logOnce(key, KIND_OBJECT, candidateObjects[key]) then
        totalCandidateLogs = totalCandidateLogs + 1
    end

    if string.find(lower(class), "function", 1, true) or string.find(lower(name), "function", 1, true) then
        local functionKey = "function:" .. combined
        if not candidateFunctions[functionKey] then
            candidateFunctions[functionKey] = string.format("source=%s owner=%s function=%s", source or "unknown", class, name)
            table.insert(functionOrder, functionKey)
        end
        logOnce(functionKey, KIND_FUNCTION, candidateFunctions[functionKey])
    end

    return true
end

local function scanClass(classNameToFind, reason)
    local visited = 0
    local matched = 0

    local ok, objects = pcall(function()
        return FindAllOf(classNameToFind)
    end)

    if not ok or objects == nil then
        logOnce("scan-class-miss:" .. classNameToFind, KIND_SCAN, "class=" .. classNameToFind .. " unavailable reason=" .. reason)
        return visited, matched
    end

    for _, object in ipairs(objects) do
        visited = visited + 1
        if rememberCandidate(object, classNameToFind) then
            matched = matched + 1
        end
        if visited >= MAX_SCAN_PER_CLASS then
            logLine(KIND_LIMIT, "class=" .. classNameToFind .. " visitedLimit=" .. tostring(MAX_SCAN_PER_CLASS))
            break
        end
        if totalCandidateLogs >= MAX_TOTAL_CANDIDATES then
            break
        end
    end

    return visited, matched
end

local function scanObjects(reason)
    if scanInProgress then
        logLine(KIND_SCAN, "skip reason=" .. reason .. " because scan is already running")
        return
    end

    scanInProgress = true
    logLine(KIND_SCAN, "begin reason=" .. reason .. " mode=targeted classes=" .. tostring(#TARGET_SCAN_CLASSES))

    local totalVisited = 0
    local totalMatched = 0
    for _, classNameToFind in ipairs(TARGET_SCAN_CLASSES) do
        local visited, matched = scanClass(classNameToFind, reason)
        totalVisited = totalVisited + visited
        totalMatched = totalMatched + matched
        logLine(KIND_SCAN, "class=" .. classNameToFind .. " visited=" .. tostring(visited) .. " matched=" .. tostring(matched))
        if totalCandidateLogs >= MAX_TOTAL_CANDIDATES then
            break
        end
    end

    logLine(KIND_SCAN, "end reason=" .. reason .. " objectsVisited=" .. tostring(totalVisited) .. " matched=" .. tostring(totalMatched))
    scanInProgress = false
end

local function scanAllObjectsUnsafe(reason)
    logLine(KIND_SCAN, "unsafe global ForEachUObject scan disabled by default reason=" .. reason)
    -- Kept only as a last-resort diagnostic hook; Aruna 1.206 crashed inside UE4SS during this path.
    -- ForEachUObject(function(object)
    --     rememberCandidate(object, "ForEachUObject")
    -- end)
end

local function dumpSummary()
    local objectCount = 0
    for _ in pairs(candidateObjects) do
        objectCount = objectCount + 1
    end

    local functionCount = 0
    for _ in pairs(candidateFunctions) do
        functionCount = functionCount + 1
    end

    local objectLines = 0
    for _, key in ipairs(candidateOrder) do
        if objectLines >= MAX_SUMMARY_LINES then
            logLine(KIND_LIMIT, "summary object lines truncated max=" .. tostring(MAX_SUMMARY_LINES))
            break
        end
        logLine(KIND_OBJECT, candidateObjects[key])
        objectLines = objectLines + 1
    end

    local functionLines = 0
    for _, key in ipairs(functionOrder) do
        if functionLines >= MAX_SUMMARY_LINES then
            logLine(KIND_LIMIT, "summary function lines truncated max=" .. tostring(MAX_SUMMARY_LINES))
            break
        end
        logLine(KIND_FUNCTION, candidateFunctions[key])
        functionLines = functionLines + 1
    end

    logLine(KIND_SUMMARY, "candidateObjects=" .. tostring(objectCount) .. " candidateFunctions=" .. tostring(functionCount))
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
            local count = 0
            for index, object in ipairs(objects) do
                count = count + 1
                if count > 80 then
                    logLine(KIND_LIMIT, "player context class=" .. class .. " truncated")
                    break
                end
                if isValidObject(object) then
                    logLine(KIND_PLAYER, "class=" .. class .. " index=" .. tostring(index) .. " name=" .. objectName(object) .. " objectClass=" .. className(object))
                end
            end
        else
            logOnce("player-miss:" .. class, KIND_PLAYER, "class=" .. class .. " unavailable")
        end
    end
end

local function resetProbeLog()
    seen = {}
    candidateObjects = {}
    candidateFunctions = {}
    candidateOrder = {}
    functionOrder = {}
    targetedUiObjects = {}
    targetedUiOrder = {}
    dumpedPropertyOwners = {}
    candidatePropertyCache = {}
    sensitivityCandidatePrevious = {}
    scanInProgress = false
    timelineInProgress = false
    totalCandidateLogs = 0
    newObjectCandidateLogs = 0
    resetFile(chooseLogPath())
    logLine(KIND_READY, "Xtoys Aruna Probe ready version=" .. PROBE_VERSION .. " log=" .. chooseLogPath())
    logLine(KIND_READY, "temporary minimal sensitivity-only mode=" .. tostring(TEMP_MINIMAL_SENSITIVITY_ONLY))
    logLine(KIND_READY, "F5 dumps cached converter-related UI object paths without text getter calls")
    logLine(KIND_READY, "F6 dumps WG_Converter binding sources plus selected UFunction property metadata")
    logLine(KIND_READY, "F7 dumps player context; F8 keeps the unsafe global scan stub disabled")
    logLine(KIND_READY, "unsafe global UObject scan is disabled")
end

local function registerHotkey(keyCode, label, callback)
    local ok, err = pcall(function()
        RegisterKeyBindAsync(keyCode, {}, function()
            logLine(KIND_HOTKEY, label)
            callback()
        end)
    end)

    if ok then
        logLine(KIND_HOTKEY, label .. " registered")
    else
        logLine(KIND_ERROR, "RegisterKeyBind failed for " .. label .. ": " .. safeToString(err))
    end
end

local function registerNewObjectProbe()
    if NotifyOnNewObject == nil then
        logLine(KIND_ERROR, "NotifyOnNewObject API unavailable")
        return
    end

    for _, classPath in ipairs(NEW_OBJECT_CLASSES) do
        local ok, err = pcall(function()
            NotifyOnNewObject(classPath, function(object)
                if scanInProgress then
                    return
                end
                if newObjectCandidateLogs >= MAX_NEW_OBJECT_CANDIDATES then
                    logOnce("new-object-limit", KIND_LIMIT, "new object candidate limit reached max=" .. tostring(MAX_NEW_OBJECT_CANDIDATES))
                    return
                end
                if rememberCandidate(object, classPath) then
                    newObjectCandidateLogs = newObjectCandidateLogs + 1
                end
            end)
        end)

        if ok then
            logLine(KIND_READY, "NotifyOnNewObject registered class=" .. classPath)
        else
            logLine(KIND_ERROR, "NotifyOnNewObject failed class=" .. classPath .. ": " .. safeToString(err))
        end
    end
end

resetProbeLog()
registerHotkey(Key.F5, "F5 dump cached converter UI paths", function()
    dumpUiTextSnapshot("F5")
end)
registerHotkey(Key.F6, "F6 dump candidates and converter bindings", function()
    scanObjects("F6")
    dumpTargetBlueprints("F6")
    dumpConverterBindingSources("F6")
    sampleConverterValues("F6")
    dumpSummary()
end)
registerHotkey(Key.F7, "F7 dump player context", function()
    dumpPlayerContext()
end)
registerHotkey(Key.F8, "F8 unsafe global scan disabled", function()
    scanAllObjectsUnsafe("F8")
end)
registerHotkey(Key.F9, "F9 reset probe log", resetProbeLog)
registerNewObjectProbe()
