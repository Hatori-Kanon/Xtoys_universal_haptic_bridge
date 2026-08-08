# Aruna External Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only external Windows probe that attaches to `ArunaLOSL.exe`, scans readable memory for HUD label anchors and formatted numeric strings, and writes a local diagnostic log.

**Architecture:** A small .NET console app performs process selection, Win32 read-only memory enumeration, byte-pattern scanning, and log writing. The game directory remains clean except for the generated log file.

**Tech Stack:** C# / .NET 6, Windows P/Invoke (`OpenProcess`, `VirtualQueryEx`, `ReadProcessMemory`), PowerShell static validation.

---

## File Structure

- Create `src/ArunaProbe.External/ArunaProbe.External.csproj`: console project targeting `net6.0`.
- Create `src/ArunaProbe.External/Program.cs`: command-line entry and orchestration.
- Create `src/ArunaProbe.External/ProbeOptions.cs`: argument parsing and defaults.
- Create `src/ArunaProbe.External/ProbeLogger.cs`: timestamped local log writer.
- Create `src/ArunaProbe.External/ProcessSelector.cs`: `ArunaLOSL.exe` process discovery and game-root inference.
- Create `src/ArunaProbe.External/NativeMethods.cs`: minimal read-only Win32 declarations.
- Create `src/ArunaProbe.External/MemoryRegion.cs`: readable memory region model.
- Create `src/ArunaProbe.External/PatternCatalog.cs`: HUD labels and numeric patterns.
- Create `src/ArunaProbe.External/MemoryScanner.cs`: region enumeration and byte-pattern scanning.
- Create `src/ArunaProbe.External/README.md`: build/run/safety notes.
- Create `tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1`: static safety and content validation.

## Task 1: Project Shell And Static Safety Test

**Files:**
- Create: `src/ArunaProbe.External/ArunaProbe.External.csproj`
- Create: `src/ArunaProbe.External/Program.cs`
- Create: `tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1`

- [ ] **Step 1: Write failing validation test**

Create `tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1`:

```powershell
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$projectDir = Join-Path $root 'src\ArunaProbe.External'
$program = Join-Path $projectDir 'Program.cs'

if (-not (Test-Path $program)) {
    throw "Program.cs not found at $program"
}

$source = Get-ChildItem -LiteralPath $projectDir -Recurse -File -Include *.cs |
    ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }

$combined = ($source -join "`n")

foreach ($forbidden in @('WriteProcessMemory', 'CreateRemoteThread', 'webhook.xtoys.app')) {
    if ($combined.Contains($forbidden)) {
        throw "Forbidden token found: $forbidden"
    }
}

foreach ($required in @('OpenProcess', 'ReadProcessMemory', 'VirtualQueryEx', '開発度', '口腔', '乳房', '陰核', 'フタナリ', '尿道', '膣', '肛門')) {
    if (-not $combined.Contains($required)) {
        throw "Required token missing: $required"
    }
}

Write-Host 'Aruna external probe static validation passed.'
```

- [ ] **Step 2: Run validation to confirm it fails**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.External.Tests\Validate-ArunaExternalProbe.ps1
```

Expected: FAIL because `Program.cs` does not exist.

- [ ] **Step 3: Create minimal project shell**

Create `src/ArunaProbe.External/ArunaProbe.External.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>XtoysArunaExternalProbe</AssemblyName>
  </PropertyGroup>
</Project>
```

Create `src/ArunaProbe.External/Program.cs`:

```csharp
using System;

namespace ArunaProbe.External;

internal static class Program
{
    private static int Main(string[] args)
    {
        Console.WriteLine("Xtoys Aruna External Probe");
        Console.WriteLine("This tool uses OpenProcess, VirtualQueryEx, and ReadProcessMemory in read-only mode.");
        Console.WriteLine("HUD anchors: 開発度 口腔 乳房 陰核 フタナリ 尿道 膣 肛門");
        return 0;
    }
}
```

