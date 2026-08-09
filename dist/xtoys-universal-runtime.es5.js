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
      hasIntensity: raw.intensity !== undefined,
      frequency: 0,
      hasFrequency: raw.frequency !== undefined,
      rotateSpeed: null,
      hasRotateSpeed: raw.rotateSpeed !== undefined,
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
    var pendingDispatches = {};
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
      var failure;
      tuple.rampSeconds = transition.rampSeconds;
      if (!force && sameTuple(lastTuples[slot.id], tuple)) {
        delete pendingDispatches[slot.id];
        return { changed: false, failure: null };
      }
      try {
        outputAdapter.applySlot(copy(slot), copy(transition));
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
      if (pending !== undefined && sameCore(pending.tuple, coreTuple(slot))) {
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
      var slots = ns.computeSlots(engine.snapshot(), normalizedConfig, atMs);
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
      expired = engine.expire(atMs, false);
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

    return runtime;
  };
}(XTHB));
(function (ns) {
  function slotSuffix(slotId) {
    if (typeof slotId !== 'number' || !isFinite(slotId) || slotId % 1 !== 0 || slotId < 1 || slotId > 16) {
      throw new Error('XToys output slot ID must be an integer from 1 through 16.');
    }
    return slotId < 10 ? '0' + slotId : String(slotId);
  }

  function directionCode(direction) {
    if (direction === 'clockwise') {
      return 1;
    }
    if (direction === 'counterclockwise') {
      return -1;
    }
    return 0;
  }

  function safeConsoleLog(text) {
    try {
      if (typeof console !== 'undefined' && console !== null && typeof console.log === 'function') {
        console.log(text);
      }
    } catch (ignored) {
      /* Logging must never interrupt physical output handling. */
    }
  }

  function serialized(value) {
    try {
      return JSON.stringify(value);
    } catch (ignored) {
      return String(value);
    }
  }

  ns.createXToysAdapter = function (logLevel) {
    var level = logLevel === 'off' || logLevel === 'debug' ? logLevel : 'errors';
    var successfulApplies = 0;
    var adapter = {
      applySlot: function (slot, transition) {
        var suffix = slotSuffix(slot.id);
        setVariable('xthb-slot-' + suffix + '-value', slot.value);
        setVariable('xthb-slot-' + suffix + '-frequency', slot.frequency);
        setVariable('xthb-slot-' + suffix + '-ramp-seconds', transition.rampSeconds);
        setVariable('xthb-slot-' + suffix + '-direction-code', directionCode(slot.direction));
        setVariable('xthb-slot-' + suffix + '-generation', slot.generation);
        callAction({ type: 'updateJob', job: 'xthb-output-' + suffix, action: 'start' });
        successfulApplies += 1;
        if (level === 'debug' && successfulApplies >= 100) {
          safeConsoleLog('XTHB debug: ' + successfulApplies + ' successful slot updates.');
          successfulApplies = 0;
        }
      },
      log: function (entry) {
        var type = entry && entry.type !== undefined ? String(entry.type) : '';
        if (level !== 'off' && type.indexOf('error') !== -1) {
          safeConsoleLog('XTHB error: ' + serialized(entry));
        } else if (level === 'debug') {
          safeConsoleLog('XTHB debug: ' + serialized(entry));
        }
      }
    };
    return adapter;
  };
}(XTHB));
var xtoysBridgeInit;
var xtoysBridgeHandle;
var xtoysBridgeTick;
var xtoysBridgeStopAll;
var xtoysBridgeReloadConfig;
var xtoysBridgeTestSlot;

(function (ns) {
  var runtime = null;
  var adapter = null;
  var config = null;
  var stopped = true;
  var manualGeneration = 0;

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

  function reportError(type, error, targetAdapter) {
    var outputAdapter = targetAdapter || adapter;
    var entry = { type: type, detail: errorDetail(error) };
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

  function zeroSlot(outputAdapter, slotId, generation) {
    outputAdapter.applySlot({
      id: slotId,
      value: 0,
      frequency: 0,
      direction: null,
      generation: generation
    }, { rampSeconds: 0 });
  }

  function enabledSlot(configuration, slotId) {
    return configuration !== null && configuration.slots[slotId - 1].enabled;
  }

  function installCandidate(candidate) {
    var slotId;
    if (config !== null) {
      for (slotId = 1; slotId <= 16; slotId += 1) {
        if (enabledSlot(config, slotId) && !enabledSlot(candidate.config, slotId)) {
          zeroSlot(candidate.adapter, slotId, 0);
        }
      }
    }
    candidate.runtime.stopAll();
    runtime = candidate.runtime;
    adapter = candidate.adapter;
    config = candidate.config;
    stopped = true;
    manualGeneration = 0;
  }

  function initialize() {
    var candidate;
    try {
      candidate = readCandidate();
      installCandidate(candidate);
      return 1;
    } catch (error) {
      reportError('config_error', error, candidate === undefined ? null : candidate.adapter);
      return 0;
    }
  }

  xtoysBridgeInit = function () {
    return initialize();
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
      if (result.preview === undefined) {
        if (result.changed === undefined && result.dispatchFailures !== undefined) {
          stopped = true;
        } else if (result.changed === true || result.changedSlots > 0) {
          stopped = false;
        }
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
    var changed;
    if (runtime === null || stopped) {
      return 0;
    }
    try {
      changed = runtime.stopAll();
      stopped = true;
      return changed;
    } catch (error) {
      reportError('runtime_error', error, adapter);
      return 0;
    }
  };

  xtoysBridgeReloadConfig = function () {
    return initialize();
  };

  xtoysBridgeTestSlot = function (slotId, value) {
    var numericSlot = Number(slotId);
    var numericValue = Number(value);
    var selected;
    if (runtime === null || !isFinite(numericSlot) || numericSlot % 1 !== 0 ||
        numericSlot < 1 || numericSlot > 16 || !isFinite(numericValue) ||
        value === null || (typeof value === 'string' && value.replace(/^\s+|\s+$/g, '') === '')) {
      return 0;
    }
    selected = config.slots[numericSlot - 1];
    if (!selected.enabled || selected.id !== numericSlot) {
      return 0;
    }
    manualGeneration += 1;
    try {
      adapter.applySlot({
        id: numericSlot,
        value: ns.clamp(numericValue, 0, 100),
        frequency: 0,
        direction: null,
        generation: manualGeneration
      }, { rampSeconds: 0 });
      stopped = false;
      return 1;
    } catch (error) {
      reportError('adapter_apply_error', error, adapter);
      return 0;
    }
  };
}(XTHB));
