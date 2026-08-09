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
