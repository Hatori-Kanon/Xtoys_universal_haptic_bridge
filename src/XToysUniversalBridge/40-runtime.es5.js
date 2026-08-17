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
      rampSeconds: tuple.rampSeconds
    };
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
      direction: slot.direction
    };
  }

  function normalizedDirection(value) {
    return value === undefined ? null : value;
  }

  function coreTuple(slot) {
    return {
      value: slot.value,
      frequency: slot.frequency,
      direction: normalizedDirection(slot.direction)
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
    var slotEnvelopes = {};
    var runtime = {};

    if (!validation.ok) {
      throw new Error(validation.code + ': ' + validation.detail);
    }
    if (typeof outputAdapter.applySlot !== 'function') {
      throw new Error('Runtime adapter must provide applySlot.');
    }
    normalizedConfig = validation.config;
    engine = ns.createStateEngine();

    function reportCallError(slotId, error) {
      if (typeof outputAdapter.log !== 'function') {
        return;
      }
      try {
        outputAdapter.log({
          type: 'xtoys_call_error',
          slotId: slotId,
          detail: error && error.message !== undefined ? String(error.message) : String(error)
        });
      } catch (ignored) {
        /* Logging cannot block another output slot. */
      }
    }

    function apply(slot, transition, force) {
      var tuple = coreTuple(slot);
      tuple.rampSeconds = transition.rampSeconds;
      if (!force && sameTuple(lastTuples[slot.id], tuple)) {
        lastSlots[slot.id] = copySlot(slot);
        return { changed: false, completed: true };
      }
      try {
        outputAdapter.applySlot(actuatorSlot(slot), copyTransition(transition));
      } catch (error) {
        reportCallError(slot.id, error);
        return { changed: false, completed: false };
      }
      lastTuples[slot.id] = copyTuple(tuple);
      lastSlots[slot.id] = copySlot(slot);
      return { changed: true, completed: true };
    }

    function transitionFor(slot, expiredParts) {
      var previous = lastSlots[slot.id];
      var winnerChanged = resolvedWinnerKey(previous) !== resolvedWinnerKey(slot);
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
        return { slot: slot, transition: null, token: null };
      }

      if (envelope === undefined || envelope.ownerKey !== key) {
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
        return {
          slot: physical,
          transition: transition,
          token: {
            slotId: slot.id,
            ownerKey: key,
            ownerGeneration: envelope.ownerGeneration,
            phase: targetPhase ? 'target' : 'floor'
          }
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

    function completeHapticPhase(token, atMs) {
      var envelope = slotEnvelopes[token.slotId];
      if (envelope !== undefined && envelope.ownerKey === token.ownerKey &&
          envelope.ownerGeneration === token.ownerGeneration) {
        if (token.phase === 'fall' && !envelope.floorApplied) {
          envelope.floorApplied = true;
          envelope.riseAt = atMs + envelope.fallMs;
        } else if (token.phase === 'target' || token.phase === 'floor') {
          envelope.phase = token.phase;
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
      for (index = 0; index < slots.length; index += 1) {
        slot = slots[index];
        if (slot.enabled) {
          prepared = prepareHapticSlot(slot, atMs);
          transition = prepared.transition === null
            ? transitionFor(prepared.slot, expiredParts)
            : prepared.transition;
          applied = apply(prepared.slot, transition, false);
          if (applied.completed && prepared.token !== null) {
            completeHapticPhase(prepared.token, atMs);
          }
          if (applied.changed) {
            changed += 1;
          }
        }
      }
      return { changedSlots: changed };
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
          changedSlots: stopped
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
          changedSlots: 0
        };
      }
      dispatched = dispatch(atMs, expired.changedParts);
      return {
        ok: true,
        changed: applied.changed || expired.changed,
        changedSlots: dispatched.changedSlots
      };
    };

    runtime.tick = function () {
      var atMs = now();
      var expired = engine.expire(atMs, false);
      var dispatched = dispatch(atMs, expired.changedParts);
      return dispatched.changedSlots;
    };

    runtime.stopAll = function () {
      var atMs = now();
      var slots;
      var slot;
      var index;
      var applied;
      var changed = 0;
      slotEnvelopes = {};
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
        }
      }
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

    runtime.invalidateSlot = function (slotId) {
      if (typeof slotId !== 'number' || !isFinite(slotId) || slotId % 1 !== 0 || slotId < 1 || slotId > 16) {
        throw new Error('Runtime slot ID must be an integer from 1 through 16.');
      }
      delete lastTuples[slotId];
    };

    return runtime;
  };
}(XTHB));
