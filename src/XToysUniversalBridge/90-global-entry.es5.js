var xtoysBridgeInit;
var xtoysBridgeHandle;
var xtoysBridgeTick;
var xtoysBridgeStopAll;
var xtoysBridgeTestSlot;

(function (ns) {
  var runtime = null;
  var adapter = null;
  var config = null;

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

  function reportError(type, error, targetAdapter, slotId) {
    var outputAdapter = targetAdapter || adapter;
    var entry = { type: type, detail: errorDetail(error) };
    if (slotId !== undefined) {
      entry.slotId = slotId;
    }
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

  function manualDirection(slot, value, direction) {
    if (slot.type !== 'rotation') {
      return { ok: true, value: null };
    }
    if (value === 0 && (direction === undefined || direction === null || direction === '')) {
      return { ok: true, value: null };
    }
    if (direction === 'clockwise' || direction === 'counterclockwise') {
      return { ok: true, value: direction };
    }
    return { ok: false, value: null };
  }

  xtoysBridgeInit = function () {
    var candidate;
    try {
      candidate = readCandidate();
      candidate.runtime.stopAll();
      runtime = candidate.runtime;
      adapter = candidate.adapter;
      config = candidate.config;
      return 1;
    } catch (error) {
      reportError('config_error', error,
        candidate === undefined ? null : candidate.adapter);
      return 0;
    }
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
    if (runtime === null) {
      return 0;
    }
    try {
      return runtime.stopAll();
    } catch (error) {
      reportError('runtime_error', error, adapter);
      return 0;
    }
  };

  xtoysBridgeTestSlot = function (slotId, value, direction) {
    var parsedSlot = finiteNumber(slotId);
    var parsedValue = finiteNumber(value);
    var numericSlot;
    var numericValue;
    var selected;
    var parsedDirection;
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
    parsedDirection = manualDirection(selected, numericValue, direction);
    if (!parsedDirection.ok) {
      return 0;
    }
    runtime.invalidateSlot(numericSlot);
    try {
      adapter.applySlot({
        id: numericSlot,
        value: ns.clamp(numericValue, 0, 100),
        frequency: 0,
        direction: parsedDirection.value
      }, { rampSeconds: 0 });
      return 1;
    } catch (error) {
      reportError('xtoys_call_error', error, adapter, numericSlot);
      return 0;
    }
  };
}(XTHB));
