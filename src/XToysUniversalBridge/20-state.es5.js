(function (ns) {
  var hasOwn = Object.prototype.hasOwnProperty;
  var separator = '\u001f';

  function eventKey(source, eventId) {
    return source + separator + eventId;
  }

  function baselineKey(source, part) {
    return source + separator + part;
  }

  function sourceKey(source) {
    return separator + source;
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

    function result(changed, parts, nextBaseline, nextEvents, nextGeneration) {
      return {
        changed: changed,
        changedParts: parts,
        snapshot: snapshot(nextBaseline, nextEvents, nextGeneration)
      };
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

    function applyEvent(message, nowMs, dryRun) {
      var key = eventKey(message.source, message.eventId);
      var current = events[key];
      var nextEvents;
      var parts = [];
      var nextGeneration;

      if (hasOwn.call(events, key) && message.sequence <= current[0].sequence) {
        return result(false, [], baseline, events, generation);
      }
      nextEvents = copy(events);
      nextGeneration = generation + 1;
      if (hasOwn.call(nextEvents, key)) {
        addEntryParts(parts, nextEvents[key]);
      }
      addEntryParts(parts, completeEvent(message, nowMs, nextGeneration));
      nextEvents[key] = completeEvent(message, nowMs, nextGeneration);
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
      nextGeneration = changed ? generation + 1 : generation;
      if (!dryRun) {
        publish(nextBaseline, events, nextSequences, nextGeneration);
      }
      return result(changed, parts, nextBaseline, events, nextGeneration);
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
        return result(false, targetParts(message.targets), baseline, events, generation);
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
