using BepInEx;
using DominatePlanBridge.BepInEx.Hooks;
using HarmonyLib;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace DominatePlanProbe.BepInEx;

[BepInPlugin(PluginGuid, PluginName, PluginVersion)]
public sealed class ProbePlugin : BaseUnityPlugin
{
    public const string PluginGuid = "local.xtoys.dominateplan.probe";
    public const string PluginName = "XToys Dominate Plan Probe";
    public const string PluginVersion = "0.2.0";

    private readonly HashSet<MethodBase> _patchedMethods = new HashSet<MethodBase>();
    private Harmony? _harmony;
    private string _logPath = string.Empty;

    private void Awake()
    {
        _logPath = Path.Combine(Paths.GameRootPath, "xtoys_dominate_probe_log.txt");
        ResetLog();

        _harmony = new Harmony(PluginGuid);
        ProbeHooks.Initialize(Log);
        HookProbeCandidates();
        Log("READY", "Xtoys Dominate Plan Probe ready.");
    }

    private void HookProbeCandidates()
    {
        PatchProbeMethod("BattleMain", "PlayerAttack");
        PatchProbeMethod("BattleMain", "EnemySpawn");
        PatchProbeMethod("SearchMain", "ShinchokuChange");
        PatchProbeMethod("SearchOrgasmP", "Orgasum");
        PatchProbeMethod("SearchOrgasmP", "OrgasmStart");
        PatchProbeMethod("SearchOrgasmP", "OrgasmSet");
        PatchProbeMethod("CharaSet", "YogoreCol");
        PatchProbeMethod("CharaSet", "DownReturn");
        PatchProbeMethod("SearchMain", "TrapAttack");
        PatchProbeMethod("SearchMain", "LoseMain");

        PatchProbeCoroutineMoveNext("EnemyAttackP", 0, 11);
        PatchProbeCoroutineMoveNext("EnemyOsenP", 0, 2);
        PatchProbeCoroutineMoveNext("EnemyEXAttackP", 0, 6);

        PatchProbeMethodsNamed(
            "KuchiPlus",
            "MunePlus",
            "KabuPlus",
            "KethuPlus",
            "OrgasmCountPlus",
            "EnergyGaugeDown",
            "YogoreSP");
    }

    private void PatchProbeMethod(string typeName, string methodName)
    {
        var method = FindMethod(typeName, methodName);
        if (method == null)
        {
            return;
        }

        PatchProbe(method, $"{typeName}.{methodName}");
    }

    private MethodInfo? FindMethod(string typeName, string methodName)
    {
        var type = AccessTools.TypeByName(typeName);
        if (type == null)
        {
            Log("MISS", $"type not found {typeName}");
            return null;
        }

        var method = AccessTools.Method(type, methodName);
        if (method == null)
        {
            Log("MISS", $"method not found {typeName}.{methodName}");
            return null;
        }

        return method;
    }

    private void PatchProbeMethodsNamed(params string[] methodNames)
    {
        var wanted = new HashSet<string>(methodNames, StringComparer.Ordinal);
        var assembly = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == "Assembly-CSharp");
        if (assembly == null)
        {
            Log("MISS", "Assembly-CSharp not loaded for named method scan");
            return;
        }

        var count = 0;
        foreach (var type in assembly.GetTypes())
        {
            var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            foreach (var method in type.GetMethods(flags))
            {
                if (!wanted.Contains(method.Name))
                {
                    continue;
                }

                PatchProbe(method, type.FullName + "." + method.Name);
                count++;
            }
        }

        Log("SCAN", $"probe named method hooks scanned={count}");
    }

    private void PatchProbeCoroutineMoveNext(string outerTypeName, int firstType, int lastType)
    {
        var outerType = AccessTools.TypeByName(outerTypeName);
        if (outerType == null)
        {
            Log("MISS", $"type not found {outerTypeName}");
            return;
        }

        for (var index = firstType; index <= lastType; index++)
        {
            var nestedName = $"<Type{index}>d__";
            foreach (var nested in outerType.GetNestedTypes(BindingFlags.NonPublic))
            {
                if (!nested.Name.StartsWith(nestedName, StringComparison.Ordinal))
                {
                    continue;
                }

                var moveNext = AccessTools.Method(nested, "MoveNext");
                if (moveNext != null)
                {
                    PatchProbe(moveNext, $"{outerTypeName}.Type{index}.MoveNext");
                }
            }
        }
    }

    private void PatchProbe(MethodBase method, string label)
    {
        if (_patchedMethods.Contains(method))
        {
            return;
        }

        try
        {
            var prefix = new HarmonyMethod(typeof(ProbeHooks).GetMethod(nameof(ProbeHooks.Prefix), BindingFlags.Static | BindingFlags.NonPublic));
            var postfix = new HarmonyMethod(typeof(ProbeHooks).GetMethod(nameof(ProbeHooks.Postfix), BindingFlags.Static | BindingFlags.NonPublic));
            _harmony!.Patch(method, prefix: prefix, postfix: postfix);
            _patchedMethods.Add(method);
            Log("HOOK", "probe " + label);
        }
        catch (Exception ex)
        {
            Log("ERROR", $"failed probe hook {label}: {ex.GetType().Name} {ex.Message}");
        }
    }

    private void ResetLog()
    {
        try
        {
            File.WriteAllText(_logPath, string.Empty);
        }
        catch (Exception ex)
        {
            Logger.LogWarning($"probe file reset failed: {ex.Message}");
        }
    }

    private void Log(string kind, string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss.fff}] [{kind}] {message}";
        Logger.LogInfo(line);

        try
        {
            File.AppendAllText(_logPath, line + Environment.NewLine);
        }
        catch (Exception ex)
        {
            Logger.LogWarning($"probe file log failed: {ex.Message}");
        }
    }
}
