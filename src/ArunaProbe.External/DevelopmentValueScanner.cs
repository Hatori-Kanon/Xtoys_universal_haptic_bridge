using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;

namespace ArunaProbe.External;

internal sealed record DevelopmentValueTarget(string Label, double Value);

internal sealed record DevelopmentValueVariant(DevelopmentValueTarget Target, string VariantName, string ValueType, double FloatValue, int IntValue);

internal sealed class DevelopmentValueScanner
{
    private const ulong MaxUserAddress = 0x0000800000000000UL;
    private const int MaxMatchesPerTargetType = 120;
    private const double Float32Tolerance = 0.0005;
    private const double Float64Tolerance = 0.0000005;

    private static readonly DevelopmentValueTarget[] Targets =
    {
        new("口腔", 8.77),
        new("乳房", 9.59),
        new("陰核", 8.47),
        new("フタナリ", 8.52),
        new("尿道", 8.53),
        new("膣", 8.19),
        new("肛門", 8.27),
    };

    private static readonly DevelopmentValueVariant[] Variants = CreateVariants();

    private readonly ProbeLogger logger;
    private readonly ulong maxRegionBytes;
    private readonly Dictionary<string, int> counts = new(StringComparer.Ordinal);

    public DevelopmentValueScanner(ProbeLogger logger, int maxRegionMb)
    {
        this.logger = logger;
        maxRegionBytes = checked((ulong)maxRegionMb * 1024UL * 1024UL);
    }

    public int ScanOnce(SafeProcessHandle processHandle)
    {
        var totalMatches = 0;
        var scannedRegions = 0;
        counts.Clear();

        foreach (var region in EnumerateRegions(processHandle))
        {
            if (!region.IsPrivateWritable || region.Size == 0 || region.Size > maxRegionBytes || region.Size > int.MaxValue)
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

        logger.Info($"Development value scan complete. RegionsRead={scannedRegions}; Matches={totalMatches}");
        LogSummary();
        return totalMatches;
    }

    private int ScanBuffer(MemoryRegion region, byte[] buffer, int length)
    {
        var matches = 0;

        for (var offset = 0; offset + sizeof(float) <= length; offset += 4)
        {
            var value = BitConverter.ToSingle(buffer, offset);
            matches += MatchFloat32(region, offset, value);
            var intValue = BitConverter.ToInt32(buffer, offset);
            matches += MatchInt32(region, offset, intValue);
        }

        for (var offset = 0; offset + sizeof(double) <= length; offset += 8)
        {
            var value = BitConverter.ToDouble(buffer, offset);
            matches += MatchFloat64(region, offset, value);
        }

        return matches;
    }

    private int MatchFloat32(MemoryRegion region, int offset, float value)
    {
        if (!float.IsFinite(value))
        {
            return 0;
        }

        foreach (var variant in Variants.Where(variant => variant.ValueType == "Float32"))
        {
            if (Math.Abs(value - variant.FloatValue) <= Float32Tolerance)
            {
                return LogMatch(region, offset, variant, value);
            }
        }

        return 0;
    }

    private int MatchFloat64(MemoryRegion region, int offset, double value)
    {
        if (!double.IsFinite(value))
        {
            return 0;
        }

        foreach (var variant in Variants.Where(variant => variant.ValueType == "Float64"))
        {
            if (Math.Abs(value - variant.FloatValue) <= Float64Tolerance)
            {
                return LogMatch(region, offset, variant, value);
            }
        }

        return 0;
    }

    private int MatchInt32(MemoryRegion region, int offset, int value)
    {
        foreach (var variant in Variants.Where(variant => variant.ValueType == "Int32"))
        {
            if (value == variant.IntValue)
            {
                return LogMatch(region, offset, variant, value);
            }
        }

        return 0;
    }

    private int LogMatch(MemoryRegion region, int offset, DevelopmentValueVariant variant, double observed)
    {
        var key = $"{variant.Target.Label} {variant.Target.Value:0.00} {variant.ValueType} {variant.VariantName}";
        counts.TryGetValue(key, out var currentCount);
        if (currentCount >= MaxMatchesPerTargetType)
        {
            return 0;
        }

        var absoluteAddress = region.BaseAddress + (ulong)offset;
        counts[key] = currentCount + 1;
        logger.Info(
            $"DevelopmentMatch {variant.Target.Label} expected={variant.Target.Value:0.00} {variant.ValueType} variant={variant.VariantName} observed={observed:0.########} at 0x{absoluteAddress:X}; " +
            $"RegionBase={region.RegionBase}; RegionEnd={region.RegionEnd}; " +
            $"RegionProtect={region.RegionProtect}; RegionType={region.RegionType}");
        return 1;
    }

    private void LogSummary()
    {
        logger.Info("Development value summary:");
        if (counts.Count == 0)
        {
            logger.Info("  none");
            return;
        }

        foreach (var item in counts.OrderByDescending(pair => pair.Value).ThenBy(pair => pair.Key, StringComparer.Ordinal))
        {
            logger.Info($"  {item.Key}: {item.Value}");
        }
    }

    private static DevelopmentValueVariant[] CreateVariants()
    {
        var variants = new List<DevelopmentValueVariant>();

        foreach (var target in Targets)
        {
            AddFloatVariants(variants, target, "Float32");
            AddFloatVariants(variants, target, "Float64");
            AddIntVariant(variants, target, "ScaledBy100", 100);
            AddIntVariant(variants, target, "ScaledBy1000", 1000);
            AddIntVariant(variants, target, "ScaledBy10000", 10000);
        }

        return variants.ToArray();
    }

    private static void AddFloatVariants(List<DevelopmentValueVariant> variants, DevelopmentValueTarget target, string valueType)
    {
        variants.Add(new DevelopmentValueVariant(target, "Direct", valueType, target.Value, 0));
        variants.Add(new DevelopmentValueVariant(target, "RatioBy100", valueType, target.Value / 100.0, 0));
        variants.Add(new DevelopmentValueVariant(target, "DisplayTimes10", valueType, target.Value * 10.0, 0));
    }

    private static void AddIntVariant(List<DevelopmentValueVariant> variants, DevelopmentValueTarget target, string variantName, int multiplier)
    {
        variants.Add(new DevelopmentValueVariant(
            target,
            variantName,
            "Int32",
            0,
            (int)Math.Round(target.Value * multiplier, MidpointRounding.AwayFromZero)));
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
