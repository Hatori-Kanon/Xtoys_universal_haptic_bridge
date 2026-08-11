var XTHB = typeof XTHB === 'undefined' ? {} : XTHB;
(function (ns) {
  XTHB.MODULE_NAMESPACE = true;
  ns.VERSION = '1.0.0';
  ns.PROTOCOL_VERSION = 1;
  ns.MAX_PAYLOAD_LENGTH = 32768;
  ns.MAX_TARGETS = 32;
  ns.MAX_STATES = 32;
  ns.MAX_IDENTIFIER_LENGTH = 128;
  ns.MAX_STATE_LABEL_LENGTH = 128;
  ns.MAX_ACTIVE_EVENTS = 128;
  ns.MAX_ACTIVE_EVENT_TARGETS = 256;
  ns.SCHEDULER_INTERVAL_MS = 100;
  ns.MAX_CADENCE_RECORDS = ns.MAX_ACTIVE_EVENT_TARGETS;
  ns.MAX_BASELINE_SOURCES = 64;
  ns.MAX_BASELINE_TARGETS = 256;
  ns.MAX_TIME_MS = 600000;
  ns.clamp = function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };
  ns.copyObject = function (value) {
    return value === null || typeof value !== 'object'
      ? value
      : JSON.parse(JSON.stringify(value));
  };
  ns.compositeKey = function (parts) {
    return JSON.stringify(parts);
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
