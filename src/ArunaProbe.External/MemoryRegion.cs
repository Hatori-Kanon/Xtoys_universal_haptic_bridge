namespace ArunaProbe.External;

internal sealed record MemoryRegion(ulong BaseAddress, ulong Size, uint State, uint Protect, uint Type)
{
    internal const uint MEM_COMMIT = 0x1000;
    internal const uint MEM_PRIVATE = 0x20000;
    internal const uint PAGE_NOACCESS = 0x01;
    internal const uint PAGE_READWRITE = 0x04;
    internal const uint PAGE_WRITECOPY = 0x08;
    internal const uint PAGE_EXECUTE_READWRITE = 0x40;
    internal const uint PAGE_EXECUTE_WRITECOPY = 0x80;
    internal const uint PAGE_GUARD = 0x100;

    public ulong EndAddress => BaseAddress + Size;

    public string RegionBase => $"0x{BaseAddress:X}";

    public string RegionEnd => $"0x{EndAddress:X}";

    public string RegionProtect => $"0x{Protect:X}";

    public string RegionType => $"0x{Type:X}";

    public bool IsReadable =>
        State == MEM_COMMIT &&
        (Protect & PAGE_NOACCESS) == 0 &&
        (Protect & PAGE_GUARD) == 0;

    public bool IsPrivateWritable =>
        IsReadable &&
        Type == MEM_PRIVATE &&
        ((Protect & PAGE_READWRITE) != 0 ||
         (Protect & PAGE_WRITECOPY) != 0 ||
         (Protect & PAGE_EXECUTE_READWRITE) != 0 ||
         (Protect & PAGE_EXECUTE_WRITECOPY) != 0);
}
