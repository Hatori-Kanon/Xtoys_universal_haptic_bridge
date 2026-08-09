'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var buildScript = path.join(repositoryRoot, 'scripts', 'Build-XToysRuntime.ps1');
var distributionFile = path.join(repositoryRoot, 'dist', 'xtoys-universal-runtime.es5.js');

function buildRuntime() {
  childProcess.execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  return fs.readFileSync(distributionFile, 'utf8');
}

test('build emits one ES5 runtime in module order', function () {
  var output = buildRuntime();
  assert.match(output, /var XTHB =/);
  assert.match(output, /XTHB.MODULE_NAMESPACE/);
  assert.doesNotMatch(output, /\b(let|const|class|async|await)\b|=>/);
});
