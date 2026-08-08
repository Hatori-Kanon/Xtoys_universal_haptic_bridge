namespace ArunaProbe.External;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            var options = ProbeOptions.Parse(args);
            if (options.Help)
            {
                PrintUsage();
                return 0;
            }

            using var logger = ProbeLogger.Create(options.LogDirectory);
            return Run(options, logger);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 2;
        }
    }

    private static int Run(ProbeOptions options, ProbeLogger logger)
    {
        try
        {
            var patterns = PatternCatalog.CreateHudPatterns(options.IncludeLowPriority, options.IncludeHudValues);
            logger.Info("Xtoys Aruna External Probe");
            logger.Info("This tool uses OpenProcess, VirtualQueryEx, and ReadProcessMemory in read-only mode.");
            logger.Info($"Process: {options.ProcessName}");
            logger.Info($"DurationSeconds: {options.DurationSeconds}; IntervalMs: {options.IntervalMs}; MaxRegionMb: {options.MaxRegionMb}; MaxMatchesPerPattern: {options.MaxMatchesPerPattern}; Once: {options.Once}");
            logger.Info($"IncludeLowPriority: {options.IncludeLowPriority}");
            logger.Info($"IncludeHudValues: {options.IncludeHudValues}");
            logger.Info($"ScanDevelopmentValues: {options.ScanDevelopmentValues}");
            logger.Info($"HUD pattern count: {patterns.Count}");
            logger.Info($"LogPath: {logger.LogPath}");
            logger.Info("HUD anchors: 開発度 口腔 乳房 陰核 フタナリ 尿道 膣 肛門");

            using var target = ProcessSelector.TryOpen(options.ProcessName, logger);
            if (target is null)
            {
                logger.Info("No readable Aruna process is available yet.");
                logger.Info("Probe finished.");
                return 1;
            }

            logger.Info("Read-only process attachment succeeded.");
            var scanner = new MemoryScanner(logger, patterns, options.MaxRegionMb, options.MaxMatchesPerPattern);
            var developmentScanner = options.ScanDevelopmentValues
                ? new DevelopmentValueScanner(logger, options.MaxRegionMb)
                : null;

            if (options.Once)
            {
                scanner.ScanOnce(target.Handle);
                developmentScanner?.ScanOnce(target.Handle);
                logger.Info("Probe finished.");
                return 0;
            }

            var deadline = DateTime.UtcNow.AddSeconds(options.DurationSeconds);
            while (DateTime.UtcNow < deadline)
            {
                scanner.ScanOnce(target.Handle);
                developmentScanner?.ScanOnce(target.Handle);
                Thread.Sleep(options.IntervalMs);
            }

            logger.Info("Probe finished.");
            return 0;
        }
        catch (Exception ex)
        {
            logger.Info($"Probe failed: {ex}");
            return 2;
        }
    }

    private static void PrintUsage()
    {
        Console.WriteLine("Xtoys Aruna External Probe");
        Console.WriteLine("Usage:");
        Console.WriteLine("  XtoysArunaExternalProbe.exe [--once] [--duration-seconds 30] [--interval-ms 1000] [--max-region-mb 64] [--max-matches-per-pattern 80]");
        Console.WriteLine("Options:");
        Console.WriteLine("  --process-name ArunaLOSL.exe");
        Console.WriteLine("  --log-dir <directory>");
        Console.WriteLine("  --include-low-priority");
        Console.WriteLine("  --include-hud-values");
        Console.WriteLine("  --scan-development-values");
    }
}
