using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace ArunaProbe.External;

internal static class NativeMethods
{
    internal const uint PROCESS_VM_READ = 0x0010;
    internal const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    [Flags]
    internal enum ProcessAccess : uint
    {
        QueryLimitedInformation = PROCESS_QUERY_LIMITED_INFORMATION,
        VmRead = PROCESS_VM_READ,
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern SafeProcessHandle OpenProcess(
        ProcessAccess dwDesiredAccess,
        bool bInheritHandle,
        int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern nint VirtualQueryEx(
        SafeProcessHandle hProcess,
        nint lpAddress,
        out MEMORY_BASIC_INFORMATION lpBuffer,
        nuint dwLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern bool ReadProcessMemory(
        SafeProcessHandle hProcess,
        nint lpBaseAddress,
        byte[] lpBuffer,
        nuint nSize,
        out nuint lpNumberOfBytesRead);

    [StructLayout(LayoutKind.Sequential)]
    internal struct MEMORY_BASIC_INFORMATION
    {
        public nint BaseAddress;
        public nint AllocationBase;
        public uint AllocationProtect;
        public ushort PartitionId;
        public nuint RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }
}
