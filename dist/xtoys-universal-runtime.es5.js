var XTHB = typeof XTHB === 'undefined' ? {} : XTHB;
(function (ns) {
  XTHB.MODULE_NAMESPACE = true;
  ns.VERSION = '1.0.0';
  ns.PROTOCOL_VERSION = 1;
  ns.MAX_PAYLOAD_LENGTH = 32768;
  ns.MAX_TARGETS = 32;
  ns.MAX_STATES = 32;
  ns.MAX_TIME_MS = 600000;
  ns.clamp = function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };
  ns.copyObject = function (value) {
    return value === null || typeof value !== 'object'
      ? value
      : JSON.parse(JSON.stringify(value));
  };
  ns.nowMs = function () { return new Date().getTime(); };
  ns.createDefaultConfig = function () {
    var groups = {
      genitals: {},
      lower_body: {},
      double_hole: {},
      whole_body: {},
      mixed: {}
    };
    var slots = [];
    var id;

    for (id = 1; id <= 16; id += 1) {
      slots.push({
        id: id,
        enabled: false,
        type: 'intensity',
        frequencyEnabled: false,
        routes: {}
      });
    }

    return {
      logLevel: 'errors',
      globalMultiplier: 1,
      groups: groups,
      slots: slots
    };
  };
}(XTHB));
(function (ns) {
  var hasOwn = Object.prototype.hasOwnProperty;
  var leafParts = {
    mouth: true,
    breast: true,
    nipple: true,
    armpit: true,
    clitoris: true,
    vulva: true,
    vagina: true,
    urethra: true,
    anus: true,
    butt: true,
    penis: true,
    prostate: true
  };
  var groupNames = {
    genitals: true,
    lower_body: true,
    double_hole: true,
    whole_body: true,
    mixed: true
  };
  var commands = {
    play: true,
    update: true,
    stop: true,
    stop_all: true,
    set_baseline: true,
    test: true
  };
  var logLevels = { off: true, errors: true, debug: true };
  var slotTypes = { intensity: true, rotation: true };
  var effects = { hold: true, pulse: true };
  var blends = { replace: true, max: true };
  var baselineBlends = { boost: true, replace: true, max: true };

  function fail(code, detail) {
    return { ok: false, code: code, detail: detail };
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isBlankString(value) {
    return typeof value === 'string' && value.replace(/^\s+|\s+$/g, '') === '';
  }

  function numberValue(value, code) {
    var number;
    if (value === null || value === undefined || isBlankString(value)) {
      return fail(code, 'A finite numeric value is required.');
    }
    number = Number(value);
    if (!isFinite(number)) {
      return fail(code, 'A finite numeric value is required.');
    }
    return { ok: true, value: number };
  }

  function boundedWeight(value, code) {
    var parsed = numberValue(value, code);
    if (!parsed.ok || parsed.value < 0 || parsed.value > 1) {
      return !parsed.ok ? parsed : fail(code, 'Weight must be between 0 and 1.');
    }
    return parsed;
  }

  function validateWeightMap(map, allowedParts, code) {
    var key;
    var parsed;
    var normalized = {};
    if (!isObject(map)) {
      return fail(code, 'Routes must be an object.');
    }
    for (key in map) {
      if (hasOwn.call(map, key)) {
        if (!hasOwn.call(allowedParts, key)) {
          return fail('unknown_part', 'Route references an unsupported leaf part.');
        }
        parsed = boundedWeight(map[key], code);
        if (!parsed.ok) {
          return parsed;
        }
        normalized[key] = parsed.value;
      }
    }
    return { ok: true, value: normalized };
  }

  ns.validateConfig = function (config) {
    var key;
    var index;
    var slot;
    var id;
    var routeResult;
    var groupResult;
    var multiplier;
    var ids = {};
    var slots = [];
    var groups = {};

    if (!isObject(config)) {
      return fail('invalid_config', 'Configuration must be an object.');
    }
    if (!hasOwn.call(logLevels, config.logLevel)) {
      return fail('invalid_log_level', 'Unsupported log level.');
    }
    multiplier = numberValue(config.globalMultiplier, 'invalid_global_multiplier');
    if (!multiplier.ok || multiplier.value < 0) {
      return !multiplier.ok ? multiplier : fail('invalid_global_multiplier', 'Global multiplier must not be negative.');
    }
    if (!isObject(config.groups)) {
      return fail('invalid_groups', 'Groups must be an object.');
    }
    for (key in config.groups) {
      if (hasOwn.call(config.groups, key) && !hasOwn.call(groupNames, key)) {
        return fail('unknown_group', 'Unsupported virtual group.');
      }
    }
    for (key in groupNames) {
      if (!hasOwn.call(config.groups, key)) {
        return fail('missing_group', 'Every supported virtual group is required.');
      }
      groupResult = validateWeightMap(config.groups[key], leafParts, 'invalid_group_weight');
      if (!groupResult.ok) {
        return groupResult;
      }
      groups[key] = groupResult.value;
    }
    if (!Array.isArray(config.slots) || config.slots.length !== 16) {
      return fail('invalid_slot_count', 'Exactly sixteen output slots are required.');
    }
    for (index = 0; index < config.slots.length; index += 1) {
      slot = config.slots[index];
      if (!isObject(slot) || !hasOwn.call(slot, 'id') || !hasOwn.call(slot, 'enabled') ||
          !hasOwn.call(slot, 'type') || !hasOwn.call(slot, 'frequencyEnabled') || !hasOwn.call(slot, 'routes')) {
        return fail('invalid_slot', 'Every slot must include all required fields.');
      }
      id = numberValue(slot.id, 'invalid_slot_id');
      if (!id.ok || id.value % 1 !== 0 || id.value < 1 || id.value > 16 || hasOwn.call(ids, id.value)) {
        return !id.ok ? id : fail('invalid_slot_id', 'Slot IDs must be unique values from 1 through 16.');
      }
      if (typeof slot.enabled !== 'boolean') {
        return fail('invalid_slot_enabled', 'Slot enabled must be a boolean.');
      }
      if (!hasOwn.call(slotTypes, slot.type)) {
        return fail('invalid_slot_type', 'Unsupported slot type.');
      }
      if (typeof slot.frequencyEnabled !== 'boolean') {
        return fail('invalid_frequency_enabled', 'Frequency enabled must be a boolean.');
      }
      routeResult = validateWeightMap(slot.routes, leafParts, 'invalid_route_weight');
      if (!routeResult.ok) {
        return routeResult;
      }
      ids[id.value] = true;
      slots[id.value - 1] = {
        id: id.value,
        enabled: slot.enabled,
        type: slot.type,
        frequencyEnabled: slot.frequencyEnabled,
        routes: routeResult.value
      };
    }
    for (index = 1; index <= 16; index += 1) {
      if (!hasOwn.call(ids, index)) {
        return fail('invalid_slot_id', 'Slot IDs must include every value from 1 through 16.');
      }
    }
    return {
      ok: true,
      config: {
        logLevel: config.logLevel,
        globalMultiplier: multiplier.value,
        groups: groups,
        slots: slots
      }
    };
  };

  function supportedPart(part, config) {
    return typeof part === 'string' && (hasOwn.call(leafParts, part) || hasOwn.call(config.groups, part));
  }

  function optionalNumber(value, defaultValue, code) {
    if (value === undefined) {
      return { ok: true, value: defaultValue };
    }
    return numberValue(value, code);
  }

  function normalizedTarget(raw, config, transient) {
    var parsed;
    var rotateSpeed;
    var direction;
    var target;
    if (!isObject(raw) || !supportedPart(raw.part, config)) {
      return fail('unknown_part', 'Target references an unsupported part.');
    }
    if (raw.effect !== undefined && !hasOwn.call(effects, raw.effect)) {
      return fail('invalid_effect', 'Unsupported target effect.');
    }
    if (raw.blend !== undefined && !hasOwn.call(blends, raw.blend)) {
      return fail('invalid_blend', 'Unsupported target blend.');
    }
    if (raw.baselineBlend !== undefined && !hasOwn.call(baselineBlends, raw.baselineBlend)) {
      return fail('invalid_baseline_blend', 'Unsupported baseline blend.');
    }
    parsed = optionalNumber(raw.intensity, 0, 'invalid_number');
    if (!parsed.ok) {
      return parsed;
    }
    target = {
      part: raw.part,
      effect: raw.effect === undefined ? 'hold' : raw.effect,
      intensity: ns.clamp(parsed.value, 0, 100),
      frequency: 0,
      rotateSpeed: null,
      rotateDirection: null,
      durationMs: 0,
      rampUpMs: 0,
      rampDownMs: 0,
      pulseOnMs: 0,
      pulseOffMs: 0,
      priority: 0,
      blend: raw.blend === undefined ? 'replace' : raw.blend,
      baselineBlend: raw.baselineBlend === undefined ? 'boost' : raw.baselineBlend
    };
    parsed = optionalNumber(raw.frequency, 0, 'invalid_number');
    if (!parsed.ok) {
      return parsed;
    }
    target.frequency = ns.clamp(parsed.value, 0, 100);
    if (raw.rotateSpeed !== undefined) {
      rotateSpeed = numberValue(raw.rotateSpeed, 'invalid_number');
      if (!rotateSpeed.ok) {
        return rotateSpeed;
      }
      target.rotateSpeed = ns.clamp(rotateSpeed.value, 0, 100);
    }
    direction = raw.rotateDirection;
    if (direction !== undefined && direction !== null && direction !== 'clockwise' && direction !== 'counterclockwise') {
      return fail('invalid_rotate_direction', 'Rotation direction is unsupported.');
    }
    if (target.rotateSpeed !== null && target.rotateSpeed > 0 && (direction !== 'clockwise' && direction !== 'counterclockwise')) {
      return fail('invalid_rotate_direction', 'Positive rotation speed requires a direction.');
    }
    target.rotateDirection = direction === undefined ? null : direction;
    if (transient) {
      parsed = numberValue(raw.durationMs, 'invalid_duration');
      if (!parsed.ok || parsed.value <= 0) {
        return !parsed.ok ? parsed : fail('invalid_duration', 'Transient duration must be positive.');
      }
      target.durationMs = ns.clamp(parsed.value, 0, ns.MAX_TIME_MS);
    } else {
      parsed = optionalNumber(raw.durationMs, 0, 'invalid_number');
      if (!parsed.ok) {
        return parsed;
      }
      target.durationMs = ns.clamp(parsed.value, 0, ns.MAX_TIME_MS);
    }
    parsed = optionalNumber(raw.rampUpMs, 0, 'invalid_number');
    if (!parsed.ok) {
      return parsed;
    }
    target.rampUpMs = ns.clamp(parsed.value, 0, ns.MAX_TIME_MS);
    parsed = optionalNumber(raw.rampDownMs, 0, 'invalid_number');
    if (!parsed.ok) {
      return parsed;
    }
    target.rampDownMs = ns.clamp(parsed.value, 0, ns.MAX_TIME_MS);
    parsed = optionalNumber(raw.pulseOnMs, 0, 'invalid_number');
    if (!parsed.ok) {
      return parsed;
    }
    target.pulseOnMs = ns.clamp(parsed.value, 0, ns.MAX_TIME_MS);
    parsed = optionalNumber(raw.pulseOffMs, 0, 'invalid_number');
    if (!parsed.ok) {
      return parsed;
    }
    target.pulseOffMs = ns.clamp(parsed.value, 0, ns.MAX_TIME_MS);
    parsed = optionalNumber(raw.priority, 0, 'invalid_number');
    if (!parsed.ok) {
      return parsed;
    }
    target.priority = parsed.value;
    return { ok: true, value: target };
  }

  function parseTargets(rawTargets, config, transient, required) {
    var index;
    var parsed;
    var targets = [];
    if (!Array.isArray(rawTargets)) {
      return fail('invalid_targets', 'Targets must be an array.');
    }
    if (rawTargets.length > ns.MAX_TARGETS) {
      return fail('too_many_targets', 'Too many targets.');
    }
    if (required && rawTargets.length === 0) {
      return fail('missing_targets', 'At least one target is required.');
    }
    for (index = 0; index < rawTargets.length; index += 1) {
      parsed = normalizedTarget(rawTargets[index], config, transient);
      if (!parsed.ok) {
        return parsed;
      }
      targets.push(parsed.value);
    }
    return { ok: true, value: targets };
  }

  function normalizedSequence(value) {
    return numberValue(value, 'invalid_sequence');
  }

  ns.parseMessage = function (payloadText, config) {
    var payload;
    var configResult;
    var targets;
    var sequence;
    var states;
    var index;
    var transient;
    var message;
    if (typeof payloadText !== 'string') {
      return fail('invalid_payload', 'Payload must be a JSON string.');
    }
    if (payloadText.length > ns.MAX_PAYLOAD_LENGTH) {
      return fail('payload_too_large', 'Payload exceeds the maximum length.');
    }
    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      return fail('invalid_json', 'Payload is not valid JSON.');
    }
    if (!isObject(payload)) {
      return fail('invalid_payload', 'Payload must decode to an object.');
    }
    if (payload.protocolVersion !== ns.PROTOCOL_VERSION) {
      return fail('unsupported_protocol_version', 'Unsupported protocol version.');
    }
    if (typeof payload.command !== 'string' || !hasOwn.call(commands, payload.command)) {
      return fail('unsupported_command', 'Unsupported command.');
    }
    if (typeof payload.source !== 'string' || isBlankString(payload.source)) {
      return fail('missing_source', 'Source is required.');
    }
    if (payload.states !== undefined) {
      if (!Array.isArray(payload.states)) {
        return fail('invalid_states', 'States must be an array.');
      }
      if (payload.states.length > ns.MAX_STATES) {
        return fail('too_many_states', 'Too many state labels.');
      }
      states = [];
      for (index = 0; index < payload.states.length; index += 1) {
        if (typeof payload.states[index] !== 'string') {
          return fail('invalid_states', 'State labels must be strings.');
        }
        states.push(payload.states[index]);
      }
    } else {
      states = [];
    }
    message = {
      protocolVersion: ns.PROTOCOL_VERSION,
      command: payload.command,
      source: payload.source,
      eventId: null,
      sequence: null,
      states: states,
      targets: []
    };
    if (payload.command === 'stop_all') {
      return { ok: true, message: message };
    }
    configResult = ns.validateConfig(config);
    if (!configResult.ok) {
      return configResult;
    }
    if (payload.command === 'play' || payload.command === 'update') {
      if (typeof payload.eventId !== 'string' || isBlankString(payload.eventId)) {
        return fail('missing_event_id', 'A non-empty event ID is required.');
      }
      sequence = normalizedSequence(payload.sequence);
      if (!sequence.ok) {
        return sequence;
      }
      targets = parseTargets(payload.targets, configResult.config, true, true);
      if (!targets.ok) {
        return targets;
      }
      message.eventId = payload.eventId;
      message.sequence = sequence.value;
      message.targets = targets.value;
      return { ok: true, message: message };
    }
    if (payload.command === 'set_baseline') {
      sequence = normalizedSequence(payload.sequence);
      if (!sequence.ok) {
        return sequence;
      }
      targets = parseTargets(payload.targets, configResult.config, false, false);
      if (!targets.ok) {
        return targets;
      }
      message.sequence = sequence.value;
      message.targets = targets.value;
      return { ok: true, message: message };
    }
    if (payload.command === 'stop') {
      if (payload.eventId !== undefined && payload.eventId !== null) {
        if (typeof payload.eventId !== 'string' || isBlankString(payload.eventId)) {
          return fail('missing_event_id', 'Event ID must be non-empty when supplied.');
        }
        message.eventId = payload.eventId;
      }
      if (payload.sequence !== undefined) {
        sequence = normalizedSequence(payload.sequence);
        if (!sequence.ok) {
          return sequence;
        }
        message.sequence = sequence.value;
      }
      if (payload.targets !== undefined) {
        targets = parseTargets(payload.targets, configResult.config, false, false);
        if (!targets.ok) {
          return targets;
        }
        message.targets = targets.value;
      }
      if (message.eventId === null && message.targets.length === 0) {
        return fail('missing_stop_selector', 'Stop requires an event ID or one or more targets.');
      }
      return { ok: true, message: message };
    }
    if (payload.targets !== undefined) {
      targets = parseTargets(payload.targets, configResult.config, false, false);
      if (!targets.ok) {
        return targets;
      }
      message.targets = targets.value;
    }
    if (payload.sequence !== undefined) {
      sequence = normalizedSequence(payload.sequence);
      if (!sequence.ok) {
        return sequence;
      }
      message.sequence = sequence.value;
    }
    return { ok: true, message: message };
  };
}(XTHB));
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
