# XToys 与 XTHB 完整设置手册（中文）

## 适用读者与最终成果

本手册面向第一次把游戏事件接入 XToys 的用户，以及需要维护 **XToys Universal Haptic Bridge（XTHB）** 的配置者。完成本手册及后续章节后，你会有一个受 XToys Script 承载的 XTHB：游戏 Bridge 只发送约定的 Webhook 消息，XTHB 负责将其路由到预先配置的输出槽；停止 Script 时，Final Actions 会把输出归零。

这不是无人值守的硬件运行说明。开始前必须能立即停止 XToys Script，并且由操作人员全程在场。

## 如何判断本文依据

为避免把项目约定、观察到的界面和 XToys 平台行为混为一谈，本文每一项内容按以下三层标识：

1. **XToys 官方行为**：仅指下列 `guide.xtoys.app` 页面明确说明的 Script、Block、Action、Trigger、Job、变量、表达式、JavaScript 与 Webhook 行为。平台定义以该页面为准。
2. **XTHB 项目约定**：本仓库运行时、协议和模板规定的固定名称与接线方式，不应误认为 XToys 的通用平台术语。16 槽、`xtoysBridgeHandle`、`xthb-output-NN` 等均属于这一层。
3. **当前界面核对**：官方公开指南未逐项固定、或可能随 XToys 界面版本变化的设备/UI 操作。执行时在你当前的 XToys 界面复查实际可选项、字段名与已连接设备；若不一致，先停止并记录差异，不要猜测映射关系。

### XToys 官方来源

以下七页是本文 XToys 平台信息的唯一公开依据；每个链接均保留原始地址，便于在操作前重新核对：

