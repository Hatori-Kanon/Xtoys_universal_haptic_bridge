'use strict';

var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var repositoryRoot = path.resolve(__dirname, '..');
var distributionFile = path.join(repositoryRoot, 'dist', 'xtoys-universal-runtime.es5.js');
var configFile = path.join(repositoryRoot, 'tests', 'XToysUniversalBridge.Tests', 'fixtures', 'config.json');

function loadNamespace() {
  var context = vm.createContext({ console: console });
  var source = fs.readFileSync(distributionFile, 'utf8');
  vm.runInContext(source, context, { filename: distributionFile });
  return context.XTHB;
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function createRuntime(namespace, config, adapter, now) {
  return namespace.createRuntime(config, {
    applySlot: adapter || function () {}
  }, now || function () { return 0; });
}

function target() {
  return {
    part: 'clitoris',
    intensity: 40,
    durationMs: 600000
  };
}

function payload(command, eventId, sequence) {
  return JSON.stringify({
    protocolVersion: 1,
    command: command,
    source: 'benchmark',
    eventId: eventId,
    sequence: sequence,
    targets: [target()]
  });
}

function adaptivePayload(command, eventId, sequence) {
  var message = JSON.parse(payload(command, eventId, sequence));
  message.targets[0].intensity = 60;
  message.targets[0].durationMs = 600000;
  message.targets[0].rampUpMs = 180;
  message.targets[0].rampDownMs = 80;
  message.targets[0].retrigger = {
    mode: 'adaptive',
    minDropPercent: 25,
    maxDropPercent: 100,
    minRampUpMs: 30,
    minRampDownMs: 20,
    textureThresholdMs: 150,
    quietResetMs: 600
  };
  return JSON.stringify(message);
}

function adaptiveBenchmarkConfig(config) {
  var benchmarkConfig = JSON.parse(JSON.stringify(config));
  benchmarkConfig.slots.forEach(function (slot) {
    slot.enabled = slot.enabled === true && slot.type === 'intensity' &&
      slot.routes.clitoris !== undefined && slot.routes.clitoris > 0;
  });
  return benchmarkConfig;
}

function adaptiveSixteenSlotConfig(config) {
  var benchmarkConfig = JSON.parse(JSON.stringify(config));
  benchmarkConfig.slots.forEach(function (slot) {
    slot.enabled = true;
    slot.type = 'intensity';
    slot.frequencyEnabled = false;
    slot.routes = { clitoris: 1 };
  });
  return benchmarkConfig;
}

function milliseconds(started) {
  return Number(process.hrtime.bigint() - started) / 1000000;
}

function benchmarkSameEvent(namespace, config, updates) {
  var runtime = createRuntime(namespace, config);
  var index;
  var started;
  runtime.handle(payload('play', 'same-event', 0));
  started = process.hrtime.bigint();
  for (index = 1; index <= updates; index += 1) {
    runtime.handle(payload('update', 'same-event', index));
  }
  return { updates: updates, milliseconds: milliseconds(started) };
}

function benchmarkUniqueEvents(namespace, config, requested) {
  var runtime = createRuntime(namespace, config);
  var accepted = 0;
  var rejected = 0;
  var index;
  var result;
  var started = process.hrtime.bigint();
  for (index = 0; index < requested; index += 1) {
    result = runtime.handle(payload('play', 'unique-' + index, 1));
    if (result.ok) {
      accepted += 1;
    } else {
      rejected += 1;
    }
  }
  return {
    requested: requested,
    accepted: accepted,
    rejected: rejected,
    milliseconds: milliseconds(started)
  };
}

function benchmarkTicks(namespace, config, activeEvents, iterations) {
  var runtime = createRuntime(namespace, config);
  var index;
  var started;
  for (index = 0; index < activeEvents; index += 1) {
    runtime.handle(payload('play', 'tick-' + index, 1));
  }
  started = process.hrtime.bigint();
  for (index = 0; index < iterations; index += 1) {
    runtime.tick();
  }
  return {
    activeEvents: activeEvents,
    iterations: iterations,
    milliseconds: milliseconds(started)
  };
}

function benchmarkAdaptiveSamePart(namespace, config, updates) {
  var adapterCalls = 0;
  var initialAdapterCalls;
  var maxUpdateAdapterCalls = 0;
  var updateAdapterCalls = 0;
  var zeroUpdateDispatches = 0;
  var fullUpdateDispatches = 0;
  var now = 0;
  var runtime = createRuntime(namespace, config, function () {
    adapterCalls += 1;
  }, function () { return now; });
  var index;
  var snapshot;
  var started;
  var before;
  var dispatched;
  runtime.handle(adaptivePayload('play', 'adaptive-same-part', 1));
  initialAdapterCalls = adapterCalls;
  started = process.hrtime.bigint();
  for (index = 2; index <= updates + 1; index += 1) {
    now = (index - 1) * 50;
    before = adapterCalls;
    runtime.handle(adaptivePayload('update', 'adaptive-same-part', index));
    dispatched = adapterCalls - before;
    updateAdapterCalls += dispatched;
    maxUpdateAdapterCalls = Math.max(maxUpdateAdapterCalls, dispatched);
    if (dispatched === 0) {
      zeroUpdateDispatches += 1;
    }
    if (dispatched > 0) {
      fullUpdateDispatches += 1;
    }
  }
  snapshot = runtime.hapticSnapshot();
  return {
    updates: updates,
    cadenceRecords: Object.keys(snapshot.cadenceRecords || {}).length,
    envelopeSlots: Object.keys(snapshot.slotEnvelopes || {}).length,
    affectedSlots: Object.keys(snapshot.slotEnvelopes || {}).length,
    initialAdapterCalls: initialAdapterCalls,
    maxUpdateAdapterCalls: maxUpdateAdapterCalls,
    updateAdapterCalls: updateAdapterCalls,
    zeroUpdateDispatches: zeroUpdateDispatches,
    fullUpdateDispatches: fullUpdateDispatches,
    adapterCalls: adapterCalls,
    milliseconds: milliseconds(started)
  };
}

function benchmarkEnvelopes(namespace, config, updates) {
  var adapterCalls = 0;
  var initialAdapterCalls;
  var retriggerAdapterCalls;
  var maxTickAdapterCalls = 0;
  var activeTickDispatches = 0;
  var zeroTickDispatches = 0;
  var tickAdapterCalls = 0;
  var now = 0;
  var runtime = createRuntime(namespace, config, function () {
    adapterCalls += 1;
  }, function () { return now; });
  var index;
  var snapshot;
  var beforeCalls;
  var dispatched;
  var started;
  runtime.handle(adaptivePayload('play', 'adaptive-envelopes', 1));
  initialAdapterCalls = adapterCalls;
  started = process.hrtime.bigint();
  now = 50;
  beforeCalls = adapterCalls;
  runtime.handle(adaptivePayload('update', 'adaptive-envelopes', 2));
  retriggerAdapterCalls = adapterCalls - beforeCalls;
  for (index = 1; index <= updates; index += 1) {
    now = index * 50;
    beforeCalls = adapterCalls;
    runtime.tick();
    dispatched = adapterCalls - beforeCalls;
    tickAdapterCalls += dispatched;
    maxTickAdapterCalls = Math.max(maxTickAdapterCalls, dispatched);
    if (dispatched > 0) {
      activeTickDispatches += 1;
    } else {
      zeroTickDispatches += 1;
    }
  }
  snapshot = runtime.hapticSnapshot();
  return {
    updates: updates,
    cadenceRecords: Object.keys(snapshot.cadenceRecords || {}).length,
    envelopeSlots: Object.keys(snapshot.slotEnvelopes || {}).length,
    affectedSlots: Object.keys(snapshot.slotEnvelopes || {}).length,
    initialAdapterCalls: initialAdapterCalls,
    retriggerAdapterCalls: retriggerAdapterCalls,
    maxTickAdapterCalls: maxTickAdapterCalls,
    activeTickDispatches: activeTickDispatches,
    zeroTickDispatches: zeroTickDispatches,
    tickAdapterCalls: tickAdapterCalls,
    adapterCalls: adapterCalls,
    milliseconds: milliseconds(started)
  };
}

function benchmarkAdaptiveTickCopies(namespace, config) {
  var adapterCalls = 0;
  var now = 0;
  var runtime = createRuntime(namespace, config, function () {
    adapterCalls += 1;
  }, function () { return now; });
  var originalCopy = namespace.copyObject;
  var deepCopies = 0;
  var fullWinnerCopies = 0;
  var fullSlotCopies = 0;
  var callsBefore;

  runtime.handle(adaptivePayload('play', 'adaptive-tick-16', 1));
  now = 50;
  runtime.handle(adaptivePayload('update', 'adaptive-tick-16', 2));
  namespace.copyObject = function (value) {
    deepCopies += 1;
    if (value !== null && typeof value === 'object') {
      if (value.target !== undefined) {
        fullWinnerCopies += 1;
      }
      if (value.foregroundWinner !== undefined && value.transientWinner !== undefined) {
        fullSlotCopies += 1;
      }
    }
    return originalCopy(value);
  };
  callsBefore = adapterCalls;
  try {
    now = 150;
    runtime.tick();
  } finally {
    namespace.copyObject = originalCopy;
  }
  return {
    enabledSlots: 16,
    adapterCalls: adapterCalls - callsBefore,
    deepCopies: deepCopies,
    fullWinnerCopies: fullWinnerCopies,
    fullSlotCopies: fullSlotCopies
  };
}

function main() {
  var testMode = process.argv.indexOf('--test') !== -1;
  var namespace = loadNamespace();
  var config = loadConfig();
  var adaptiveConfig = adaptiveBenchmarkConfig(config);
  var sixteenSlotConfig = adaptiveSixteenSlotConfig(config);
  var uniqueCounts = [32, 64, 128, 129];
  var output = {
    nodeVersion: process.version,
    sameEvent: benchmarkSameEvent(namespace, config, testMode ? 20 : 2000),
    adaptiveSamePart: benchmarkAdaptiveSamePart(namespace, adaptiveConfig, testMode ? 20 : 2000),
    envelopes: benchmarkEnvelopes(namespace, adaptiveConfig, testMode ? 10 : 1000),
    adaptiveTick16: benchmarkAdaptiveTickCopies(namespace, sixteenSlotConfig),
    uniqueEvents: uniqueCounts.map(function (count) {
      return benchmarkUniqueEvents(namespace, config, count);
    }),
    ticks: benchmarkTicks(namespace, config, testMode ? 32 : 128, testMode ? 10 : 1000)
  };
  process.stdout.write(JSON.stringify(output) + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write((error && error.stack ? error.stack : String(error)) + '\n');
  process.exitCode = 1;
}
