# 一次性 XToys 通用模板配置

> **第一次配置 XToys 时，请先阅读[完整中文设置手册](xtoys-complete-setup-guide.zh-CN.md)。** 本文是熟悉 XToys 后使用的技术速查。

本模板只需为每个 XToys Script 配置一次。游戏 Bridge 之后只发送 [协议 v1](xtoys-protocol-v1.md) 的 Webhook，不需要知道 XToys 设备、通道或 Job 名称。

## 0. 粘贴运行时与配置变量

将构建产物 `dist/xtoys-universal-runtime.es5.js` 粘贴到 Script 的全局 JavaScript 页面。不要把可复用函数写在内联 Custom JavaScript Action 中。

新增 Script 变量 `xthb-config-json`，值为一个 JSON 字符串。运行时仅在 `xtoysBridgeInit()` 或 `xtoysBridgeReloadConfig()` 时读取它。它必须含有全部五个组和编号 1–16 的全部槽位；未用槽仍保留并设为 `enabled: false`。

```json
{
  "logLevel": "errors",
  "globalMultiplier": 1,
  "groups": {
    "genitals": { "clitoris": 1, "vulva": 0.8, "vagina": 0.8, "penis": 0.8, "prostate": 0.8 },
    "lower_body": { "vulva": 0.8, "vagina": 0.8, "anus": 0.7, "butt": 0.6, "penis": 0.7, "prostate": 0.7 },
    "double_hole": { "vagina": 1, "anus": 1 },
    "whole_body": { "mouth": 0.4, "breast": 0.5, "clitoris": 0.7, "vagina": 0.7, "anus": 0.5, "penis": 0.7 },
    "mixed": { "nipple": 0.5, "armpit": 0.4, "vulva": 0.6, "butt": 0.5, "prostate": 0.6 }
  },
  "slots": [
    { "id": 1, "enabled": true, "type": "intensity", "frequencyEnabled": true, "routes": { "clitoris": 1 } },
    { "id": 2, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 3, "enabled": true, "type": "rotation", "frequencyEnabled": false, "routes": { "vagina": 1 } },
    { "id": 4, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 5, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 6, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 7, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 8, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 9, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 10, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 11, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 12, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 13, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 14, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 15, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} },
    { "id": 16, "enabled": false, "type": "intensity", "frequencyEnabled": false, "routes": {} }
  ]
}
```

`logLevel` 只能是 `off`、`errors` 或 `debug`。`globalMultiplier` 必须为非负数。组和槽的权重为 0–1；槽类型只能是 `intensity` 或 `rotation`。一个设备的独立振动执行器与独立旋转执行器必须占用不同槽。多个设备可接到同一槽，但仅限它们应接收**完全相同**输出的情形；同一物理子通道不可同时接到多个槽。

## 1. 建立唯一的 Webhook Global Trigger

