# XToys 通用触觉桥全中文新手手册设计

## 目标

为第一次接触 XToys Script 编辑器的使用者提供一份可从头照做的中文手册。使用者无需理解本仓库的 JavaScript 内部实现，只需能够在 XToys 界面中新建 Script、变量、Global Trigger、Job 和 Action，并复制本文提供的文本。

手册完成后，使用者应能：

1. 创建一个只需配置一次的 XToys 通用触觉桥 Script。
2. 将最多 16 个逻辑输出槽连接到强度、E-Stim 或 Rotate 设备动作。
3. 让不同游戏通过同一个固定 Webhook 协议驱动这些槽，而不再为每个游戏重写 XToys 脚本。
4. 以低风险、逐槽递进的方式完成人工硬件验收。
5. 在没有输出、方向错误、基线不恢复或停止失败时按照明确步骤排查。

## 目标读者和写作规则

- 目标读者没有 XToys JavaScript 或 Script 编辑经验。
- 每个操作步骤都写明所在页面、需要创建的对象、精确名称、粘贴内容、保存方式和预期结果。
- 第一次出现的 XToys 名词必须用中文解释，并保留界面中的英文原名。
- 不要求读者从协议文档反推操作；主手册自身包含完成搭建和验收所需的所有内容。
- 代码、JSON、变量名、Job 名和函数名保持英文原样，解释全部使用中文。
- 对可能产生真实硬件输出的操作使用醒目的安全提示，并明确区分“预览测试”和“真实输出测试”。

## 官方依据与不臆测规则

手册必须先核对 XToys 官方指南，再描述 XToys 平台操作。核心官方来源固定为：

- Script 创建与各标签页：<https://guide.xtoys.app/script-creation/overview.html>
- 变量、Action、Trigger、Job 与 Queue 定义：<https://guide.xtoys.app/script-creation/definitions.html>
- 表达式与 `{变量名}` 用法：<https://guide.xtoys.app/script-creation/expressions.html>
- ES5 JavaScript、`getVariable`、`setVariable` 与 `callAction`：<https://guide.xtoys.app/script-creation/javascript.html>
- Webhook 创建、POST 消息、Private/Shared Webhook 与凭据规则：<https://guide.xtoys.app/tools/webhook.html>
- Script 的加载、连接、手动启动与停止：<https://guide.xtoys.app/getting-started/using-scripts.html>
- 官方 Job 循环示例：<https://guide.xtoys.app/script-creation/example-1.html>

手册中的信息分为三类，并明确标注边界：

1. **XToys 官方行为**：必须能由上述官方页面直接支持，并在相关章节附近附官方链接。
2. **XTHB 项目约定**：例如固定 Job 名、变量名、16 槽配置和六个全局函数，必须能由仓库源码、测试或协议文档支持。
3. **当前界面/设备相关操作**：官方公开指南未列出的 E-Stim、Rotate 或设备专属菜单不得凭空写出。手册只说明如何先在 General 页连接对应 Block，再从 XToys Action 选择器中选择实际出现的设备 Action；精确标签或生成的 Action JSON 必须由使用者在当前 XToys 界面核对并记录。

若官方指南与当前界面不一致，手册以当前官方指南为原则来源，同时将界面差异列为人工验收记录，不能悄悄用推测填补。

## 交付物

### 1. 新增完整新手手册

新增 `docs/xtoys-complete-setup-guide.zh-CN.md`，标题为“XToys 通用触觉桥：从零创建、配置与人工验收”。它是首次配置时的主入口。

### 2. 保留技术速查文档

保留 `docs/xtoys-template-setup.md`，将其定位为熟悉 XToys 后使用的配置速查。文档顶部增加指向完整新手手册的链接，避免新用户直接进入高度压缩的步骤。

### 3. 更新仓库入口

更新 `README.md` 的 Quick start，使完整中文手册成为 XToys 初次配置的首选链接，协议文档继续作为游戏 Bridge 开发参考。

## 完整手册结构

### 第一部分：开始前理解系统

1. 说明游戏插件、Webhook、XToys 通用 Script、输出槽、Job 和物理设备之间的关系。
2. 解释“一个游戏事件描述逻辑部位，XToys 配置决定实际设备”的职责边界。
3. 解释 16 个槽是固定的逻辑出口，不等于必须连接 16 台设备。
4. 解释同一物理通道可承载多个逻辑部位，但这些部位会被路由到同一个槽并共同仲裁。

