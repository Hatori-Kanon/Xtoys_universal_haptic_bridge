'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var runtimeHarness = require('./harness');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var manualPath = path.join(repositoryRoot, 'docs', 'xtoys-complete-setup-guide.zh-CN.md');

function readManual() {
  return fs.readFileSync(manualPath, 'utf8');
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
  assert.equal(envelopes.length, 6);
  assert.deepEqual(envelopes.map(function (envelope) {
    return JSON.parse(envelope.payload).command;
  }).sort(), [
    'set_baseline',
    'play',
    'update',
    'stop',
    'stop_all',
    'test'
  ].sort());
  envelopes.forEach(function (envelope) {
    var payload = JSON.parse(envelope.payload);
    var parsed = runtime.XTHB.parseMessage(JSON.stringify(payload), config);
    assert.equal(payload.protocolVersion, 1);
    assert.equal(typeof payload.command, 'string');
    assert.equal(typeof payload.source, 'string');
    assert.equal(parsed.ok, true, payload.command + ': ' + parsed.code);
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
