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
