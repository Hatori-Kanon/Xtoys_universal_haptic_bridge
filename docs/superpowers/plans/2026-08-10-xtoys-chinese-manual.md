# XToys 全中文新手手册实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 编写一份让 XToys Script 初学者可以从新建 Script 一直完成真实设备验收的全中文手册，并用自动化检查保证固定名称、JSON 示例和文档链接准确。

**Architecture:** 新增一份自包含的完整新手手册，保留现有模板文档作为熟练用户速查，并从 README 指向两者。手册把内容明确分成“XToys 官方行为”“XTHB 项目约定”和“当前界面核对”三类；Node 文档测试验证官方来源、固定契约、JSON 示例和仓库链接，人工复核负责确认官方公开指南没有覆盖的动态设备菜单。

**Tech Stack:** Markdown、Node.js `node:test`、XToys 官方 Guide、现有 ES5 XTHB 运行时与测试 harness。

## Global Constraints

- XToys 平台操作必须以 `guide.xtoys.app` 官方指南为依据，不得根据常识或旧界面猜测。
- 官方未公开列出的 E-Stim、Rotate 或设备专属 Action 菜单，必须标记为“当前界面核对”，不能称为官方固定路径。
- XTHB 的函数名、变量名、Job 名、配置结构和协议语义必须与仓库当前源码、测试和 `docs/xtoys-protocol-v1.md` 完全一致。
- 主手册面向没有 XToys Script 编辑经验的读者，每一步包含页面、操作对象、精确输入、预期结果和失败处理。
- 协议 `test` 只预览，不驱动硬件；`xtoysBridgeTestSlot()` 会驱动真实硬件。
- `xtoysBridgeTestSlot()` 只验证强度、Rotate 速度与归零；频率必须以低值协议 `play`/`set_baseline` 验证，方向必须以低值协议 `play`/`update` 验证。协议输出后立即 `stop`，等待 scheduler tick 和物理归零才换槽或断开。
- 运行时只设置当前输出，不修改设备最大强度或最大转速，不检测游戏进程或心跳。
- `stop_all` 清空当前状态，但保留每个 `source` 的 baseline sequence 栅栏。
- `stop_all` 后必须重发相同或旧 baseline sequence 以确认保持零，再用更高 sequence 恢复；Initial Actions 在硬件归零后以 Variable Action 写入完整 `xthb-config-json`，再初始化和启动调度器。
- 人工调用通过临时 Controls 与 Global Triggers；A 阶段把 `logLevel` 临时设为 `debug` 观察 preview，完成后恢复 `errors`；所有动态控件和设备菜单均按当前界面核对。
- 手册不得包含真实 Webhook ID、Shared Webhook Auth Token 或用户设备凭据。
- 对真实设备测试必须采用逐槽、低输出、可立即手动停止的递进流程。

## 官方来源清单

- Script 创建与标签页：<https://guide.xtoys.app/script-creation/overview.html>
- 变量、Action、Trigger、Job、Queue：<https://guide.xtoys.app/script-creation/definitions.html>
- `{变量名}` 与表达式：<https://guide.xtoys.app/script-creation/expressions.html>
- ES5、全局 JS、`getVariable`、`setVariable`、`callAction`：<https://guide.xtoys.app/script-creation/javascript.html>
- Webhook 类型、创建、POST、认证：<https://guide.xtoys.app/tools/webhook.html>
- Script 加载、连接与手动启动：<https://guide.xtoys.app/getting-started/using-scripts.html>
- Job 循环和 Initial Action 官方示例：<https://guide.xtoys.app/script-creation/example-1.html>

---

### Task 1: 建立官方依据和文档契约

**Files:**
- Create: `docs/xtoys-complete-setup-guide.zh-CN.md`
- Create: `tests/XToysUniversalBridge.Tests/documentation.test.js`

**Interfaces:**
- Consumes: 上述七个 XToys 官方页面；设计文档中的三层信息边界。
- Produces: `readManual()` 测试帮助函数；完整手册的来源说明、名词解释和安全边界，供后续任务扩展。

- [ ] **Step 1: 写官方来源契约测试**

创建 `tests/XToysUniversalBridge.Tests/documentation.test.js`，先只加入来源与边界测试：

