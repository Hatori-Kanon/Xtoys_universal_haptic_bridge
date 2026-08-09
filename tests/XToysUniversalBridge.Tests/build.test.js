'use strict';

var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var vm = require('node:vm');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var buildScript = path.join(repositoryRoot, 'scripts', 'Build-XToysRuntime.ps1');
var distributionFile = path.join(repositoryRoot, 'dist', 'xtoys-universal-runtime.es5.js');
var globalEntryFile = path.join(repositoryRoot, 'src', 'XToysUniversalBridge', '90-global-entry.es5.js');
var runtimeHarness = require('./harness');

function buildRuntime() {
  childProcess.execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  return fs.readFileSync(distributionFile, 'utf8');
}

function buildRuntimeAsync() {
  return new Promise(function (resolve, reject) {
    childProcess.execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript],
      { cwd: repositoryRoot, encoding: 'utf8' },
      function (error) {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

function executeDistribution() {
  var source = runtimeHarness.readDistribution();
  var context;
  context = vm.createContext({
    getVariable: function () {},
    setVariable: function () {},
    callAction: function () {},
    console: { log: function () {} }
  });
  vm.runInContext(source, context, { filename: distributionFile });
  assert.equal(context.XTHB.MODULE_GLOBAL_ENTRY, true);
}

test('build emits one ES5 runtime in module order', function () {
  var output = buildRuntime();
  assert.match(output, /var XTHB =/);
  assert.match(output, /XTHB.MODULE_NAMESPACE/);
  assert.doesNotMatch(output, /\b(let|const|class|async|await)\b|=>/);
});

test('build script serializes publishers and atomically replaces from a unique temporary file', function () {
  var script = fs.readFileSync(buildScript, 'utf8');
  assert.match(script, /System\.Threading\.Mutex/);
  assert.match(script, /Guid.*NewGuid|GetRandomFileName/);
  assert.match(script, /System\.IO\.File\]::Replace/);
  assert.match(script, /backupFile\s*=\s*\$temporaryFile\s*\+\s*'\.bak'/);
  assert.match(script, /finally/);
  assert.match(script, /ReleaseMutex/);
  assert.match(script, /Dispose/);
});

test('build cleanup records deletion failures while always attempting both deletes and lock release', function () {
  var script = fs.readFileSync(buildScript, 'utf8');
  assert.match(script, /\$buildFailure/);
  assert.match(script, /\$cleanupFailure/);
  assert.match(script, /try\s*\{[\s\S]*Delete\(\$temporaryFile\)[\s\S]*\}\s*catch/);
  assert.match(script, /try\s*\{[\s\S]*Delete\(\$backupFile\)[\s\S]*\}\s*catch/);
  assert.match(script, /finally\s*\{[\s\S]*ReleaseMutex[\s\S]*finally\s*\{[\s\S]*Dispose/);
});

test('harness rejects a complete but stale distribution', function () {
  var current = fs.readFileSync(distributionFile, 'utf8');
  var stale = current.replace("ns.VERSION = '1.0.0';", "ns.VERSION = 'stale';");
  assert.match(stale, /ns\.MODULE_GLOBAL_ENTRY/);
  new vm.Script(stale);
  assert.equal(runtimeHarness.distributionMatchesSources(current), true);
  assert.equal(runtimeHarness.distributionMatchesSources(stale), false);
});

test('global entry remains ES5-only and cannot call forbidden direct hardware actions', function () {
  var source = fs.readFileSync(globalEntryFile, 'utf8');
  assert.doesNotMatch(source, /updateComponent|setMaxVolume|setMaxRotationSpeed|\bsetMax\w*|eval\(|Function\(/);
  assert.doesNotMatch(source, /\b(let|const|class|async|await)\b|=>/);
});

test('committed release artifact matches sources and remains unchanged after rebuilding', function () {
  var committed = childProcess.execFileSync(
    'git',
    ['show', 'HEAD:dist/xtoys-universal-runtime.es5.js'],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  var expected = runtimeHarness.expectedDistribution();
  var context = vm.createContext({
    getVariable: function () {},
    setVariable: function () {},
    callAction: function () {},
    console: { log: function () {} }
  });
  var names = [
    'xtoysBridgeInit',
    'xtoysBridgeHandle',
    'xtoysBridgeTick',
    'xtoysBridgeStopAll',
    'xtoysBridgeReloadConfig',
    'xtoysBridgeTestSlot'
  ];

  assert.equal(committed, expected);
  assert.doesNotMatch(committed,
    /setMax|eval\(|Function\(|rotateReverse|setPattern|=>|\b(let|const|class|async|await)\b/);
  vm.runInContext(committed, context, { filename: 'HEAD:dist/xtoys-universal-runtime.es5.js' });
  assert.equal(context.XTHB.MODULE_GLOBAL_ENTRY, true);
  names.forEach(function (name) {
    assert.equal(typeof context[name], 'function', name);
  });

  buildRuntime();
  childProcess.execFileSync(
    'git',
    ['diff', '--exit-code', '--', 'dist/xtoys-universal-runtime.es5.js'],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
});

test('concurrent builders never expose a truncated distribution to readers', { timeout: 30000 }, function () {
  var builds = [];
  var failure = null;
  var reads = 0;
  var timer;
  var index;
  executeDistribution();
  timer = setInterval(function () {
    try {
      executeDistribution();
      reads += 1;
    } catch (error) {
      if (failure === null) {
        failure = error;
      }
    }
  }, 1);
  for (index = 0; index < 12; index += 1) {
    builds.push(buildRuntimeAsync());
  }
  return Promise.all(builds).then(function () {
    var leftovers;
    clearInterval(timer);
    executeDistribution();
    assert.equal(failure, null);
    assert.ok(reads > 0);
    leftovers = fs.readdirSync(path.dirname(distributionFile)).filter(function (name) {
      return /xtoys-universal-runtime\.es5\.js\..*\.(tmp|bak)$/.test(name);
    });
    assert.deepEqual(leftovers, []);
  }, function (error) {
    clearInterval(timer);
    throw error;
  });
});
