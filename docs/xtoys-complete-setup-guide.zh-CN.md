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
2. 一次只启用并验证一个 XTHB 槽。确认该槽的逻辑部位、设备/子通道和输出类型后，才继续下一个；实际设备/子通道选择属于 **当前界面核对**。
3. 保持 XToys Script 的停止按钮或等效停止控制随时可操作；由在场人员执行测试，绝不无人运行。官方说明 Final Actions 会在 Script 停止时触发，通常用于把玩具强度设回 0（[Script Creation Overview](https://guide.xtoys.app/script-creation/overview.html)）。
4. 在任何常规测试前先验证 Final Actions：启动后立刻停止，并确认每个已连接输出都已归零。归零需要按真实设备反馈和当前界面复核，属于 **当前界面核对**；不能只凭变量或日志推断硬件已停止。
5. 遇到异常输出、无法立即停止、设备行为与预期不符或不确定哪一个槽在驱动设备时，立即停止 Script、断开受影响设备，并在问题确认前不要继续测试。

下一章将基于以上边界配置 Script、Webhook、调度 Job 与输出 Job。执行具体按钮步骤前，请重新打开相关官方页面并完成 **当前界面核对**。
