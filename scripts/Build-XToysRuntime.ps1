$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $repositoryRoot 'src\XToysUniversalBridge'
$distributionDirectory = Join-Path $repositoryRoot 'dist'
$distributionFile = Join-Path $distributionDirectory 'xtoys-universal-runtime.es5.js'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$es6Pattern = '\b(let|const|class|async|await)\b|=>'
$sourceFiles = Get-ChildItem -Path $sourceDirectory -Filter '*.es5.js' -File |
  Sort-Object -Property Name

if ($sourceFiles.Count -eq 0) {
  throw 'No ES5 runtime source files were found.'
}

$sourceText = @(
  $sourceFiles | ForEach-Object {
    [System.IO.File]::ReadAllText($_.FullName, $utf8NoBom).TrimEnd("`r", "`n")
  }
) -join "`n"

if ($sourceText -match $es6Pattern) {
  throw 'Runtime source contains non-ES5 syntax.'
}

[System.IO.Directory]::CreateDirectory($distributionDirectory) | Out-Null
[System.IO.File]::WriteAllText($distributionFile, $sourceText + "`n", $utf8NoBom)
