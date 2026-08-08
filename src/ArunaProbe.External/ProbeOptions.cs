namespace ArunaProbe.External;

internal sealed record ProbeOptions(
    string ProcessName,
    int DurationSeconds,
    int IntervalMs,
    int MaxRegionMb,
    int MaxMatchesPerPattern,
    string? LogDirectory,
    bool Once,
    bool IncludeLowPriority,
    bool IncludeHudValues,
    bool ScanDevelopmentValues,
    bool Help)
{
    public static ProbeOptions Parse(string[] args)
    {
        var options = new ProbeOptions(
            ProcessName: "ArunaLOSL.exe",
            DurationSeconds: 30,
            IntervalMs: 1000,
            MaxRegionMb: 64,
            MaxMatchesPerPattern: 80,
            LogDirectory: null,
            Once: false,
            IncludeLowPriority: false,
            IncludeHudValues: false,
            ScanDevelopmentValues: false,
            Help: false);

        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            switch (arg)
            {
                case "--help":
                case "-h":
                    options = options with { Help = true };
                    break;
                case "--once":
                    options = options with { Once = true };
                    break;
                case "--include-low-priority":
                    options = options with { IncludeLowPriority = true };
                    break;
                case "--include-hud-values":
                    options = options with { IncludeHudValues = true };
                    break;
                case "--scan-development-values":
                    options = options with { ScanDevelopmentValues = true };
                    break;
                case "--process-name":
                    options = options with { ProcessName = ReadValue(args, ref index, arg) };
                    break;
                case "--duration-seconds":
                    options = options with { DurationSeconds = ReadPositiveInt(args, ref index, arg) };
                    break;
                case "--interval-ms":
                    options = options with { IntervalMs = ReadPositiveInt(args, ref index, arg) };
                    break;
                case "--max-region-mb":
                    options = options with { MaxRegionMb = ReadPositiveInt(args, ref index, arg) };
                    break;
                case "--max-matches-per-pattern":
                    options = options with { MaxMatchesPerPattern = ReadPositiveInt(args, ref index, arg) };
                    break;
                case "--log-dir":
                    options = options with { LogDirectory = ReadValue(args, ref index, arg) };
                    break;
                default:
                    throw new ArgumentException($"Unknown argument: {arg}");
            }
        }

        return options;
    }

    private static string ReadValue(string[] args, ref int index, string optionName)
    {
        if (index + 1 >= args.Length)
        {
            throw new ArgumentException($"Missing value for {optionName}");
        }

        index++;
        return args[index];
    }

    private static int ReadPositiveInt(string[] args, ref int index, string optionName)
    {
        var value = ReadValue(args, ref index, optionName);
        if (!int.TryParse(value, out var parsed) || parsed <= 0)
        {
            throw new ArgumentException($"{optionName} requires a positive integer.");
        }

        return parsed;
    }
}
