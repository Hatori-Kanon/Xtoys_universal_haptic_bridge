using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace ArunaProbe.External;

internal sealed class MemoryScanner
{
    private const ulong MaxUserAddress = 0x0000800000000000UL;

    private readonly ProbeLogger logger;
    private readonly IReadOnlyList<PatternSpec> patterns;
    private readonly ulong maxRegionBytes;
    private readonly int maxMatchesPerPattern;
    private readonly Dictionary<string, int> matchCounts = new(StringComparer.Ordinal);

    public MemoryScanner(ProbeLogger logger, IReadOnlyList<PatternSpec> patterns, int maxRegionMb, int maxMatchesPerPattern)
    {
        this.logger = logger;
        this.patterns = patterns;
        this.maxMatchesPerPattern = maxMatchesPerPattern;
        maxRegionBytes = checked((ulong)maxRegionMb * 1024UL * 1024UL);
    }

    public int ScanOnce(SafeProcessHandle processHandle)
    {
        var totalMatches = 0;
        var scannedRegions = 0;
        matchCounts.Clear();

        foreach (var region in EnumerateRegions(processHandle))
        {
            if (!region.IsReadable || region.Size == 0 || region.Size > maxRegionBytes || region.Size > int.MaxValue)
            {
                continue;
            }

            var buffer = new byte[(int)region.Size];
            if (!NativeMethods.ReadProcessMemory(
                    processHandle,
                    (nint)unchecked((long)region.BaseAddress),
                    buffer,
                    (nuint)buffer.Length,
                    out var bytesRead) ||
                bytesRead == 0)
            {
                continue;
            }

            scannedRegions++;
            var readableBytes = (int)Math.Min((ulong)bytesRead, (ulong)buffer.Length);
            totalMatches += ScanBuffer(region, buffer, readableBytes);
        }

        logger.Info($"Scan pass complete. RegionsRead={scannedRegions}; Matches={totalMatches}");
        LogMatchSummary();
        return totalMatches;
    }

    private int ScanBuffer(MemoryRegion region, byte[] buffer, int length)
    {
        var passMatches = 0;

        foreach (var pattern in patterns)
        {
            var key = GetPatternKey(pattern);
            matchCounts.TryGetValue(key, out var currentCount);
            if (currentCount >= maxMatchesPerPattern)
            {
                continue;
            }

            var offset = 0;
            while (offset < length)
            {
                if (currentCount >= maxMatchesPerPattern)
                {
                    break;
                }

                var matchAt = IndexOf(buffer, length, pattern.Bytes, offset);
                if (matchAt < 0)
                {
                    break;
                }

                var absoluteAddress = region.BaseAddress + (ulong)matchAt;
                logger.Info(
                    $"Match {pattern.Name} {pattern.EncodingName} at 0x{absoluteAddress:X}; " +
                    $"RegionBase={region.RegionBase}; RegionEnd={region.RegionEnd}; " +
                    $"RegionProtect={region.RegionProtect}; RegionType={region.RegionType}");
                passMatches++;
                currentCount++;
                matchCounts[key] = currentCount;

                offset = matchAt + Math.Max(pattern.Bytes.Length, 1);
            }

            if (currentCount == maxMatchesPerPattern)
            {
                logger.Info($"Pattern per-pattern cap reached: {key}; Cap={maxMatchesPerPattern}");
            }
        }

        return passMatches;
    }

    private void LogMatchSummary()
    {
        logger.Info("Match summary:");
        if (matchCounts.Count == 0)
        {
            logger.Info("  none");
            return;
        }

        foreach (var item in matchCounts.OrderByDescending(pair => pair.Value).ThenBy(pair => pair.Key, StringComparer.Ordinal))
        {
            logger.Info($"  {item.Key}: {item.Value}");
        }
    }

    private static string GetPatternKey(PatternSpec pattern)
    {
        return $"{pattern.Name} {pattern.EncodingName}";
    }

    private static int IndexOf(byte[] haystack, int haystackLength, byte[] needle, int start)
    {
        if (needle.Length == 0 || haystackLength < needle.Length)
        {
            return -1;
        }

        var lastStart = haystackLength - needle.Length;
        for (var index = start; index <= lastStart; index++)
        {
            var matched = true;
            for (var needleIndex = 0; needleIndex < needle.Length; needleIndex++)
            {
                if (haystack[index + needleIndex] != needle[needleIndex])
                {
                    matched = false;
                    break;
                }
            }

            if (matched)
            {
                return index;
            }
        }

        return -1;
    }

    private static IEnumerable<MemoryRegion> EnumerateRegions(SafeProcessHandle processHandle)
    {
        var address = 0UL;
        var infoSize = (nuint)Marshal.SizeOf<NativeMethods.MEMORY_BASIC_INFORMATION>();

        while (address < MaxUserAddress)
        {
            var result = NativeMethods.VirtualQueryEx(
                processHandle,
                (nint)unchecked((long)address),
                out var info,
                infoSize);

            if (result == 0)
            {
                yield break;
            }

            var baseAddress = unchecked((ulong)(long)info.BaseAddress);
            var size = (ulong)info.RegionSize;
            if (size == 0)
            {
                yield break;
            }

            yield return new MemoryRegion(baseAddress, size, info.State, info.Protect, info.Type);

            var next = baseAddress + size;
            if (next <= address)
            {
                yield break;
            }

            address = next;
        }
    }
}
