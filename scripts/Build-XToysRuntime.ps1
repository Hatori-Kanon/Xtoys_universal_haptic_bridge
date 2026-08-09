$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $repositoryRoot 'src\XToysUniversalBridge'
$distributionDirectory = Join-Path $repositoryRoot 'dist'
$distributionFile = Join-Path $distributionDirectory 'xtoys-universal-runtime.es5.js'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$es6Pattern = '\b(let|const|class|async|await)\b|=>'
$buildMutex = New-Object System.Threading.Mutex($false, 'Local\XTHB-XToysUniversalRuntime-Build')
$mutexHeld = $false
$temporaryFile = $null
$backupFile = $null
$buildFailure = $null
$cleanupFailure = $null

try {
  try {
    try {
      $mutexHeld = $buildMutex.WaitOne()
    }
    catch [System.Threading.AbandonedMutexException] {
      $mutexHeld = $true
    }

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
    $temporaryFile = Join-Path $distributionDirectory (
      'xtoys-universal-runtime.es5.js.' + [System.Guid]::NewGuid().ToString('N') + '.tmp'
    )
    [System.IO.File]::WriteAllText($temporaryFile, $sourceText + "`n", $utf8NoBom)
    if ([System.IO.File]::Exists($distributionFile)) {
      $backupFile = $temporaryFile + '.bak'
      [System.IO.File]::Replace($temporaryFile, $distributionFile, $backupFile)
      [System.IO.File]::Delete($backupFile)
      $backupFile = $null
    }
    else {
      [System.IO.File]::Move($temporaryFile, $distributionFile)
    }
    $temporaryFile = $null
  }
  catch {
    $buildFailure = $_.Exception
  }
}
finally {
  try {
    try {
      if ($temporaryFile -ne $null -and [System.IO.File]::Exists($temporaryFile)) {
        [System.IO.File]::Delete($temporaryFile)
      }
    }
    catch {
      if ($cleanupFailure -eq $null) {
        $cleanupFailure = $_.Exception
      }
    }

    try {
      if ($backupFile -ne $null -and [System.IO.File]::Exists($backupFile)) {
        [System.IO.File]::Delete($backupFile)
      }
    }
    catch {
      if ($cleanupFailure -eq $null) {
        $cleanupFailure = $_.Exception
      }
    }
  }
  finally {
    try {
      if ($mutexHeld) {
        $buildMutex.ReleaseMutex()
      }
    }
    catch {
      if ($cleanupFailure -eq $null) {
        $cleanupFailure = $_.Exception
      }
    }
    finally {
      try {
        $buildMutex.Dispose()
      }
      catch {
        if ($cleanupFailure -eq $null) {
          $cleanupFailure = $_.Exception
        }
      }
    }
  }
}

if ($buildFailure -ne $null) {
  throw $buildFailure
}
if ($cleanupFailure -ne $null) {
  throw $cleanupFailure
}
