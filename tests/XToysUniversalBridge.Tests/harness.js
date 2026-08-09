'use strict';

var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var distributionFile = path.join(repositoryRoot, 'dist', 'xtoys-universal-runtime.es5.js');

function readDistribution() {
  var attempt;
  var source;
  var lastError;
  for (attempt = 0; attempt < 100; attempt += 1) {
    try {
      source = fs.readFileSync(distributionFile, 'utf8');
      if (/var XTHB =/.test(source) && /ns\.MODULE_GLOBAL_ENTRY/.test(source)) {
        return source;
      }
      lastError = new Error('Distribution is incomplete during publication.');
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
  loadRuntime: loadRuntime
};
