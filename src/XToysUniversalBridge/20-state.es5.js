(function (ns) {
  var hasOwn = Object.prototype.hasOwnProperty;

  function eventKey(source, eventId) {
    return ns.compositeKey([source, eventId]);
  }

  function baselineKey(source, part) {
    return ns.compositeKey([source, part]);
  }

  function sourceKey(source) {
    return ns.compositeKey([source]);
  }

  function copy(value) {
    return ns.copyObject(value);
  }

  function addPart(parts, part) {
    if (parts.indexOf(part) === -1) {
      parts.push(part);
    }
  }

  function addEntryParts(parts, entries) {
    var index;
    for (index = 0; index < entries.length; index += 1) {
      addPart(parts, entries[index].target.part);
    }
  }

  function targetParts(targets) {
    var index;
    var parts = [];
    for (index = 0; index < targets.length; index += 1) {
      addPart(parts, targets[index].part);
    }
    return parts;
  }

  function snapshot(baseline, events, generation) {
    return {
      baseline: copy(baseline),
      events: copy(events),
      generation: generation
    };
  }

  ns.createStateEngine = function () {
    var baseline = {};
    var events = {};
    var baselineSequences = {};
    var generation = 0;
    var engine = {};

    function publish(nextBaseline, nextEvents, nextBaselineSequences, nextGeneration) {
      baseline = nextBaseline;
      events = nextEvents;
      baselineSequences = nextBaselineSequences;
      generation = nextGeneration;
      engine.baseline = baseline;
      engine.events = events;
    }

    function result(changed, parts, nextBaseline, nextEvents, nextGeneration, ignoredReason) {
      return {
        changed: changed,
        changedParts: parts,
        snapshot: snapshot(nextBaseline, nextEvents, nextGeneration),
        ignoredReason: ignoredReason || null,
        rejected: null
      };
    }

    function capacityResult(detail) {
      return {
        changed: false,
        changedParts: [],
        snapshot: snapshot(baseline, events, generation),
        ignoredReason: null,
        rejected: {
          code: 'state_capacity_exceeded',
          detail: detail
        }
      };
    }

    function hasActiveEntry(entries, nowMs) {
      var index;
      for (index = 0; index < entries.length; index += 1) {
        if (entries[index].expiresAt > nowMs) {
          return true;
        }
      }
      return false;
    }

    function completeEvent(message, nowMs, nextGeneration) {
      var index;
      var entries = [];
      for (index = 0; index < message.targets.length; index += 1) {
        entries.push({
          source: message.source,
          eventId: message.eventId,
          sequence: message.sequence,
          acceptedAt: nowMs,
          expiresAt: nowMs + message.targets[index].durationMs,
          generation: nextGeneration,
          target: copy(message.targets[index])
        });
      }
      return entries;
    }

    function activeEventCounts(candidateEvents, nowMs) {
      var key;
      var entries;
      var index;
      var activeTargets;
      var eventCount = 0;
      var targetCount = 0;
      for (key in candidateEvents) {
        if (hasOwn.call(candidateEvents, key)) {
          entries = candidateEvents[key];
          activeTargets = 0;
          for (index = 0; index < entries.length; index += 1) {
            if (entries[index].expiresAt > nowMs) {
              activeTargets += 1;
            }
          }
          if (activeTargets > 0) {
            eventCount += 1;
            targetCount += activeTargets;
          }
        }
      }
      return { events: eventCount, targets: targetCount };
    }

    function ownKeyCount(value) {
      var key;
      var count = 0;
      for (key in value) {
        if (hasOwn.call(value, key)) {
          count += 1;
        }
      }
      return count;
    }

    function applyEvent(message, nowMs, dryRun) {
      var key = eventKey(message.source, message.eventId);
      var current = events[key];
      var nextEvents;
      var nextEntries;
      var counts;
      var parts = [];
      var nextGeneration;

      if (message.command === 'update' &&
          (!hasOwn.call(events, key) || !hasActiveEntry(current, nowMs))) {
        return result(false, [], baseline, events, generation, 'absent_event');
      }
      if (hasOwn.call(events, key) && message.sequence <= current[0].sequence) {
        return result(false, [], baseline, events, generation);
      }
      nextEvents = copy(events);
      nextGeneration = generation + 1;
      if (hasOwn.call(nextEvents, key)) {
        addEntryParts(parts, nextEvents[key]);
      }
      nextEntries = completeEvent(message, nowMs, nextGeneration);
      addEntryParts(parts, nextEntries);
      nextEvents[key] = nextEntries;
      counts = activeEventCounts(nextEvents, nowMs);
      if (counts.events > ns.MAX_ACTIVE_EVENTS) {
        return capacityResult('Active event identity limit exceeded.');
      }
      if (counts.targets > ns.MAX_ACTIVE_EVENT_TARGETS) {
        return capacityResult('Active event target limit exceeded.');
      }
      if (!dryRun) {
        publish(baseline, nextEvents, baselineSequences, nextGeneration);
      }
      return result(true, parts, baseline, nextEvents, nextGeneration);
    }

    function applyStop(message, dryRun) {
      var key;
      var nextEvents = copy(events);
      var parts = [];
      var requestedParts = targetParts(message.targets);
      var eventEntries;
      var keptEntries;
      var index;
      var eventSource;
      var changed = false;
      var nextGeneration;

      if (message.eventId !== null) {
        key = eventKey(message.source, message.eventId);
        if (hasOwn.call(nextEvents, key)) {
          eventEntries = nextEvents[key];
          if (requestedParts.length === 0) {
            addEntryParts(parts, eventEntries);
            delete nextEvents[key];
            changed = true;
          } else {
            keptEntries = [];
            for (index = 0; index < eventEntries.length; index += 1) {
              if (requestedParts.indexOf(eventEntries[index].target.part) !== -1) {
                addPart(parts, eventEntries[index].target.part);
                changed = true;
              } else {
                keptEntries.push(eventEntries[index]);
              }
            }
            if (keptEntries.length === 0) {
              delete nextEvents[key];
            } else {
              nextEvents[key] = keptEntries;
            }
          }
        }
      } else {
        for (key in nextEvents) {
          if (hasOwn.call(nextEvents, key)) {
            eventEntries = nextEvents[key];
            eventSource = eventEntries[0].source;
            if (eventSource === message.source) {
              keptEntries = [];
              for (index = 0; index < eventEntries.length; index += 1) {
                if (requestedParts.indexOf(eventEntries[index].target.part) !== -1) {
                  addPart(parts, eventEntries[index].target.part);
                  changed = true;
                } else {
                  keptEntries.push(eventEntries[index]);
                }
              }
              if (keptEntries.length === 0) {
                delete nextEvents[key];
              } else {
                nextEvents[key] = keptEntries;
              }
            }
          }
        }
      }
      nextGeneration = changed ? generation + 1 : generation;
      if (changed && !dryRun) {
        publish(baseline, nextEvents, baselineSequences, nextGeneration);
      }
      return result(changed, parts, baseline, nextEvents, nextGeneration);
    }

    function applyBaseline(message, dryRun) {
      var sequenceKey = sourceKey(message.source);
      var currentSequence = baselineSequences[sequenceKey];
      var nextBaseline;
      var nextSequences;
      var key;
      var index;
      var parts = [];
      var changed = false;
      var nextGeneration;

      if (hasOwn.call(baselineSequences, sequenceKey) && message.sequence <= currentSequence) {
        return result(false, [], baseline, events, generation);
      }
      nextBaseline = copy(baseline);
      nextSequences = copy(baselineSequences);
      for (key in nextBaseline) {
        if (hasOwn.call(nextBaseline, key) && nextBaseline[key].source === message.source) {
          addPart(parts, nextBaseline[key].target.part);
          delete nextBaseline[key];
          changed = true;
        }
      }
      for (index = 0; index < message.targets.length; index += 1) {
        key = baselineKey(message.source, message.targets[index].part);
        nextBaseline[key] = {
          source: message.source,
          sequence: message.sequence,
          target: copy(message.targets[index])
        };
        addPart(parts, message.targets[index].part);
        changed = true;
      }
      nextSequences[sequenceKey] = message.sequence;
      if (ownKeyCount(nextSequences) > ns.MAX_BASELINE_SOURCES) {
        return capacityResult('Baseline source limit exceeded.');
      }
      if (ownKeyCount(nextBaseline) > ns.MAX_BASELINE_TARGETS) {
        return capacityResult('Baseline target limit exceeded.');
      }
      nextGeneration = changed ? generation + 1 : generation;
      if (!dryRun) {
        publish(nextBaseline, events, nextSequences, nextGeneration);
      }
      return result(changed, parts, nextBaseline, events, nextGeneration);
    }

    function applyTest(message, nowMs) {
      var nextEvents = copy(events);
      var nextGeneration = generation;
      var entries = [];
      var index;
      if (message.targets.length > 0) {
        nextGeneration += 1;
        for (index = 0; index < message.targets.length; index += 1) {
          entries.push({
            source: message.source,
            eventId: null,
            sequence: message.sequence,
            acceptedAt: nowMs,
            expiresAt: nowMs + message.targets[index].durationMs,
            generation: nextGeneration,
            target: copy(message.targets[index])
          });
        }
        nextEvents[ns.compositeKey(['preview', message.source, nextGeneration])] = entries;
      }
      return result(false, targetParts(message.targets), baseline, nextEvents, nextGeneration);
    }

    engine.baseline = baseline;
    engine.events = events;
    engine.snapshot = function () {
      return snapshot(baseline, events, generation);
    };
    engine.clearAll = function (dryRun) {
      var nextGeneration = generation + 1;
      var parts = [];
      var key;
      for (key in baseline) {
        if (hasOwn.call(baseline, key)) {
          addPart(parts, baseline[key].target.part);
        }
      }
      for (key in events) {
        if (hasOwn.call(events, key)) {
          addEntryParts(parts, events[key]);
        }
      }
      if (!dryRun) {
        publish({}, {}, baselineSequences, nextGeneration);
      }
      return result(true, parts, {}, {}, nextGeneration);
    };
    engine.applyMessage = function (message, nowMs, dryRun) {
      if (message.command === 'play' || message.command === 'update') {
        return applyEvent(message, nowMs, dryRun === true);
      }
      if (message.command === 'stop') {
        return applyStop(message, dryRun === true);
      }
      if (message.command === 'set_baseline') {
        return applyBaseline(message, dryRun === true);
      }
      if (message.command === 'stop_all') {
        return engine.clearAll(dryRun === true);
      }
      if (message.command === 'test') {
        return applyTest(message, nowMs);
      }
      return result(false, [], baseline, events, generation);
    };
    engine.expire = function (nowMs, dryRun) {
      var nextEvents = copy(events);
      var key;
      var index;
      var entries;
      var keptEntries;
      var parts = [];
      var changed = false;
      var nextGeneration;
      for (key in nextEvents) {
        if (hasOwn.call(nextEvents, key)) {
          entries = nextEvents[key];
          keptEntries = [];
          for (index = 0; index < entries.length; index += 1) {
            if (entries[index].expiresAt <= nowMs) {
              addPart(parts, entries[index].target.part);
              changed = true;
            } else {
              keptEntries.push(entries[index]);
            }
          }
          if (keptEntries.length === 0) {
            delete nextEvents[key];
          } else {
            nextEvents[key] = keptEntries;
          }
        }
      }
      nextGeneration = changed ? generation + 1 : generation;
      if (changed && dryRun !== true) {
        publish(baseline, nextEvents, baselineSequences, nextGeneration);
      }
      return result(changed, parts, baseline, nextEvents, nextGeneration);
    };
    return engine;
  };
}(XTHB));
