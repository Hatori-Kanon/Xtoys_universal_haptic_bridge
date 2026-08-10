'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var runtimeHarness = require('./harness');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var manualPath = path.join(repositoryRoot, 'docs', 'xtoys-complete-setup-guide.zh-CN.md');
var quickReferencePath = path.join(repositoryRoot, 'docs', 'xtoys-template-setup.md');
var implementationPlanPath = path.join(
  repositoryRoot,
  'docs',
  'superpowers',
  'plans',
  '2026-08-10-xtoys-chinese-manual.md'
);
var designPath = path.join(
  repositoryRoot,
  'docs',
  'superpowers',
  'specs',
  '2026-08-10-xtoys-chinese-manual-design.md'
);

function readManual() {
  return fs.readFileSync(manualPath, 'utf8');
}

function readDocument(documentPath) {
  return fs.readFileSync(documentPath, 'utf8');
}

function sectionBetween(markdown, startPattern, endPattern, description) {
  var start = markdown.search(startPattern);
  var tail;
  var end;

  assert.notEqual(start, -1, description + ' start must exist');
  tail = markdown.slice(start);
  end = tail.slice(1).search(endPattern);
  assert.notEqual(end, -1, description + ' end must exist');
  return tail.slice(0, end + 1);
}

function assertAppearsInOrder(text, patterns, description) {
  var cursor = 0;
  patterns.forEach(function (pattern) {
    var match = pattern.exec(text.slice(cursor));
    assert.notEqual(match, null, description + ': missing or out of order: ' + pattern);
    cursor += match.index + match[0].length;
  });
}

function jsonBlocks(markdown) {
  var blocks = [];
  var pattern = /```json\s*([\s\S]*?)```/g;
  var match;
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

function quickStartSection(markdown) {
  var match = /^## Quick start\r?\n([\s\S]*?)(?=^## [^\r\n]+|(?![\s\S]))/m.exec(markdown);
  assert.notEqual(match, null, 'README must contain a Quick start section');
  return match[1];
}

function assertCompleteChineseManualEntrypoints(readme, quickReference) {
  var firstConfigHeading = /^## /m.exec(quickReference);
  var preamble;
  assert.notEqual(firstConfigHeading, null, 'quick reference must contain its first configuration section');
  preamble = quickReference.slice(0, firstConfigHeading.index);
  assert.match(
    quickStartSection(readme),
    /\[[^\]]+\]\(docs\/xtoys-complete-setup-guide\.zh-CN\.md\)/
  );
  assert.match(preamble, /\[[^\]]+\]\(xtoys-complete-setup-guide\.zh-CN\.md\)/);
  assert.match(preamble, /第一次配置|初次配置/);
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