```js
'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var manualPath = path.join(repositoryRoot, 'docs', 'xtoys-complete-setup-guide.zh-CN.md');

function readManual() {
  return fs.readFileSync(manualPath, 'utf8');
}

test('Chinese manual cites the required official XToys sources and separates provenance', function () {
  var manual = readManual();
  var officialUrls = [
    'https://guide.xtoys.app/script-creation/overview.html',
    'https://guide.xtoys.app/script-creation/definitions.html',
    'https://guide.xtoys.app/script-creation/expressions.html',
    'https://guide.xtoys.app/script-creation/javascript.html',
    'https://guide.xtoys.app/tools/webhook.html',
    'https://guide.xtoys.app/getting-started/using-scripts.html',
    'https://guide.xtoys.app/script-creation/example-1.html'
  ];

  officialUrls.forEach(function (url) {
    assert.match(manual, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.match(manual, /XToys 官方行为/);
  assert.match(manual, /XTHB 项目约定/);
  assert.match(manual, /当前界面核对/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
```

Expected: FAIL，错误指出 `docs/xtoys-complete-setup-guide.zh-CN.md` 不存在。

- [ ] **Step 3: 编写手册基础章节**

创建 `docs/xtoys-complete-setup-guide.zh-CN.md`，写完以下可独立阅读的章节，不使用占位符：

1. 标题、适用读者、最终成果。
2. “如何判断本文依据”：逐项列出七个官方链接，并解释三层信息边界。
3. 系统数据流：游戏 Bridge → XToys Webhook → `xtoysBridgeHandle` → 状态/路由 → 槽变量 → `xthb-output-NN` Job → 设备 Action。
4. 名词表：Script、Block、Action、Trigger、Global Trigger、Job、Step、XToys Variable、Custom JavaScript、Webhook、XTHB 槽。
5. 安全准备：先在 XToys 设置设备上限、一次只验一个槽、保持停止按钮可操作、先验证 Final Actions、不得无人运行。

所有 XToys 定义段落旁边放对应官方链接；16 槽和 XTHB 函数等项目定义链接到仓库内的 `xtoys-template-setup.md` 或 `xtoys-protocol-v1.md`。

- [ ] **Step 4: 运行来源契约测试并确认 GREEN**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
```

Expected: PASS，1 test passed，0 failed。

- [ ] **Step 5: 提交**

```powershell
git add docs/xtoys-complete-setup-guide.zh-CN.md tests/XToysUniversalBridge.Tests/documentation.test.js
git commit -m "docs: establish official XToys manual sources"
```

---

### Task 2: 编写从新建 Script 到 16 个输出 Job 的逐步操作

**Files:**
- Modify: `docs/xtoys-complete-setup-guide.zh-CN.md`
- Modify: `tests/XToysUniversalBridge.Tests/documentation.test.js`

**Interfaces:**
- Consumes: `dist/xtoys-universal-runtime.es5.js`；`xthb-config-json`；`xtoysBridgeInit/Handle/Tick/StopAll/ReloadConfig/TestSlot`；五个槽变量；`xthb-scheduler` 和 16 个输出 Job。
- Produces: 可以在当前 XToys UI 中从零搭建 Script 基础设施和输出 Job 的完整步骤。

- [ ] **Step 1: 为固定名称和必备章节添加失败测试**

向 `documentation.test.js` 追加：

```js
test('manual contains every fixed XTHB job variable and public global', function () {
  var manual = readManual();
  var globals = [
    'xtoysBridgeInit',
    'xtoysBridgeHandle',
    'xtoysBridgeTick',
    'xtoysBridgeStopAll',
    'xtoysBridgeReloadConfig',
    'xtoysBridgeTestSlot'
  ];
  var slotId;
  var suffix;

  assert.match(manual, /xthb-config-json/);
  assert.match(manual, /xthb-scheduler/);
  globals.forEach(function (name) {
    assert.match(manual, new RegExp('`' + name + '\\('));
  });
  for (slotId = 1; slotId <= 16; slotId += 1) {
    suffix = slotId < 10 ? '0' + slotId : String(slotId);
    assert.match(manual, new RegExp('xthb-output-' + suffix));
    [
      'value',
      'frequency',
      'ramp-seconds',
      'direction-code',
      'generation'
    ].forEach(function (field) {
      assert.match(manual, new RegExp('xthb-slot-' + suffix + '-' + field));
    });
  }
});