- [ ] **Step 4: Run validation and build**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.External.Tests\Validate-ArunaExternalProbe.ps1
dotnet build src\ArunaProbe.External\ArunaProbe.External.csproj
```

Expected: validation PASS, build PASS.

## Task 2: Options, Logging, And Pattern Catalog

**Files:**
- Create: `src/ArunaProbe.External/ProbeOptions.cs`
- Create: `src/ArunaProbe.External/ProbeLogger.cs`
- Create: `src/ArunaProbe.External/PatternCatalog.cs`
- Modify: `src/ArunaProbe.External/Program.cs`

- [ ] **Step 1: Add options parser**

Create `ProbeOptions.cs` with:

```csharp
namespace ArunaProbe.External;

internal sealed record ProbeOptions
{
    public int? ProcessId { get; private init; }
    public string? GameRoot { get; private init; }
    public int MaxRegionMb { get; private init; } = 256;
    public bool IncludeNumbers { get; private init; } = true;

    public static ProbeOptions Parse(string[] args)
    {
        var options = new ProbeOptions();
        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg.Equals("scan", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (arg == "--pid" && i + 1 < args.Length && int.TryParse(args[++i], out var pid))
            {
                options = options with { ProcessId = pid };
                continue;
            }

            if (arg == "--game-root" && i + 1 < args.Length)
            {
                options = options with { GameRoot = args[++i] };
                continue;
            }

            if (arg == "--max-region-mb" && i + 1 < args.Length && int.TryParse(args[++i], out var mb))
            {
                options = options with { MaxRegionMb = Math.Max(1, mb) };
                continue;
            }

            if (arg == "--include-numbers")
            {
                options = options with { IncludeNumbers = true };
                continue;
            }

            if (arg == "--no-numbers")
            {
                options = options with { IncludeNumbers = false };
                continue;
            }

            throw new ArgumentException($"Unknown or incomplete argument: {arg}");
        }

        return options;
    }
}
```

- [ ] **Step 2: Add logger**

Create `ProbeLogger.cs` with:

```csharp
using System.Text;

namespace ArunaProbe.External;

internal sealed class ProbeLogger : IDisposable
{
    private readonly StreamWriter _writer;

    public string Path { get; }

    public ProbeLogger(string logPath)
    {
        Path = logPath;
        var directory = System.IO.Path.GetDirectoryName(logPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _writer = new StreamWriter(logPath, append: false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    }

    public void Write(string category, string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss.fff}] [{category}] {message}";
        Console.WriteLine(line);
        _writer.WriteLine(line);
        _writer.Flush();
    }

    public void Dispose() => _writer.Dispose();
}
```

- [ ] **Step 3: Add pattern catalog**

Create `PatternCatalog.cs` with:

```csharp
using System.Text;

namespace ArunaProbe.External;

internal sealed record ScanPattern(string Kind, string EncodingName, string Text, byte[] Bytes);

internal static class PatternCatalog
{
    public static readonly string[] HudLabels =
    {
        "開発度",
        "口腔",
        "乳房",
        "陰核",
        "フタナリ",
        "尿道",
        "膣",
        "肛門",
        "Core",
        "Shell",
        "Energy",
    };

    public static readonly string[] NumericTexts =
    {
        "000.00",
        "9999.0",
        "49990",
        "20/20",
        "8/8",
    };

    public static IReadOnlyList<ScanPattern> Build(bool includeNumbers)
    {
        var patterns = new List<ScanPattern>();
        foreach (var label in HudLabels)
        {
            AddBoth(patterns, "MATCH", label);
        }

        if (includeNumbers)
        {
            foreach (var number in NumericTexts)
            {
                AddBoth(patterns, "NUMBER", number);
            }
        }

        return patterns;
    }

