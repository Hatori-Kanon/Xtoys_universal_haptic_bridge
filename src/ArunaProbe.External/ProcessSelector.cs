using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace ArunaProbe.External;

internal sealed record TargetProcess(Process Process, SafeProcessHandle Handle) : IDisposable
{
    public void Dispose()
    {
        Handle.Dispose();
        Process.Dispose();
    }
}

internal static class ProcessSelector
{
    public static TargetProcess? TryOpen(string processName, ProbeLogger logger)
    {
        var normalized = Path.GetFileNameWithoutExtension(processName);
        var candidates = Process.GetProcessesByName(normalized)
            .OrderBy(process => process.Id)
            .ToArray();

        if (candidates.Length == 0)
        {
            logger.Info($"Process not found: {processName}");
            return null;
        }

        foreach (var process in candidates)
        {
            var handle = NativeMethods.OpenProcess(
                NativeMethods.ProcessAccess.QueryLimitedInformation | NativeMethods.ProcessAccess.VmRead,
                bInheritHandle: false,
                dwProcessId: process.Id);

            if (!handle.IsInvalid)
            {
                logger.Info($"Opened process {process.ProcessName}.exe PID={process.Id} with read-only access.");
                return new TargetProcess(process, handle);
            }

            var error = Marshal.GetLastWin32Error();
            logger.Info($"OpenProcess failed for PID={process.Id}; Win32Error={error}");
            process.Dispose();
        }

        return null;
    }
}
