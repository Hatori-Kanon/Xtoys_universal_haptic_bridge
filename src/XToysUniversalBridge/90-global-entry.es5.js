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
  var stopRetryPending = false;

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

  function hasRecentFailures(targetRuntime) {
    return targetRuntime.recentFailures().length > 0;
  }

  function finiteNumber(value) {
    var numeric;
    if (typeof value === 'number') {
      return isFinite(value) ? { ok: true, value: value } : { ok: false };
    }
    if (typeof value !== 'string' || value.replace(/^\s+|\s+$/g, '') === '') {
      return { ok: false };
    }
    numeric = Number(value);
    return isFinite(numeric) ? { ok: true, value: numeric } : { ok: false };
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
    stopRetryPending = hasRecentFailures(runtime);
    stopped = !stopRetryPending;
  }

  function restoreActiveRuntime(wasStopped, wasStopRetryPending) {
    if (runtime === null) {
      return;
    }
    try {
      runtime.forceResync();
      if (hasRecentFailures(runtime)) {
        stopped = false;
        stopRetryPending = wasStopped || wasStopRetryPending;
      } else {
        stopped = wasStopped || wasStopRetryPending;
        stopRetryPending = false;
      }
    } catch (error) {
      stopped = false;
      stopRetryPending = false;
      reportError('runtime_error', error, adapter);
    }
  }

  function initialize() {
    var candidate;
    var wasStopped = stopped;
    var wasStopRetryPending = stopRetryPending;
    try {
      candidate = readCandidate();
      installCandidate(candidate);
      return 1;
    } catch (error) {
      if (candidate !== undefined) {
        restoreActiveRuntime(wasStopped, wasStopRetryPending);
      }
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
          stopRetryPending = result.dispatchFailures.length > 0;
          stopped = !stopRetryPending;
        } else if (result.changed === true || result.changedSlots > 0) {
          stopped = false;
          stopRetryPending = false;
        }
      }
      return 1;
    } catch (error) {
      reportError('runtime_error', error, adapter);
      return 0;
    }
  };

  xtoysBridgeTick = function () {
    var changed;
    if (runtime === null) {
      return 0;
    }
    try {
      changed = runtime.tick();
      if (stopRetryPending) {
        stopRetryPending = hasRecentFailures(runtime);
        stopped = !stopRetryPending;
      }
      return changed;
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
      changed = stopRetryPending ? runtime.tick() : runtime.stopAll();
      stopRetryPending = hasRecentFailures(runtime);
      stopped = !stopRetryPending;
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
    var parsedSlot = finiteNumber(slotId);
    var parsedValue = finiteNumber(value);
    var numericSlot;
    var numericValue;
    var selected;
    var generation;
    if (runtime === null || !parsedSlot.ok || !parsedValue.ok) {
      return 0;
    }
    numericSlot = parsedSlot.value;
    numericValue = parsedValue.value;
    if (numericSlot % 1 !== 0 || numericSlot < 1 || numericSlot > 16) {
      return 0;
    }
    selected = config.slots[numericSlot - 1];
    if (!selected.enabled || selected.id !== numericSlot) {
      return 0;
    }
    generation = runtime.reserveSlotGeneration(numericSlot);
    try {
      adapter.applySlot({
        id: numericSlot,
        value: ns.clamp(numericValue, 0, 100),
        frequency: 0,
        direction: null,
        generation: generation
      }, { rampSeconds: 0 });
      stopped = false;
      stopRetryPending = false;
      return 1;
    } catch (error) {
      stopped = false;
      stopRetryPending = false;
      reportError('adapter_apply_error', error, adapter);
      return 0;
    }
  };
}(XTHB));
