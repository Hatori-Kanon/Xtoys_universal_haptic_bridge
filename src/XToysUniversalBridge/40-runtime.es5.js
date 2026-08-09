(function (ns) {
  function copy(value) {
    return ns.copyObject(value);
  }

  function normalizedDirection(value) {
    return value === undefined ? null : value;
  }

  function coreTuple(slot) {
    return {
      value: slot.value,
      frequency: slot.frequency,
      direction: normalizedDirection(slot.direction),
      generation: slot.generation
    };
  }

  function sameCore(left, right) {
    return left !== undefined &&
      left.value === right.value &&
      left.frequency === right.frequency &&
      left.direction === right.direction &&
      left.generation === right.generation;
  }

  function sameTuple(left, right) {
    return sameCore(left, right) && left.rampSeconds === right.rampSeconds;
  }

  function containsPart(parts, part) {
    return parts.indexOf(part) !== -1;
  }

  function sameWinner(left, right) {
    if (left === null || right === null) {
      return left === right;
    }
    return left.source === right.source &&
      left.eventId === right.eventId &&
      left.sequence === right.sequence &&
      left.generation === right.generation &&
      left.target.part === right.target.part;
  }

  function expiryReleased(previous, current, expiredParts) {
    return previous !== undefined &&
      previous.transientWinner !== null &&
      containsPart(expiredParts, previous.transientWinner.target.part) &&
      !sameWinner(previous.transientWinner, current.transientWinner);
  }

  function rampSeconds(previous, current, previousTuple, expiredParts) {
    var previousValue = previous === undefined ? 0 : previous.value;
    var milliseconds = 0;
    var currentCore = coreTuple(current);

    if (sameCore(previousTuple, currentCore)) {
      return previousTuple.rampSeconds;
    }
    if (expiryReleased(previous, current, expiredParts)) {
      milliseconds = previous.rampDownMs;
    } else if (current.value > previousValue) {
      milliseconds = current.rampUpMs;
    } else if (current.value < previousValue && previous !== undefined) {
      milliseconds = previous.rampDownMs;
    }
    return ns.clamp(milliseconds / 1000, 0, 600);
  }

  ns.createRuntime = function (config, adapter, clock) {
    var validation = ns.validateConfig(config);
    var normalizedConfig;
    var outputAdapter = adapter || {};
    var now = typeof clock === 'function' ? clock : ns.nowMs;
    var engine;
    var lastSlots = {};
    var lastTuples = {};
    var runtime = {};

    if (!validation.ok) {
      throw new Error(validation.code + ': ' + validation.detail);
    }
    if (typeof outputAdapter.applySlot !== 'function') {
      throw new Error('Runtime adapter must provide applySlot.');
    }
    normalizedConfig = validation.config;
    engine = ns.createStateEngine();

    function apply(slot, transition, force) {
      var tuple = coreTuple(slot);
      tuple.rampSeconds = transition.rampSeconds;
      if (!force && sameTuple(lastTuples[slot.id], tuple)) {
        return false;
      }
      lastTuples[slot.id] = copy(tuple);
      lastSlots[slot.id] = copy(slot);
      outputAdapter.applySlot(copy(slot), copy(transition));
      return true;
    }

    function dispatch(atMs, expiredParts) {
      var slots = ns.computeSlots(engine.snapshot(), normalizedConfig, atMs);
      var index;
      var slot;
      var transition;
      var changed = 0;
      for (index = 0; index < slots.length; index += 1) {
        slot = slots[index];
        if (slot.enabled) {
          transition = {
            rampSeconds: rampSeconds(lastSlots[slot.id], slot, lastTuples[slot.id], expiredParts)
          };
          if (apply(slot, transition, false)) {
            changed += 1;
          }
        }
      }
      return changed;
    }

    function preview(message, atMs) {
      var applied = engine.applyMessage(message, atMs, true);
      return {
        message: copy(message),
        snapshot: copy(applied.snapshot),
        slots: copy(ns.computeSlots(applied.snapshot, normalizedConfig, atMs))
      };
    }

    runtime.handle = function (payloadText) {
      var parsed = ns.parseMessage(payloadText, normalizedConfig);
      var atMs;
      var applied;
      var expired;
      var testPreview;
      var changedSlots;
      if (!parsed.ok) {
        return parsed;
      }
      atMs = now();
      if (parsed.message.command === 'test') {
        testPreview = preview(parsed.message, atMs);
        if (typeof outputAdapter.log === 'function') {
          outputAdapter.log(copy(testPreview));
        }
        return { ok: true, changedSlots: 0, preview: testPreview };
      }
      if (parsed.message.command === 'stop_all') {
        return { ok: true, changedSlots: runtime.stopAll() };
      }
      applied = engine.applyMessage(parsed.message, atMs, false);
      expired = engine.expire(atMs, false);
      changedSlots = dispatch(atMs, expired.changedParts);
      return {
        ok: true,
        changed: applied.changed || expired.changed,
        changedSlots: changedSlots
      };
    };

    runtime.tick = function () {
      var atMs = now();
      var expired = engine.expire(atMs, false);
      return dispatch(atMs, expired.changedParts);
    };

    runtime.stopAll = function () {
      var atMs = now();
      var slots;
      var slot;
      var index;
      var changed = 0;
      engine.clearAll(false);
      slots = ns.computeSlots(engine.snapshot(), normalizedConfig, atMs);
      for (index = 0; index < slots.length; index += 1) {
        slot = slots[index];
        if (slot.enabled) {
          slot.value = 0;
          slot.frequency = 0;
          slot.direction = null;
          if (apply(slot, { rampSeconds: 0 }, true)) {
            changed += 1;
          }
        }
      }
      return changed;
    };

    runtime.snapshot = function () {
      return engine.snapshot();
    };

    return runtime;
  };
}(XTHB));