    private static void AddBoth(List<ScanPattern> patterns, string kind, string text)
    {
        patterns.Add(new ScanPattern(kind, "utf8", text, Encoding.UTF8.GetBytes(text)));
        patterns.Add(new ScanPattern(kind, "utf16", text, Encoding.Unicode.GetBytes(text)));
    }
}
```

- [ ] **Step 4: Wire options and logger in Program**

Replace `Program.cs` with:

```csharp
namespace ArunaProbe.External;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            var options = ProbeOptions.Parse(args);
            var logPath = ResolveLogPath(options.GameRoot);
            using var logger = new ProbeLogger(logPath);
            logger.Write("READY", "Xtoys Aruna External Probe ready");
            logger.Write("OPTIONS", $"pid={options.ProcessId?.ToString() ?? "auto"} maxRegionMb={options.MaxRegionMb} includeNumbers={options.IncludeNumbers}");
            logger.Write("PATTERN", $"count={PatternCatalog.Build(options.IncludeNumbers).Count}");
            logger.Write("DONE", "Project shell ready; process scanning is implemented in the next task.");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static string ResolveLogPath(string? gameRoot)
    {
        if (!string.IsNullOrWhiteSpace(gameRoot))
        {
            return Path.Combine(gameRoot, "xtoys_aruna_external_probe_log.txt");
        }

        return Path.Combine(AppContext.BaseDirectory, "logs", "xtoys_aruna_external_probe_log.txt");
    }
}
```

- [ ] **Step 5: Build and validate**

Run:

```powershell
dotnet build src\ArunaProbe.External\ArunaProbe.External.csproj
powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.External.Tests\Validate-ArunaExternalProbe.ps1
```

Expected: PASS.

## Task 3: Process Discovery And Read-Only Win32 API

**Files:**
- Create: `src/ArunaProbe.External/ProcessSelector.cs`
- Create: `src/ArunaProbe.External/NativeMethods.cs`
- Modify: `src/ArunaProbe.External/Program.cs`

- [ ] **Step 1: Add process selector**

Create `ProcessSelector.cs`:

```csharp
using System.Diagnostics;

namespace ArunaProbe.External;

internal static class ProcessSelector
{
    public static Process Select(ProbeOptions options)
    {
        if (options.ProcessId is int pid)
        {
            return Process.GetProcessById(pid);
        }

        var candidates = Process.GetProcessesByName("ArunaLOSL")
            .OrderByDescending(p =>
            {
                try { return p.StartTime; }
                catch { return DateTime.MinValue; }
            })
            .ToArray();

        if (candidates.Length == 0)
        {
            throw new InvalidOperationException("No running ArunaLOSL.exe process found. Start the game first.");
        }

        return candidates[0];
    }

    public static string? InferGameRoot(Process process)
    {
        try
        {
            var exePath = process.MainModule?.FileName;
            if (string.IsNullOrWhiteSpace(exePath))
            {
                return null;
            }

            var win64 = Directory.GetParent(exePath);
            var binaries = win64?.Parent;
            var arunaLosl = binaries?.Parent;
            return arunaLosl?.Parent?.FullName;
        }
        catch
        {
            return null;
        }
    }
}
```

- [ ] **Step 2: Add native declarations**

Create `NativeMethods.cs`:

```csharp
using System.Runtime.InteropServices;

namespace ArunaProbe.External;

internal static class NativeMethods
{
    public const int ProcessQueryLimitedInformation = 0x1000;
    public const int ProcessVmRead = 0x0010;
    public const int MemCommit = 0x1000;
    public const int PageNoAccess = 0x01;
    public const int PageGuard = 0x100;

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(int desiredAccess, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr VirtualQueryEx(IntPtr processHandle, IntPtr address, out MemoryBasicInformation buffer, UIntPtr length);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReadProcessMemory(IntPtr processHandle, IntPtr baseAddress, byte[] buffer, UIntPtr size, out UIntPtr bytesRead);

    [StructLayout(LayoutKind.Sequential)]
    public struct MemoryBasicInformation
    {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }
}
```

- [ ] **Step 3: Wire process selection in Program**

Update `Program.cs` after parsing options:

```csharp
var process = ProcessSelector.Select(options);
var inferredGameRoot = options.GameRoot ?? ProcessSelector.InferGameRoot(process);
var logPath = ResolveLogPath(inferredGameRoot);
using var logger = new ProbeLogger(logPath);
logger.Write("READY", "Xtoys Aruna External Probe ready");
logger.Write("PROCESS", $"pid={process.Id} name={process.ProcessName} path={SafePath(process)}");
```

Add helper:

```csharp
private static string SafePath(System.Diagnostics.Process process)
{
    try { return process.MainModule?.FileName ?? "(unknown)"; }
    catch { return "(unavailable)"; }
}
```

- [ ] **Step 4: Build and validate**

Run:

```powershell
dotnet build src\ArunaProbe.External\ArunaProbe.External.csproj
powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.External.Tests\Validate-ArunaExternalProbe.ps1
```

Expected: PASS.

## Task 4: Memory Region Enumeration And Pattern Scan

**Files:**
- Create: `src/ArunaProbe.External/MemoryRegion.cs`
- Create: `src/ArunaProbe.External/MemoryScanner.cs`
- Modify: `src/ArunaProbe.External/Program.cs`

- [ ] **Step 1: Add memory region model**

Create `MemoryRegion.cs`:

```csharp
namespace ArunaProbe.External;

internal sealed record MemoryRegion(ulong BaseAddress, ulong Size, uint Protect)
{
    public ulong EndAddress => BaseAddress + Size;
}
```

- [ ] **Step 2: Add scanner**

Create `MemoryScanner.cs`:

```csharp
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace ArunaProbe.External;

internal sealed class MemoryScanner
{
    private readonly ProbeLogger _logger;

