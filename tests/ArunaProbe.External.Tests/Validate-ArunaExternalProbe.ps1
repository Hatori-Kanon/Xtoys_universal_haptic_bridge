$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$projectDir = Join-Path $root 'src\ArunaProbe.External'
$program = Join-Path $projectDir 'Program.cs'
$readme = Join-Path $projectDir 'README.md'

if (-not (Test-Path $program)) {
    throw "Program.cs not found at $program"
}

if (-not (Test-Path $readme)) {
    throw "README.md not found at $readme"
}

$source = Get-ChildItem -LiteralPath $projectDir -Recurse -File -Include *.cs |
    ForEach-Object { Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName }

$readmeText = Get-Content -Raw -Encoding UTF8 -LiteralPath $readme
$combined = ($source -join "`n") + "`n" + $readmeText

foreach ($forbidden in @('WriteProcessMemory', 'CreateRemoteThread', 'PROCESS_ALL_ACCESS', 'webhook.xtoys.app')) {
    if ($combined.Contains($forbidden)) {
        throw "Forbidden token found: $forbidden"
    }
}

function New-TextFromCodePoints([int[]] $codePoints) {
    return -join ($codePoints | ForEach-Object { [char]$_ })
}

$requiredTokens = @(
    'OpenProcess',
    'ReadProcessMemory',
    'VirtualQueryEx',
    'ProbeOptions',
    'ProbeLogger',
    'PatternCatalog',
    '--duration-seconds',
    '--interval-ms',
    'ArunaLOSL.exe',
    'aruna_external_probe',
    'UTF8',
    'UTF16LE',
    'NativeMethods',
    'ProcessSelector',
    'PROCESS_QUERY_LIMITED_INFORMATION',
    'PROCESS_VM_READ',
    'SafeProcessHandle',
    'MemoryRegion',
    'MemoryScanner',
    'MEM_COMMIT',
    'PAGE_GUARD',
    'PAGE_NOACCESS',
    '--max-region-mb',
    'MaxRegionMb',
    '--include-low-priority',
    '--max-matches-per-pattern',
    'IncludeLowPriority',
    'MaxMatchesPerPattern',
    'Priority',
    'LowPriorityHudAnchors',
    'HighPriorityHudAnchors',
    'per-pattern cap',
    'Match summary',
    'Probe finished',
    'Probe failed',
    'RegionBase',
    'RegionEnd',
    'RegionProtect',
    'RegionType',
    '--include-hud-values',
    'IncludeHudValues',
    'HudValueAnchors',
    '49990',
    '9999.0',
    '000.00',
    '20/20',
    '8/8',
    '--scan-development-values',
    'ScanDevelopmentValues',
    'DevelopmentValueScanner',
    'DevelopmentValueTarget',
    'MEM_PRIVATE',
    'PAGE_READWRITE',
    'IsPrivateWritable',
    'Float32',
    'Float64',
    'Int32',
    'DevelopmentValueVariant',
    'ScaledBy100',
    'ScaledBy1000',
    'ScaledBy10000',
    'RatioBy100',
    'DisplayTimes10',
    '8.77',
    '877',
    '8770',
    '87700',
    '0.0877',
    '87.7',
    '9.59',
    '8.47',
    '8.52',
    '8.53',
    '8.19',
    '8.27',
    'Development value summary',
    'external read-only',
    'dotnet run',
    'Aruna side first',
    (New-TextFromCodePoints @(0x958B, 0x767A, 0x5EA6)),
    (New-TextFromCodePoints @(0x53E3, 0x8154)),
    (New-TextFromCodePoints @(0x4E73, 0x623F)),
    (New-TextFromCodePoints @(0x9670, 0x6838)),
    (New-TextFromCodePoints @(0x30D5, 0x30BF, 0x30CA, 0x30EA)),
    (New-TextFromCodePoints @(0x5C3F, 0x9053)),
    (New-TextFromCodePoints @(0x81A3)),
    (New-TextFromCodePoints @(0x809B, 0x9580))
)

foreach ($required in $requiredTokens) {
    if (-not $combined.Contains($required)) {
        throw "Required token missing: $required"
    }
}

Write-Host 'Aruna external probe static validation passed.'
