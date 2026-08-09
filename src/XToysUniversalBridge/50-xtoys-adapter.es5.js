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
