using System.Text;

namespace ArunaProbe.External;

internal sealed class ProbeLogger : IDisposable
{
    private readonly StreamWriter writer;

    private ProbeLogger(StreamWriter writer, string logPath)
    {
        this.writer = writer;
        LogPath = logPath;
    }

    public string LogPath { get; }

    public static ProbeLogger Create(string? logDirectory)
    {
        var directory = string.IsNullOrWhiteSpace(logDirectory)
            ? Path.Combine(Environment.CurrentDirectory, "logs")
            : Path.GetFullPath(logDirectory);

        Directory.CreateDirectory(directory);

        var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var logPath = Path.Combine(directory, $"aruna_external_probe_{timestamp}.log");
        var writer = new StreamWriter(logPath, append: false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false))
        {
            AutoFlush = true,
        };

        return new ProbeLogger(writer, logPath);
    }

    public void Info(string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {message}";
        Console.WriteLine(line);
        writer.WriteLine(line);
    }

    public void Dispose()
    {
        writer.Dispose();
    }
}
