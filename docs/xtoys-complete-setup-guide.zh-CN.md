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

1. 打开 XToys 应用，在侧边栏进入 My Scripts，再点 `+` 新建 Script。**XToys 官方行为**：官方 [Script Creation Overview](https://guide.xtoys.app/script-creation/overview.html) 说明从 My Scripts 的 `+` 创建 Script；这个 Guide 页面是操作依据，不是 XToys 应用入口。
2. 在 General 页面先添加 Webhook 工具 Block，再添加这份配置实际需要的 Toy/输出 Block。点击 Add Block、选择 Block 类型；Webhook 的 Private/Shared 类型与设备类型均按你的真实连接选择。**XToys 官方行为**：General 页面用于选择 Script 要控制或交互的 Block，且 Action 的可选项取决于已连接的 Block（[Overview](https://guide.xtoys.app/script-creation/overview.html)、[Definitions](https://guide.xtoys.app/script-creation/definitions.html)）。所以先连 Block，后配 Action；找不到一个 Action 时，先检查它所需的 Block 是否已添加。
3. 保存后按 [Using Scripts](https://guide.xtoys.app/getting-started/using-scripts.html) 的公开流程操作：在 My Scripts 选中它并点 `Load Script`，然后在会话中的 Script Block 使用 plug（连接）按钮连接所需 Block，使用 play（播放）按钮启动。需要停止时由操作人员手动停止。官方还说明单一 Tool 的 Script 可以选择嵌入；本手册选择不嵌入的独立 Script。
4. `Load Script`、plug 与 play 是 Using Scripts 当前公开说明中的按钮；除此之外的布局、设备列表、停止按钮位置或当前界面出现差异时，按 **当前界面核对** 记录实际路径，不要从 Guide Overview 的链接地址推断应用入口。

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
2. 添加 Variable Action，把 `xthb-config-json` 设置为“完整 16 槽配置”一节中整份 JSON 序列化后的完整 JSON 字符串。Variables 可由 Variable Action 定义/更新，而 Initial Actions 可设置初始变量值（[Definitions](https://guide.xtoys.app/script-creation/definitions.html)、[Overview](https://guide.xtoys.app/script-creation/overview.html)）；不要只在编辑说明中创建变量而漏掉这一步。
3. 添加 Custom JavaScript Action：`xtoysBridgeInit();`。
4. 添加启动 Job 的 UI Action，启动 `xthb-scheduler`。

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
| `xtoysBridgeInit()` | Initial Actions 的第 3 步 | 读取 `xthb-config-json`、验证配置、归零启用槽并初始化运行时。 |
| `xtoysBridgeHandle(payload)` | 固定 Webhook Global Trigger | 处理映射出的完整内层 JSON 字符串。 |
| `xtoysBridgeTick()` | `xthb-scheduler` 的 START Step | 执行一次调度检查并返回改变的槽数。 |
| `xtoysBridgeStopAll()` | Final Actions 的第 1 步 | 清空运行状态，并以零渐变尝试归零每个启用槽；可再次调用以重试失败槽。 |
| `xtoysBridgeReloadConfig()` | 准备切换整份配置时 | 重新读取 `xthb-config-json`；不要把它当成每条游戏消息的处理函数。 |
| `xtoysBridgeTestSlot()` | 人工逐槽低输出检查 | `xtoysBridgeTestSlot()` 会产生真实硬件输出；实际签名为 `xtoysBridgeTestSlot(slotId, value)`，仅对已启用的 1–16 槽接受 0–100 值。与只预览、不驱动物理输出的协议 `test` 不同。 |

### 9. 建立临时人工验收入口

粘贴运行时的 JS 区域只负责定义并在 Script 启动时加载函数，不能在运行期间手动执行函数。B/C 阶段需要调用 `xtoysBridgeTestSlot()` 或 `xtoysBridgeReloadConfig()` 时，先建立下面的临时入口。其机制来自 XToys 官方说明：Controls 可动态改变 XToys variables，Global Triggers 可在整个 Script 运行期根据变量状态触发 Action，Custom JavaScript 可用 `getVariable()` 读取这些变量（[Overview](https://guide.xtoys.app/script-creation/overview.html)、[Definitions](https://guide.xtoys.app/script-creation/definitions.html)、[JavaScript](https://guide.xtoys.app/script-creation/javascript.html)）。

1. 在 Controls 页面创建两个输入控件，分别绑定 XToys variables `xthb-test-slot` 和 `xthb-test-value`；槽号填 1–16，值从经过现场确认的低值开始。再创建两个临时触发控件，分别绑定 `xthb-run-test-slot` 和 `xthb-run-reload-config`。建议使用按下后会回到 off 的 Push button。
2. 在 Global Triggers 页面创建一个临时变量 Trigger：当 `xthb-run-test-slot` 为真时，执行一个 Custom JavaScript Action，精确内容为：

   ```js
   xtoysBridgeTestSlot(getVariable('xthb-test-slot'), getVariable('xthb-test-value'));
   ```

   运行 Script，在 Controls 中填写 slot/value 后按临时测试控件。预期只有该已启用槽收到一次真实输出；值设为 `0` 后再触发可直接写零，但若仍有协议事件或 baseline，下一次 scheduler tick 可能恢复输出。
3. 再创建一个临时变量 Trigger：当 `xthb-run-reload-config` 为真时，执行另一个 Custom JavaScript Action，精确内容为：

   ```js
   xtoysBridgeReloadConfig();
   ```

   在 Initial Actions 的 Variable Action 或其源配置中更新完整 JSON 后，重新运行相应 Variable Action，再按 Controls 中的临时 reload 控件。预期日志显示新配置已读取；随后用低值消息核对目标槽。
4. Controls 的具体控件标题、变量 Trigger 的比较方式、Trigger 输出变量和 Action 编辑按钮会随当前 UI 而变，官方公开页没有固定这些文案；全部按 **当前界面核对**。只采用能明确绑定上述变量并能在运行期改变它们的实际选项。
5. A–D 验收结束后，删除或禁用这四个临时 Control 和两个临时 Global Trigger；确认正常运行只保留 Webhook Trigger。若保留验收入口，任何能操作 Script 的人都可能触发真实硬件输出。

## 设备、逻辑部位与 16 槽规划

**XTHB 项目约定**：16 个槽是固定的逻辑出口，不是 16 台设备的要求。先列出实际连接的每个物理设备和子通道，再决定是否启用对应槽；设备菜单、子通道名称和 Action 字段均为 **当前界面核对**。同一设备的独立振动执行器和独立旋转执行器必须使用不同槽；多个设备只有在应收到完全相同的输出时才可接到同一槽。

先在 XToys 把最大强度、最大转速设到在场使用者认可的低安全范围；这是 **当前界面核对**，不把数值或菜单名假定为官方固定值。真实输出时一次只连接当前测试槽，其他物理输出保持断开或禁用。

| 槽 | 物理设备 / 子通道 | 逻辑部位 | 类型 | 当前界面核对的设备 Action JSON | 填写栏 |
| --- | --- | --- | --- | --- | --- |
| 01 | ______ | ______ | intensity（频率） | ______ | ______ |
| 02 | ______ | ______ | intensity | ______ | ______ |
| 03 | ______ | ______ | rotation | ______ | ______ |
| 04–16 | ______ | ______ | intensity / rotation | ______ | ______ |

一个 `routes` 对象可把多个逻辑叶子部位指向同一槽，例如下方槽 01 同时接收 `clitoris` 和 `vagina`。这表示这些部位共用这个物理输出并进入同一仲裁，不会把两个值简单相加：基线候选取有效值较高者，有限事件按优先级、有效值、sequence、接受时间和 generation 选择胜者。若这种共享不符合设备预期，应拆成不同槽。

## 完整 16 槽配置

将下列对象整体序列化后填入 `xthb-config-json`。这是唯一的配置 JSON 代码块；保存前调用 `XTHB.validateConfig(config)` 或启动 `xtoysBridgeInit()`，只有验证成功才连接设备。它含五个固定组、连续 1–16 槽、一个 `frequencyEnabled: true` 的强度槽、一个旋转槽，以及保留但禁用的未用槽。

```json
{
  "logLevel": "errors",
  "globalMultiplier": 0.5,
  "groups": {
    "genitals": { "clitoris": 1, "vulva": 0.8, "vagina": 0.8, "penis": 0.8, "prostate": 0.8 },
    "lower_body": { "vulva": 0.8, "vagina": 0.8, "anus": 0.7, "butt": 0.6, "penis": 0.7, "prostate": 0.7 },
    "double_hole": { "vagina": 1, "anus": 1 },
    "whole_body": { "mouth": 0.4, "breast": 0.5, "clitoris": 0.7, "vagina": 0.7, "anus": 0.5, "penis": 0.7 },
    "mixed": { "nipple": 0.5, "armpit": 0.4, "vulva": 0.6, "butt": 0.5, "prostate": 0.6 }
  },
  "slots": [
    { "id": 1, "enabled": true, "type": "intensity", "frequencyEnabled": true, "routes": { "clitoris": 1, "vagina": 0.7 } },
    { "id": 2, "enabled": true, "type": "intensity", "frequencyEnabled": false, "routes": { "vulva": 1 } },
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

字段说明（均为 **XTHB 项目约定**）：

- `logLevel` 只能是 `off`、`errors` 或 `debug`；常规配置使用 `errors`。A 阶段为了看见成功的协议预览会临时改为 `debug`，验完必须恢复 `errors`。
- `globalMultiplier` 是非负的总路由倍率。一个组目标经过的有效值是游戏值 × 组权重 × 槽 `routes` 权重 × 此倍率，最后夹到 0–100；它不是 XToys 的设备最大值设置。
- `groups` 必须恰有 `genitals`、`lower_body`、`double_hole`、`whole_body`、`mixed` 五键。每个组内的 0–1 权重只在游戏发送该组名时展开到叶子部位。
- 每个 `slots` 项必须有连续且唯一的 `id`、布尔 `enabled`、`intensity` 或 `rotation` 的 `type`、布尔 `frequencyEnabled` 和叶子部位到 0–1 的 `routes`。
- 本手册把 `frequencyEnabled` 仅用于强度槽的频率 Action；推荐的旋转槽设为 `false`，并只把 `rotateSpeed` 与显式 `rotateDirection` 接到 Rotate Action。为旋转槽打开它本身不会在此接线方案中产生频率控制。
- `routes` 允许一个物理槽共享多个逻辑部位，结果如上节的同槽仲裁；禁用槽即使有 Job 也不输出，仍必须保留在配置中。

## 六类外层 Webhook 示例

以下均为可解析的外层 Webhook JSON；`action` 固定为 `xtoys_game_bridge`，`payload` 是经转义的内层 JSON 字符串。示例标识均为虚构文本，不含 Webhook URL、ID 或 Auth Token。发送时仍须按 [Webhook 官方说明](https://guide.xtoys.app/tools/webhook.html) 在私密位置使用自己的地址和凭据。

### POST 地址与认证模板

`<WEBHOOK_ID>` 和 `<AUTH_TOKEN>` 都是用户必须自行替换的占位符，不是真实值；不要把替换后的值提交到仓库或贴进公开日志。Private Webhook 的可执行请求结构如下：

```http
POST https://webhook.xtoys.app/<WEBHOOK_ID>
Content-Type: application/json

{"action":"xtoys_game_bridge","payload":"{\"protocolVersion\":1,\"command\":\"test\",\"source\":\"post-template\",\"targets\":[{\"part\":\"clitoris\",\"intensity\":10}]}"}
```

Shared Webhook 使用相同 POST 地址和 JSON body，并额外加入官方要求的 Authorization header：

```http
POST https://webhook.xtoys.app/<WEBHOOK_ID>
Content-Type: application/json
Authorization: Bearer <AUTH_TOKEN>

{"action":"xtoys_game_bridge","payload":"{\"protocolVersion\":1,\"command\":\"test\",\"source\":\"post-template\",\"targets\":[{\"part\":\"clitoris\",\"intensity\":10}]}"}
```

成功观察点是对应 Webhook Global Trigger 确实运行，并在 A 阶段看见 `XTHB debug:` 预览日志；这比只看到发送工具完成更可靠。失败观察点包括发送端 HTTP/认证错误、Shared 请求缺少或错填 Bearer token、Trigger 没运行，或 XTHB errors/debug 日志报告 payload 被拒绝。Webhook 地址、POST JSON 和 Shared Authorization 的依据均来自 [Webhook 官方说明](https://guide.xtoys.app/tools/webhook.html)。

### 1. `set_baseline`：建立基线

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"set_baseline\",\"source\":\"manual-demo\",\"sequence\":1,\"targets\":[{\"part\":\"vagina\",\"intensity\":12,\"frequency\":10,\"rotateSpeed\":10,\"rotateDirection\":\"clockwise\",\"rampUpMs\":300,\"rampDownMs\":300}]}"
}
```

### 2. `play`：叠加有限事件

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"play\",\"source\":\"manual-demo\",\"eventId\":\"acceptance-event\",\"sequence\":1,\"targets\":[{\"part\":\"vagina\",\"intensity\":20,\"frequency\":25,\"rotateSpeed\":25,\"rotateDirection\":\"clockwise\",\"durationMs\":30000,\"rampUpMs\":100,\"rampDownMs\":200,\"priority\":10}]}"
}
```

### 3. `update`：使用更高 sequence 更新并反转旋转方向

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"update\",\"source\":\"manual-demo\",\"eventId\":\"acceptance-event\",\"sequence\":2,\"targets\":[{\"part\":\"vagina\",\"intensity\":30,\"frequency\":30,\"rotateSpeed\":35,\"rotateDirection\":\"counterclockwise\",\"durationMs\":30000,\"rampUpMs\":100,\"rampDownMs\":200,\"priority\":10}]}"
}
```

为给在场人员留出观察和记录时间，这两个低值示例使用 30000 ms。`update` 必须在有限事件到期前发送；若先前的 `play` 已到期，运行时会以 `absent_event` 忽略该 `update`，而不是重新创建事件。更新成功后，该 `update` 自己的 30000 ms 重新从接受时刻计算。

### 4. `stop`：停止指定有限事件

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"stop\",\"source\":\"manual-demo\",\"eventId\":\"acceptance-event\"}"
}
```

### 5. 空 `set_baseline`：用更高 sequence 清除该来源基线

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"set_baseline\",\"source\":\"manual-demo\",\"sequence\":2,\"targets\":[]}"
}
```

### 6. 在 `stop_all` 前重新建立可观察活动 baseline

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"set_baseline\",\"source\":\"manual-demo\",\"sequence\":3,\"targets\":[{\"part\":\"vagina\",\"intensity\":12,\"frequency\":10,\"rotateSpeed\":10,\"rotateDirection\":\"clockwise\",\"rampUpMs\":0,\"rampDownMs\":0}]}"
}
```

先等待至少一个 scheduler tick，并按真实设备确认这个 baseline 已产生可观察的低值活动输出，再发送下一条 `stop_all`；不要让 `stop_all` 面对空状态。

### 7. `stop_all`：全停但不清除 baseline sequence 栅栏

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"stop_all\",\"source\":\"manual-demo\"}"
}
```

`stop_all` 清除所有来源的当前基线和有限事件，并归零已启用槽；但它保留每个 `source` 已接受的 baseline sequence 栅栏。下面先重发相同的 `sequence: 3`，验证状态层将其忽略并保持零；parser 仍会认为这条消息格式有效。

### 8. `stop_all` 后重发相同 sequence：格式有效但应被栅栏忽略

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"set_baseline\",\"source\":\"manual-demo\",\"sequence\":3,\"targets\":[{\"part\":\"vagina\",\"intensity\":12,\"frequency\":10,\"rotateSpeed\":10,\"rotateDirection\":\"clockwise\",\"rampUpMs\":0,\"rampDownMs\":0}]}"
}
```

### 9. `stop_all` 后用更高 sequence 恢复

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"set_baseline\",\"source\":\"manual-demo\",\"sequence\":4,\"targets\":[{\"part\":\"vagina\",\"intensity\":12,\"frequency\":10,\"rotateSpeed\":10,\"rotateDirection\":\"clockwise\",\"rampUpMs\":0,\"rampDownMs\":0}]}"
}
```

只有大于已接受 baseline sequence 的序号才能恢复。相同/旧序号保持物理零，更高 `sequence: 4` 恢复低值输出；这是 XTHB 状态机语义，不是 XToys Webhook 的通用功能。

### 10. `test`：只做协议预览

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"test\",\"source\":\"manual-demo\",\"targets\":[{\"part\":\"clitoris\",\"intensity\":10}]}"
}
```

协议 `test` 只预览、不驱动物理输出；它不能替代 `xtoysBridgeTestSlot(slotId, value)` 的真实硬件验收。

## 四阶段人工验收

每一阶段都由在场人员执行。任一步出现异常输出、停止无效、Action 与记录不符或不确定当前槽时，立即停止 Script、断开受影响设备，记录结果并停止后续阶段。不要通过继续增大输出“确认”问题。

### A. 无设备：初始化、调度器和协议预览

- **前置条件**：不连接真实输出；配置已经通过 `XTHB.validateConfig(config)`；16 个输出 Job、Initial Actions、Final Actions 和 `xthb-scheduler` 已保存。
- **动作**：先在完整配置中把 `logLevel` 从常规的 `errors` 临时改为 `debug`，通过临时入口调用 `xtoysBridgeReloadConfig()`（尚未初始化时则重新启动并由 `xtoysBridgeInit()` 生效）。确认初始化无配置错误并观察 `xthb-scheduler` 的 0.1 秒循环；再发送上方协议 `test` Webhook，观察 `XTHB debug:` 开头的预览日志。完成预览后把 `logLevel` 改回 `errors`，重新执行配置 Variable Action，并调用 `xtoysBridgeReloadConfig()` 生效。
- **预期结果**：`test` 仅被解析并产生 `XTHB debug:` 预览日志，不能启动物理输出 Job，设备也未连接；恢复 `errors` 后成功预览日志不再输出，错误仍会记录；停止 Script 后 Final Actions 执行。
- **失败即停止**：初始化错误、调度 Job 不循环、`test` 驱动了输出 Job，或无法确认停止动作时停止验收。
- **记录栏**：日期 ______；Script 修订 ______；初始化日志 ______；调度观察 ______；`test` 结果 ______。

### B. 单槽低输出：真实硬件逐槽核对

- **前置条件**：先在 XToys 把最大值设为使用者认可的低安全范围；一次只连接当前测试槽；当前槽必须 `enabled: true`，且 A 已通过。
- **动作**：通过“临时人工验收入口”对每个已启用槽调用 `xtoysBridgeTestSlot(slotId, value)`，从低值开始；`xtoysBridgeTestSlot(slotId, value)` 只用于强度、速度与归零。它固定写入 `frequency: 0` 和 `direction: null`，所以强度槽只确认强度、Rotate 槽只确认速度。频率槽改用带非零 `frequency` 的低值 `play` 或 `set_baseline` 验证；Rotate 方向改用低值 `play` 的显式方向，`update` 必须在有限事件到期前发送以验证反向。每次用 `play` 或 `update` 完成频率/方向检查后，立即发送匹配同一 `source + eventId` 的 `stop`；若改用 `set_baseline`，则发送更高 sequence 的空 baseline，不能用 `stop` 清 baseline。随后等待至少一个 scheduler tick，按真实设备确认物理归零，才允许换槽或断开。只调用 `xtoysBridgeTestSlot(slotId, 0)` 不足以清除活动事件或 baseline，下一 tick 仍可能恢复输出。最后手动停止 Script。
- **预期结果**：只有当前连接的槽有真实输出；频率只由协议低值消息验证，Rotate 速度由 TestSlot 验证、方向由协议消息验证；Final Actions 将当前设备实际归零。
- **失败即停止**：非当前槽输出、值无法控制、频率/方向不符、归零失败或停止无法立刻执行时停止。
- **记录栏**：槽号 ______；低值 ______；强度/频率/速度/方向观察 ______；Final Actions 零值确认 ______；设备 Action JSON ______。

### C. 多槽路由：字段隔离、共享槽、权重与禁用槽

- **前置条件**：B 已完成；仅连接本次要核对的槽；最大值仍保持低安全范围。
- **动作**：启用槽 01（强度/频率）和槽 03（Rotate），发送含 `intensity`、`frequency`、`rotateSpeed`、`rotateDirection` 的低值 `play`；确认每槽只消费自己的字段后，立即发送匹配 `stop`，等待至少一个 scheduler tick 并确认真实设备归零。再分别发送 `clitoris` 与 `vagina` 目标，确认它们通过槽 01 的共享 `routes` 进入同一物理槽的仲裁；每次都用匹配 `stop` 清理。调整一个 0–1 路由权重或 `globalMultiplier` 后，通过临时入口执行 `xtoysBridgeReloadConfig()`，重新以低值发送并确认有效输出按乘积变化，随后 stop/tick/物理归零。临时给一个禁用槽加入已知 `routes`（例如槽 04 的 `clitoris: 1`），保持 `enabled: false`，重新执行配置 Variable Action 并通过临时入口调用 `xtoysBridgeReloadConfig()`，再发送同一目标的低值消息，确认该槽仍不启动输出 Job。随后 stop/tick/物理归零，移除临时 route、恢复原配置并再次 reload。
- **预期结果**：强度槽不把 `rotateSpeed` 当输出，旋转槽不把 `intensity` 当速度；共享部位不是相加，而是按上述胜者规则仲裁；权重和全局倍率生效，禁用槽不输出。
- **失败即停止**：字段串槽、共享槽出现非预期叠加、禁用槽输出、或权重变化与记录不符时停止。
- **记录栏**：槽 01 观察 ______；槽 03 观察 ______；共享路由胜者 ______；权重/倍率 ______；禁用槽确认 ______。

### D. 完整协议：到期恢复与 sequence 栅栏

- **前置条件**：C 已完成；仅连接当前验收槽；最大值保持低安全范围；每步都记录实际 Job/设备反馈再进入下一步。
- **动作**：严格按完整外层 JSON 的出现顺序发送：`set_baseline`（1）→ `play`（事件 1）→ `update`（事件 2）→ 等待到期/tick 并确认回到基线 → 匹配 `stop`（也可在另一次事件未到期时验证）→ 空 `set_baseline`（2）并确认零 → 重新建立活动 baseline（3），等待 tick 并确认有可观察的低值活动输出 → `stop_all` 并确认零 → 重发相同 baseline sequence（3）并确认仍为零 → 发送更高 baseline sequence（4）并确认恢复 → 空 baseline（5）、等待 tick 并确认物理归零 → 手动停止 Script。每一步物理归零后才允许换槽或断开。
- **预期结果**：`update` 替换旧事件并反转所发方向；事件到期后恢复到当时基线；空 baseline 只清除该来源基线；`stop_all` 面对活动状态时归零并保留 sequence 栅栏；相同/旧 baseline sequence 的消息格式虽有效，但状态层忽略且保持零；更高 sequence 恢复；最后空 baseline 和 Final Actions 都得到真实归零确认。
- **失败即停止**：到期不恢复、空 baseline 停止了不应停止的事件、`stop_all` 后旧序号仍恢复、较高序号无法恢复，或 Final Actions 未归零时停止。
- **记录栏**：基线 ______；play/update ______；到期恢复 ______；空 baseline ______；stop_all ______；更高序号恢复 ______；手动停止 ______。

## 故障排查：先平台、再契约、再记录 Action JSON

每项依次做三件事：先依据 [XToys 官方 Script/Action/Trigger/Job 定义](https://guide.xtoys.app/script-creation/definitions.html) 与 [Webhook 说明](https://guide.xtoys.app/tools/webhook.html) 检查平台层连接、保存、Trigger/Job/变量；再核对 XTHB 固定名称、配置和协议；最后从当前 XToys 的 Action 选择器导出/抄录实际设备 Action JSON 到记录栏。设备菜单、字段名称和 JSON 结构均为 **当前界面核对**，不得猜测。

| 症状 | 先检查 XToys 平台层 | 再检查 XTHB 固定契约 | 最后记录当前设备 Action JSON |
| --- | --- | --- | --- |
| 配置 JSON 无效 | Variable Action 是否保存了完整字符串、Script 是否重新启动 | 五组、连续 16 槽、`logLevel`、权重和 `XTHB.validateConfig(config)` 的错误码 | 槽号 ______；JSON ______ |
| Webhook 到达但 Trigger 不运行 | Webhook Block、Global Trigger、外层 `action` 筛选和保存状态 | `action` 必为 `xtoys_game_bridge`；只传完整 `payload` 给 `xtoysBridgeHandle(payload)` | Trigger 输入/Action ______ |
| Job 名或变量名拼错 | Job 是否存在并连接了正确 Block | `xthb-scheduler`、`xthb-output-NN` 与五个 `xthb-slot-NN-*` 名必须逐字一致 | Job/变量/Action ______ |
| E-Stim 频率无变化 | 当前设备 Block 是否提供频率 Action，字段是否使用表达式 | 槽为 `intensity` 且 `frequencyEnabled: true`；频率取 `{xthb-slot-NN-frequency}` | 频率 Action ______ |
| Rotate 方向错误 | 当前 Action 的顺/逆方向选项和条件是否保存 | `direction-code` 为 `1` 顺时针、`-1` 逆时针；目标必须显式 `rotateDirection` | 两个方向 Action ______ |
| 事件到期不回 baseline | `xthb-scheduler` 是否运行且 0.1 秒 Trigger 回到 START | `durationMs` 为正；`xtoysBridgeTick()` 调度；检查 baseline 与 ramp 字段 | 调度/输出 Action ______ |
| 重复 sequence 被忽略 | Webhook 是否真的把新 payload 交给 Script | 同一 `source + eventId` 的 play/update 必须严格递增 sequence | 收到的 payload/Action ______ |
| `stop_all` 后旧 baseline sequence 无法恢复 | 全停 Action/Job 是否被人工重复停止 | 这是预期栅栏：用大于该 source 已接受 baseline sequence 的 `set_baseline` | 全停/恢复 Action ______ |
| Final Actions 未归零 | Stop Actions 是否保存、设备 Block 是否仍连接 | 顺序为 `xtoysBridgeStopAll()`、停止调度器、显式设备零值、必要时停输出 Job | Final Actions ______ |
| Reload 后旧槽仍输出 | Reload 后是否仍有旧 Job/Queue 或持续设备 Action | 修改 `xthb-config-json` 后调用 `xtoysBridgeReloadConfig()`；旧槽应禁用并执行 Final Actions 归零 | Reload 前后 Action ______ |

## 人工验收记录

真实硬件是否通过只能由在场人员填写，本文不声明设备已通过。保留此表和当前 Action JSON，便于下次更换 XToys 版本或设备后重新核对。

| 项目 | 填写栏 |
| --- | --- |
| 操作人员 / 日期 | ______ |
| XToys 版本 / Script 修订 | ______ |
| 设备最大值低安全范围确认 | ______ |
| A 无设备 | 通过 / 停止；记录 ______ |
| B 单槽低输出 | 通过 / 停止；记录 ______ |
| C 多槽路由 | 通过 / 停止；记录 ______ |
| D 完整协议 | 通过 / 停止；记录 ______ |
| 异常、断开或恢复操作 | ______ |
| 当前设备 Action JSON 存放位置（私密） | ______ |