### 第二部分：安全准备

1. 在 XToys 中先设置并验证设备最大强度或最大转速；运行时不会修改这些最大值。
2. 初次验收只启用一个槽，输出值从低值开始，确认停止动作后再增加。
3. 保持 XToys 的停止控制可立即操作，不在无人看管时运行。
4. 明确手动启动和停止 Script 是当前生命周期设计；脚本不检测游戏进程。
5. 说明 E-Stim 的硬件限制由 XToys 与设备配置承担，通用运行时只写当前值和可选频率。

### 第三部分：创建 Script 基础结构

1. 新建 XToys Script，并建议使用固定名称。
2. 打开 Script 编辑器顶部的 `JS` 区域，粘贴完整 `dist/xtoys-universal-runtime.es5.js`；此区域只在 Script 启动时加载定义，人工验收改用临时 Controls 与 Global Triggers 入口。
3. 创建 `xthb-config-json` Script 变量。
4. 解释全局 JavaScript 与 Action 内的 Custom JavaScript 的区别：函数只能在全局页面定义，Action 中只调用函数。

### 第四部分：规划设备与槽位

1. 提供设备清单表：物理设备、物理子通道、刺激部位、槽类型、槽编号。
2. 强度输出使用 `intensity` 槽，旋转输出使用 `rotation` 槽；同一设备的独立执行器必须占不同槽。
3. 说明多个部位共享同一槽的配置方法和结果。
4. 说明多个设备只有在需要完全相同输出时才可连接到同一个槽。
5. 未使用槽仍必须保留在 JSON 中并设为 `enabled: false`。

### 第五部分：填写配置 JSON

1. 给出包含 16 个槽的完整可复制配置。
2. 逐字段解释 `logLevel`、`globalMultiplier`、`groups`、`slots`、`routes`、`frequencyEnabled`。
3. 给出三个配置示例：普通强度槽、支持频率的 E-Stim 槽、Rotate 槽。
4. 给出共享物理通道的路由示例。
5. 给出 JSON 检查清单，包括槽编号连续、类型正确、权重范围和字符串引号。

### 第六部分：创建 Webhook Global Trigger

1. 创建唯一的 Webhook Global Trigger，并将固定外层 `action` 设置为 `xtoys_game_bridge`。
2. 在 Custom JavaScript Action 中只映射 `payload = {trigger-payload}`。
3. Action 代码只调用 `xtoysBridgeHandle(payload);`。
4. 解释为何不能在 XToys 中拆分游戏事件字段，也不能把游戏事件名作为外层 action。

### 第七部分：创建调度 Job

1. 创建 `xthb-scheduler`。
2. 在 `START` 步骤调用 `xtoysBridgeTick();`。
3. 建立 0.1 秒 timed Trigger 回到 `START`。
4. 解释调度器负责事件到期、脉冲切换和基线恢复，不负责检测游戏进程。

### 第八部分：创建 16 个输出 Job

1. 按固定名称创建 `xthb-output-01` 至 `xthb-output-16`。
2. 提供逐槽变量对照表，包括值、频率、渐变、方向和 generation。
3. 分别给出三类 Job 的逐项 Action 配置：
   - 普通强度或振动槽；
   - 支持频率的 E-Stim 槽；
   - Rotate 速度与顺时针、逆时针条件槽。
4. 明确 `generation` 只供运行时防止旧输出覆盖新输出，不连接设备 Action。
5. 明确禁用槽仍保留 Job，但不连接设备。

### 第九部分：Initial Actions 和 Final Actions

1. Initial Actions 先通过 XToys UI 将所有实际连接输出归零，再用 Variable Action 设置 `xthb-config-json` 的完整 JSON，然后调用 `xtoysBridgeInit()`，最后启动 `xthb-scheduler`。
2. Final Actions 先调用 `xtoysBridgeStopAll()`，再停止调度器，然后通过 XToys UI 再次显式归零所有实际连接输出。
3. 说明显式 UI 归零是 JavaScript 失败时的安全背板，不能省略。
4. 说明这些动作只修改当前输出，不修改最大强度或最大转速。

### 第十部分：人工验收

人工验收按四个阶段执行，每一阶段都有前置条件、操作、预期结果、失败处理和记录项。

#### 阶段 A：无设备验证