test('manual distinguishes preview from physical output and states lifecycle boundaries', function () {
  var manual = readManual();
  assert.match(manual, /协议 `test`[^\n]*不[^\n]*物理输出/);
  assert.match(manual, /`xtoysBridgeTestSlot\(\)`[^\n]*真实|真实[^\n]*`xtoysBridgeTestSlot\(\)`/);
  assert.match(manual, /不[^\n]*修改[^\n]*最大强度/);
  assert.match(manual, /不[^\n]*检测[^\n]*游戏进程/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
```

Expected: 新增的两个测试 FAIL，指出缺少固定 Job/变量和生命周期说明。

- [ ] **Step 3: 编写 Script 创建和基础设施章节**

在手册中按顺序写完：

1. 从官方 `My Scripts` 页面点击 `+` 新建 Script；说明 General 页必须先添加 Webhook 工具 Block 和实际需要的 Toy/输出 Block，因为官方定义说明可用 Action 取决于连接的 Block。
2. 说明独立 Script 的手动加载、连接、启动和停止；不把嵌入 Tool 写成必选步骤。
3. 点击编辑器顶部 `JS` 按钮，粘贴完整 dist；说明官方限制是 ES5、JS-Interpreter、无 DOM，函数在 Script 启动时求值。
4. 使用 XToys Variable Action 设置 `xthb-config-json`，并解释 Action/Control 中引用变量要写 `{xthb-config-json}`，JavaScript 的 `getVariable` 不加花括号。
5. 创建固定 Webhook Global Trigger：只把 Trigger 提供的 payload 映射给内联 Custom JavaScript，再调用 `xtoysBridgeHandle(payload);`。无法由官方页面确定的具体按钮标题必须标记“当前界面核对”。
6. 创建 `xthb-scheduler`，在 START 调用 `xtoysBridgeTick();`，使用 Job 内的 elapsed-time Trigger 重新进入 START；引用官方 Job 循环示例，不把界面未公开的 Trigger 文案写死。
7. 创建 `xthb-output-01` 至 `xthb-output-16`；说明运行时通过官方支持的 `callAction({type:'updateJob', job:'...', action:'start'})` 启动 Job。
8. 给出 16 行完整变量表；解释 Job Action 文本字段使用 `{xthb-slot-NN-value}` 等表达式。
9. 分开说明普通强度、支持频率的 E-Stim、Rotate 三类槽。设备专属 Action 从当前 Action 选择器实际出现的项目中选择，并记录生成 JSON；不声称官方公开文档列出了特定菜单标题。
10. 说明 Rotate 的速度使用 value，方向条件读取 direction-code：`1` 顺时针、`-1` 逆时针、`0` 不执行方向 Action；这是 XTHB 项目约定。
11. 写 Initial Actions 与 Final Actions 的精确顺序，并将“Final Action 通常用于归零”链接到官方 Overview。

- [ ] **Step 4: 对照源码核验五变量和 updateJob 结构**

Run:

```powershell
rg -n "setVariable\('xthb-slot-|type: 'updateJob'|job: 'xthb-output-'" src/XToysUniversalBridge/50-xtoys-adapter.es5.js
```

Expected: 显示 `value`、`frequency`、`ramp-seconds`、`direction-code`、`generation` 五个变量写入，以及 `updateJob`/`start`。

- [ ] **Step 5: 运行文档测试并确认 GREEN**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
```

Expected: 3 tests passed，0 failed。

- [ ] **Step 6: 提交**

```powershell
git add docs/xtoys-complete-setup-guide.zh-CN.md tests/XToysUniversalBridge.Tests/documentation.test.js
git commit -m "docs: explain XToys script and job creation"
```

---

### Task 3: 加入可验证配置、Webhook 和四阶段人工验收

**Files:**
- Modify: `docs/xtoys-complete-setup-guide.zh-CN.md`
- Modify: `tests/XToysUniversalBridge.Tests/documentation.test.js`

**Interfaces:**
- Consumes: `XTHB.validateConfig(config)`；协议 v1 的六个命令；人工函数 `xtoysBridgeTestSlot(slotId, value)`。
- Produces: 可解析的 16 槽配置、可解析的外层 Webhook 示例、逐槽硬件验收、故障排查和验收记录表。

- [ ] **Step 1: 添加 JSON、配置和本地链接验证测试**

向 `documentation.test.js` 追加以下帮助函数和测试：

```js
var runtimeHarness = require('./harness');

function jsonBlocks(markdown) {
  var blocks = [];
  var pattern = /```json\s*([\s\S]*?)```/g;
  var match;
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

test('all manual JSON examples parse and include a valid 16-slot config', function () {
  var blocks = jsonBlocks(readManual());
  var runtime = runtimeHarness.loadRuntime();
  var configs = blocks.filter(function (value) {
    return value && value.groups && value.slots;
  });

  assert.ok(blocks.length >= 7);
  assert.equal(configs.length, 1);
  assert.equal(configs[0].slots.length, 16);
  assert.equal(runtime.XTHB.validateConfig(configs[0]).ok, true);
});

test('every webhook envelope contains parseable protocol v1 payload', function () {
  var envelopes = jsonBlocks(readManual()).filter(function (value) {
    return value && value.action === 'xtoys_game_bridge';
  });
  assert.ok(envelopes.length >= 6);
  envelopes.forEach(function (envelope) {
    var payload = JSON.parse(envelope.payload);
    assert.equal(payload.protocolVersion, 1);
    assert.equal(typeof payload.command, 'string');
    assert.equal(typeof payload.source, 'string');
  });
});

test('relative Markdown links in the manual resolve inside the repository', function () {
  var manual = readManual();
  var pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  var match;
  var target;
  while ((match = pattern.exec(manual)) !== null) {
    target = match[1].split('#')[0];
    if (target === '' || /^[a-z]+:/i.test(target)) {
      continue;
    }
    assert.equal(fs.existsSync(path.resolve(path.dirname(manualPath), target)), true, target);
  }
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
```

Expected: 三个新增测试 FAIL，因为尚无完整配置和六个外层 Webhook 示例。

- [ ] **Step 3: 编写槽位规划和完整配置章节**

加入一份完整 16 槽 JSON：

- 包含五个固定组、16 个连续槽位、合法 `logLevel` 与 `globalMultiplier`。
- 至少示范一个 `frequencyEnabled: true` 的 intensity 槽和一个 rotation 槽。
- 未用槽保留并设为 `enabled: false`。
- 逐字段解释组权重、routes 权重和同一物理通道共享多个逻辑部位的结果。
- 提供空白设备规划表，但使用“填写栏”或下划线，不出现自动化禁止的占位词。

- [ ] **Step 4: 编写四阶段人工验收**

按以下固定顺序写清每个阶段的前置条件、动作、预期结果、失败即停止条件和记录栏：

1. A 无设备：初始化、调度器、协议 test 预览。
2. B 单槽低输出：一次一个槽，`xtoysBridgeTestSlot()` 只确认强度、Rotate 速度与归零；频率用低值协议 `play` 或 `set_baseline`，方向用低值协议 `play`/`update`。每次协议输出后立即 `stop`，等待 scheduler tick 和物理归零才换槽或断开。
3. C 多槽路由：强度/旋转字段隔离、多个部位共享槽、权重与禁用槽。
4. D 完整协议：`set_baseline` → `play` → 更高 sequence 的 `update` → 到期恢复 → 空 baseline → 重新建立活动 baseline → `stop_all` → 重发相同/旧 sequence（保持零）→ 更高 baseline sequence 恢复 → 空 baseline、scheduler tick、物理归零 → 手动停止 Script。

真实输出步骤必须提示先把 XToys 最大值设为用户认可的低安全范围，并且一次只连接当前测试槽。

- [ ] **Step 5: 加入六类外层 Webhook 示例和故障排查**

至少加入 `set_baseline`、`play`、`update`、`stop`、`stop_all`、`test` 六种外层 JSON；`payload` 必须是正确转义的 JSON 字符串。故障排查必须覆盖：

- 配置 JSON 无效；
- Webhook 到达但 Trigger 不运行；
- Job 名或变量名拼错；
- E-Stim 频率无变化；
- Rotate 方向错误；
- 事件到期不回 baseline；
- 重复 sequence 被忽略；
- `stop_all` 后旧 baseline sequence 无法恢复；
- Final Actions 未归零；
- Reload 后旧槽仍输出。

每项先检查官方平台层，再检查 XTHB 固定契约，最后记录当前设备 Action JSON。

- [ ] **Step 6: 运行文档测试并确认 GREEN**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
```

Expected: 6 tests passed，0 failed。

- [ ] **Step 7: 提交**

```powershell
git add docs/xtoys-complete-setup-guide.zh-CN.md tests/XToysUniversalBridge.Tests/documentation.test.js
git commit -m "docs: add XToys hardware acceptance walkthrough"
```

---

### Task 4: 接入仓库入口并完成最终准确性门禁

**Files:**
- Modify: `README.md`
- Modify: `docs/xtoys-template-setup.md`
- Modify: `tests/XToysUniversalBridge.Tests/documentation.test.js`

**Interfaces:**
- Consumes: 完整新手手册、现有速查文档、README Quick start。
- Produces: 清晰的文档入口和最终发布证据。

- [ ] **Step 1: 添加入口链接失败测试**

向 `documentation.test.js` 追加：

```js
test('README and quick reference link to the complete Chinese manual', function () {
  var readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  var quickReference = fs.readFileSync(
    path.join(repositoryRoot, 'docs', 'xtoys-template-setup.md'),
    'utf8'
  );
  assert.match(readme, /docs\/xtoys-complete-setup-guide\.zh-CN\.md/);
  assert.match(quickReference, /xtoys-complete-setup-guide\.zh-CN\.md/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
```

Expected: 新测试 FAIL，因为 README 和速查尚未链接完整手册。

- [ ] **Step 3: 更新 README 和速查入口**

1. 将 README Quick start 的首次 XToys 配置链接改为完整中文手册。
2. 保留 `xtoys-template-setup.md` 链接并标注“熟悉 XToys 后使用的技术速查”。
3. 在 `xtoys-template-setup.md` 标题下增加醒目说明：第一次配置请先阅读完整中文手册。
4. 不改变协议链接和硬件验证仍待用户完成的状态声明。

- [ ] **Step 4: 运行定向与全量测试**

Run:

```powershell
node --test tests/XToysUniversalBridge.Tests/documentation.test.js
node --test tests/XToysUniversalBridge.Tests/*.test.js
```

Expected: 文档测试 7 passed；全量测试包含新增 7 项且 0 failed。

- [ ] **Step 5: 执行文档和产物一致性检查**

Run:

```powershell
rg -n "待完善|稍后填写|以后补写" docs/xtoys-complete-setup-guide.zh-CN.md
git diff --check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Build-XToysRuntime.ps1
git diff --exit-code -- dist/xtoys-universal-runtime.es5.js
```

Expected:

- `rg` 无匹配并返回 1；
- `git diff --check` 返回 0；
- 构建返回 0；
- dist diff 返回 0。

- [ ] **Step 6: 人工来源复核**

逐段复核所有 XToys UI 断言：

1. Script 标签页、Initial/Final Actions、Global Triggers、Jobs 对照官方 Overview。
2. 变量花括号、Action、Trigger、Job 语义对照 Definitions 和 Expressions。
3. ES5、JS 按钮、`getVariable`、`setVariable`、`callAction` 对照 JavaScript 页面。
4. Webhook ID、POST body、action、Private/Shared 认证对照 Webhook 页面。
5. 所有设备专属菜单如果没有官方依据，确认已标成“当前界面核对”，且没有臆造按钮路径。

- [ ] **Step 7: 提交**

```powershell
git add README.md docs/xtoys-template-setup.md tests/XToysUniversalBridge.Tests/documentation.test.js
git commit -m "docs: publish XToys Chinese setup entrypoint"
```

- [ ] **Step 8: 最终状态核验**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -5
```

Expected: 工作树干净；分支只包含设计、计划和手册相关提交。
