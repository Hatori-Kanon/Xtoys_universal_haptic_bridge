(function (ns) {
  var hasOwn = Object.prototype.hasOwnProperty;

  function eventKey(source, eventId) {
    return ns.compositeKey([source, eventId]);
  }

  function baselineKey(source, part) {
    return ns.compositeKey([source, part]);
  }

  function partKey(source, part) {
    return ns.compositeKey([source, part]);
  }

  function sourceKey(source) {
    return ns.compositeKey([source]);
  }

  function copy(value) {
    return ns.copyObject(value);
  }

  function copyOwnMap(value) {
    var key;
    var copied = {};
    for (key in value) {
      if (hasOwn.call(value, key)) {
        copied[key] = value[key];
      }
    }
    return copied;
  }

  function copyTarget(target) {
    var key;
    var copied = {};
    for (key in target) {
      if (hasOwn.call(target, key)) {
        copied[key] = target[key];
      }
    }
    if (copied.retrigger !== null && copied.retrigger !== undefined) {
      copied.retrigger = copyOwnMap(copied.retrigger);
    }
    return copied;
  }

  function copyOwner(owner) {
    return {
      eventKeys: copyOwnMap(owner.eventKeys),
      adaptiveEventKey: owner.adaptiveEventKey,
      adaptiveGeneration: owner.adaptiveGeneration
    };
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

  function createEventEntries(message, nowMs, nextGeneration) {
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
        target: copyTarget(message.targets[index]),
        cadence: null
      });
    }
    return entries;
  }

  function createBaselineEntry(message, target) {
    return {
      source: message.source,
      sequence: message.sequence,
      target: copyTarget(target)
    };
  }

  ns.createStateEngine = function () {
    var baseline = {};
    var events = {};
    var baselineSequences = {};
    var cadenceRecords = {};
    var partOwners = {};
    var generation = 0;
    var engine = {};

    function publish(nextBaseline, nextEvents, nextBaselineSequences,
        nextCadenceRecords, nextPartOwners, nextGeneration) {
      baseline = nextBaseline;
      events = nextEvents;
      baselineSequences = nextBaselineSequences;
      cadenceRecords = nextCadenceRecords;
      partOwners = nextPartOwners;
      generation = nextGeneration;
      engine.baseline = baseline;
      engine.events = events;
    }

    function result(changed, parts, nextBaseline, nextEvents, nextGeneration, ignoredReason, includeSnapshot) {
      var value = {
        changed: changed,
        changedParts: parts,
        ignoredReason: ignoredReason || null,
        rejected: null
      };
      if (includeSnapshot) {
        value.snapshot = snapshot(nextBaseline, nextEvents, nextGeneration);
      }
      return value;
    }

    function capacityResult(detail, includeSnapshot) {
      var value = {
        changed: false,
        changedParts: [],
        ignoredReason: null,
        rejected: {
          code: 'state_capacity_exceeded',
          detail: detail
        }
      };
      if (includeSnapshot) {
        value.snapshot = snapshot(baseline, events, generation);
      }
      return value;
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

    function ownerForWrite(candidateOwners, copiedOwners, key) {
      if (!hasOwn.call(candidateOwners, key)) {
        candidateOwners[key] = {
          eventKeys: {},
          adaptiveEventKey: null,
          adaptiveGeneration: null
        };
        copiedOwners[key] = true;
      } else if (!hasOwn.call(copiedOwners, key)) {
        candidateOwners[key] = copyOwner(candidateOwners[key]);
        copiedOwners[key] = true;
      }
      return candidateOwners[key];
    }

    function hasPartEntry(entries, source, part, adaptiveOnly) {
      var index;
      for (index = 0; index < entries.length; index += 1) {
        if (entries[index].source === source && entries[index].target.part === part &&
            (!adaptiveOnly || entries[index].target.retrigger !== null)) {
          return true;
        }
      }
      return false;
    }

    function removeEntryOwnership(candidateOwners, copiedOwners, key,
        removedEntries, keptEntries) {
      var index;
      var entry;
      var keyForPart;
      var owner;
      var seen = {};
      var seenKey;
      for (index = 0; index < removedEntries.length; index += 1) {
        entry = removedEntries[index];
        keyForPart = partKey(entry.source, entry.target.part);
        seenKey = ns.compositeKey([
          entry.source, entry.target.part, entry.generation
        ]);
        if (hasOwn.call(seen, seenKey)) {
          continue;
        }
        seen[seenKey] = true;
        if (!hasOwn.call(candidateOwners, keyForPart)) {
          continue;
        }
        owner = candidateOwners[keyForPart];
        if (owner.eventKeys[key] === entry.generation &&
            !hasPartEntry(keptEntries, entry.source, entry.target.part, false)) {
          owner = ownerForWrite(candidateOwners, copiedOwners, keyForPart);
          delete owner.eventKeys[key];
        }
        if (owner.adaptiveEventKey === key &&
            owner.adaptiveGeneration === entry.generation &&
            !hasPartEntry(keptEntries, entry.source, entry.target.part, true)) {
          owner = ownerForWrite(candidateOwners, copiedOwners, keyForPart);
          owner.adaptiveEventKey = null;
          owner.adaptiveGeneration = null;
        }
        if (ownKeyCount(owner.eventKeys) === 0) {
          delete candidateOwners[keyForPart];
          delete copiedOwners[keyForPart];
        }
      }
    }

    function addEntryOwnership(candidateOwners, copiedOwners, key, entry) {
      var keyForPart = partKey(entry.source, entry.target.part);
      var owner = ownerForWrite(candidateOwners, copiedOwners, keyForPart);
      owner.eventKeys[key] = entry.generation;
      if (entry.target.retrigger !== null) {
        owner.adaptiveEventKey = key;
        owner.adaptiveGeneration = entry.generation;
      }
    }

    function supersedePart(candidateEvents, candidateOwners, copiedOwners,
        source, part, incomingKey, parts) {
      var keyForPart = partKey(source, part);
      var owner = candidateOwners[keyForPart];
      var ownedEventKey;
      var entries;
      var keptEntries;
      var removedEntries;
      var index;
      if (owner === undefined) {
        return;
      }
      for (ownedEventKey in owner.eventKeys) {
        if (hasOwn.call(owner.eventKeys, ownedEventKey) &&
            ownedEventKey !== incomingKey &&
            hasOwn.call(candidateEvents, ownedEventKey)) {
          entries = candidateEvents[ownedEventKey];
          keptEntries = [];
          removedEntries = [];
          for (index = 0; index < entries.length; index += 1) {
            if (entries[index].source === source &&
                entries[index].target.part === part) {
              removedEntries.push(entries[index]);
            } else {
              keptEntries.push(entries[index]);
            }
          }
          if (removedEntries.length > 0) {
            addPart(parts, part);
            if (keptEntries.length === 0) {
              delete candidateEvents[ownedEventKey];
            } else {
              candidateEvents[ownedEventKey] = keptEntries;
            }
            removeEntryOwnership(candidateOwners, copiedOwners, ownedEventKey,
              removedEntries, keptEntries);
          }
        }
      }
    }

    function pruneExpiredOwner(candidateEvents, candidateOwners, copiedOwners,
        ownerKey, nowMs, parts) {
      var owner = candidateOwners[ownerKey];
      var ownedEventKey;
      var entries;
      var keptEntries;
      var removedEntries;
      var index;
      if (owner === undefined) {
        return;
      }
      for (ownedEventKey in owner.eventKeys) {
        if (hasOwn.call(owner.eventKeys, ownedEventKey) &&
            hasOwn.call(candidateEvents, ownedEventKey)) {
          entries = candidateEvents[ownedEventKey];
          keptEntries = [];
          removedEntries = [];
          for (index = 0; index < entries.length; index += 1) {
            if (partKey(entries[index].source, entries[index].target.part) === ownerKey &&
                entries[index].expiresAt <= nowMs) {
              removedEntries.push(entries[index]);
            } else {
              keptEntries.push(entries[index]);
            }
          }
          if (removedEntries.length > 0) {
            addEntryParts(parts, removedEntries);
            if (keptEntries.length === 0) {
              delete candidateEvents[ownedEventKey];
            } else {
              candidateEvents[ownedEventKey] = keptEntries;
            }
            removeEntryOwnership(candidateOwners, copiedOwners, ownedEventKey,
              removedEntries, keptEntries);
          }
        }
      }
    }

    function pruneExpiredEntries(candidateEvents, candidateOwners, copiedOwners,
        nowMs, parts) {
      var ownerKey;
      var ownerKeys = [];
      var index;
      for (ownerKey in candidateOwners) {
        if (hasOwn.call(candidateOwners, ownerKey)) {
          ownerKeys.push(ownerKey);
        }
      }
      for (index = 0; index < ownerKeys.length; index += 1) {
        pruneExpiredOwner(candidateEvents, candidateOwners, copiedOwners,
          ownerKeys[index], nowMs, parts);
      }
    }

    function cleanQuietCadence(records, nowMs) {
      var key;
      var record;
      var nextRecords = records;
      var copied = false;
      for (key in records) {
        if (hasOwn.call(records, key)) {
          record = records[key];
          if (nowMs - record.lastAttackAt >= record.quietResetMs) {
            if (!copied) {
              nextRecords = copyOwnMap(records);
              copied = true;
            }
            delete nextRecords[key];
          }
        }
      }
      return nextRecords;
    }

    function oldestInactiveCadenceKey(records, owners) {
      var key;
      var owner;
      var oldestKey = null;
      var oldestAt = null;
      for (key in records) {
        if (hasOwn.call(records, key)) {
          owner = owners[key];
          if (owner === undefined || owner.adaptiveEventKey === null) {
            if (oldestKey === null || records[key].lastAttackAt < oldestAt ||
                (records[key].lastAttackAt === oldestAt && key < oldestKey)) {
              oldestKey = key;
              oldestAt = records[key].lastAttackAt;
            }
          }
        }
      }
      return oldestKey;
    }

    function applyEvent(message, nowMs, dryRun) {
      var key = eventKey(message.source, message.eventId);
      var current = events[key];
      var nextEvents;
      var nextEntries;
      var nextCadenceRecords;
      var nextPartOwners;
      var copiedOwners = {};
      var cadenceCopied;
      var keyForPart;
      var previousCadence;
      var nextCadence;
      var evictionKey;
      var counts;
      var parts = [];
      var nextGeneration;
      var index;

      if (message.command === 'update' &&
          (!hasOwn.call(events, key) || !hasActiveEntry(current, nowMs))) {
        return result(false, [], baseline, events, generation, 'absent_event', dryRun);
      }
      if (hasOwn.call(events, key) && message.sequence <= current[0].sequence) {
        return result(false, [], baseline, events, generation, null, dryRun);
      }
      nextGeneration = generation + 1;
      nextEntries = createEventEntries(message, nowMs, nextGeneration);
      nextEvents = copyOwnMap(events);
      nextPartOwners = copyOwnMap(partOwners);
      pruneExpiredEntries(nextEvents, nextPartOwners, copiedOwners,
        nowMs, parts);
      nextCadenceRecords = cleanQuietCadence(
        cadenceRecords, nowMs
      );
      cadenceCopied = nextCadenceRecords !== cadenceRecords;
      if (hasOwn.call(events, key)) {
        addEntryParts(parts, events[key]);
        delete nextEvents[key];
        removeEntryOwnership(nextPartOwners, copiedOwners, key,
          events[key], []);
      }
      addEntryParts(parts, nextEntries);

      for (index = 0; index < nextEntries.length; index += 1) {
        if (nextEntries[index].target.retrigger !== null) {
          keyForPart = partKey(message.source, nextEntries[index].target.part);
          supersedePart(nextEvents, nextPartOwners, copiedOwners,
            message.source, nextEntries[index].target.part, key, parts);
          if (!hasOwn.call(nextCadenceRecords, keyForPart) &&
              ownKeyCount(nextCadenceRecords) >= ns.MAX_CADENCE_RECORDS) {
            evictionKey = oldestInactiveCadenceKey(
              nextCadenceRecords, nextPartOwners
            );
            if (evictionKey === null) {
              return capacityResult('Cadence record limit exceeded.', dryRun);
            }
            if (!cadenceCopied) {
              nextCadenceRecords = copyOwnMap(nextCadenceRecords);
              cadenceCopied = true;
            }
            delete nextCadenceRecords[evictionKey];
          }
          previousCadence = hasOwn.call(nextCadenceRecords, keyForPart)
            ? nextCadenceRecords[keyForPart]
            : null;
          nextCadence = ns.nextCadence(previousCadence,
            nextEntries[index].target, nowMs, nextGeneration);
          if (!cadenceCopied) {
            nextCadenceRecords = copyOwnMap(nextCadenceRecords);
            cadenceCopied = true;
          }
          nextCadenceRecords[keyForPart] = nextCadence;
          nextEntries[index].cadence = nextCadence;
        }
        addEntryOwnership(nextPartOwners, copiedOwners, key,
          nextEntries[index]);
      }
      nextEvents[key] = nextEntries;
      counts = activeEventCounts(nextEvents, nowMs);
      if (counts.events > ns.MAX_ACTIVE_EVENTS) {
        return capacityResult('Active event identity limit exceeded.', dryRun);
      }
      if (counts.targets > ns.MAX_ACTIVE_EVENT_TARGETS) {
        return capacityResult('Active event target limit exceeded.', dryRun);
      }
      if (!dryRun) {
        publish(baseline, nextEvents, baselineSequences,
          nextCadenceRecords, nextPartOwners, nextGeneration);
      }
      return result(true, parts, baseline, nextEvents, nextGeneration, null, dryRun);
    }

    function applyStop(message, dryRun) {
      var key;
      var nextEvents = events;
      var nextPartOwners = partOwners;
      var copiedOwners = {};
      var parts = [];
      var requestedParts = targetParts(message.targets);
      var eventEntries;
      var keptEntries;
      var removedEntries;
      var entryChanged;
      var index;
      var changed = false;
      var nextGeneration;

      function retainRequested(entries) {
        var retained = [];
        var retainedIndex;
        removedEntries = [];
        entryChanged = false;
        for (retainedIndex = 0; retainedIndex < entries.length; retainedIndex += 1) {
          if (requestedParts.indexOf(entries[retainedIndex].target.part) !== -1) {
            addPart(parts, entries[retainedIndex].target.part);
            removedEntries.push(entries[retainedIndex]);
            entryChanged = true;
          } else {
            retained.push(entries[retainedIndex]);
          }
        }
        return retained;
      }

      if (message.eventId !== null) {
        key = eventKey(message.source, message.eventId);
        if (hasOwn.call(events, key)) {
          eventEntries = events[key];
          if (requestedParts.length === 0) {
            nextEvents = copyOwnMap(events);
            nextPartOwners = copyOwnMap(partOwners);
            addEntryParts(parts, eventEntries);
            delete nextEvents[key];
            removeEntryOwnership(nextPartOwners, copiedOwners, key,
              eventEntries, []);
            changed = true;
          } else {
            keptEntries = retainRequested(eventEntries);
            if (entryChanged) {
              nextEvents = copyOwnMap(events);
              nextPartOwners = copyOwnMap(partOwners);
              if (keptEntries.length === 0) {
                delete nextEvents[key];
              } else {
                nextEvents[key] = keptEntries;
              }
              removeEntryOwnership(nextPartOwners, copiedOwners, key,
                removedEntries, keptEntries);
              changed = true;
            }
          }
        }
      } else {
        for (key in events) {
          if (hasOwn.call(events, key)) {
            eventEntries = events[key];
            if (eventEntries[0].source === message.source) {
              keptEntries = retainRequested(eventEntries);
              if (entryChanged) {
                if (!changed) {
                  nextEvents = copyOwnMap(events);
                  nextPartOwners = copyOwnMap(partOwners);
                }
                if (keptEntries.length === 0) {
                  delete nextEvents[key];
                } else {
                  nextEvents[key] = keptEntries;
                }
                removeEntryOwnership(nextPartOwners, copiedOwners, key,
                  removedEntries, keptEntries);
                changed = true;
              }
            }
          }
        }
      }
      nextGeneration = changed ? generation + 1 : generation;
      if (changed && !dryRun) {
        publish(baseline, nextEvents, baselineSequences,
          cadenceRecords, nextPartOwners, nextGeneration);
      }
      return result(changed, parts, baseline, nextEvents, nextGeneration, null, dryRun);
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
        return result(false, [], baseline, events, generation, null, dryRun);
      }
      nextBaseline = copyOwnMap(baseline);
      nextSequences = copyOwnMap(baselineSequences);
      for (key in baseline) {
        if (hasOwn.call(baseline, key) && baseline[key].source === message.source) {
          addPart(parts, baseline[key].target.part);
          delete nextBaseline[key];
          changed = true;
        }
      }
      for (index = 0; index < message.targets.length; index += 1) {
        key = baselineKey(message.source, message.targets[index].part);
        nextBaseline[key] = createBaselineEntry(message, message.targets[index]);
        addPart(parts, message.targets[index].part);
        changed = true;
      }
      nextSequences[sequenceKey] = message.sequence;
      if (ownKeyCount(nextSequences) > ns.MAX_BASELINE_SOURCES) {
        return capacityResult('Baseline source limit exceeded.', dryRun);
      }
      if (ownKeyCount(nextBaseline) > ns.MAX_BASELINE_TARGETS) {
        return capacityResult('Baseline target limit exceeded.', dryRun);
      }
      nextGeneration = changed ? generation + 1 : generation;
      if (!dryRun) {
        publish(nextBaseline, events, nextSequences,
          cadenceRecords, partOwners, nextGeneration);
      }
      return result(changed, parts, nextBaseline, events, nextGeneration, null, dryRun);
    }

    function applyTest(message, nowMs) {
      var nextEvents = events;
      var nextGeneration = generation;
      var entries;
      if (message.targets.length > 0) {
        nextGeneration += 1;
        entries = createEventEntries(message, nowMs, nextGeneration);
        nextEvents = copyOwnMap(events);
        nextEvents[ns.compositeKey(['preview', message.source, nextGeneration])] = entries;
      }
      return result(false, targetParts(message.targets), baseline, nextEvents, nextGeneration, null, true);
    }

    engine.baseline = baseline;
    engine.events = events;
    engine.snapshot = function () {
      return snapshot(baseline, events, generation);
    };
    engine.hapticSnapshot = function () {
      return copy({
        cadenceRecords: cadenceRecords,
        partOwners: partOwners
      });
    };
    engine.readState = function () {
      /* Internal read-only view. Callers must never mutate retained maps or entries. */
      return { baseline: baseline, events: events, generation: generation };
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
        publish({}, {}, baselineSequences, {}, {}, nextGeneration);
      }
      return result(true, parts, {}, {}, nextGeneration, null, dryRun === true);
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
      return result(false, [], baseline, events, generation, null, dryRun === true);
    };
    engine.expire = function (nowMs, dryRun) {
      var nextEvents;
      var nextPartOwners;
      var nextCadenceRecords;
      var copiedOwners = {};
      var key;
      var index;
      var entries;
      var keptEntries;
      var removedEntries;
      var entryChanged;
      var parts = [];
      var changed = false;
      var nextGeneration;

      for (key in events) {
        if (hasOwn.call(events, key)) {
          entries = events[key];
          for (index = 0; index < entries.length; index += 1) {
            if (entries[index].expiresAt <= nowMs) {
              changed = true;
              break;
            }
          }
          if (changed) {
            break;
          }
        }
      }
      if (!changed) {
        nextCadenceRecords = cleanQuietCadence(
          cadenceRecords, nowMs
        );
        if (nextCadenceRecords !== cadenceRecords && dryRun !== true) {
          publish(baseline, events, baselineSequences,
            nextCadenceRecords, partOwners, generation);
        }
        return result(false, [], baseline, events, generation, null, dryRun === true);
      }

      nextEvents = copyOwnMap(events);
      nextPartOwners = copyOwnMap(partOwners);
      for (key in events) {
        if (hasOwn.call(events, key)) {
          entries = events[key];
          entryChanged = false;
          for (index = 0; index < entries.length; index += 1) {
            if (entries[index].expiresAt <= nowMs) {
              entryChanged = true;
              break;
            }
          }
          if (entryChanged) {
            keptEntries = [];
            removedEntries = [];
            for (index = 0; index < entries.length; index += 1) {
              if (entries[index].expiresAt <= nowMs) {
                addPart(parts, entries[index].target.part);
                removedEntries.push(entries[index]);
              } else {
                keptEntries.push(entries[index]);
              }
            }
            if (keptEntries.length === 0) {
              delete nextEvents[key];
            } else {
              nextEvents[key] = keptEntries;
            }
            removeEntryOwnership(nextPartOwners, copiedOwners, key,
              removedEntries, keptEntries);
          }
        }
      }
      nextCadenceRecords = cleanQuietCadence(
        cadenceRecords, nowMs
      );
      nextGeneration = generation + 1;
      if (dryRun !== true) {
        publish(baseline, nextEvents, baselineSequences,
          nextCadenceRecords, nextPartOwners, nextGeneration);
      }
      return result(true, parts, baseline, nextEvents, nextGeneration, null, dryRun === true);
    };
    return engine;
  };
}(XTHB));
