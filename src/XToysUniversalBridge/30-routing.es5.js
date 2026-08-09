(function (ns) {
  var hasOwn = Object.prototype.hasOwnProperty;

  function ownValues(object) {
    var key;
    var values = [];
    for (key in object) {
      if (hasOwn.call(object, key)) {
        values.push(object[key]);
      }
    }
    return values;
  }

  function targetValue(target, type) {
    if (type === 'rotation') {
      return target.rotateSpeed;
    }
    return target.intensity;
  }

  function hasActuator(target, type) {
    if (type === 'rotation' && target.hasRotateSpeed === false) {
      return false;
    }
    if (type === 'intensity' && target.hasIntensity === false) {
      return false;
    }
    return typeof targetValue(target, type) === 'number' && isFinite(targetValue(target, type));
  }

  function expandedParts(target, groups) {
    var parts = [];
    var leaf;
    if (hasOwn.call(groups, target.part)) {
      for (leaf in groups[target.part]) {
        if (hasOwn.call(groups[target.part], leaf)) {
          parts.push({ part: leaf, weight: groups[target.part][leaf] });
        }
      }
      return parts;
    }
    parts.push({ part: target.part, weight: 1 });
    return parts;
  }

  function contributionIdentity(entry, kind, leafPart) {
    var eventId = entry.eventId === undefined || entry.eventId === null ? '' : entry.eventId;
    return kind + '\u001f' + (entry.source || '') + '\u001f' + eventId + '\u001f' +
      entry.target.part + '\u001f' + leafPart;
  }

  function candidate(entry, type, routeWeight, groupWeight, multiplier, identity) {
    var raw = targetValue(entry.target, type);
    return {
      entry: entry,
      effectiveValue: ns.clamp(raw * groupWeight * routeWeight * multiplier, 0, 100),
      identity: identity
    };
  }

  function betterBaseline(next, current) {
    if (current === null || next.effectiveValue > current.effectiveValue) {
      return true;
    }
    return next.effectiveValue === current.effectiveValue && next.identity < current.identity;
  }

  function newerTransient(next, current) {
    var nextTarget = next.entry.target;
    var currentTarget;
    if (current === null) {
      return true;
    }
    currentTarget = current.entry.target;
    if (nextTarget.priority !== currentTarget.priority) {
      return nextTarget.priority > currentTarget.priority;
    }
    if (next.effectiveValue !== current.effectiveValue) {
      return next.effectiveValue > current.effectiveValue;
    }
    if (next.entry.sequence !== current.entry.sequence) {
      return next.entry.sequence > current.entry.sequence;
    }
    if (next.entry.acceptedAt !== current.entry.acceptedAt) {
      return next.entry.acceptedAt > current.entry.acceptedAt;
    }
    if (next.entry.generation !== current.entry.generation) {
      return next.entry.generation > current.entry.generation;
    }
    return next.identity < current.identity;
  }

  function pulseIsOn(entry, nowMs) {
    var target = entry.target;
    var elapsed;
    var period;
    if (target.effect !== 'pulse') {
      return true;
    }
    if (target.pulseOnMs <= 0) {
      return false;
    }
    if (target.pulseOffMs <= 0) {
      return true;
    }
    elapsed = nowMs - entry.acceptedAt;
    if (elapsed < 0) {
      return true;
    }
    period = target.pulseOnMs + target.pulseOffMs;
    return elapsed % period < target.pulseOnMs;
  }

  function winnerMetadata(winner) {
    if (winner === null) {
      return null;
    }
    return ns.copyObject(winner.entry);
  }

  function outputForSlot(slot, snapshot, nowMs) {
    var baselineWinner = null;
    var transientWinner = null;
    var baselineEntries = ownValues(snapshot.baseline || {});
    var eventLists = ownValues(snapshot.events || {});
    var listIndex;
    var entryIndex;
    var entries;
    var entry;
    var expanded;
    var partIndex;
    var part;
    var routeWeight;
    var next;
    var activeTransient;
    var selected;
    var value = 0;
    var direction = null;
    var frequency = 0;
    var rampUpMs = 0;
    var rampDownMs = 0;
    var pulseOnMs = 0;
    var pulseOffMs = 0;

    if (slot.enabled) {
      for (entryIndex = 0; entryIndex < baselineEntries.length; entryIndex += 1) {
        entry = baselineEntries[entryIndex];
        if (hasActuator(entry.target, slot.type)) {
          expanded = expandedParts(entry.target, snapshot.config.groups);
          for (partIndex = 0; partIndex < expanded.length; partIndex += 1) {
            part = expanded[partIndex];
            routeWeight = slot.routes[part.part];
            if (routeWeight !== undefined) {
              next = candidate(entry, slot.type, routeWeight, part.weight, snapshot.config.globalMultiplier,
                contributionIdentity(entry, 'baseline', part.part));
              if (betterBaseline(next, baselineWinner)) {
                baselineWinner = next;
              }
            }
          }
        }
      }
      for (listIndex = 0; listIndex < eventLists.length; listIndex += 1) {
        entries = eventLists[listIndex];
        for (entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
          entry = entries[entryIndex];
          if (hasActuator(entry.target, slot.type)) {
            expanded = expandedParts(entry.target, snapshot.config.groups);
            for (partIndex = 0; partIndex < expanded.length; partIndex += 1) {
              part = expanded[partIndex];
              routeWeight = slot.routes[part.part];
              if (routeWeight !== undefined) {
                next = candidate(entry, slot.type, routeWeight, part.weight, snapshot.config.globalMultiplier,
                  contributionIdentity(entry, 'transient', part.part));
                if (newerTransient(next, transientWinner)) {
                  transientWinner = next;
                }
              }
            }
          }
        }
      }
    }

    activeTransient = transientWinner !== null && pulseIsOn(transientWinner.entry, nowMs);
    if (baselineWinner !== null && activeTransient) {
      value = ns.mixValue(baselineWinner.effectiveValue, transientWinner.effectiveValue,
        transientWinner.entry.target.baselineBlend);
      selected = transientWinner.entry.target;
    } else if (activeTransient) {
      value = transientWinner.effectiveValue;
      selected = transientWinner.entry.target;
    } else if (baselineWinner !== null) {
      value = baselineWinner.effectiveValue;
      selected = baselineWinner.entry.target;
    } else {
      selected = null;
    }
    if (selected !== null) {
      if (slot.frequencyEnabled) {
        frequency = selected.frequency;
      }
      if (slot.type === 'rotation') {
        direction = selected.rotateDirection;
      }
      rampUpMs = selected.rampUpMs;
      rampDownMs = selected.rampDownMs;
      pulseOnMs = selected.pulseOnMs;
      pulseOffMs = selected.pulseOffMs;
    }

    return {
      id: slot.id,
      enabled: slot.enabled,
      type: slot.type,
      value: value,
      frequency: frequency,
      direction: direction,
      rampUpMs: rampUpMs,
      rampDownMs: rampDownMs,
      pulseOnMs: pulseOnMs,
      pulseOffMs: pulseOffMs,
      baselineWinner: winnerMetadata(baselineWinner),
      transientWinner: winnerMetadata(transientWinner),
      generation: snapshot.generation
    };
  }

  ns.mixValue = function (baselineValue, transientValue, blend) {
    var value;
    if (blend === 'boost') {
      value = baselineValue + transientValue * (100 - baselineValue) / 100;
    } else if (blend === 'max') {
      value = Math.max(baselineValue, transientValue);
    } else {
      value = transientValue;
    }
    return ns.clamp(value, 0, 100);
  };

  ns.computeSlots = function (state, config, nowMs) {
    var index;
    var slots = [];
    var snapshot = {
      baseline: state.baseline || {},
      events: state.events || {},
      generation: state.generation,
      config: config
    };
    for (index = 0; index < config.slots.length; index += 1) {
      slots.push(outputForSlot(config.slots[index], snapshot, nowMs));
    }
    return slots;
  };
}(XTHB));
