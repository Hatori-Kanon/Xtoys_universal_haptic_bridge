(function (ns) {
  ns.MODULE_HAPTICS = true;

  ns.nextCadence = function (previous, target, nowMs, generation) {
    var interval;
    var average;
    var mode = 'single';
    var textureStartedAt = null;
    if (previous !== null && nowMs - previous.lastAttackAt < target.retrigger.quietResetMs) {
      interval = nowMs - previous.lastAttackAt;
      average = previous.averageInterval === null
        ? interval
        : previous.averageInterval * 0.75 + interval * 0.25;
      mode = average < target.retrigger.textureThresholdMs ? 'texture' : 'adaptive';
      textureStartedAt = mode === 'texture'
        ? (previous.mode === 'texture' ? previous.textureStartedAt : nowMs)
        : null;
    } else {
      average = null;
    }
    return {
      lastAttackAt: nowMs,
      averageInterval: average,
      mode: mode,
      lastGeneration: generation,
      textureStartedAt: textureStartedAt,
      quietResetMs: target.retrigger.quietResetMs
    };
  };

  ns.envelopePlan = function (target, cadence) {
    var profile = target.retrigger;
    var ratio = cadence.averageInterval === null ? 1 : ns.clamp(
      (cadence.averageInterval - profile.textureThresholdMs) /
        (profile.quietResetMs - profile.textureThresholdMs), 0, 1);
    var desiredFall = profile.minRampDownMs +
      (target.rampDownMs - profile.minRampDownMs) * ratio;
    var desiredRise = profile.minRampUpMs +
      (target.rampUpMs - profile.minRampUpMs) * ratio;
    var minimumTotal = profile.minRampDownMs + profile.minRampUpMs;
    var available = target.durationMs - ns.SCHEDULER_INTERVAL_MS;
    var desiredTotal = desiredFall + desiredRise;
    var fit;
    if (desiredTotal > available && desiredTotal > minimumTotal) {
      fit = (available - minimumTotal) / (desiredTotal - minimumTotal);
      desiredFall = profile.minRampDownMs +
        (desiredFall - profile.minRampDownMs) * fit;
      desiredRise = profile.minRampUpMs +
        (desiredRise - profile.minRampUpMs) * fit;
    }
    return {
      mode: cadence.mode,
      dropPercent: profile.minDropPercent +
        (profile.maxDropPercent - profile.minDropPercent) * ratio,
      fallMs: desiredFall,
      riseMs: desiredRise
    };
  };

  ns.hapticFloor = function (baselineValue, targetValue, blend, dropPercent) {
    var anchor = blend === 'replace' ? 0 : baselineValue;
    return ns.clamp(anchor + (targetValue - anchor) *
      (1 - dropPercent / 100), 0, 100);
  };

  ns.textureTargetPhase = function (cadence, nowMs) {
    var period = Math.max(200, 2 * cadence.averageInterval);
    var elapsed = nowMs - cadence.textureStartedAt;
    return elapsed < 0 || elapsed % period < period / 2;
  };
}(XTHB));
