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

  function sameActuator(left, right) {
    return left !== undefined &&
      left.value === right.value &&
      left.frequency === right.frequency &&
      left.direction === right.direction;
  }

  function sameTuple(left, right) {
    return sameActuator(left, right) && left.rampSeconds === right.rampSeconds;
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

    if (sameActuator(previousTuple, currentCore)) {
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
    var pendingDispatches = {};
    var generationFloors = {};
    var recentFailures = [];
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
      var physicalSlot = copy(slot);
      var failure;
      tuple.rampSeconds = transition.rampSeconds;
      if (!force && pendingDispatches[slot.id] === undefined && sameTuple(lastTuples[slot.id], tuple)) {
        lastSlots[slot.id] = copy(slot);
        return { changed: false, failure: null };
      }
      if (generationFloors[slot.id] === undefined) {
        generationFloors[slot.id] = physicalSlot.generation;
      } else {
        physicalSlot.generation = Math.max(physicalSlot.generation, generationFloors[slot.id] + 1);
        generationFloors[slot.id] = physicalSlot.generation;
      }
      tuple.generation = physicalSlot.generation;
      try {
        outputAdapter.applySlot(physicalSlot, copy(transition));
      } catch (error) {
        failure = {
          slotId: slot.id,
          code: 'adapter_apply_failed',
          detail: error && error.message !== undefined ? String(error.message) : String(error)
        };
        pendingDispatches[slot.id] = {
          tuple: copy(tuple),
          transition: copy(transition)
        };
        return { changed: false, failure: failure };
      }
      lastTuples[slot.id] = copy(tuple);
      lastSlots[slot.id] = copy(slot);
      delete pendingDispatches[slot.id];
      return { changed: true, failure: null };
    }

    function transitionFor(slot, expiredParts) {
      var pending = pendingDispatches[slot.id];
      if (pending !== undefined && sameActuator(pending.tuple, coreTuple(slot))) {
        return copy(pending.transition);
      }
      return {
        rampSeconds: rampSeconds(lastSlots[slot.id], slot, lastTuples[slot.id], expiredParts)
      };
    }

    function dispatchResult(changedSlots, failures) {
      return { changedSlots: changedSlots, failures: failures };
    }

    function reportFailures(failures) {
      var index;
      var logEntry;
      recentFailures = copy(failures);
      if (typeof outputAdapter.log !== 'function') {
        return;
      }
      for (index = 0; index < failures.length; index += 1) {
        logEntry = copy(failures[index]);
        logEntry.type = 'dispatch_error';
        try {
          outputAdapter.log(logEntry);
        } catch (ignored) {
          /* Logging cannot prevent best-effort physical dispatch progress. */
        }
      }
    }

    function dispatch(atMs, expiredParts) {
      var slots = ns.computeSlots(engine.readState(), normalizedConfig, atMs);
      var index;
      var slot;
      var transition;
      var applied;
      var changed = 0;
      var failures = [];
      for (index = 0; index < slots.length; index += 1) {
        slot = slots[index];
        if (slot.enabled) {
          transition = transitionFor(slot, expiredParts);
          applied = apply(slot, transition, false);
          if (applied.changed) {
            changed += 1;
          }
          if (applied.failure !== null) {
            failures.push(applied.failure);
          }
        }
      }
      return dispatchResult(changed, failures);
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
      var dispatched;
      var stopped;
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
        stopped = runtime.stopAll();
        return {
          ok: true,
          changedSlots: stopped,
          dispatchFailures: copy(recentFailures)
        };
      }
      applied = engine.applyMessage(parsed.message, atMs, false);
      if (applied.rejected !== null) {
        return {
          ok: false,
          code: applied.rejected.code,
          detail: applied.rejected.detail
        };
      }
      expired = engine.expire(atMs, false);
      if (applied.ignoredReason === 'absent_event' && !expired.changed) {
        return {
          ok: true,
          changed: false,
          changedSlots: 0,
          dispatchFailures: []
        };
      }
      dispatched = dispatch(atMs, expired.changedParts);
      reportFailures(dispatched.failures);
      return {
        ok: true,
        changed: applied.changed || expired.changed,
        changedSlots: dispatched.changedSlots,
        dispatchFailures: copy(dispatched.failures)
      };
    };

    runtime.tick = function () {
      var atMs = now();
      var expired = engine.expire(atMs, false);
      var dispatched = dispatch(atMs, expired.changedParts);
      reportFailures(dispatched.failures);
      return dispatched.changedSlots;
    };

    runtime.stopAll = function () {
      var atMs = now();
      var slots;
      var slot;
      var index;
      var applied;
      var changed = 0;
      var failures = [];
      engine.clearAll(false);
      slots = ns.computeSlots(engine.snapshot(), normalizedConfig, atMs);
      for (index = 0; index < slots.length; index += 1) {
        slot = slots[index];
        if (slot.enabled) {
          slot.value = 0;
          slot.frequency = 0;
          slot.direction = null;
          applied = apply(slot, { rampSeconds: 0 }, true);
          if (applied.changed) {
            changed += 1;
          }
          if (applied.failure !== null) {
            failures.push(applied.failure);
          }
        }
      }
      reportFailures(failures);
      return changed;
    };

    runtime.snapshot = function () {
      return engine.snapshot();
    };

    runtime.recentFailures = function () {
      return copy(recentFailures);
    };

    runtime.invalidateSlot = function (slotId) {
      if (typeof slotId !== 'number' || !isFinite(slotId) || slotId % 1 !== 0 || slotId < 1 || slotId > 16) {
        throw new Error('Runtime slot ID must be an integer from 1 through 16.');
      }
      delete lastTuples[slotId];
    };

    runtime.reserveSlotGeneration = function (slotId) {
      var generation = 0;
      if (typeof slotId !== 'number' || !isFinite(slotId) || slotId % 1 !== 0 || slotId < 1 || slotId > 16) {
        throw new Error('Runtime slot ID must be an integer from 1 through 16.');
      }
      if (generationFloors[slotId] !== undefined) {
        generation = Math.max(generation, generationFloors[slotId]);
      }
      if (lastTuples[slotId] !== undefined) {
        generation = Math.max(generation, lastTuples[slotId].generation);
      }
      if (pendingDispatches[slotId] !== undefined) {
        generation = Math.max(generation, pendingDispatches[slotId].tuple.generation);
      }
      if (lastSlots[slotId] !== undefined) {
        generation = Math.max(generation, lastSlots[slotId].generation);
      }
      generation += 1;
      generationFloors[slotId] = generation;
      delete lastTuples[slotId];
      return generation;
    };

    runtime.forceResync = function () {
      lastTuples = {};
      pendingDispatches = {};
      return runtime.tick();
    };

    return runtime;
  };
}(XTHB));