test('platform-operation sections keep their official source or current-UI boundary nearby', function () {
  var manual = readManual();
  var quickReference = readDocument(quickReferencePath);
  var scriptCreation = sectionBetween(manual, /^### 1\. 新建、加载并连接独立 Script$/m, /^### 2\./m, 'script creation');
  var webhook = sectionBetween(manual, /^### 3\. 建立固定 Webhook Global Trigger$/m, /^### 4\./m, 'manual webhook');
  var deviceActions = sectionBetween(manual, /^### 6\. 为三类槽填写设备 Action$/m, /^### 7\./m, 'manual device actions');
  var quickWebhook = sectionBetween(quickReference, /^## 1\. 建立唯一的 Webhook Global Trigger$/m, /^## 2\./m, 'quick-reference webhook');
  var quickDevices = sectionBetween(quickReference, /^## 3\. 建立全部 16 个输出 Job$/m, /^## 4\./m, 'quick-reference device actions');

  assert.match(scriptCreation, /https:\/\/guide\.xtoys\.app\/script-creation\/overview\.html/);
  assert.match(scriptCreation, /https:\/\/guide\.xtoys\.app\/getting-started\/using-scripts\.html/);
  assert.match(webhook, /https:\/\/guide\.xtoys\.app\/tools\/webhook\.html/);
  assert.match(webhook, /当前界面核对/);
  assert.match(deviceActions, /https:\/\/guide\.xtoys\.app\/script-creation\/javascript\.html/);
  assert.match(deviceActions, /当前界面核对/);
  assert.match(quickWebhook, /https:\/\/guide\.xtoys\.app\/tools\/webhook\.html/);
  assert.match(quickWebhook, /当前界面核对/);
  assert.match(quickDevices, /https:\/\/guide\.xtoys\.app\/script-creation\/(?:definitions|javascript)\.html/);
  assert.match(quickDevices, /当前界面核对/);
});

test('Initial Actions set the complete config after hardware zeroing and before initialization', function () {
  var manualInitial = sectionBetween(readManual(), /^### 7\. Initial Actions/m, /^### 8\./m, 'manual Initial Actions');
  var quickInitial = sectionBetween(readDocument(quickReferencePath), /^## 4\. Initial \/ Final Actions/m, /^## 5\./m, 'quick-reference Initial Actions');

  [manualInitial, quickInitial].forEach(function (initialActions) {
    assertAppearsInOrder(initialActions, [
      /(?:强度|旋转速度)[^\n]*`0`/,
      /Variable Action[^\n]*`xthb-config-json`[^\n]*完整[^\n]*JSON/,
      /`xtoysBridgeInit\(\);`|xtoysBridgeInit\(\);/,
      /启动[^\n]*`xthb-scheduler`/
    ], 'Initial Actions order');
  });
});

test('manual provides executable temporary Controls and Global Trigger acceptance entries', function () {
  var manual = readManual();

  assert.match(manual, /临时人工验收入口/);
  assert.match(manual, /Controls/);
  assert.match(manual, /Global Triggers/);
  assert.match(manual, /xthb-test-slot/);
  assert.match(manual, /xthb-test-value/);
  assert.match(
    manual,
    /xtoysBridgeTestSlot\(getVariable\(['"]xthb-test-slot['"]\), getVariable\(['"]xthb-test-value['"]\)\);/
  );
  assert.match(manual, /xtoysBridgeReloadConfig\(\);/);
  assert.match(manual, /删除或禁用[^\n]*(?:Control|Global Trigger|临时)/);
  assert.match(manual, /当前界面核对/);
  assert.doesNotMatch(manual, /全局 JavaScript 页面[^\n]*(?:控制台|直接调用|交互执行)/);
});

test('protocol preview temporarily enables debug logging and restores errors afterward', function () {
  var stageA = sectionBetween(readManual(), /^### A\. 无设备/m, /^### B\./m, 'stage A');

  assertAppearsInOrder(stageA, [
    /`logLevel`[^\n]*`debug`/,
    /`xtoysBridgeReloadConfig\(\)`|`xtoysBridgeInit\(\)`/,
    /协议 `test`/,
    /`XTHB debug:`[^\n]*预览/,
    /`logLevel`[^\n]*`errors`/,
    /`xtoysBridgeReloadConfig\(\)`/
  ], 'debug preview lifecycle');
});

test('hardware protocol checks stop state and observe physical zero before moving on', function () {
  var stageB = sectionBetween(readManual(), /^### B\. 单槽低输出/m, /^### C\./m, 'stage B');

  assert.match(stageB, /每次[^\n]*(?:`play`|`update`)[^\n]*立即[^\n]*`stop`/);
  assert.match(stageB, /baseline[^\n]*更高[^\n]*sequence[^\n]*空[^\n]*baseline|更高[^\n]*sequence[^\n]*空[^\n]*baseline/);
  assertAppearsInOrder(stageB, [
    /`stop`/,
    /至少一个[^\n]*scheduler tick/,
    /真实设备[^\n]*物理归零|物理[^\n]*归零/,
    /才[^\n]*(?:换槽|断开)/
  ], 'hardware cleanup');
});

test('Chinese manual separates protocol preview from low-output per-slot hardware testing', function () {
  var manual = readManual();

  assert.match(manual, /协议 `test` 只预览、不驱动物理输出/);
  assert.match(manual, /`xtoysBridgeTestSlot\(slotId, value\)` 才会产生真实硬件输出/);
  assert.match(manual, /低值且一次一槽逐步上调/);
  assert.match(manual, /不能用协议 `test` 替代硬件验收/);
});

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

test('every webhook envelope is a valid protocol v1 command for the manual config', function () {
  var blocks = jsonBlocks(readManual());
  var runtime = runtimeHarness.loadRuntime();
  var config = blocks.filter(function (value) {
    return value && value.groups && value.slots;
  })[0];
  var envelopes = blocks.filter(function (value) {
    return value && value.action === 'xtoys_game_bridge';
  });
  var payloads = envelopes.map(function (envelope) {
    return JSON.parse(envelope.payload);
  });
  var commands = payloads.map(function (payload) {
    return payload.command;
  });
  var stopAllIndex = commands.indexOf('stop_all');
  var baselinesBeforeStopAll;
  var baselinesAfterStopAll;
  var activeBeforeStopAll;

  assert.ok(envelopes.length >= 6);
  [
    'set_baseline',
    'play',
    'update',
    'stop',
    'stop_all',
    'test'
  ].forEach(function (command) {
    assert.ok(commands.includes(command), 'missing command: ' + command);
  });
  envelopes.forEach(function (envelope) {
    var payload = JSON.parse(envelope.payload);
    var parsed = runtime.XTHB.parseMessage(JSON.stringify(payload), config);
    assert.equal(payload.protocolVersion, 1);
    assert.equal(typeof payload.command, 'string');
    assert.equal(typeof payload.source, 'string');
    assert.equal(parsed.ok, true, payload.command + ': ' + parsed.code);
  });

  assert.notEqual(stopAllIndex, -1);
  baselinesBeforeStopAll = payloads.slice(0, stopAllIndex).filter(function (payload) {
    return payload.command === 'set_baseline';
  });
  baselinesAfterStopAll = payloads.slice(stopAllIndex + 1).filter(function (payload) {
    return payload.command === 'set_baseline';
  });
  assert.ok(baselinesBeforeStopAll.some(function (payload) {
    return payload.targets.length === 0;
  }), 'missing empty baseline before stop_all');
  activeBeforeStopAll = baselinesBeforeStopAll.filter(function (payload) {
    return payload.targets.length > 0;
  }).slice(-1)[0];
  assert.ok(activeBeforeStopAll, 'stop_all must follow a newly active baseline');
  assert.ok(baselinesAfterStopAll.some(function (payload) {
    return payload.sequence <= activeBeforeStopAll.sequence && payload.targets.length > 0;
  }), 'missing same/old baseline sequence after stop_all');
  assert.ok(baselinesAfterStopAll.some(function (payload) {
    return payload.sequence > activeBeforeStopAll.sequence && payload.targets.length > 0;
  }), 'missing higher baseline sequence recovery after stop_all');
});

test('manual provides placeholder-only Private and Shared POST templates', function () {
  var manual = readManual();
  var webhookExamples = sectionBetween(manual, /^## 六类外层 Webhook 示例$/m, /^## 四阶段人工验收$/m, 'webhook examples');

  assert.match(webhookExamples, /https:\/\/webhook\.xtoys\.app\/<WEBHOOK_ID>/);
  assert.match(webhookExamples, /Content-Type:\s*application\/json/);
  assert.match(webhookExamples, /Authorization:\s*Bearer <AUTH_TOKEN>/);
  assert.match(webhookExamples, /<WEBHOOK_ID>[^\n]*自行替换|自行替换[^\n]*<WEBHOOK_ID>/);
  assert.match(webhookExamples, /<AUTH_TOKEN>[^\n]*自行替换|自行替换[^\n]*<AUTH_TOKEN>/);
  assert.match(webhookExamples, /成功[^\n]*(?:Webhook|Trigger|日志)/);
  assert.match(webhookExamples, /失败[^\n]*(?:HTTP|认证|Trigger|日志)/);
});

test('manual describes My Scripts as an app path and Using Scripts as the load workflow', function () {
  var scriptCreation = sectionBetween(readManual(), /^### 1\. 新建、加载并连接独立 Script$/m, /^### 2\./m, 'script creation');

  assert.match(scriptCreation, /打开 XToys 应用[^\n]*侧边栏[^\n]*My Scripts[^\n]*`\+`/);
  assert.doesNotMatch(scriptCreation, /\[My Scripts\]\(https:\/\/guide\.xtoys\.app\/script-creation\/overview\.html\)/);
  assert.match(scriptCreation, /Load Script/);
  assert.match(scriptCreation, /plug|连接按钮/);
  assert.match(scriptCreation, /play|播放按钮/);
  assert.match(scriptCreation, /https:\/\/guide\.xtoys\.app\/getting-started\/using-scripts\.html/);
});

test('plan and design preserve TestSlot boundaries and the final protocol cleanup contract', function () {
  var plan = readDocument(implementationPlanPath);
  var design = readDocument(designPath);

  [plan, design].forEach(function (document) {
    assert.match(document, /TestSlot[^\n]*只[^\n]*(?:强度|速度|归零)|`xtoysBridgeTestSlot\([^\n]*只[^\n]*(?:强度|速度|归零)/i);
    assert.match(document, /频率[^\n]*(?:低值协议|`play`|`set_baseline`)/);
    assert.match(document, /方向[^\n]*(?:低值协议|`play`|`update`)/);
    assert.match(document, /`stop`[^\n]*(?:scheduler tick|物理归零)/);
    assert.match(document, /stop_all[^\n]*(?:旧|相同)[^\n]*sequence/i);
  });
});

test('manual keeps slot testing separate from protocol frequency and disabled-route checks', function () {
  var manual = readManual();

  assert.match(manual, /`xtoysBridgeTestSlot\(slotId, value\)` 只用于强度、速度与归零/);
  assert.match(manual, /带非零 `frequency` 的低值 `play` 或 `set_baseline`/);
  assert.match(manual, /`update` 必须在有限事件到期前发送/);
  assert.match(manual, /临时给一个禁用槽加入已知 `routes`.*保持 `enabled: false`.*`xtoysBridgeReloadConfig\(\)`/);
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

test('README Quick start and quick reference preamble link new users to the complete Chinese manual', function () {
  var readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  var quickReference = fs.readFileSync(
    path.join(repositoryRoot, 'docs', 'xtoys-template-setup.md'),
    'utf8'
  );

  assertCompleteChineseManualEntrypoints(readme, quickReference);
});

test('complete-manual entrypoint validation rejects bare paths and missing first-time guidance', function () {
  var readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  var quickReference = fs.readFileSync(
    path.join(repositoryRoot, 'docs', 'xtoys-template-setup.md'),
    'utf8'
  );
  var barePathReadme = readme.replace(
    /\[[^\]]+\]\(docs\/xtoys-complete-setup-guide\.zh-CN\.md\)/,
    'docs/xtoys-complete-setup-guide.zh-CN.md'
  );
  var quickReferenceWithoutFirstTimeCue = quickReference.replace('第一次配置', '熟悉配置');

  assert.throws(function () {
    assertCompleteChineseManualEntrypoints(barePathReadme, quickReference);
  }, assert.AssertionError);
  assert.throws(function () {
    assertCompleteChineseManualEntrypoints(readme, quickReferenceWithoutFirstTimeCue);
  }, assert.AssertionError);
});