建立一个 Webhook Global Trigger，筛选外层 `action == xtoys_game_bridge`。XToys 官方说明 Webhook 的 `action` 和其他键值会交给 Script，Global Trigger 可在 Script 全程响应；见 [Webhook](https://guide.xtoys.app/tools/webhook.html) 与 [Script Overview](https://guide.xtoys.app/script-creation/overview.html)。

在 Custom JavaScript Action 的输入映射中，把当前 Webhook Trigger 实际提供的**完整 payload 值**映射为本地输入 `payload`。Trigger 输出变量的精确名称和映射控件标题未由公开指南固定，必须在当前 Action 编辑器中做 **当前界面核对**；不要硬编码假定它一定叫 `{trigger-payload}`，也不要拆分内层字段。

内联 Custom JavaScript 内容必须是：

```js
xtoysBridgeHandle(payload);
```

不要在 Trigger 中拆分协议字段，也不要用 `eval` 或把外层 `action` 改成游戏事件名。Private POST 地址模板为 `https://webhook.xtoys.app/<WEBHOOK_ID>`，请求头含 `Content-Type: application/json`；Shared Webhook 还需 `Authorization: Bearer <AUTH_TOKEN>`。两个尖括号值均为用户自行替换的占位符，不得填入仓库真实凭据。

## 2. 建立调度 Job

创建 Job `xthb-scheduler`，包含一个步骤 `START`。在该步骤添加一个 Custom JavaScript Action：

```js
xtoysBridgeTick();
```

再建立一个 0.1 秒的 timed Trigger，使它回到同一个 `START` 步骤。这样每次执行都会调度下一次检查，用于有限事件到期、脉冲开关和基线恢复。不要为每一个游戏事件创建自己的计时器。

## 3. 建立全部 16 个输出 Job

建立以下 Job，名称必须完全一致：`xthb-output-01` 至 `xthb-output-16`。每个 Job 只配置一次，运行时会通过 `updateJob` 的 `start` 调用刷新它。

每个已启用槽的 Job 要按其配置类型连接相关设备/子通道，并添加这些块 Action：

- 当前强度或当前旋转速度值：`{xthb-slot-NN-value}`。
- 渐变时间：`{xthb-slot-NN-ramp-seconds}`。
- 仅当该槽是频率已启用的强度槽时，E-Stim 频率：`{xthb-slot-NN-frequency}`。
- 仅对旋转槽添加顺时针方向 Action，条件为 `{xthb-slot-NN-direction-code} == 1`。
- 仅对旋转槽添加逆时针方向 Action，条件为 `{xthb-slot-NN-direction-code} == -1`。

上述设备 Action 的实际菜单名称、E-Stim 频率字段、Rotate 方向选项和生成 JSON 都不是公开 Guide 固定的 UI 契约，必须 **当前界面核对**。先按 [Definitions](https://guide.xtoys.app/script-creation/definitions.html) 在 General 连接所需 Block，再从当前 Action 选择器选实际出现的设备 Action；可按 [JavaScript](https://guide.xtoys.app/script-creation/javascript.html) 的 “Add XToys Action” 方法取得当前 JSON。

下表列出 16 个 Job 的精确变量前缀和条件。将 `NN` 换成该行的两位编号，不要另起别名。

| Job | 值 / 渐变 / 频率变量 | 顺时针条件 | 逆时针条件 |
| --- | --- | --- | --- |
| `xthb-output-01` | `{xthb-slot-01-value}` / `{xthb-slot-01-ramp-seconds}` / `{xthb-slot-01-frequency}` | `{xthb-slot-01-direction-code} == 1` | `{xthb-slot-01-direction-code} == -1` |
| `xthb-output-02` | `{xthb-slot-02-value}` / `{xthb-slot-02-ramp-seconds}` / `{xthb-slot-02-frequency}` | `{xthb-slot-02-direction-code} == 1` | `{xthb-slot-02-direction-code} == -1` |
| `xthb-output-03` | `{xthb-slot-03-value}` / `{xthb-slot-03-ramp-seconds}` / `{xthb-slot-03-frequency}` | `{xthb-slot-03-direction-code} == 1` | `{xthb-slot-03-direction-code} == -1` |
| `xthb-output-04` | `{xthb-slot-04-value}` / `{xthb-slot-04-ramp-seconds}` / `{xthb-slot-04-frequency}` | `{xthb-slot-04-direction-code} == 1` | `{xthb-slot-04-direction-code} == -1` |
| `xthb-output-05` | `{xthb-slot-05-value}` / `{xthb-slot-05-ramp-seconds}` / `{xthb-slot-05-frequency}` | `{xthb-slot-05-direction-code} == 1` | `{xthb-slot-05-direction-code} == -1` |
| `xthb-output-06` | `{xthb-slot-06-value}` / `{xthb-slot-06-ramp-seconds}` / `{xthb-slot-06-frequency}` | `{xthb-slot-06-direction-code} == 1` | `{xthb-slot-06-direction-code} == -1` |
| `xthb-output-07` | `{xthb-slot-07-value}` / `{xthb-slot-07-ramp-seconds}` / `{xthb-slot-07-frequency}` | `{xthb-slot-07-direction-code} == 1` | `{xthb-slot-07-direction-code} == -1` |
| `xthb-output-08` | `{xthb-slot-08-value}` / `{xthb-slot-08-ramp-seconds}` / `{xthb-slot-08-frequency}` | `{xthb-slot-08-direction-code} == 1` | `{xthb-slot-08-direction-code} == -1` |
| `xthb-output-09` | `{xthb-slot-09-value}` / `{xthb-slot-09-ramp-seconds}` / `{xthb-slot-09-frequency}` | `{xthb-slot-09-direction-code} == 1` | `{xthb-slot-09-direction-code} == -1` |
| `xthb-output-10` | `{xthb-slot-10-value}` / `{xthb-slot-10-ramp-seconds}` / `{xthb-slot-10-frequency}` | `{xthb-slot-10-direction-code} == 1` | `{xthb-slot-10-direction-code} == -1` |
| `xthb-output-11` | `{xthb-slot-11-value}` / `{xthb-slot-11-ramp-seconds}` / `{xthb-slot-11-frequency}` | `{xthb-slot-11-direction-code} == 1` | `{xthb-slot-11-direction-code} == -1` |
| `xthb-output-12` | `{xthb-slot-12-value}` / `{xthb-slot-12-ramp-seconds}` / `{xthb-slot-12-frequency}` | `{xthb-slot-12-direction-code} == 1` | `{xthb-slot-12-direction-code} == -1` |
| `xthb-output-13` | `{xthb-slot-13-value}` / `{xthb-slot-13-ramp-seconds}` / `{xthb-slot-13-frequency}` | `{xthb-slot-13-direction-code} == 1` | `{xthb-slot-13-direction-code} == -1` |
| `xthb-output-14` | `{xthb-slot-14-value}` / `{xthb-slot-14-ramp-seconds}` / `{xthb-slot-14-frequency}` | `{xthb-slot-14-direction-code} == 1` | `{xthb-slot-14-direction-code} == -1` |
| `xthb-output-15` | `{xthb-slot-15-value}` / `{xthb-slot-15-ramp-seconds}` / `{xthb-slot-15-frequency}` | `{xthb-slot-15-direction-code} == 1` | `{xthb-slot-15-direction-code} == -1` |
| `xthb-output-16` | `{xthb-slot-16-value}` / `{xthb-slot-16-ramp-seconds}` / `{xthb-slot-16-frequency}` | `{xthb-slot-16-direction-code} == 1` | `{xthb-slot-16-direction-code} == -1` |

`xthb-slot-NN-generation` 是运行时单调递增的**物理下发令牌**，用于防止旧调度结果覆盖新结果；它不是设备 Action 的值，也不会仅凭逻辑事件序号变化就强制重启 Job。若值、频率、方向和渐变时间都没有变化，运行时会保留最新逻辑状态但跳过该槽的变量写入与 `updateJob`。失败重试、手动测试、强制同步和全局停止仍会显式下发。

因此，一个槽的逻辑状态 generation 可能已经推进，而 XToys 中的 `xthb-slot-NN-generation` 仍保持上次真正下发的令牌；下一次物理变化或强制下发会使用严格更大的令牌。关闭未使用槽时，仍保留相应 Job 和配置槽，且不把设备接到它们。

## 4. Initial / Final Actions：硬件安全背板

在 Script 的 Initial Actions 中，按以下顺序配置：

1. 对 `01`–`16` 的每个输出块，添加 UI Action，将当前强度或当前旋转速度设为 `0`；对每个频率已启用的强度输出，再将频率设为 `0`。
2. 添加 Variable Action，把 `xthb-config-json` 设置为本页完整 16 槽配置序列化后的完整 JSON 字符串。XToys Variables 由 Variable Action 定义/更新，Initial Actions 可设置初始变量（[Definitions](https://guide.xtoys.app/script-creation/definitions.html)、[Overview](https://guide.xtoys.app/script-creation/overview.html)）。
3. 添加 Custom JavaScript Action：

   ```js
   xtoysBridgeInit();
   ```

4. 添加启动 Job 的 UI Action，启动 `xthb-scheduler`。

在 Script 的 Final Actions 中，顺序必须为：

1. 添加 Custom JavaScript Action：

   ```js
   xtoysBridgeStopAll();
   ```

2. 添加停止 Job 的 UI Action，停止 `xthb-scheduler`。
3. 对 `01`–`16` 的每个输出块，添加 UI Action，将当前强度或当前旋转速度设为 `0`；对每个频率已启用的强度输出，再将频率设为 `0`。
4. 停止或清空所有 `xthb-output-01` 至 `xthb-output-16` Job/Queue（若模板为它们配置了持续 Queue）。

这些显式的 UI 零值 Action 是必须的。JavaScript 也会归零变量，但 Final Actions 在 JavaScript 抛错、运行时尚未初始化或单个 Job 刷新失败时仍是硬件停止的最后保障。它们只设置当前输出为零，不设置任何设备最大强度或最大旋转速度。

## 5. 可用的全局函数

- `xtoysBridgeInit()`：读取 `xthb-config-json`、验证配置、归零已启用槽并初始化运行时。
- `xtoysBridgeHandle(payload)`：处理 Global Trigger 映射出的内层 JSON 字符串。
- `xtoysBridgeTick()`：执行一次调度检查，返回改变槽数。
- `xtoysBridgeStopAll()`：清空运行状态并以零渐变尝试归零每个已启用槽；可重复调用以重试失败槽。
- `xtoysBridgeReloadConfig()`：重新读取 `xthb-config-json`；只在准备切换配置时调用。
- `xtoysBridgeTestSlot(slotId, value)`：手动向一个已启用配置槽输出一次 0–100 值。它与协议命令 `test` 不同，后者不驱动硬件。

全局 JavaScript 页面不是交互式控制台。需要人工调用 TestSlot/Reload 时，按[完整手册的临时人工验收入口](xtoys-complete-setup-guide.zh-CN.md)建立 Controls 与 Global Triggers；具体控件和变量 Trigger 文案按 **当前界面核对**，验收后删除或禁用临时入口。

## 6. 最终用户协助冒烟检查（待完成）

此检查目前明确为 **待用户在 XToys 与实际硬件上完成**。自动化测试只验证构建产物、变量和 `updateJob` Action；它不代表真实设备已经验证成功。

- [ ] 将 `dist/xtoys-universal-runtime.es5.js` 的完整内容粘贴到 XToys Script 的全局 JavaScript 页面。
- [ ] 按本指南建立一个启用的强度槽和一个启用的旋转槽，并保留其余 14 个禁用槽。
- [ ] 配置 Initial Actions、`xthb-scheduler`、两个输出 Job 和 Final Actions，然后启动 Script。
- [ ] 发送协议文档中的基线示例；确认强度与旋转基线、渐入时间和顺时针方向。
- [ ] 发送 `play` 示例；确认强度变化和配置的 ramp 生效。
- [ ] 发送较高 `sequence` 的方向 `update` 示例；确认旋转方向只在该更新后切换为逆时针。
- [ ] TestSlot 只验证强度、Rotate 速度与归零；E-Stim 频率和 Rotate 方向只使用低值协议 `play`/`update` 验证。每次立即发送匹配 `stop`，等待至少一个 scheduler tick 并确认物理归零后，才换槽或断开；若使用 baseline，则用更高 sequence 的空 baseline 清理。
- [ ] 等待有限事件到期并让调度 Job tick；确认输出按 ramp 恢复到最新基线，而不是归零或恢复旧状态。
- [ ] 在 `stop_all` 前重新建立可观察活动 baseline；发送 `stop_all` 后确认归零，再重发相同/旧 baseline sequence 确认被状态层忽略，最后用更高 sequence 确认恢复。
- [ ] 停止 Script；确认 Final Actions 再次把强度、旋转速度和适用的频率显式归零。
- [ ] 记录本次测试使用的 XToys Script 修订：`待填写`。
- [ ] 导出并记录与本文示例不同的 XToys UI Action JSON（若无差异也写明“无”）：`待填写`。

在以上项目全部完成并记录之前，硬件验证状态保持为“待完成”，也不要开始依赖真实设备行为的游戏适配迁移。