    public MemoryScanner(ProbeLogger logger)
    {
        _logger = logger;
    }

    public int Scan(int processId, IReadOnlyList<ScanPattern> patterns, int maxRegionMb)
    {
        var handle = NativeMethods.OpenProcess(
            NativeMethods.ProcessQueryLimitedInformation | NativeMethods.ProcessVmRead,
            inheritHandle: false,
            processId);

        if (handle == IntPtr.Zero)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcess failed");
        }

        try
        {
            var matches = 0;
            foreach (var region in EnumerateRegions(handle))
            {
                if (region.Size > (ulong)maxRegionMb * 1024UL * 1024UL)
                {
                    _logger.Write("SKIP", $"base=0x{region.BaseAddress:X} size=0x{region.Size:X} reason=too_large");
                    continue;
                }

                matches += ScanRegion(handle, region, patterns);
            }

            return matches;
        }
        finally
        {
            NativeMethods.CloseHandle(handle);
        }
    }

    private IEnumerable<MemoryRegion> EnumerateRegions(IntPtr handle)
    {
        var address = 0UL;
        var mbiSize = (UIntPtr)Marshal.SizeOf<NativeMethods.MemoryBasicInformation>();

        while (address < 0x0000800000000000UL)
        {
            var result = NativeMethods.VirtualQueryEx(handle, (IntPtr)address, out var info, mbiSize);
            if (result == IntPtr.Zero)
            {
                break;
            }

            var baseAddress = (ulong)info.BaseAddress.ToInt64();
            var size = info.RegionSize.ToUInt64();
            if (size == 0)
            {
                break;
            }

            if (info.State == NativeMethods.MemCommit && IsReadable(info.Protect))
            {
                yield return new MemoryRegion(baseAddress, size, info.Protect);
            }

            address = baseAddress + size;
            if (address <= baseAddress)
            {
                break;
            }
        }
    }

    private int ScanRegion(IntPtr handle, MemoryRegion region, IReadOnlyList<ScanPattern> patterns)
    {
        var buffer = new byte[region.Size];
        if (!NativeMethods.ReadProcessMemory(handle, (IntPtr)region.BaseAddress, buffer, (UIntPtr)buffer.Length, out var bytesRead))
        {
            return 0;
        }

        var length = (int)Math.Min((ulong)buffer.Length, bytesRead.ToUInt64());
        var matches = 0;
        foreach (var pattern in patterns)
        {
            foreach (var offset in FindAll(buffer, length, pattern.Bytes))
            {
                matches++;
                _logger.Write(pattern.Kind, $"encoding={pattern.EncodingName} text={pattern.Text} address=0x{region.BaseAddress + (ulong)offset:X} region=0x{region.BaseAddress:X}-0x{region.EndAddress:X}");
            }
        }

        return matches;
    }

    private static IEnumerable<int> FindAll(byte[] buffer, int length, byte[] pattern)
    {
        if (pattern.Length == 0 || length < pattern.Length)
        {
            yield break;
        }

        for (var i = 0; i <= length - pattern.Length; i++)
        {
            var matched = true;
            for (var j = 0; j < pattern.Length; j++)
            {
                if (buffer[i + j] != pattern[j])
                {
                    matched = false;
                    break;
                }
            }

            if (matched)
            {
                yield return i;
            }
        }
    }

