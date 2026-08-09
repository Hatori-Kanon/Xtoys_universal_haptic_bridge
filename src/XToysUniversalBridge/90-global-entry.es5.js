var xtoysBridgeInit;
var xtoysBridgeHandle;
var xtoysBridgeTick;
var xtoysBridgeStopAll;
var xtoysBridgeReloadConfig;
var xtoysBridgeTestSlot;

(function (ns) {
  var runtime = null;
  var adapter = null;
  var config = null;
  var stopped = true;
  var manualGeneration = 0;

  ns.MODULE_GLOBAL_ENTRY = true;

  function safeConsoleError(detail) {
    try {
      if (typeof console !== 'undefined' && console !== null && typeof console.log === 'function') {
        console.log('XTHB error: ' + detail);
      }
    } catch (ignored) {
      /* A failed console must not escape a public global. */
    }
  }

  function errorDetail(error) {
    return error && error.message !== undefined ? String(error.message) : String(error);
  }

  function reportError(type, error, targetAdapter) {
    var outputAdapter = targetAdapter || adapter;
    var entry = { type: type, detail: errorDetail(error) };
    if (outputAdapter !== null && typeof outputAdapter.log === 'function') {
      try {
        outputAdapter.log(entry);
        return;
      } catch (ignored) {
        /* Fall through to the guarded console. */
      }
    }
    safeConsoleError(entry.detail);
  }

  function readCandidate() {
    var raw = getVariable('xthb-config-json');
    var parsed;
    var validation;
    var nextAdapter;
    if (typeof raw !== 'string') {
      throw new Error('xthb-config-json must contain a JSON string.');
    }
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error('invalid_config_json: ' + errorDetail(error));
    }
    validation = ns.validateConfig(parsed);
    if (!validation.ok) {
      throw new Error(validation.code + ': ' + validation.detail);
    }
    nextAdapter = ns.createXToysAdapter(validation.config.logLevel);
    return {
      config: validation.config,
      adapter: nextAdapter,
      runtime: ns.createRuntime(validation.config, nextAdapter, ns.nowMs)
    };
  }

  function zeroSlot(outputAdapter, slotId, generation) {
    outputAdapter.applySlot({
      id: slotId,
      value: 0,
      frequency: 0,
      direction: null,
      generation: generation
    }, { rampSeconds: 0 });
  }

  function enabledSlot(configuration, slotId) {
    return configuration !== null && configuration.slots[slotId - 1].enabled;
  }

  function installCandidate(candidate) {
    var slotId;
    if (config !== null) {
      for (slotId = 1; slotId <= 16; slotId += 1) {
        if (enabledSlot(config, slotId) && !enabledSlot(candidate.config, slotId)) {
          zeroSlot(candidate.adapter, slotId, 0);
        }
      }
    }
    candidate.runtime.stopAll();
    runtime = candidate.runtime;
    adapter = candidate.adapter;
    config = candidate.config;
    stopped = true;
    manualGeneration = 0;
  }

  function initialize() {
    var candidate;
    try {
      candidate = readCandidate();
      installCandidate(candidate);
      return 1;
    } catch (error) {
      reportError('config_error', error, candidate === undefined ? null : candidate.adapter);
      return 0;
    }
  }

  xtoysBridgeInit = function () {
    return initialize();
  };

  xtoysBridgeHandle = function (payloadText) {
    var result;
    if (runtime === null) {
      return 1;
    }
    try {
      result = runtime.handle(payloadText);
      if (!result.ok) {
        adapter.log({ type: 'input_error', code: result.code, detail: result.detail });
        return 0;
      }
      if (result.preview === undefined) {
        if (result.changed === undefined && result.dispatchFailures !== undefined) {
          stopped = true;
        } else if (result.changed === true || result.changedSlots > 0) {
          stopped = false;
        }
      }
      return 1;
    } catch (error) {
      reportError('runtime_error', error, adapter);
      return 0;
    }
  };

  xtoysBridgeTick = function () {
    if (runtime === null) {
      return 0;
    }
    try {
      return runtime.tick();
    } catch (error) {
      reportError('runtime_error', error, adapter);
      return 0;
    }
  };

  xtoysBridgeStopAll = function () {
    var changed;
    if (runtime === null || stopped) {
      return 0;
    }
    try {
      changed = runtime.stopAll();
      stopped = true;
      return changed;
    } catch (error) {
      reportError('runtime_error', error, adapter);
      return 0;
    }
  };

  xtoysBridgeReloadConfig = function () {
    return initialize();
  };

  xtoysBridgeTestSlot = function (slotId, value) {
    var numericSlot = Number(slotId);
    var numericValue = Number(value);
    var selected;
    if (runtime === null || !isFinite(numericSlot) || numericSlot % 1 !== 0 ||
        numericSlot < 1 || numericSlot > 16 || !isFinite(numericValue) ||
        value === null || (typeof value === 'string' && value.replace(/^\s+|\s+$/g, '') === '')) {
      return 0;
    }
    selected = config.slots[numericSlot - 1];
    if (!selected.enabled || selected.id !== numericSlot) {
      return 0;
    }
    manualGeneration += 1;
    try {
      adapter.applySlot({
        id: numericSlot,
        value: ns.clamp(numericValue, 0, 100),
        frequency: 0,
        direction: null,
        generation: manualGeneration
      }, { rampSeconds: 0 });
      stopped = false;
      return 1;
    } catch (error) {
      reportError('adapter_apply_error', error, adapter);
      return 0;
    }
  };
}(XTHB));