- 暂不连接真实输出；把 `logLevel` 临时设为 `debug`，通过 `xtoysBridgeReloadConfig()`（或首次启动的 `xtoysBridgeInit()`）生效后启动 Script。
- 确认 `xtoysBridgeInit()` 成功，配置 JSON 没有错误日志。
- 确认调度 Job 周期运行。
- 调用协议 `test`，确认只有 `XTHB debug:` 预览日志、不启动物理输出 Job；验收后将 `logLevel` 恢复为 `errors` 并通过 `xtoysBridgeReloadConfig()` 生效。

#### 阶段 B：单槽低输出验证

- 每次只启用和连接一个槽。
- `xtoysBridgeTestSlot(slotId, value)` 只用于强度、Rotate 速度与归零；它不验证频率或方向。
- 频率使用低值协议 `play` 或 `set_baseline` 验证，方向使用低值协议 `play`/`update` 验证；每次立即发送匹配的 `stop`（baseline 则用更高 sequence 的空 baseline），等待至少一个 scheduler tick 并确认物理归零后才换槽或断开。
- 停止 Script，确认 Final Actions 将实际设备归零。

#### 阶段 C：多槽和路由验证

- 启用一个强度槽和一个 Rotate 槽，确认各自只接收对应字段。
- 测试多个逻辑部位路由到同一物理槽。
- 测试权重和 `globalMultiplier` 对输出的影响。
- 确认未启用槽和未连接 Job 不产生输出。

#### 阶段 D：完整协议验证

依次发送可复制 Webhook，并记录每一步的实际结果：

1. `set_baseline`：建立持续基线。
2. `play`：在基线上叠加一次有限攻击。
3. `update`：用更高 sequence 更新攻击并切换 Rotate 方向。
4. 等待事件到期：确认输出按渐变回到最新基线。
5. `set_baseline` 空快照：确认只清除该来源基线。
6. 重新建立活动 baseline、等待 tick 并确认有低值输出后发送 `stop_all`：确认所有已启用槽立即收到零值。
7. `stop_all` 后重发相同或旧 baseline sequence：确认状态层忽略并保持零；使用更高 baseline sequence 恢复。
8. 用更高 sequence 的空 baseline 清理、等待 scheduler tick 并确认物理归零后，手动停止 Script：确认 Final Actions 再次归零。

### 第十一部分：故障排查

按症状组织排查，而不是要求新用户理解源码：

- Script 启动后立即报错；
- Webhook 到达但完全没有输出；
- 只有部分槽有输出；
- Rotate 有速度但方向不对；
- E-Stim 有强度但频率未变化；
- 攻击结束后没有回到 baseline；
- `set_baseline` 被忽略；
- `stop_all` 后无法恢复 baseline；
- 停止 Script 后设备仍有输出；
- 修改配置后旧槽仍在输出。

每个症状给出按优先级排序的检查项，并引用精确变量、Job 或函数名称。

### 第十二部分：验收记录与附录

1. 提供可填写的设备与槽映射表。
2. 提供逐阶段验收勾选表、XToys Script 修订号、测试日期和异常记录。
3. 收录六个公共函数及其用途。
4. 收录 16 个 Job 与变量名完整对照。
5. 收录 baseline、play、update、stop、stop_all 和 test 的外层 Webhook 示例。

## 准确性边界

- 手册中的函数、变量和 Job 名必须逐字对应当前源码与自动化测试。
- 手册不得声称真实硬件已经通过测试；完成状态由使用者填写验收记录决定。
- 协议 `test` 不驱动硬件，`xtoysBridgeTestSlot()` 会驱动硬件，这一差异必须在所有相关章节保持一致。
- `stop_all` 清空当前状态但保留每个 source 的 baseline sequence 栅栏。
- 运行时不使用 `updateComponent`、不修改设备最大值，也不跟踪游戏启动、关闭或心跳。
- 手册不包含任何真实 Webhook 私密地址或用户凭据。

## 文档验证

完成手册后执行以下检查：

1. 对照 `90-global-entry.es5.js` 和 `50-xtoys-adapter.es5.js` 核对公共函数、五个槽变量和 `updateJob` 结构。
2. 对照 `docs/xtoys-protocol-v1.md` 核对命令、字段、sequence 和 stop 语义。
3. 搜索手册中的全部 `xthb-` 名称，确认不存在拼写漂移。
4. 验证所有 JSON 代码块可解析，所有外层 Webhook 的 payload 字符串可再次解析为内层对象。
5. 运行 XToys Universal Bridge 自动化测试，确认文档修改没有改变已提交运行时产物。
6. 检查 README、速查文档和完整手册之间的链接有效。