1. [Script Creation Overview](https://guide.xtoys.app/script-creation/overview.html)：Script 用于让已连接的工具事件驱动玩具；说明 General、Controls、Start/Stop Actions、Global Triggers 与 Jobs 的用途。
2. [Definitions and Details](https://guide.xtoys.app/script-creation/definitions.html)：定义 XToys Variables、Actions、Triggers、Jobs、Steps 与 Queues；变量引用使用花括号。
3. [Expressions](https://guide.xtoys.app/script-creation/expressions.html)：说明多数 Action 和 Trigger 可使用表达式，表达式可引用 XToys 变量。
4. [JavaScript](https://guide.xtoys.app/script-creation/javascript.html)：说明 Script/Trigger 可运行 Custom JavaScript、仅支持 ES5，以及通过 `getVariable`/`setVariable` 等接口访问 XToys 变量。
5. [Webhook](https://guide.xtoys.app/tools/webhook.html)：说明 Webhook 可通过 GET、POST 或 WebSocket 与 Script/Tease 通信，消息必须含 `action`；Shared Webhook 的 Auth Token 应像密码一样保密。
6. [Using Scripts](https://guide.xtoys.app/getting-started/using-scripts.html)：用户侧 Script 使用入口的官方导航页；实际点击路径以 **当前界面核对** 为准。
7. [Example 1 - Auto Increase](https://guide.xtoys.app/script-creation/example-1.html)：官方 Script 示例，作为阅读 Script 组成与动作编排的补充参考；不要把示例参数当作本项目的硬件配置。

## 系统数据流

**XTHB 项目约定**（实现、固定函数与固定 Job 名称见[一次性 XToys 模板配置](xtoys-template-setup.md)和[协议 v1](xtoys-protocol-v1.md)）：

```text
游戏 Bridge → XToys Webhook → xtoysBridgeHandle → 状态/路由
→ 槽变量 → xthb-output-NN Job → 设备 Action
```

含义如下：游戏 Bridge 发送协议封装；XToys Webhook 把收到的 `action` 与其他字段交给 Script；`xtoysBridgeHandle` 处理内层负载并更新 XTHB 的状态/路由；运行时写入槽变量；名称固定为 `xthb-output-NN` 的 Job 再把变量提供给设备 Action。XToys 官方行为只覆盖 Webhook 将 `action` 和其他键值交给 Script，以及 Script 的 Action/Job 机制（[Webhook](https://guide.xtoys.app/tools/webhook.html)、[Definitions and Details](https://guide.xtoys.app/script-creation/definitions.html)）；上述 XTHB 函数、槽和 Job 命名并非 XToys 平台内建功能。

不要把真实 Webhook ID 或 Auth Token 写进本手册、导出的示例、截图、提交记录或公开日志。尤其是 Shared Webhook 的 Auth Token 属于凭据，应仅保存在你自己的安全配置中（[Webhook](https://guide.xtoys.app/tools/webhook.html)）。

## 名词表

| 名词 | 含义与依据 |
| --- | --- |
| Script | **XToys 官方行为**：把已连接工具中的事件用于自动化玩具反应的 Script；可连接 Block。[官方说明](https://guide.xtoys.app/script-creation/overview.html) |
| Block | **XToys 官方行为**：Script 在 General Tab 中选择要控制或交互的 Block，例如 Tool 与玩具类型。[官方说明](https://guide.xtoys.app/script-creation/overview.html) |
| Action | **XToys 官方行为**：向已连接 Block 发送命令，或执行 Script 相关操作（如启动 Job、切换 Job Step）；可用 Action 取决于 Script 连接的 Block。[官方定义](https://guide.xtoys.app/script-creation/definitions.html) |
| Trigger | **XToys 官方行为**：条件为真时使 Action 运行；可依据已连接 Toy/Tool 状态、经过时间或变量状态。[官方定义](https://guide.xtoys.app/script-creation/definitions.html) |
| Global Trigger | **XToys 官方行为**：在 Script 的整个运行期间保持活动的 Trigger；若只想在特定点启用，应使用 Job 内 Trigger。[官方说明](https://guide.xtoys.app/script-creation/overview.html) |
| Job | **XToys 官方行为**：由多个 Step 组成的状态机；不会自动启动，启动时首先触发 START Step。[官方定义](https://guide.xtoys.app/script-creation/definitions.html) |
| Step | **XToys 官方行为**：Job 的组成单元；开始时会立即运行该 Step 的 Action，Job 同时只能处于一个 Step。[官方定义](https://guide.xtoys.app/script-creation/definitions.html) |
| XToys Variable | **XToys 官方行为**：存放数值或字符串的变量，可由 Variable Action 定义或更新，并在其他 Action/Trigger 中以 `{变量名}` 引用。[官方定义](https://guide.xtoys.app/script-creation/definitions.html) |
| Custom JavaScript | **XToys 官方行为**：Script 和 Trigger 可以运行的 JavaScript；官方页面说明其为 ES5、在 Script/Tease 启动时求值，并可读写 XToys Variable。[官方说明](https://guide.xtoys.app/script-creation/javascript.html) |
| Webhook | **XToys 官方行为**：通过 GET、POST 或 WebSocket 与 XToys Script/Tease 通信的机制；消息必须有 `action`，Script 可据该值配置 Trigger。[官方说明](https://guide.xtoys.app/tools/webhook.html) |
| XTHB 槽 | **XTHB 项目约定**：编号 01–16 的逻辑输出槽，配置、变量前缀和 `xthb-output-NN` Job 由仓库模板固定，不是 XToys 官方术语。[模板说明](xtoys-template-setup.md) |

## 安全准备

在接线、发送测试消息或启动 Script 前逐项完成：

1. 在 XToys 的设备控制处先设置保守的设备上限；此位置、字段名和每个设备的可设范围均为 **当前界面核对**，不得根据本手册臆测。协议本身不设置设备最大强度或最大旋转速度，见[协议 v1](xtoys-protocol-v1.md)。
2. 一次只启用并验证一个 XTHB 槽。先发送协议 `test` 做解析预览：协议 `test` 只预览、不驱动物理输出；它用于确认消息能被接受，不能用协议 `test` 替代硬件验收。只有在预览无误、人员在场且停止控制可用时，才可使用真实测试函数；`xtoysBridgeTestSlot(slotId, value)` 才会产生真实硬件输出。真实测试必须以低值且一次一槽逐步上调，每一次上调后都确认设备反馈和停止控制，再继续下一个槽或值。该函数和协议 `test` 的差异属于 **XTHB 项目约定**，分别见[一次性 XToys 模板配置](xtoys-template-setup.md)和[协议 v1](xtoys-protocol-v1.md)；实际设备/子通道选择属于 **当前界面核对**。
3. 保持 XToys Script 的停止按钮或等效停止控制随时可操作；由在场人员执行测试，绝不无人运行。官方说明 Final Actions 会在 Script 停止时触发，通常用于把玩具强度设回 0（[Script Creation Overview](https://guide.xtoys.app/script-creation/overview.html)）。
4. 在任何常规测试前先验证 Final Actions：启动后立刻停止，并确认每个已连接输出都已归零。归零需要按真实设备反馈和当前界面复核，属于 **当前界面核对**；不能只凭变量或日志推断硬件已停止。
5. 遇到异常输出、无法立即停止、设备行为与预期不符或不确定哪一个槽在驱动设备时，立即停止 Script、断开受影响设备，并在问题确认前不要继续测试。

下一章将基于以上边界配置 Script、Webhook、调度 Job 与输出 Job。执行具体按钮步骤前，请重新打开相关官方页面并完成 **当前界面核对**。

## 从零建立 XTHB Script 基础设施

本章把 XToys 已公开的 Script 工作流与 XTHB 固定契约接在一起。这里的 `xthb-*` 名称、全局函数和变量是 **XTHB 项目约定**；XToys 的 Script、Block、Action、Trigger、Job 与变量的含义以 [Overview](https://guide.xtoys.app/script-creation/overview.html)、[Definitions and Details](https://guide.xtoys.app/script-creation/definitions.html) 和 [JavaScript](https://guide.xtoys.app/script-creation/javascript.html) 为准。

### 1. 新建、加载并连接独立 Script

1. 打开官方的 [My Scripts](https://guide.xtoys.app/script-creation/overview.html) 页面，点击 `+` 新建 Script。**XToys 官方行为**：官方 Overview 明确写明从 My Scripts 的 `+` 创建 Script。
2. 在 General 页面先添加 Webhook 工具 Block，再添加这份配置实际需要的 Toy/输出 Block。点击 Add Block、选择 Block 类型；Webhook 的 Private/Shared 类型与设备类型均按你的真实连接选择。**XToys 官方行为**：General 页面用于选择 Script 要控制或交互的 Block，且 Action 的可选项取决于已连接的 Block（[Overview](https://guide.xtoys.app/script-creation/overview.html)、[Definitions](https://guide.xtoys.app/script-creation/definitions.html)）。所以先连 Block，后配 Action；找不到一个 Action 时，先检查它所需的 Block 是否已添加。
3. 保存 Script 后，将它作为**独立 Script**加载到当前 XToys 会话，连接实际 Toy/输出 Block，再由操作人员手动启动和停止。官方说明：单一 Tool 的 Script *可以*嵌入 Tool；连接多个 Tool 时会作为可手动开关的独立 Block（[Overview](https://guide.xtoys.app/script-creation/overview.html)）。本手册选择独立 Script，嵌入 Tool 不是必选步骤。
4. 若当前界面的加载、连接或启动按钮名称与上句不同，按 **当前界面核对** 记录实际路径；不要把旧界面或其他 Script 的按钮名称套用到这里。

### 2. 安装运行时与配置变量

1. 在 Script 编辑器顶部点击 `JS`，粘贴构建产物 `dist/xtoys-universal-runtime.es5.js` 的**完整内容**，然后保存。**XToys 官方行为**：`JS` 位于编辑器顶栏，JavaScript 会在 Script 启动时立即求值；它只支持 ES5、经 JS-Interpreter 执行且没有 DOM 访问（[JavaScript](https://guide.xtoys.app/script-creation/javascript.html)）。不要把完整运行时拆进某个 Trigger 的内联 Action。
2. 添加一个 XToys Variable Action，把变量名设为 `xthb-config-json`，值设为完整配置 JSON 字符串（配置的五个组与 16 个槽定义见[一次性 XToys 模板配置](xtoys-template-setup.md)）。未使用槽仍要保留，并在 JSON 中设为 `enabled: false`。
3. 在 Action 或 Control 的文本字段引用这个变量时写 `{xthb-config-json}`；XToys 官方规定变量在 Action/Trigger 中使用花括号（[Definitions](https://guide.xtoys.app/script-creation/definitions.html)）。相反，JavaScript 中调用 `getVariable('xthb-config-json')` 时**不**写花括号，这是官方 JavaScript API 的规则（[JavaScript](https://guide.xtoys.app/script-creation/javascript.html)）。
4. 运行时只在 `xtoysBridgeInit()` 或 `xtoysBridgeReloadConfig()` 时读取配置；完成初始配置后前者用于初始化，准备切换整份配置时才调用后者。两个函数的具体语义见本章末的函数表。

### 3. 建立固定 Webhook Global Trigger

1. 先在个人 Profile 创建 Private 或 Shared Webhook，并将 Webhook ID（以及 Shared Webhook 所需的 Auth Token）保存在私密位置。**XToys 官方行为**：Webhook 消息必须含 `action` 和 Webhook ID；Shared Webhook 还需要 Auth Token，且 Token 应视为密码（[Webhook](https://guide.xtoys.app/tools/webhook.html)）。不要把真值写入 Script 导出、文档或日志。
2. 在 Global Triggers 中建立一个连接到 Webhook Block 的 Trigger，将外层 `action` 筛选为 XTHB 固定值 `xtoys_game_bridge`。官方说明 Webhook 的 `action` 可由 Script Trigger 用作响应条件，且 Global Trigger 在 Script 的整个运行期间有效（[Webhook](https://guide.xtoys.app/tools/webhook.html)、[Overview](https://guide.xtoys.app/script-creation/overview.html)）。
3. 将该 Trigger 提供的**完整内层 payload**仅映射到内联 Custom JavaScript 的输入变量 `payload`，随后添加下列内联 Action：

   ```js
   xtoysBridgeHandle(payload);
   ```

   不在 Trigger 内拆分协议字段，不使用 `eval`，也不把外层 `action` 改成游戏事件名。Webhook Trigger 所提供变量的精确名称、映射控件和按钮标题不是官方公开指南的固定承诺，均为 **当前界面核对**：请在当前 UI 选取实际出现的 payload 输入，并在保存前确认它把完整内层 JSON 交给 `payload`。

### 4. 建立调度 Job

1. 新建 Job，名称必须为 `xthb-scheduler`；建立（或保留）其 `START` Step。
2. 在 `START` 中添加 Custom JavaScript Action：

   ```js
   xtoysBridgeTick();
   ```

3. 在这个 Job 的当前 Step 添加一个基于 elapsed time 的 Trigger；让 Trigger 所连 Action 重新进入同一个 `START` Step。间隔使用模板约定的 `0.1` 秒。**XToys 官方行为**：Job 启动后首先触发 START Step，Step 的 Action 会立即运行；当前 Step 的 Trigger 可调用 Action 回到同一个 Step 并重新运行它的 Action（[Definitions](https://guide.xtoys.app/script-creation/definitions.html)、[官方 Job 循环示例](https://guide.xtoys.app/script-creation/example-1.html)）。
4. elapsed-time Trigger 的实际控件文案、单位和“回到当前 Step”Action 的菜单文字均为 **当前界面核对**；官方公开指南没有把这些 UI 标签固定为某个名称。不要为每个游戏事件另建计时器。

### 5. 创建 16 个固定输出 Job

依次创建名称**完全一致**的 Job：`xthb-output-01`、`xthb-output-02`、…、`xthb-output-16`。每个 Job 只配置一次；运行时每次应用槽状态都会写变量并启动同名 Job。源码中的实际调用为：

```js
callAction({ type: 'updateJob', job: 'xthb-output-' + suffix, action: 'start' });
```

`callAction` 是 XToys 官方提供的 JavaScript Action 调用接口；官方示例也使用 `type: "updateJob"` 和 `job` 字段。上述 `xthb-output-NN` 名称与 `action: 'start'` 的组合是 **XTHB 项目约定**，已按 [50-xtoys-adapter.es5.js](../src/XToysUniversalBridge/50-xtoys-adapter.es5.js) 核对。Job 不会自动启动，因而不应依赖“创建后自动运行”（[Definitions](https://guide.xtoys.app/script-creation/definitions.html)）。

每个 Job Action 的文本字段使用下表花括号表达式。`generation` 由运行时写入以防旧调度结果覆盖新结果，**不是**设备 Action 的值；保留它是为了与运行时契约一致。

| Job | value | frequency | ramp-seconds | direction-code | generation |
| --- | --- | --- | --- | --- | --- |
| `xthb-output-01` | `{xthb-slot-01-value}` | `{xthb-slot-01-frequency}` | `{xthb-slot-01-ramp-seconds}` | `{xthb-slot-01-direction-code}` | `xthb-slot-01-generation` |
| `xthb-output-02` | `{xthb-slot-02-value}` | `{xthb-slot-02-frequency}` | `{xthb-slot-02-ramp-seconds}` | `{xthb-slot-02-direction-code}` | `xthb-slot-02-generation` |
| `xthb-output-03` | `{xthb-slot-03-value}` | `{xthb-slot-03-frequency}` | `{xthb-slot-03-ramp-seconds}` | `{xthb-slot-03-direction-code}` | `xthb-slot-03-generation` |
| `xthb-output-04` | `{xthb-slot-04-value}` | `{xthb-slot-04-frequency}` | `{xthb-slot-04-ramp-seconds}` | `{xthb-slot-04-direction-code}` | `xthb-slot-04-generation` |
| `xthb-output-05` | `{xthb-slot-05-value}` | `{xthb-slot-05-frequency}` | `{xthb-slot-05-ramp-seconds}` | `{xthb-slot-05-direction-code}` | `xthb-slot-05-generation` |
| `xthb-output-06` | `{xthb-slot-06-value}` | `{xthb-slot-06-frequency}` | `{xthb-slot-06-ramp-seconds}` | `{xthb-slot-06-direction-code}` | `xthb-slot-06-generation` |
| `xthb-output-07` | `{xthb-slot-07-value}` | `{xthb-slot-07-frequency}` | `{xthb-slot-07-ramp-seconds}` | `{xthb-slot-07-direction-code}` | `xthb-slot-07-generation` |
| `xthb-output-08` | `{xthb-slot-08-value}` | `{xthb-slot-08-frequency}` | `{xthb-slot-08-ramp-seconds}` | `{xthb-slot-08-direction-code}` | `xthb-slot-08-generation` |
| `xthb-output-09` | `{xthb-slot-09-value}` | `{xthb-slot-09-frequency}` | `{xthb-slot-09-ramp-seconds}` | `{xthb-slot-09-direction-code}` | `xthb-slot-09-generation` |
| `xthb-output-10` | `{xthb-slot-10-value}` | `{xthb-slot-10-frequency}` | `{xthb-slot-10-ramp-seconds}` | `{xthb-slot-10-direction-code}` | `xthb-slot-10-generation` |
| `xthb-output-11` | `{xthb-slot-11-value}` | `{xthb-slot-11-frequency}` | `{xthb-slot-11-ramp-seconds}` | `{xthb-slot-11-direction-code}` | `xthb-slot-11-generation` |
| `xthb-output-12` | `{xthb-slot-12-value}` | `{xthb-slot-12-frequency}` | `{xthb-slot-12-ramp-seconds}` | `{xthb-slot-12-direction-code}` | `xthb-slot-12-generation` |
| `xthb-output-13` | `{xthb-slot-13-value}` | `{xthb-slot-13-frequency}` | `{xthb-slot-13-ramp-seconds}` | `{xthb-slot-13-direction-code}` | `xthb-slot-13-generation` |
| `xthb-output-14` | `{xthb-slot-14-value}` | `{xthb-slot-14-frequency}` | `{xthb-slot-14-ramp-seconds}` | `{xthb-slot-14-direction-code}` | `xthb-slot-14-generation` |
| `xthb-output-15` | `{xthb-slot-15-value}` | `{xthb-slot-15-frequency}` | `{xthb-slot-15-ramp-seconds}` | `{xthb-slot-15-direction-code}` | `xthb-slot-15-generation` |
| `xthb-output-16` | `{xthb-slot-16-value}` | `{xthb-slot-16-frequency}` | `{xthb-slot-16-ramp-seconds}` | `{xthb-slot-16-direction-code}` | `xthb-slot-16-generation` |

### 6. 为三类槽填写设备 Action

先按配置中每个槽的 `type` 与 `frequencyEnabled` 决定下列接线；同一物理子通道不可同时接到多个槽。设备专属 Action 的名称、字段、范围和所需 Block 均是 **当前界面核对**：在当前 Action 选择器中选择实际出现的项目，并用编辑器的 “Add XToys Action” 导出/记录生成 JSON；官方公开 JavaScript 指南建议以此方式取得正确 Action JSON（[JavaScript](https://guide.xtoys.app/script-creation/javascript.html)）。

1. **普通强度槽**：把 `{xthb-slot-NN-value}` 作为当前强度值，把 `{xthb-slot-NN-ramp-seconds}` 作为渐变时间；不添加频率或 Rotate 方向 Action。
2. **支持频率的 E-Stim 强度槽**：在普通强度槽的两个字段之外，把 `{xthb-slot-NN-frequency}` 填入当前 UI 出现的频率字段。E-Stim 的精确 Action 菜单名称与字段标签未由官方公开指南列出，必须按 **当前界面核对** 记录；不要假称某个菜单标题是官方固定值。
3. **Rotate 槽**：把 `{xthb-slot-NN-value}` 用作当前旋转速度，并把 `{xthb-slot-NN-ramp-seconds}` 用作其渐变时间。按 XTHB 项目约定添加两个方向 Action：当 `{xthb-slot-NN-direction-code} == 1` 时顺时针；当 `{xthb-slot-NN-direction-code} == -1` 时逆时针；值为 `0` 时不执行任何方向 Action。Rotate 的精确 Action 菜单与字段名称同样是 **当前界面核对**。

### 7. Initial Actions 与 Final Actions 的固定顺序

在 Start/Stop Actions 页面按以下顺序配置。**XToys 官方行为**：Initial Actions 在 Script 启动时立即触发；Final Actions 在停止时触发，通常用于把玩具强度归零（[Overview](https://guide.xtoys.app/script-creation/overview.html)）。所有设备的“设为 0”UI Action 名称、频率字段和 Job/Queue 停止控件均为 **当前界面核对**。

**Initial Actions（顺序不可调换）：**

1. 对 `01`–`16` 的每个输出 Block，将当前强度或当前旋转速度设为 `0`；对启用频率的强度输出也将频率设为 `0`。
2. 添加 Custom JavaScript Action：`xtoysBridgeInit();`。
3. 添加启动 Job 的 UI Action，启动 `xthb-scheduler`。

**Final Actions（顺序不可调换）：**

1. 添加 Custom JavaScript Action：`xtoysBridgeStopAll();`。
2. 添加停止 Job 的 UI Action，停止 `xthb-scheduler`。
3. 对 `01`–`16` 的每个输出 Block，将当前强度或当前旋转速度设为 `0`；对启用频率的强度输出也将频率设为 `0`。
4. 停止或清空 `xthb-output-01` 至 `xthb-output-16` 的 Job/Queue（只在你为这些输出配置了持续 Queue 时执行）。

这些显式 UI 零值 Action 是硬件停止的最后保障；它们只改变当前输出，**不修改设备最大强度**或最大旋转速度。XTHB 运行时只消费送入 Webhook 的协议 payload 和 `xthb-scheduler` 的 tick，**不检测游戏进程**、心跳或设备最大值；因此它们不能替代人工设定的设备安全上限与停止控制。

### 8. XTHB 全局函数速查

以下函数都来自粘贴的运行时，名称和参数是 **XTHB 项目约定**，不是 XToys 内建命令：

| 函数 | 何时调用 | 结果/边界 |
| --- | --- | --- |
| `xtoysBridgeInit()` | Initial Actions 的第 2 步 | 读取 `xthb-config-json`、验证配置、归零启用槽并初始化运行时。 |
| `xtoysBridgeHandle(payload)` | 固定 Webhook Global Trigger | 处理映射出的完整内层 JSON 字符串。 |
| `xtoysBridgeTick()` | `xthb-scheduler` 的 START Step | 执行一次调度检查并返回改变的槽数。 |
| `xtoysBridgeStopAll()` | Final Actions 的第 1 步 | 清空运行状态，并以零渐变尝试归零每个启用槽；可再次调用以重试失败槽。 |
| `xtoysBridgeReloadConfig()` | 准备切换整份配置时 | 重新读取 `xthb-config-json`；不要把它当成每条游戏消息的处理函数。 |
| `xtoysBridgeTestSlot()` | 人工逐槽低输出检查 | `xtoysBridgeTestSlot()` 会产生真实硬件输出；实际签名为 `xtoysBridgeTestSlot(slotId, value)`，仅对已启用的 1–16 槽接受 0–100 值。与只预览、不驱动物理输出的协议 `test` 不同。 |