    private static bool IsReadable(uint protect)
    {
        if ((protect & NativeMethods.PageGuard) != 0 || (protect & NativeMethods.PageNoAccess) != 0)
        {
            return false;
        }

        return true;
    }
}
```

- [ ] **Step 3: Wire scanner in Program**

Replace the placeholder `DONE` log with:

```csharp
var patterns = PatternCatalog.Build(options.IncludeNumbers);
logger.Write("PATTERN", $"count={patterns.Count}");
var scanner = new MemoryScanner(logger);
var matchCount = scanner.Scan(process.Id, patterns, options.MaxRegionMb);
logger.Write("DONE", $"matches={matchCount}");
```

- [ ] **Step 4: Build and static validate**

Run:

```powershell
dotnet build src\ArunaProbe.External\ArunaProbe.External.csproj
powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.External.Tests\Validate-ArunaExternalProbe.ps1
```

Expected: PASS.

## Task 5: README And Runtime Verification

**Files:**
- Create: `src/ArunaProbe.External/README.md`
- Modify if needed: `tests/ArunaProbe.External.Tests/Validate-ArunaExternalProbe.ps1`

- [ ] **Step 1: Add README**

Create `README.md`:

```markdown
# Xtoys Aruna External Probe

This is a read-only diagnostic probe for `Aruna and the Labyrinth of SealedLewd1.207`.

It does not install files into the game directory, inject DLLs, patch code, write memory, or send XToys webhooks. It attaches to a running `ArunaLOSL.exe` process with read-only Windows APIs and scans readable memory for HUD label anchors.

## Build

```powershell
dotnet build src\ArunaProbe.External\ArunaProbe.External.csproj -c Release
```

## Run

Start the clean game first, then run:

```powershell
src\ArunaProbe.External\bin\Release\net6.0\XtoysArunaExternalProbe.exe scan --game-root "C:\Users\HatoriKanon\Claude\Projects\Xtoys-ws-plugin\Aruna and the Labyrinth of SealedLewd1.207"
```

The log is written to:

```text
Aruna and the Labyrinth of SealedLewd1.207/xtoys_aruna_external_probe_log.txt
```

## HUD Anchors

The first scan looks for:

```text
開発度
口腔
乳房
陰核
フタナリ
尿道
膣
肛門
Core
Shell
Energy
```
```

- [ ] **Step 2: Extend validation for README**

Append to validation script:

```powershell
$readme = Join-Path $projectDir 'README.md'
if (-not (Test-Path $readme)) {
    throw "README.md not found"
}

$readmeText = Get-Content -Raw -LiteralPath $readme
foreach ($requiredText in @('read-only', 'does not install files', '開発度', 'XtoysArunaExternalProbe.exe')) {
    if (-not $readmeText.Contains($requiredText)) {
        throw "README missing required text: $requiredText"
    }
}
```

- [ ] **Step 3: Build release**

Run:

```powershell
dotnet build src\ArunaProbe.External\ArunaProbe.External.csproj -c Release
```

Expected: PASS and output `src\ArunaProbe.External\bin\Release\net6.0\XtoysArunaExternalProbe.exe`.

- [ ] **Step 4: Run static validation**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tests\ArunaProbe.External.Tests\Validate-ArunaExternalProbe.ps1
```

Expected: PASS.

- [ ] **Step 5: Runtime verification with the user**

Ask the user to start the clean game and show the HUD screen from the screenshot. Then run:

```powershell
src\ArunaProbe.External\bin\Release\net6.0\XtoysArunaExternalProbe.exe scan --game-root "C:\Users\HatoriKanon\Claude\Projects\Xtoys-ws-plugin\Aruna and the Labyrinth of SealedLewd1.207"
```

Expected: log file exists at:

```text
C:\Users\HatoriKanon\Claude\Projects\Xtoys-ws-plugin\Aruna and the Labyrinth of SealedLewd1.207\xtoys_aruna_external_probe_log.txt
```

Expected log includes `PROCESS`, `PATTERN`, and either `MATCH` or `NUMBER` lines.

## Self-Review

- Spec coverage: The plan creates the external tool, keeps the game directory clean, uses read-only APIs, scans UTF-8/UTF-16 HUD labels, scans numeric strings, and writes the requested log.
- Placeholder scan: No task contains TODO/TBD/FIXME placeholders.
- Type consistency: `ProbeOptions`, `ProbeLogger`, `ProcessSelector`, `PatternCatalog`, and `MemoryScanner` are introduced before use.
