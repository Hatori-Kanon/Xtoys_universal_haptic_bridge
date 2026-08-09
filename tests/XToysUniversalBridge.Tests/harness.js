'use strict';

var crypto = require('node:crypto');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var distributionFile = path.join(repositoryRoot, 'dist', 'xtoys-universal-runtime.es5.js');
var sourceDirectory = path.join(repositoryRoot, 'src', 'XToysUniversalBridge');

function expectedDistribution() {
  var names = fs.readdirSync(sourceDirectory).filter(function (name) {
    return /\.es5\.js$/.test(name) && fs.statSync(path.join(sourceDirectory, name)).isFile();
  }).sort();
  return names.map(function (name) {
    return fs.readFileSync(path.join(sourceDirectory, name), 'utf8').replace(/[\r\n]+$/, '');
  }).join('\n') + '\n';
}

function contentHash(source) {
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex');
}

function distributionMatchesSources(source) {
  var expected = expectedDistribution();
  return source === expected && contentHash(source) === contentHash(expected);
}

function readDistribution() {
  var attempt;
  var source;
  var lastError;
  for (attempt = 0; attempt < 100; attempt += 1) {
    try {
      source = fs.readFileSync(distributionFile, 'utf8');
      if (distributionMatchesSources(source)) {
        return source;
      }
      lastError = new Error('Distribution does not match the current runtime sources.');
    } catch (error) {
      lastError = error;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
  }
  throw lastError;
}

function loadRuntime(options) {
  var settings = options || {};
  var variables = settings.variables || {};
  var actions = [];
  var logs = [];
  var now = settings.now === undefined ? 0 : settings.now;
  var context = vm.createContext({
    getVariable: function (name) {
      return variables[name];
    },
    setVariable: function (name, value) {
      variables[name] = value;
    },
    callAction: function (json) {
      actions.push(json);
    },
    console: {
      log: function (text) {
        logs.push(String(text));
      }
    }
  });

  vm.runInContext(readDistribution(), context, {
    filename: distributionFile
  });
  context.XTHB.nowMs = function () {
    return now;
  };

  return {
    context: context,
    XTHB: context.XTHB,
    variables: variables,
    actions: actions,
    logs: logs,
    setNow: function (value) {
      now = value;
    }
  };
}

module.exports = {
  distributionMatchesSources: distributionMatchesSources,
  loadRuntime: loadRuntime,
  readDistribution: readDistribution
};
