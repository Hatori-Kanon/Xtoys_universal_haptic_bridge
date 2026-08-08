using System.Text;

namespace ArunaProbe.External;

internal sealed record PatternSpec(string Name, string EncodingName, byte[] Bytes, int Priority);

internal static class PatternCatalog
{
    private static readonly string[] HighPriorityHudAnchors =
    {
        "累計絶頂",
        "絶頂",
        "感度",
        "吸着",
        "開発度",
        "口腔",
        "乳房",
        "陰核",
        "フタナリ",
        "尿道",
        "膣",
        "肛門",
    };

    private static readonly string[] LowPriorityHudAnchors =
    {
        "Core",
        "Shell",
        "Energy",
    };

    private static readonly string[] HudValueAnchors =
    {
        "000.00",
        "49990",
        "9999.0",
        "20/20",
        "8/8",
    };

    public static IReadOnlyList<PatternSpec> CreateHudPatterns(bool includeLowPriority, bool includeHudValues)
    {
        var patterns = new List<PatternSpec>();

        foreach (var anchor in HighPriorityHudAnchors)
        {
            AddEncodings(patterns, anchor, priority: 0);
        }

        if (includeLowPriority)
        {
            foreach (var anchor in LowPriorityHudAnchors)
            {
                AddEncodings(patterns, anchor, priority: 10);
            }
        }

        if (includeHudValues)
        {
            foreach (var anchor in HudValueAnchors)
            {
                AddEncodings(patterns, anchor, priority: 5);
            }
        }

        return patterns
            .OrderBy(pattern => pattern.Priority)
            .ThenByDescending(pattern => pattern.Bytes.Length)
            .ThenBy(pattern => pattern.Name, StringComparer.Ordinal)
            .ThenBy(pattern => pattern.EncodingName, StringComparer.Ordinal)
            .ToArray();
    }

    private static void AddEncodings(List<PatternSpec> patterns, string anchor, int priority)
    {
        patterns.Add(new PatternSpec(anchor, "UTF8", Encoding.UTF8.GetBytes(anchor), priority));
        patterns.Add(new PatternSpec(anchor, "UTF16LE", Encoding.Unicode.GetBytes(anchor), priority));
    }
}
