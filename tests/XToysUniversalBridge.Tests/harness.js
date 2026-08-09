'use strict';

var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var repositoryRoot = path.resolve(__dirname, '..', '..');
var distributionFile = path.join(repositoryRoot, 'dist', 'xtoys-universal-runtime.es5.js');

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

  vm.runInContext(fs.readFileSync(distributionFile, 'utf8'), context, {
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
