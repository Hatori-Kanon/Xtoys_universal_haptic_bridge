(function (ns) {
  function copy(value) {
    return ns.copyObject(value);
  }

  function copyTransition(transition) {
    return { rampSeconds: transition.rampSeconds };
  }

  function copyTuple(tuple) {
    return {
      value: tuple.value,
      frequency: tuple.frequency,
      direction: tuple.direction,
      generation: tuple.generation,
      rampSeconds: tuple.rampSeconds
    };
  }

  function copyToken(token) {
    return {
      slotId: token.slotId,
      ownerKey: token.ownerKey,
      ownerGeneration: token.ownerGeneration,
      phase: token.phase
    };
  }

  function copyFailure(failure) {
    return {
      slotId: failure.slotId,
      code: failure.code,
      detail: failure.detail
    };
  }

  function copyFailures(failures) {
    var copied = [];
    var index;
    for (index = 0; index < failures.length; index += 1) {
      copied.push(copyFailure(failures[index]));
    }
    return copied;
  }

  function copySlot(slot) {
    /* Winner metadata is a fixed scalar projection owned by this dispatch pass. */
    return {
      id: slot.id,
      enabled: slot.enabled,
      type: slot.type,
      value: slot.value,
      frequency: slot.frequency,
      direction: slot.direction,
      rampUpMs: slot.rampUpMs,
      rampDownMs: slot.rampDownMs,
      pulseOnMs: slot.pulseOnMs,
      pulseOffMs: slot.pulseOffMs,
      baselineWinner: slot.baselineWinner,
      foregroundWinner: slot.foregroundWinner,
      transientWinner: slot.transientWinner,
      baselineValue: slot.baselineValue,
      baselineFrequency: slot.baselineFrequency,
      baselineDirection: slot.baselineDirection,
      generation: slot.generation
    };
  }

  function actuatorSlot(slot) {
    /* The adapter receives only the primitive actuator tuple it owns. */
    return {
      id: slot.id,
      value: slot.value,
      frequency: slot.frequency,
      direction: slot.direction,
      generation: slot.generation
    };
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

  function replacementRampSeconds(previous, current, winnerChanged, effectiveRiseMs) {
    if (current.type === 'rotation' && winnerChanged && current.value > 0) {
      return ns.clamp(effectiveRiseMs / 1000, 0, 600);
    }
    return null;
  }

  function rampSeconds(previous, current, previousTuple, expiredParts,
      winnerChanged, effectiveRiseMs) {
    var previousValue = previous === undefined ? 0 : previous.value;
    var milliseconds = 0;
    var currentCore = coreTuple(current);
    var replacement = replacementRampSeconds(previous, current,
      winnerChanged, effectiveRiseMs);

    if (replacement !== null) {
      return replacement;
    }
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
    var hapticPendingDispatches = {};
    var resyncPendingDispatches = {};
    var generationFloors = {};
    var slotEnvelopes = {};
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
      var physicalSlot = actuatorSlot(slot);
      var failure;
      tuple.rampSeconds = transition.rampSeconds;
      if (!force && pendingDispatches[slot.id] === undefined && sameTuple(lastTuples[slot.id], tuple)) {
        lastSlots[slot.id] = copySlot(slot);
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
        outputAdapter.applySlot(physicalSlot, copyTransition(transition));
      } catch (error) {
        failure = {
          slotId: slot.id,
          code: 'adapter_apply_failed',
          detail: error && error.message !== undefined ? String(error.message) : String(error)
        };
        pendingDispatches[slot.id] = {
          slot: copySlot(slot),
          tuple: copyTuple(tuple),
          transition: copyTransition(transition)
        };
        return { changed: false, failure: failure };
      }
      lastTuples[slot.id] = copyTuple(tuple);
      lastSlots[slot.id] = copySlot(slot);
      delete pendingDispatches[slot.id];
      return { changed: true, failure: null };
    }

    function transitionFor(slot, expiredParts) {
      var pending = pendingDispatches[slot.id];
      var previous = lastSlots[slot.id];
      var winnerChanged = resolvedWinnerKey(previous) !== resolvedWinnerKey(slot);
      if (pending !== undefined && sameActuator(pending.tuple, coreTuple(slot))) {
        return copyTransition(pending.transition);
      }
      return {
        rampSeconds: rampSeconds(previous, slot, lastTuples[slot.id],
          expiredParts, winnerChanged, slot.rampUpMs)
      };
    }

    function foregroundKey(slot) {
      var winner = slot.foregroundWinner;
      return winner === null ? null : ns.compositeKey([
        winner.source, winner.eventId, winner.target.part, winner.generation
      ]);
    }

    function resolvedWinnerKey(slot) {
      if (slot === undefined) {
        return null;
      }
      var kind = slot.transientWinner === null ? 'baseline' : 'transient';
      var winner = slot.transientWinner === null
        ? slot.baselineWinner : slot.transientWinner;
      if (winner === null) {
        return null;
      }
      return ns.compositeKey([
        kind, winner.source || '', winner.eventId || '', winner.target.part,
        winner.sequence === undefined ? '' : winner.sequence,
        winner.generation === undefined ? '' : winner.generation
      ]);
    }

    function restoresOlderForeground(previous, winner) {
      var previousWinner = previous === undefined
        ? null : previous.foregroundWinner;
      return previousWinner !== null && !sameWinner(previousWinner, winner) &&
        winner.generation < previousWinner.generation;
    }

    function restoredRiseMs(winner, plan, atMs) {
      var remaining = Math.max(0, winner.expiresAt - atMs);
      return Math.min(plan.riseMs,
        Math.max(0, remaining - ns.SCHEDULER_INTERVAL_MS));
    }

    function prepareHapticSlot(slot, atMs) {
      var key = foregroundKey(slot);
      var envelope = slotEnvelopes[slot.id];
      var pending = hapticPendingDispatches[slot.id];
      var previous = lastSlots[slot.id];
      var winner = slot.foregroundWinner;
      var winnerChanged = resolvedWinnerKey(previous) !== resolvedWinnerKey(slot);
      var effectiveRiseMs;
      var plan;
      var physical;
      var targetPhase;
      var transition;
      var restored;

      if (key === null) {
        delete slotEnvelopes[slot.id];
        delete hapticPendingDispatches[slot.id];
        return { slot: slot, transition: null, token: null };
      }

      if (envelope === undefined || envelope.ownerKey !== key) {
        delete hapticPendingDispatches[slot.id];
        plan = ns.envelopePlan(winner.target, winner.cadence);
        restored = restoresOlderForeground(previous, winner);
        effectiveRiseMs = restored
          ? restoredRiseMs(winner, plan, atMs) : plan.riseMs;
        envelope = {
          ownerKey: key,
          ownerGeneration: winner.generation,
          phase: 'rise',
          riseAt: atMs,
          floorApplied: true,
          dropPercent: plan.dropPercent,
          fallMs: plan.fallMs,
          riseMs: effectiveRiseMs,
          textureStartedAt: winner.cadence.mode === 'texture'
            ? winner.cadence.textureStartedAt : null,
          pendingTexturePhase: null,
          pendingTextureSlot: null,
          pendingTextureTransition: null,
          restoredOwner: restored
        };
        slotEnvelopes[slot.id] = envelope;
        transition = replacementRampSeconds(previous, slot, winnerChanged,
          effectiveRiseMs);
        if (transition !== null) {
          envelope.phase = 'target';
          return {
            slot: slot,
            transition: { rampSeconds: transition },
            token: {
              slotId: slot.id,
              ownerKey: key,
              ownerGeneration: envelope.ownerGeneration,
              phase: 'target'
            }
          };
        }
        if (restored) {
          envelope.phase = 'target';
          return {
            slot: slot,
            transition: { rampSeconds: envelope.riseMs / 1000 },
            token: {
              slotId: slot.id,
              ownerKey: key,
              ownerGeneration: envelope.ownerGeneration,
              phase: 'target'
            }
          };
        }
        if (winner.cadence.mode === 'texture') {
          envelope.phase = 'texture';
        } else if (previous === undefined ||
            (previous.transientWinner === null &&
              previous.value === slot.baselineValue)) {
          return {
            slot: slot,
            transition: { rampSeconds: envelope.riseMs / 1000 },
            token: {
              slotId: slot.id,
              ownerKey: key,
              ownerGeneration: envelope.ownerGeneration,
              phase: 'target'
            }
          };
        } else {
          physical = copySlot(slot);
          physical.value = ns.hapticFloor(slot.baselineValue, slot.value,
            winner.target.baselineBlend, plan.dropPercent);
          physical.frequency = slot.baselineFrequency;
          envelope.phase = 'fall';
          envelope.riseAt = null;
          envelope.floorApplied = false;
          return {
            slot: physical,
            transition: { rampSeconds: envelope.fallMs / 1000 },
            token: {
              slotId: slot.id,
              ownerKey: key,
              ownerGeneration: envelope.ownerGeneration,
              phase: 'fall'
            }
          };
        }
      }

      if (winner !== null && winner.cadence.mode === 'texture' &&
          !(envelope.phase === 'fall' &&
            (!envelope.floorApplied || atMs < envelope.riseAt))) {
        envelope.textureStartedAt = winner.cadence.textureStartedAt;
        if (envelope.pendingTextureSlot !== null) {
          return {
            slot: copySlot(envelope.pendingTextureSlot),
            transition: copyTransition(envelope.pendingTextureTransition),
            token: {
              slotId: slot.id,
              ownerKey: key,
              ownerGeneration: envelope.ownerGeneration,
              phase: envelope.pendingTexturePhase
            }
          };
        }
        targetPhase = ns.textureTargetPhase(winner.cadence, atMs);
        physical = copySlot(slot);
        if (!targetPhase) {
          physical.value = ns.hapticFloor(slot.baselineValue, slot.value,
            winner.target.baselineBlend,
            winner.target.retrigger.minDropPercent);
          physical.frequency = slot.baselineFrequency;
        }
        transition = {
          rampSeconds: (targetPhase
            ? winner.target.retrigger.minRampUpMs
            : winner.target.retrigger.minRampDownMs) / 1000
        };
        envelope.pendingTexturePhase = targetPhase ? 'target' : 'floor';
        envelope.pendingTextureSlot = copySlot(physical);
        envelope.pendingTextureTransition = copyTransition(transition);
        return {
          slot: physical,
          transition: transition,
          token: {
            slotId: slot.id,
            ownerKey: key,
            ownerGeneration: envelope.ownerGeneration,
            phase: envelope.pendingTexturePhase
          }
        };
      }

      if (pending !== undefined && pending.ownerKey === key &&
          pending.ownerGeneration === envelope.ownerGeneration) {
        return {
          slot: copySlot(pending.slot),
          transition: copyTransition(pending.transition),
          token: copyToken(pending.token)
        };
      }
      if (envelope.phase === 'fall' && envelope.floorApplied &&
          atMs >= envelope.riseAt) {
        return {
          slot: slot,
          transition: { rampSeconds: envelope.riseMs / 1000 },
          token: {
            slotId: slot.id,
            ownerKey: key,
            ownerGeneration: envelope.ownerGeneration,
            phase: 'target'
          }
        };
      }
      if (envelope.phase === 'fall') {
        physical = copySlot(slot);
        physical.value = ns.hapticFloor(slot.baselineValue, slot.value,
          winner.target.baselineBlend, envelope.dropPercent);
        physical.frequency = slot.baselineFrequency;
        return {
          slot: physical,
          transition: { rampSeconds: envelope.fallMs / 1000 },
          token: {
            slotId: slot.id,
            ownerKey: key,
            ownerGeneration: envelope.ownerGeneration,
            phase: 'fall'
          }
        };
      }
      return {
        slot: slot,
        transition: { rampSeconds: envelope.riseMs / 1000 },
        token: {
          slotId: slot.id,
          ownerKey: key,
          ownerGeneration: envelope.ownerGeneration,
          phase: 'target'
        }
      };
    }

    function confirmHapticDispatch(token, atMs) {
      var envelope = slotEnvelopes[token.slotId];
      if (envelope !== undefined && envelope.ownerKey === token.ownerKey &&
          envelope.ownerGeneration === token.ownerGeneration) {
        if (envelope.pendingTextureSlot !== null &&
            envelope.pendingTexturePhase === token.phase) {
          envelope.pendingTexturePhase = null;
          envelope.pendingTextureSlot = null;
          envelope.pendingTextureTransition = null;
          envelope.phase = token.phase;
        } else if (token.phase === 'fall' && !envelope.floorApplied) {
          envelope.floorApplied = true;
          envelope.riseAt = atMs + envelope.fallMs;
        } else if (token.phase === 'target') {
          envelope.phase = 'target';
        }
      }
    }

    function retainHapticFailure(prepared) {
      var token = prepared.token;
      var envelope = slotEnvelopes[token.slotId];
      if (envelope !== undefined && envelope.ownerKey === token.ownerKey &&
          envelope.ownerGeneration === token.ownerGeneration &&
          envelope.pendingTextureSlot !== null) {
        return;
      }
      hapticPendingDispatches[token.slotId] = {
        ownerKey: token.ownerKey,
        ownerGeneration: token.ownerGeneration,
        phase: token.phase,
        slot: copySlot(prepared.slot),
        transition: copyTransition(prepared.transition),
        token: copyToken(token)
      };
    }

    function dispatchResult(changedSlots, failures) {
      return { changedSlots: changedSlots, failures: failures };
    }

    function reportFailures(failures) {
      var index;
      var logEntry;
      recentFailures = copyFailures(failures);
      if (typeof outputAdapter.log !== 'function') {
        return;
      }
      for (index = 0; index < failures.length; index += 1) {
        logEntry = copyFailure(failures[index]);
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
      var prepared;
      var transition;
      var applied;
      var changed = 0;
      var failures = [];
      for (index = 0; index < slots.length; index += 1) {
        slot = slots[index];
        if (slot.enabled) {
          if (resyncPendingDispatches[slot.id] !== undefined) {
            prepared = {
              slot: copySlot(resyncPendingDispatches[slot.id].slot),
              transition: copyTransition(resyncPendingDispatches[slot.id].transition),
              token: null,
              resync: true
            };
          } else {
            prepared = prepareHapticSlot(slot, atMs);
          }
          transition = prepared.transition === null
            ? transitionFor(prepared.slot, expiredParts)
            : prepared.transition;
          applied = apply(prepared.slot, transition, prepared.resync === true);
          if (prepared.resync === true && applied.failure === null) {
            delete resyncPendingDispatches[slot.id];
          }
          if (applied.failure === null && prepared.token !== null) {
            delete hapticPendingDispatches[slot.id];
            confirmHapticDispatch(prepared.token, atMs);
          } else if (applied.failure !== null && prepared.token !== null) {
            retainHapticFailure(prepared);
          }
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
          dispatchFailures: copyFailures(recentFailures)
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
        dispatchFailures: copyFailures(dispatched.failures)
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
      slotEnvelopes = {};
      hapticPendingDispatches = {};
      resyncPendingDispatches = {};
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

    runtime.hapticSnapshot = function () {
      var logical = engine.hapticSnapshot();
      return {
        cadenceRecords: copy(logical.cadenceRecords),
        partOwners: copy(logical.partOwners),
        slotEnvelopes: copy(slotEnvelopes)
      };
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
      var atMs = now();
      var slots = ns.computeSlots(engine.readState(), normalizedConfig, atMs);
      var index;
      var slot;
      var pending;
      var physical;
      var transition;
      for (index = 0; index < slots.length; index += 1) {
        slot = slots[index];
        if (slot.enabled && resyncPendingDispatches[slot.id] === undefined) {
          pending = pendingDispatches[slot.id];
          if (pending !== undefined) {
            physical = copySlot(pending.slot);
            transition = copyTransition(pending.transition);
          } else if (lastSlots[slot.id] !== undefined) {
            physical = copySlot(lastSlots[slot.id]);
            transition = {
              rampSeconds: lastTuples[slot.id] === undefined
                ? 0 : lastTuples[slot.id].rampSeconds
            };
          } else {
            physical = copySlot(slot);
            transition = { rampSeconds: 0 };
          }
          resyncPendingDispatches[slot.id] = {
            slot: physical,
            transition: transition
          };
        }
      }
      return runtime.tick();
    };

    return runtime;
  };
}(XTHB));
